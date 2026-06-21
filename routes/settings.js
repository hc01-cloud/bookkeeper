const express = require('express');
const router = express.Router();

module.exports = (db) => {
  router.get('/', requireAdmin, (req, res) => {
    const rows = db.prepare('SELECT key, value FROM settings').all();
    const result = {};
    rows.forEach(r => { result[r.key] = r.key === 'anthropic_api_key' ? maskKey(r.value) : r.value; });
    res.json(result);
  });

  router.post('/', requireAdmin, (req, res) => {
    const { anthropic_api_key } = req.body;
    if (anthropic_api_key !== undefined) {
      const val = anthropic_api_key.trim();
      if (val && !val.includes('*')) {
        db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP')
          .run('anthropic_api_key', val);
      }
    }
    res.json({ success: true });
  });

  return router;
};

function maskKey(key) {
  if (!key || key.length < 8) return key;
  return key.substring(0, 7) + '****' + key.substring(key.length - 4);
}

function requireAdmin(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: '未登录' });
  if (req.session.user.role !== 'admin') return res.status(403).json({ error: '无权限' });
  next();
}
