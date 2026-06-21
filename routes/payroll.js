const express = require('express');
const router = express.Router();
const ExcelJS = require('exceljs');

module.exports = (db) => {

  // ── 社保配置 ──────────────────────────────────────────
  router.get('/ss-config', requireAuth, (req, res) => {
    const rows = db.prepare('SELECT key, value FROM ss_config').all();
    const cfg = {};
    rows.forEach(r => cfg[r.key] = r.value);
    res.json(cfg);
  });

  router.put('/ss-config', requireAuth, isAdmin, (req, res) => {
    const ups = db.prepare('INSERT OR REPLACE INTO ss_config (key, value) VALUES (?, ?)');
    Object.entries(req.body).forEach(([k, v]) => ups.run(k, parseFloat(v)));
    res.json({ success: true });
  });

  // ── 员工管理 ──────────────────────────────────────────
  router.get('/employees', requireAuth, (req, res) => {
    const rows = db.prepare(`
      SELECT e.*, GROUP_CONCAT(d.type || ':' || d.monthly_amount || ':' || COALESCE(d.note,'') || ':' || d.id, '|') AS ded_raw
      FROM employees e
      LEFT JOIN employee_deductions d ON d.employee_id = e.id
      WHERE e.is_active = 1
      GROUP BY e.id
      ORDER BY e.name
    `).all();
    rows.forEach(r => {
      r.deductions = r.ded_raw ? r.ded_raw.split('|').map(s => {
        const [type, monthly_amount, note, id] = s.split(':');
        return { id: parseInt(id), type, monthly_amount: parseFloat(monthly_amount), note };
      }) : [];
      delete r.ded_raw;
    });
    res.json(rows);
  });

  router.post('/employees', requireAuth, isAdmin, (req, res) => {
    const { name, id_card, position, hire_date, ss_base, base_salary, note } = req.body;
    if (!name || !ss_base || !base_salary) return res.status(400).json({ error: '姓名、社保基数和基本工资必填' });
    const r = db.prepare(`INSERT INTO employees (name,id_card,position,hire_date,ss_base,base_salary,note) VALUES (?,?,?,?,?,?,?)`)
      .run(name, id_card||'', position||'', hire_date||'', parseFloat(ss_base), parseFloat(base_salary), note||'');
    res.json({ success: true, id: r.lastInsertRowid });
  });

  router.put('/employees/:id', requireAuth, isAdmin, (req, res) => {
    const { name, id_card, position, hire_date, ss_base, base_salary, note } = req.body;
    db.prepare(`UPDATE employees SET name=?,id_card=?,position=?,hire_date=?,ss_base=?,base_salary=?,note=? WHERE id=?`)
      .run(name, id_card||'', position||'', hire_date||'', parseFloat(ss_base), parseFloat(base_salary), note||'', req.params.id);
    res.json({ success: true });
  });

  router.delete('/employees/:id', requireAuth, isAdmin, (req, res) => {
    db.prepare('UPDATE employees SET is_active=0 WHERE id=?').run(req.params.id);
    res.json({ success: true });
  });

  // ── 专项附加扣除 ──────────────────────────────────────
  router.post('/employees/:id/deductions', requireAuth, isAdmin, (req, res) => {
    const { type, monthly_amount, note } = req.body;
    if (!type || !monthly_amount) return res.status(400).json({ error: '类型和金额必填' });
    const r = db.prepare('INSERT INTO employee_deductions (employee_id,type,monthly_amount,note) VALUES (?,?,?,?)')
      .run(req.params.id, type, parseFloat(monthly_amount), note||'');
    res.json({ success: true, id: r.lastInsertRowid });
  });

  router.put('/deductions/:id', requireAuth, isAdmin, (req, res) => {
    const { type, monthly_amount, note } = req.body;
    db.prepare('UPDATE employee_deductions SET type=?,monthly_amount=?,note=? WHERE id=?')
      .run(type, parseFloat(monthly_amount), note||'', req.params.id);
    res.json({ success: true });
  });

  router.delete('/deductions/:id', requireAuth, isAdmin, (req, res) => {
    db.prepare('DELETE FROM employee_deductions WHERE id=?').run(req.params.id);
    res.json({ success: true });
  });

  // ── 工资计算 ──────────────────────────────────────────
  router.post('/calculate', requireAuth, (req, res) => {
    const { employee_id, year, month, bonus = 0, other_income = 0 } = req.body;
    const emp = db.prepare('SELECT * FROM employees WHERE id=?').get(employee_id);
    if (!emp) return res.status(404).json({ error: '员工不存在' });

    const cfg = {};
    db.prepare('SELECT key,value FROM ss_config').all().forEach(r => cfg[r.key] = r.value);

    const deds = db.prepare('SELECT * FROM employee_deductions WHERE employee_id=?').all(employee_id);
    const specialDed = deds.reduce((s, d) => s + d.monthly_amount, 0);

    const result = calcPayroll(emp, parseFloat(bonus), parseFloat(other_income), specialDed, cfg);
    res.json(result);
  });

  // ── 保存工资单 ────────────────────────────────────────
  router.post('/records', requireAuth, (req, res) => {
    const d = req.body;
    const existing = db.prepare('SELECT id FROM payroll_records WHERE year=? AND month=? AND employee_id=?')
      .get(d.year, d.month, d.employee_id);
    if (existing) return res.status(400).json({ error: '该员工本月工资已存在，如需修改请先删除' });
    db.prepare(`INSERT INTO payroll_records
      (year,month,employee_id,base_salary,bonus,other_income,gross_salary,ss_base,
       pension_personal,medical_personal,unemployment_personal,total_personal_ss,
       special_deductions,taxable_income,income_tax,net_salary,
       pension_company,medical_company,unemployment_company,injury_company,maternity_company,
       total_company_ss,total_cost,note,created_by)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(d.year,d.month,d.employee_id,d.base_salary,d.bonus,d.other_income,d.gross_salary,
        d.ss_base,d.pension_personal,d.medical_personal,d.unemployment_personal,d.total_personal_ss,
        d.special_deductions,d.taxable_income,d.income_tax,d.net_salary,
        d.pension_company,d.medical_company,d.unemployment_company,d.injury_company,d.maternity_company,
        d.total_company_ss,d.total_cost,d.note||'',req.session.user.id);
    res.json({ success: true });
  });

  router.get('/records', requireAuth, (req, res) => {
    const { year, month } = req.query;
    let where = []; let params = [];
    if (year)  { where.push('r.year=?');  params.push(parseInt(year)); }
    if (month) { where.push('r.month=?'); params.push(parseInt(month)); }
    const sql = `SELECT r.*, e.name as emp_name, e.position FROM payroll_records r
      LEFT JOIN employees e ON e.id=r.employee_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY r.year DESC, r.month DESC, e.name`;
    res.json(db.prepare(sql).all(...params));
  });

  router.delete('/records/:id', requireAuth, isAdmin, (req, res) => {
    db.prepare('DELETE FROM payroll_records WHERE id=?').run(req.params.id);
    res.json({ success: true });
  });

  // ── 导出工资表 Excel ──────────────────────────────────
  router.get('/export', requireAuth, async (req, res) => {
    const { year, month } = req.query;
    if (!year || !month) return res.status(400).json({ error: '请指定年月' });
    const pad = String(month).padStart(2, '0');

    const rows = db.prepare(`SELECT r.*, e.name as emp_name, e.position FROM payroll_records r
      LEFT JOIN employees e ON e.id=r.employee_id
      WHERE r.year=? AND r.month=? ORDER BY e.name`).all(parseInt(year), parseInt(month));

    const wb = new ExcelJS.Workbook();
    wb.creator = '账簿工资管理系统';

    // 工资明细
    const ws = wb.addWorksheet(`${year}年${month}月工资表`);
    const headers = ['姓名','岗位','基本工资','奖金','其他收入','应发合计',
      '社保基数','养老(个人)','医疗(个人)','失业(个人)','个人社保合计',
      '专项附加扣除','应纳税所得额','个人所得税','实发工资',
      '养老(公司)','医疗(公司)','失业(公司)','工伤(公司)','生育(公司)','公司社保合计','企业用工总成本'];
    ws.addRow([`${year}年${pad}月 工资明细表`]);
    ws.getRow(1).font = { bold: true, size: 14 };
    ws.addRow([]);
    const hRow = ws.addRow(headers);
    hRow.font = { bold: true };
    hRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E0DC' } };

    rows.forEach(r => {
      ws.addRow([r.emp_name, r.position||'', r.base_salary, r.bonus, r.other_income, r.gross_salary,
        r.ss_base, r.pension_personal, r.medical_personal, r.unemployment_personal, r.total_personal_ss,
        r.special_deductions, r.taxable_income, r.income_tax, r.net_salary,
        r.pension_company, r.medical_company, r.unemployment_company, r.injury_company, r.maternity_company,
        r.total_company_ss, r.total_cost]);
    });

    // 合计行
    if (rows.length) {
      const sum = (key) => rows.reduce((s, r) => s + (r[key] || 0), 0);
      const totRow = ws.addRow(['合计', '', sum('base_salary'), sum('bonus'), sum('other_income'), sum('gross_salary'),
        '', sum('pension_personal'), sum('medical_personal'), sum('unemployment_personal'), sum('total_personal_ss'),
        sum('special_deductions'), sum('taxable_income'), sum('income_tax'), sum('net_salary'),
        sum('pension_company'), sum('medical_company'), sum('unemployment_company'), sum('injury_company'), sum('maternity_company'),
        sum('total_company_ss'), sum('total_cost')]);
      totRow.font = { bold: true };
    }

    ws.columns = [
      {width:10},{width:10},{width:10},{width:8},{width:8},{width:10},
      {width:10},{width:10},{width:10},{width:10},{width:12},
      {width:12},{width:14},{width:10},{width:10},
      {width:10},{width:10},{width:10},{width:10},{width:10},{width:12},{width:14}
    ];

    const displayName = encodeURIComponent(`${year}年${pad}月工资表.xlsx`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="payroll_${year}${pad}.xlsx"; filename*=UTF-8''${displayName}`);
    await wb.xlsx.write(res);
    res.end();
  });

  return router;
};

