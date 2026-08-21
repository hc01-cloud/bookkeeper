const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

module.exports = (db, uploadsDir) => {
  const receiptStorage = multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.join(uploadsDir, 'receipts');
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname) || '.jpg';
      cb(null, `receipt_${Date.now()}_${Math.random().toString(36).substr(2, 6)}${ext}`);
    }
  });
  const upload = multer({ storage: receiptStorage, limits: { fileSize: 20 * 1024 * 1024 } });

  router.get('/categories', (req, res) => res.json(CATEGORIES));

  router.post('/', requireAuth, upload.array('receipts', 10), (req, res) => {
    const { date, business_line, category, amount, vendor, description, ticket_type, ticket_no, payment_method } = req.body;
    if (!date || !business_line || !category || !amount) return res.status(400).json({ error: '信息不完整' });
    if (!canAccessLine(req.session.user, business_line)) return res.status(403).json({ error: '无权限操作此业务线' });
    const images = (req.files || []).map(f => f.filename);
    const result = db.prepare(
      'INSERT INTO expense_records (date, business_line, category, amount, vendor, description, ticket_type, ticket_no, payment_method, receipt_images, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(date, business_line, category, parseFloat(amount), vendor || '', description || '', ticket_type || '无票', ticket_no || '', payment_method || '银行转账', JSON.stringify(images), req.session.user.id);
    res.json({ success: true, id: result.lastInsertRowid });
  });

  // 获取单条支出记录
  router.get('/:id', requireAuth, (req, res) => {
    const record = db.prepare('SELECT * FROM expense_records WHERE id = ?').get(req.params.id);
    if (!record) return res.status(404).json({ error: '记录不存在' });
    if (!canAccessLine(req.session.user, record.business_line)) return res.status(403).json({ error: '无权限' });
    res.json(record);
  });

  // 编辑支出记录
  router.put('/:id', requireAuth, upload.array('receipts', 10), (req, res) => {
    const record = db.prepare('SELECT * FROM expense_records WHERE id = ?').get(req.params.id);
    if (!record) return res.status(404).json({ error: '记录不存在' });
    if (!canAccessLine(req.session.user, record.business_line)) return res.status(403).json({ error: '无权限操作此业务线' });
    const { date, business_line, category, amount, vendor, description, ticket_type, ticket_no, payment_method } = req.body;
    const newImages = (req.files || []).map(f => f.filename);
    // 合并已有图片和新上传的图片
    const existingImages = JSON.parse(record.receipt_images || '[]');
    const images = [...existingImages, ...newImages];
    db.prepare(
      'UPDATE expense_records SET date=?, business_line=?, category=?, amount=?, vendor=?, description=?, ticket_type=?, ticket_no=?, payment_method=?, receipt_images=? WHERE id=?'
    ).run(date || record.date, business_line || record.business_line, category || record.category,
      amount ? parseFloat(amount) : record.amount, vendor !== undefined ? vendor : record.vendor,
      description !== undefined ? description : record.description,
      ticket_type || record.ticket_type, ticket_no !== undefined ? ticket_no : record.ticket_no,
      payment_method || record.payment_method, JSON.stringify(images), req.params.id);
    res.json({ success: true });
  });

  router.get('/', requireAuth, (req, res) => {
    const { start_date, end_date, business_line, category, page = 1, limit = 50 } = req.query;
    let where = [];
    let params = [];
    if (!isAdmin(req.session.user)) {
      where.push('business_line = ?');
      params.push(req.session.user.business_line);
    } else if (business_line) {
      where.push('business_line = ?');
      params.push(business_line);
    }
    if (start_date) { where.push('date >= ?'); params.push(start_date); }
    if (end_date) { where.push('date <= ?'); params.push(end_date); }
    if (category) { where.push('category = ?'); params.push(category); }
    const whereStr = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const rows = db.prepare(`SELECT e.*, u.name as creator_name FROM expense_records e LEFT JOIN users u ON e.created_by = u.id ${whereStr} ORDER BY date DESC, id DESC LIMIT ? OFFSET ?`).all(...params, parseInt(limit), offset);
    const total = db.prepare(`SELECT COUNT(*) as cnt FROM expense_records ${whereStr}`).get(...params).cnt;
    res.json({ rows, total });
  });

  // 删除支出记录中的单张票据图片
  router.delete('/:id/receipts/:filename', requireAuth, (req, res) => {
    const record = db.prepare('SELECT * FROM expense_records WHERE id = ?').get(req.params.id);
    if (!record) return res.status(404).json({ error: '记录不存在' });
    if (!canAccessLine(req.session.user, record.business_line)) return res.status(403).json({ error: '无权限' });
    const images = JSON.parse(record.receipt_images || '[]');
    const updated = images.filter(f => f !== req.params.filename);
    // 删除物理文件
    try {
      const p = path.join(uploadsDir, 'receipts', req.params.filename);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    } catch (e) {}
    db.prepare('UPDATE expense_records SET receipt_images=? WHERE id=?').run(JSON.stringify(updated), req.params.id);
    res.json({ success: true });
  });

  router.delete('/:id', requireAuth, (req, res) => {
    const record = db.prepare('SELECT * FROM expense_records WHERE id = ?').get(req.params.id);
    if (!record) return res.status(404).json({ error: '记录不存在' });
    if (!isAdmin(req.session.user) && record.business_line !== req.session.user.business_line) return res.status(403).json({ error: '无权限' });
    // 删除票据图片
    try {
      const images = JSON.parse(record.receipt_images || '[]');
      images.forEach(img => {
        const p = path.join(uploadsDir, 'receipts', img);
        if (fs.existsSync(p)) fs.unlinkSync(p);
      });
    } catch (e) {}
    db.prepare('DELETE FROM expense_records WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  });

  return router;
};

function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: '未登录' });
  next();
}
function isAdmin(user) { return user.role === 'admin'; }
function canAccessLine(user, line) { return user.role === 'admin' || user.business_line === line; }
