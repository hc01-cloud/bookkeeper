const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();

module.exports = (db) => {
  router.post('/login', (req, res) => {
    const { username, password } = req.body;
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    if (!user || !bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }
    req.session.user = { id: user.id, name: user.name, role: user.role, business_line: user.business_line };
    res.json({ success: true, user: req.session.user });
  });

  router.post('/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
  });

  router.get('/me', (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: '未登录' });
    res.json(req.session.user);
  });

  router.get('/users', requireAdmin, (req, res) => {
    const users = db.prepare('SELECT id, name, username, role, business_line, created_at FROM users ORDER BY id').all();
    res.json(users);
  });

  router.post('/users', requireAdmin, (req, res) => {
    const { name, username, password, role, business_line } = req.body;
    if (!name || !username || !password) return res.status(400).json({ error: '信息不完整' });
    try {
      const hash = bcrypt.hashSync(password, 10);
      const result = db.prepare('INSERT INTO users (name, username, password, role, business_line) VALUES (?, ?, ?, ?, ?)')
        .run(name, username, hash, role || 'manager', business_line || null);
      res.json({ success: true, id: result.lastInsertRowid });
    } catch (e) {
      res.status(400).json({ error: '用户名已存在' });
    }
  });

  router.put('/users/:id/password', requireAdmin, (req, res) => {
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: '密码不能为空' });
    const hash = bcrypt.hashSync(password, 10);
    db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hash, req.params.id);
    res.json({ success: true });
  });

  router.delete('/users/:id', requireAdmin, (req, res) => {
    if (parseInt(req.params.id) === req.session.user.id) return res.status(400).json({ error: '不能删除自己' });
    db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  });

  function requireAdmin(req, res, next) {
    if (!req.session.user) return res.status(401).json({ error: '未登录' });
    if (req.session.user.role !== 'admin') return res.status(403).json({ error: '无权限' });
    next();
  }

  return router;
};