// ── 个税计算（月度简易法）────────────────────────────────
function calcIncomeTax(taxableMonthly) {
  if (taxableMonthly <= 0) return 0;
  const brackets = [
    [80000, 0.45, 15160],
    [55000, 0.35,  7160],
    [35000, 0.30,  4410],
    [25000, 0.25,  2660],
    [12000, 0.20,  1410],
    [ 3000, 0.10,   210],
    [    0, 0.03,     0],
  ];
  for (const [threshold, rate, deduction] of brackets) {
    if (taxableMonthly > threshold) {
      return round2(taxableMonthly * rate - deduction);
    }
  }
  return 0;
}

function calcPayroll(emp, bonus, otherIncome, specialDed, cfg) {
  const gross = round2(emp.base_salary + bonus + otherIncome);
  const base  = emp.ss_base;

  const pensionP      = round2(base * cfg.pension_personal);
  const medicalP      = round2(base * cfg.medical_personal);
  const unemploymentP = round2(base * cfg.unemployment_personal);
  const totalPersonalSS = round2(pensionP + medicalP + unemploymentP);

  // 应纳税所得额 = 应发 - 5000起征点 - 个人社保 - 专项附加扣除
  const taxable = Math.max(0, round2(gross - 5000 - totalPersonalSS - specialDed));
  const tax = calcIncomeTax(taxable);
  const net = round2(gross - totalPersonalSS - tax);

  const pensionC      = round2(base * cfg.pension_company);
  const medicalC      = round2(base * cfg.medical_company);
  const unemploymentC = round2(base * cfg.unemployment_company);
  const injuryC       = round2(base * cfg.injury_company);
  const maternityC    = round2(base * cfg.maternity_company);
  const totalCompanySS = round2(pensionC + medicalC + unemploymentC + injuryC + maternityC);
  const totalCost = round2(gross + totalCompanySS);

  return {
    base_salary: emp.base_salary, bonus, other_income: otherIncome, gross_salary: gross,
    ss_base: base,
    pension_personal: pensionP, medical_personal: medicalP, unemployment_personal: unemploymentP,
    total_personal_ss: totalPersonalSS,
    special_deductions: specialDed,
    taxable_income: taxable, income_tax: tax, net_salary: net,
    pension_company: pensionC, medical_company: medicalC, unemployment_company: unemploymentC,
    injury_company: injuryC, maternity_company: maternityC,
    total_company_ss: totalCompanySS, total_cost: totalCost,
  };
}

function round2(n) { return Math.round(n * 100) / 100; }

function requireAuth(req, res, next) {
  if (!req.session?.user) return res.status(401).json({ error: '未登录' });
  next();
}
function isAdmin(req, res, next) {
  if (req.session?.user?.role !== 'admin') return res.status(403).json({ error: '需要管理员权限' });
  next();
}
