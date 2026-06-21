const express = require('express');
const router = express.Router();
const ExcelJS = require('exceljs');

const BL_NAMES = { tea: '茶饮店', train: '观光小火车', fishing: '稻田抓泥鳅', events: '活动承接', common: '公司公共' };
const BL_KEYS = Object.keys(BL_NAMES);

module.exports = (db) => {
  // 汇总统计（首页仪表盘用）
  router.get('/summary', requireAuth, (req, res) => {
    const { year, month } = req.query;
    let dateFilter = '';
    let params = [];
    if (year && month) {
      const pad = String(month).padStart(2, '0');
      dateFilter = `AND date LIKE '${year}-${pad}%'`;
    } else if (year) {
      dateFilter = `AND date LIKE '${year}%'`;
    }

    const blFilter = isAdmin(req.session.user) ? '' : `AND business_line = '${req.session.user.business_line}'`;

    const incomeByLine = db.prepare(`
      SELECT business_line, SUM(amount) as total FROM income_records WHERE 1=1 ${dateFilter} ${blFilter} GROUP BY business_line
    `).all();

    const expenseByLine = db.prepare(`
      SELECT business_line, SUM(amount) as total FROM expense_records WHERE 1=1 ${dateFilter} ${blFilter} GROUP BY business_line
    `).all();

    const expenseByCategory = db.prepare(`
      SELECT category, SUM(amount) as total FROM expense_records WHERE 1=1 ${dateFilter} ${blFilter} GROUP BY category ORDER BY total DESC
    `).all();

    const totalIncome = incomeByLine.reduce((s, r) => s + r.total, 0);
    const totalExpense = expenseByLine.reduce((s, r) => s + r.total, 0);

    // 月度趋势（最近6个月）
    const trend = db.prepare(`
      SELECT substr(date,1,7) as month,
        SUM(CASE WHEN source_table='income' THEN amount ELSE 0 END) as income,
        SUM(CASE WHEN source_table='expense' THEN amount ELSE 0 END) as expense
      FROM (
        SELECT date, amount, 'income' as source_table FROM income_records WHERE 1=1 ${blFilter}
        UNION ALL
        SELECT date, amount, 'expense' as source_table FROM expense_records WHERE 1=1 ${blFilter}
      ) GROUP BY month ORDER BY month DESC LIMIT 6
    `).all().reverse();

    res.json({ totalIncome, totalExpense, profit: totalIncome - totalExpense, incomeByLine, expenseByLine, expenseByCategory, trend });
  });

  // 导出月度报表 Excel
  router.get('/export', requireAuth, async (req, res) => {
    const { year, month } = req.query;
    if (!year || !month) return res.status(400).json({ error: '请指定年月' });
    const pad = String(month).padStart(2, '0');
    const datePrefix = `${year}-${pad}`;
    const blFilter = isAdmin(req.session.user) ? '' : `AND business_line = '${req.session.user.business_line}'`;

    const incomes = db.prepare(`SELECT i.*, u.name as creator_name FROM income_records i LEFT JOIN users u ON i.created_by = u.id WHERE date LIKE '${datePrefix}%' ${blFilter} ORDER BY date, business_line`).all();
    const expenses = db.prepare(`SELECT e.*, u.name as creator_name FROM expense_records e LEFT JOIN users u ON e.created_by = u.id WHERE date LIKE '${datePrefix}%' ${blFilter} ORDER BY date, business_line`).all();

    const wb = new ExcelJS.Workbook();
    wb.creator = '乡村产业运营公司记账系统';

    // 封面汇总
    const summarySheet = wb.addWorksheet('月度汇总');
    styleSheet(summarySheet);
    summarySheet.addRow([`${year}年${month}月 财务汇总报表`]);
    summarySheet.getRow(1).font = { bold: true, size: 16 };
    summarySheet.addRow([]);

    const totalIncome = incomes.reduce((s, r) => s + r.amount, 0);
    const totalExpense = expenses.reduce((s, r) => s + r.amount, 0);
    summarySheet.addRow(['项目', '收入', '支出', '利润']);
    summarySheet.getRow(3).font = { bold: true };

    BL_KEYS.forEach(bl => {
      const inc = incomes.filter(r => r.business_line === bl).reduce((s, r) => s + r.amount, 0);
      const exp = expenses.filter(r => r.business_line === bl).reduce((s, r) => s + r.amount, 0);
      summarySheet.addRow([BL_NAMES[bl], fmtMoney(inc), fmtMoney(exp), fmtMoney(inc - exp)]);
    });
    summarySheet.addRow([]);
    const totalRow = summarySheet.addRow(['合计', fmtMoney(totalIncome), fmtMoney(totalExpense), fmtMoney(totalIncome - totalExpense)]);
    totalRow.font = { bold: true };
    summarySheet.columns = [{ width: 20 }, { width: 15 }, { width: 15 }, { width: 15 }];

    // 收入明细
    const incSheet = wb.addWorksheet('收入明细');
    styleSheet(incSheet);
    incSheet.addRow(['日期', '业务线', '金额', '支付方式', '类别', '票据类型', '票号', '说明', '录入人']);
    incSheet.getRow(1).font = { bold: true };
    incomes.forEach(r => incSheet.addRow([r.date, BL_NAMES[r.business_line] || r.business_line, r.amount, r.payment_method, r.category, r.ticket_type || '无票', r.ticket_no || '', r.description, r.creator_name]));
    incSheet.columns = [{ width: 14 }, { width: 16 }, { width: 12 }, { width: 12 }, { width: 14 }, { width: 16 }, { width: 18 }, { width: 30 }, { width: 12 }];

    // 支出明细
    const expSheet = wb.addWorksheet('支出明细');
    styleSheet(expSheet);
    expSheet.addRow(['日期', '业务线', '类别', '金额', '供应商/收款方', '票据类型', '票号', '说明', '录入人']);
    expSheet.getRow(1).font = { bold: true };
    expenses.forEach(r => expSheet.addRow([r.date, BL_NAMES[r.business_line] || r.business_line, r.category, r.amount, r.vendor, r.ticket_type || '无票', r.ticket_no || '', r.description, r.creator_name]));
    expSheet.columns = [{ width: 14 }, { width: 16 }, { width: 16 }, { width: 12 }, { width: 18 }, { width: 16 }, { width: 18 }, { width: 30 }, { width: 12 }];

    // 票据汇总（无票收入/支出统计，供代理记账参考）
    const ticketSheet = wb.addWorksheet('票据汇总');
    styleSheet(ticketSheet);
    ticketSheet.addRow([`${year}年${month}月 票据情况汇总`]);
    ticketSheet.getRow(1).font = { bold: true, size: 13 };
    ticketSheet.addRow([]);
    ticketSheet.addRow(['类型', '票据类型', '笔数', '金额']);
    ticketSheet.getRow(3).font = { bold: true };
    const ticketTypes = ['增值税专用发票', '增值税普通发票', '收据', '无票'];
    ticketTypes.forEach(tt => {
      const rows = incomes.filter(r => (r.ticket_type || '无票') === tt);
      if (rows.length) ticketSheet.addRow(['收入', tt, rows.length, fmtMoney(rows.reduce((s, r) => s + r.amount, 0))]);
    });
    ticketTypes.forEach(tt => {
      const rows = expenses.filter(r => (r.ticket_type || '无票') === tt);
      if (rows.length) ticketSheet.addRow(['支出', tt, rows.length, fmtMoney(rows.reduce((s, r) => s + r.amount, 0))]);
    });
    const noTicketInc = incomes.filter(r => !r.ticket_type || r.ticket_type === '无票').reduce((s, r) => s + r.amount, 0);
    const noTicketExp = expenses.filter(r => !r.ticket_type || r.ticket_type === '无票').reduce((s, r) => s + r.amount, 0);
    ticketSheet.addRow([]);
    ticketSheet.addRow(['⚠️ 无票收入合计', '', '', fmtMoney(noTicketInc)]);
    ticketSheet.addRow(['⚠️ 无票支出合计（无法抵税）', '', '', fmtMoney(noTicketExp)]);
    ticketSheet.columns = [{ width: 22 }, { width: 20 }, { width: 8 }, { width: 15 }];

    // 支出分类汇总
    const catSheet = wb.addWorksheet('支出分类');
    styleSheet(catSheet);
    catSheet.addRow(['支出类别', '金额', '占比']);
    catSheet.getRow(1).font = { bold: true };
    const catMap = {};
    expenses.forEach(r => { catMap[r.category] = (catMap[r.category] || 0) + r.amount; });
    Object.entries(catMap).sort((a, b) => b[1] - a[1]).forEach(([cat, amt]) => {
      catSheet.addRow([cat, fmtMoney(amt), totalExpense > 0 ? ((amt / totalExpense * 100).toFixed(1) + '%') : '0%']);
    });
    catSheet.columns = [{ width: 20 }, { width: 15 }, { width: 10 }];

    const filename = `report_${year}${pad}.xlsx`;
    const displayName = encodeURIComponent(`${year}年${pad}月财务报表.xlsx`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"; filename*=UTF-8''${displayName}`);
    await wb.xlsx.write(res);
    res.end();
  });

  return router;
};

function styleSheet(sheet) {
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F5E9' } };
}
function fmtMoney(v) { return parseFloat((v || 0).toFixed(2)); }
function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: '未登录' });
  next();
}
function isAdmin(user) { return user.role === 'admin'; }
