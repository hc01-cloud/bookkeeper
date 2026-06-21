const express = require('express');
const router = express.Router();

module.exports = (db) => {

  // ── 业务线 ────────────────────────────────────────────
  router.get('/business-lines', requireAuth, (req, res) => {
    res.json(db.prepare('SELECT * FROM business_lines WHERE is_active=1 ORDER BY sort_order, id').all());
  });

  router.post('/business-lines', requireAdmin, (req, res) => {
    const { name, color } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: '名称不能为空' });
    const code = 'bl_' + Date.now();
    const maxOrder = db.prepare('SELECT MAX(sort_order) as m FROM business_lines').get().m || 0;
    try {
      const r = db.prepare('INSERT INTO business_lines (code, name, color, sort_order) VALUES (?, ?, ?, ?)').run(code, name.trim(), color || '#4caf50', maxOrder + 1);
      res.json({ success: true, id: r.lastInsertRowid, code });
    } catch (e) { res.status(400).json({ error: e.message }); }
  });

  router.put('/business-lines/:id', requireAdmin, (req, res) => {
    const { name, color, sort_order } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: '名称不能为空' });
    db.prepare('UPDATE business_lines SET name=?, color=?, sort_order=? WHERE id=?').run(name.trim(), color || '#4caf50', sort_order || 0, req.params.id);
    res.json({ success: true });
  });

  router.delete('/business-lines/:id', requireAdmin, (req, res) => {
    const bl = db.prepare('SELECT * FROM business_lines WHERE id=?').get(req.params.id);
    if (!bl) return res.status(404).json({ error: '不存在' });
    const used = db.prepare('SELECT COUNT(*) as cnt FROM income_records WHERE business_line=?').get(bl.code).cnt
                + db.prepare('SELECT COUNT(*) as cnt FROM expense_records WHERE business_line=?').get(bl.code).cnt;
    if (used > 0) return res.status(400).json({ error: `该业务线已有 ${used} 条记录，不能删除，可重命名代替` });
    db.prepare('DELETE FROM business_lines WHERE id=?').run(req.params.id);
    res.json({ success: true });
  });

  // ── 收入类目 ──────────────────────────────────────────
  router.get('/income-categories', requireAuth, (req, res) => {
    res.json(db.prepare('SELECT * FROM income_categories WHERE is_active=1 ORDER BY sort_order, id').all());
  });

  router.post('/income-categories', requireAdmin, (req, res) => {
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: '名称不能为空' });
    const maxOrder = db.prepare('SELECT MAX(sort_order) as m FROM income_categories').get().m || 0;
    try {
      const r = db.prepare('INSERT INTO income_categories (name, sort_order) VALUES (?, ?)').run(name.trim(), maxOrder + 1);
      res.json({ success: true, id: r.lastInsertRowid });
    } catch (e) { res.status(400).json({ error: '类目名称已存在' }); }
  });

  router.put('/income-categories/:id', requireAdmin, (req, res) => {
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: '名称不能为空' });
    try {
      db.prepare('UPDATE income_categories SET name=? WHERE id=?').run(name.trim(), req.params.id);
      res.json({ success: true });
    } catch (e) { res.status(400).json({ error: '类目名称已存在' }); }
  });

  router.delete('/income-categories/:id', requireAdmin, (req, res) => {
    db.prepare('UPDATE income_categories SET is_active=0 WHERE id=?').run(req.params.id);
    res.json({ success: true });
  });

  // ── 支出类目 ──────────────────────────────────────────
  router.get('/expense-categories', requireAuth, (req, res) => {
    res.json(db.prepare('SELECT * FROM expense_categories WHERE is_active=1 ORDER BY sort_order, id').all());
  });

  router.post('/expense-categories', requireAdmin, (req, res) => {
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: '名称不能为空' });
    const maxOrder = db.prepare('SELECT MAX(sort_order) as m FROM expense_categories').get().m || 0;
    try {
      const r = db.prepare('INSERT INTO expense_categories (name, sort_order) VALUES (?, ?)').run(name.trim(), maxOrder + 1);
      res.json({ success: true, id: r.lastInsertRowid });
    } catch (e) { res.status(400).json({ error: '类目名称已存在' }); }
  });

  router.put('/expense-categories/:id', requireAdmin, (req, res) => {
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: '名称不能为空' });
    try {
      db.prepare('UPDATE expense_categories SET name=? WHERE id=?').run(name.trim(), req.params.id);
      res.json({ success: true });
    } catch (e) { res.status(400).json({ error: '类目名称已存在' }); }
  });

  router.delete('/expense-categories/:id', requireAdmin, (req, res) => {
    db.prepare('UPDATE expense_categories SET is_active=0 WHERE id=?').run(req.params.id);
    res.json({ success: true });
  });

  return router;
};

function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: '未登录' });
  next();
}
function requireAdmin(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: '未登录' });
  if (req.session.user.role !== 'admin') return res.status(403).json({ error: '无权限' });
  next();
}
