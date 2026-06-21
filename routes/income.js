const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');
const iconv = require('iconv-lite');

module.exports = (db, uploadsDir) => {
  // 手工录入收入
  router.post('/', requireAuth, (req, res) => {
    const { date, business_line, amount, payment_method, category, description, ticket_type, ticket_no } = req.body;
    if (!date || !business_line || !amount) return res.status(400).json({ error: '信息不完整' });
    if (!canAccessLine(req.session.user, business_line)) return res.status(403).json({ error: '无权限操作此业务线' });
    const result = db.prepare(
      'INSERT INTO income_records (date, business_line, amount, payment_method, category, description, ticket_type, ticket_no, source, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(date, business_line, parseFloat(amount), payment_method || '现金', category || '营业收入', description || '', ticket_type || '无票', ticket_no || '', 'manual', req.session.user.id);
    res.json({ success: true, id: result.lastInsertRowid });
  });

  // 录入交班单（含图片OCR）
  const shiftStorage = multer.diskStorage({
    destination: (req, file, cb) => { fs.mkdirSync(path.join(uploadsDir, 'shifts'), { recursive: true }); cb(null, path.join(uploadsDir, 'shifts')); },
    filename: (req, file, cb) => { const ext = path.extname(file.originalname) || '.jpg'; cb(null, `shift_${Date.now()}${ext}`); }
  });
  const shiftUpload = multer({ storage: shiftStorage, limits: { fileSize: 20 * 1024 * 1024 } });

  router.post('/shift', requireAuth, shiftUpload.single('receipt'), (req, res) => {
    const { date, business_line, total_amount, transaction_count, cash_amount, wechat_amount, alipay_amount, other_amount, shift_no, notes } = req.body;
    if (!date || !business_line || !total_amount) return res.status(400).json({ error: '信息不完整' });
    if (!canAccessLine(req.session.user, business_line)) return res.status(403).json({ error: '无权限操作此业务线' });
    const receipt_image = req.file ? req.file.filename : null;
    const result = db.prepare(
      'INSERT INTO shift_reports (date, business_line, shift_no, total_amount, transaction_count, cash_amount, wechat_amount, alipay_amount, other_amount, receipt_image, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(date, business_line, shift_no || '', parseFloat(total_amount), parseInt(transaction_count) || 0,
      parseFloat(cash_amount) || 0, parseFloat(wechat_amount) || 0, parseFloat(alipay_amount) || 0, parseFloat(other_amount) || 0,
      receipt_image, notes || '', req.session.user.id);
    db.prepare('INSERT INTO income_records (date, business_line, amount, payment_method, category, description, source, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(date, business_line, parseFloat(total_amount), '混合', '营业收入', `交班单${shift_no ? ' ' + shift_no : ''}`, 'shift', req.session.user.id);
    res.json({ success: true, id: result.lastInsertRowid });
  });

  // OCR 识别票据图片（使用本地 Tesseract，无需 API Key）
  const ocrUpload = multer({ dest: path.join(uploadsDir, 'ocr_temp'), limits: { fileSize: 20 * 1024 * 1024 } });
  router.post('/ocr', requireAuth, ocrUpload.single('image'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: '请上传图片' });
    try {
      const tesseract = require('node-tesseract-ocr');
      const text = await tesseract.recognize(req.file.path, {
        lang: 'chi_sim+eng',
        oem: 1,
        psm: 6,
      });
      try { fs.unlinkSync(req.file.path); } catch (_) {}

      const data = parseReceiptText(text);
      res.json({ success: true, data, raw: text });
    } catch (e) {
      try { fs.unlinkSync(req.file.path); } catch (_) {}
      res.status(500).json({ error: 'OCR识别失败: ' + e.message });
    }
  });

  // 预览解析结果（调试用，不写数据库）
  const previewUpload = multer({ dest: path.join(uploadsDir, 'csv'), limits: { fileSize: 50 * 1024 * 1024 } });
  router.post('/import/preview', requireAuth, previewUpload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: '请上传文件' });
    const { source_type } = req.body;
    try {
      const rawBuf = fs.readFileSync(req.file.path);
      const content = iconv.decode(rawBuf, 'gb18030').replace(/^﻿/, '');
      const lines = content.split(/\r?\n/).slice(0, 30);
      // 找标题行
      let headerLine = lines.find(l => l.includes('收/支') || l.includes('金额'));
      const records = source_type === 'wechat' ? parseWechat(content) : parseAlipay(content);
      try { fs.unlinkSync(req.file.path); } catch (_) {}
      res.json({ headers: headerLine, sample: records.slice(0, 5), total: records.length });
    } catch (e) {
      try { fs.unlinkSync(req.file.path); } catch (_) {}
      res.status(400).json({ error: e.message });
    }
  });

  // 导入微信/支付宝流水（支持CSV和Excel）
  const importUpload = multer({ dest: path.join(uploadsDir, 'csv'), limits: { fileSize: 50 * 1024 * 1024 } });
  router.post('/import', requireAuth, importUpload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: '请上传文件' });
    const { business_line, source_type } = req.body;
    if (!canAccessLine(req.session.user, business_line)) return res.status(403).json({ error: '无权限操作此业务线' });

    try {
      const filePath = req.file.path;
      const originalName = req.file.originalname || '';
      const isExcel = /\.(xlsx|xls)$/i.test(originalName) || req.file.mimetype?.includes('spreadsheet') || req.file.mimetype?.includes('excel');

      let records = [];
      if (isExcel) {
        records = parseExcelFile(filePath, source_type);
      } else {
        const rawBuf = fs.readFileSync(filePath);
        // 根据 BOM 判断编码：UTF-8 BOM = EF BB BF，否则尝试 GB18030
        const isUtf8Bom = rawBuf[0] === 0xEF && rawBuf[1] === 0xBB && rawBuf[2] === 0xBF;
        let content;
        if (isUtf8Bom) {
          content = rawBuf.slice(3).toString('utf8');
        } else {
          // 尝试 UTF-8：如果解码后能找到关键中文字符就用 UTF-8，否则用 GB18030
          const utf8Try = rawBuf.toString('utf8');
          content = (utf8Try.includes('收/支') || utf8Try.includes('交易时间') || utf8Try.includes('金额'))
            ? utf8Try
            : iconv.decode(rawBuf, 'gb18030');
        }
        content = content.replace(/^﻿/, '');
        records = source_type === 'wechat' ? parseWechat(content) : parseAlipay(content);
      }

      if (records.length === 0) {
        try { fs.unlinkSync(filePath); } catch (_) {}
        return res.status(400).json({ error: '未找到有效收入记录，请确认文件格式和类型是否匹配' });
      }

      // 去重：同一天、同金额、同来源 视为重复
      const checkDup = db.prepare(
        `SELECT id FROM income_records WHERE date=? AND amount=? AND source=? AND business_line=? LIMIT 1`
      );
      const insertIncome = db.prepare(
        'INSERT INTO income_records (date, business_line, amount, payment_method, category, description, source, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      );
      let inserted = 0, skipped = 0;
      // 支付方式由导入类型决定，不从文件读（文件格式各异，容易误判）
      const fixedPayMethod = source_type === 'wechat' ? '微信支付' : '支付宝';

      db.exec('BEGIN');
      try {
        for (const r of records) {
          const dup = checkDup.get(r.date, r.amount, source_type, business_line);
          if (dup) { skipped++; continue; }
          insertIncome.run(r.date, business_line, r.amount, fixedPayMethod, '营业收入', r.description, source_type, req.session.user.id);
          inserted++;
        }
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
      try { fs.unlinkSync(filePath); } catch (_) {}
      res.json({ success: true, count: inserted, skipped });
    } catch (e) {
      try { fs.unlinkSync(req.file.path); } catch (_) {}
      res.status(400).json({ error: '文件解析失败: ' + e.message });
    }
  });

  // 查询收入列表
  router.get('/', requireAuth, (req, res) => {
    const { start_date, end_date, business_line, page = 1, limit = 50 } = req.query;
    let where = [], params = [];
    if (!isAdmin(req.session.user)) { where.push('business_line = ?'); params.push(req.session.user.business_line); }
    else if (business_line) { where.push('business_line = ?'); params.push(business_line); }
    if (start_date) { where.push('date >= ?'); params.push(start_date); }
    if (end_date) { where.push('date <= ?'); params.push(end_date); }
    const whereStr = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const rows = db.prepare(`SELECT i.*, u.name as creator_name FROM income_records i LEFT JOIN users u ON i.created_by = u.id ${whereStr} ORDER BY date DESC, id DESC LIMIT ? OFFSET ?`).all(...params, parseInt(limit), offset);
    const total = db.prepare(`SELECT COUNT(*) as cnt FROM income_records ${whereStr}`).get(...params).cnt;
    res.json({ rows, total, page: parseInt(page) });
  });

  router.get('/shifts', requireAuth, (req, res) => {
    const { start_date, end_date, business_line } = req.query;
    let where = [], params = [];
    if (!isAdmin(req.session.user)) { where.push('business_line = ?'); params.push(req.session.user.business_line); }
    else if (business_line) { where.push('business_line = ?'); params.push(business_line); }
    if (start_date) { where.push('date >= ?'); params.push(start_date); }
    if (end_date) { where.push('date <= ?'); params.push(end_date); }
    const whereStr = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const rows = db.prepare(`SELECT s.*, u.name as creator_name FROM shift_reports s LEFT JOIN users u ON s.created_by = u.id ${whereStr} ORDER BY date DESC, id DESC LIMIT 100`).all(...params);
    res.json(rows);
  });

  router.delete('/:id', requireAuth, (req, res) => {
    const record = db.prepare('SELECT * FROM income_records WHERE id = ?').get(req.params.id);
    if (!record) return res.status(404).json({ error: '记录不存在' });
    if (!isAdmin(req.session.user) && record.business_line !== req.session.user.business_line) return res.status(403).json({ error: '无权限' });
    db.prepare('DELETE FROM income_records WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  });

  return router;
};

// ── 解析 OCR 识别出的收银小票文字 ──────────────────────
function parseReceiptText(text) {
  const data = {
    date: null, total_amount: null, transaction_count: null,
    cash_amount: 0, wechat_amount: 0, alipay_amount: 0, other_amount: 0,
    shift_no: null, payment_methods: ''
  };

  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  for (const line of lines) {
    // 日期：2026-06-18 或 2026/06/18
    if (!data.date) {
      const m = line.match(/(\d{4})[-\/年](\d{1,2})[-\/月](\d{1,2})/);
      if (m) data.date = `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
    }

    // 收款合计 / 付款总额 / 应收总额
    if (!data.total_amount && /收款合计|付款总额|应收总额|实收金额|收款金额/.test(line)) {
      const m = line.match(/(\d+\.?\d*)/g);
      if (m) data.total_amount = parseFloat(m[m.length - 1]);
    }

    // 交易笔数
    if (!data.transaction_count && /交易笔数|销售数量|单数/.test(line)) {
      const m = line.match(/(\d+)/);
      if (m) data.transaction_count = parseInt(m[1]);
    }

    // 交班单号
    if (!data.shift_no && /交班单号|单号|流水/.test(line)) {
      const m = line.match(/[A-Z0-9]{8,}/i);
      if (m) data.shift_no = m[0];
    }

    // 各支付方式金额
    const amountMatch = line.match(/(\d+\.?\d*)$/);
    const amt = amountMatch ? parseFloat(amountMatch[1]) : 0;
    if (amt > 0) {
      if (/微信/.test(line)) { data.wechat_amount = amt; }
      else if (/支付宝/.test(line)) { data.alipay_amount = amt; }
      else if (/现金|人民币/.test(line) && !/退/.test(line)) { data.cash_amount = amt; }
      else if (/农商|银行|其他/.test(line)) { data.other_amount = amt; }
    }
  }

  // 汇总支付方式描述
  const methods = [];
  if (data.cash_amount > 0) methods.push(`现金¥${data.cash_amount}`);
  if (data.wechat_amount > 0) methods.push(`微信¥${data.wechat_amount}`);
  if (data.alipay_amount > 0) methods.push(`支付宝¥${data.alipay_amount}`);
  if (data.other_amount > 0) methods.push(`其他¥${data.other_amount}`);
  data.payment_methods = methods.join('、') || '见小票';

  return data;
}

// ── Excel 解析 ─────────────────────────────────────────
function parseExcelFile(filePath, sourceType) {
  // cellDates:true 让 xlsx 把日期单元格转为 JS Date 对象
  const wb = XLSX.readFile(filePath, { cellDates: true, raw: false });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });

  const results = [];
  let headerRow = -1;

  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const row = rows[i].map(c => String(c));
    if (sourceType === 'wechat' && row.some(c => c.includes('交易时间'))) { headerRow = i; break; }
    if (sourceType === 'alipay' && row.some(c => c.includes('交易号') || c.includes('付款时间'))) { headerRow = i; break; }
  }
  if (headerRow === -1) return results;

  const headers = rows[headerRow].map(c => String(c).trim());

  // 重新读一份 raw 数据用于取日期原始值（Date 对象）
  const rawRows = XLSX.utils.sheet_to_json(
    XLSX.readFile(filePath, { cellDates: true }).Sheets[sheetName],
    { header: 1, defval: '', raw: true }
  );

  for (let i = headerRow + 1; i < rows.length; i++) {
    const row = rows[i];
    const rawRow = rawRows[i] || [];
    if (!row || row.every(c => !c)) continue;

    const cell = (name) => {
      const idx = headers.findIndex(h => h.includes(name));
      return idx >= 0 ? String(row[idx] || '').trim() : '';
    };
    const rawCell = (name) => {
      const idx = headers.findIndex(h => h.includes(name));
      return idx >= 0 ? rawRow[idx] : undefined;
    };

    if (sourceType === 'wechat') {
      const type = cell('收/支') || cell('类型');
      if (type !== '收入') continue;
      const dateStr = normalizeDate(rawCell('交易时间'), cell('交易时间'));
      const amountStr = cell('金额').replace(/[¥￥,]/g, '');
      const amount = parseFloat(amountStr);
      if (!dateStr || isNaN(amount) || amount <= 0) continue;
      const pay = cell('支付方式') || cell('收款方式') || '微信支付';
      results.push({ date: dateStr, amount, payment_method: normalizePayMethod(pay, 'wechat'), description: cell('商品') || cell('备注') || '' });
    } else {
      const type = cell('收/支') || cell('收入/支出');
      if (type !== '收入') continue;
      const rawDate = rawCell('付款时间') || rawCell('交易创建时间');
      const strDate = cell('付款时间') || cell('交易创建时间');
      const dateStr = normalizeDate(rawDate, strDate);
      const amountStr = cell('金额').replace(/[¥￥,]/g, '');
      const amount = parseFloat(amountStr);
      if (!dateStr || isNaN(amount) || amount <= 0) continue;
      const pay = cell('收/付款方式') || cell('支付方式') || '支付宝';
      results.push({ date: dateStr, amount, payment_method: normalizePayMethod(pay, 'alipay'), description: cell('商品名称') || cell('备注') || '' });
    }
  }
  return results;
}

// 统一把各种日期格式转成 YYYY-MM-DD
function normalizeDate(rawVal, strVal) {
  // 如果是 JS Date 对象（cellDates:true 解析出来的）
  if (rawVal instanceof Date && !isNaN(rawVal)) {
    const y = rawVal.getFullYear();
    const m = String(rawVal.getMonth() + 1).padStart(2, '0');
    const d = String(rawVal.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  // 如果是 Excel 数字序列（如 46000）
  if (typeof rawVal === 'number' && rawVal > 40000 && rawVal < 60000) {
    const date = XLSX.SSF.parse_date_code(rawVal);
    if (date) {
      return `${date.y}-${String(date.m).padStart(2,'0')}-${String(date.d).padStart(2,'0')}`;
    }
  }
  // 降级：从字符串里提取日期
  const s = String(strVal || '').trim();
  const m = s.match(/(\d{4})[\/\-年](\d{1,2})[\/\-月](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
  // 直接截取前10位（兼容 "2026-06-18 10:00:00" 格式）
  if (s.length >= 10) return s.substring(0, 10).replace(/\//g, '-');
  return null;
}

// ── CSV 解析（微信）─────────────────────────────────────
function parseWechat(content) {
  const lines = content.split(/\r?\n/);
  const results = [];
  let headerIdx = -1;
  let headers = [];

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('交易时间') && (lines[i].includes('金额') || lines[i].includes('收/支'))) {
      headers = splitCSVLine(lines[i]);
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) return results;

  const col = (row, name) => {
    const idx = headers.findIndex(h => h.includes(name));
    return idx >= 0 ? (row[idx] || '').trim() : '';
  };

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const row = splitCSVLine(line);
    const type = col(row, '收/支');
    if (type !== '收入') continue;
    const dateStr = col(row, '交易时间').substring(0, 10);
    const amountStr = col(row, '金额').replace(/[¥￥,\s]/g, '');
    const amount = parseFloat(amountStr);
    if (!dateStr || isNaN(amount) || amount <= 0) continue;
    const pay = col(row, '支付方式') || col(row, '收款方式') || '微信支付';
    results.push({ date: dateStr, amount, payment_method: normalizePayMethod(pay, 'wechat'), description: col(row, '商品') || col(row, '备注') || '' });
  }
  return results;
}

// ── CSV 解析（支付宝）──────────────────────────────────
function parseAlipay(content) {
  const lines = content.split(/\r?\n/);
  const results = [];
  let headerIdx = -1;
  let headers = [];

  for (let i = 0; i < lines.length; i++) {
    if ((lines[i].includes('交易号') || lines[i].includes('交易创建时间')) && lines[i].includes('金额')) {
      headers = splitCSVLine(lines[i]);
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) return results;

  const col = (row, name) => {
    const idx = headers.findIndex(h => h.includes(name));
    return idx >= 0 ? (row[idx] || '').trim() : '';
  };

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('---')) continue;
    const row = splitCSVLine(line);
    const type = col(row, '收/支');
    if (type !== '收入') continue;
    const dateRaw = col(row, '付款时间') || col(row, '交易创建时间');
    const dateStr = dateRaw.substring(0, 10).replace(/\//g, '-');
    const amountStr = (col(row, '金额') || '').replace(/[¥￥,\s]/g, '');
    const amount = parseFloat(amountStr);
    if (!dateStr || isNaN(amount) || amount <= 0) continue;
    const pay = col(row, '收/付款方式') || col(row, '支付方式') || '支付宝';
    results.push({ date: dateStr, amount, payment_method: normalizePayMethod(pay, 'alipay'), description: col(row, '商品名称') || col(row, '备注') || '' });
  }
  return results;
}

function normalizePayMethod(raw, source) {
  const s = (raw || '').trim();
  if (/微信/.test(s)) return '微信支付';
  if (/支付宝/.test(s)) return '支付宝';
  if (/现金/.test(s)) return '现金';
  if (/农商|农村商业/.test(s)) return '农商支付';
  if (/银行|储蓄卡|信用卡/.test(s)) return '银行卡';
  if (/零钱/.test(s)) return '微信支付';
  if (/余额/.test(s)) return source === 'wechat' ? '微信支付' : '支付宝';
  return source === 'wechat' ? '微信支付' : '支付宝';
}

function splitCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuotes = !inQuotes; }
    else if (ch === ',' && !inQuotes) { result.push(current.trim()); current = ''; }
    else { current += ch; }
  }
  result.push(current.trim());
  return result;
}

function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: '未登录' });
  next();
}
function isAdmin(user) { return user.role === 'admin'; }
function canAccessLine(user, line) { return user.role === 'admin' || user.business_line === line; }
