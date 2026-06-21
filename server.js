const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const { initDB } = require('./db/schema');

const app = express();
const PORT = 3000;
const UPLOADS_DIR = path.join(__dirname, 'uploads');

fs.mkdirSync(path.join(UPLOADS_DIR, 'shifts'), { recursive: true });
fs.mkdirSync(path.join(UPLOADS_DIR, 'receipts'), { recursive: true });
fs.mkdirSync(path.join(UPLOADS_DIR, 'csv'), { recursive: true });

const db = initDB();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOADS_DIR));

app.use(session({
  secret: 'fengming-accounting-2024',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 }
}));

app.use('/api/auth', require('./routes/auth')(db));
app.use('/api/income', require('./routes/income')(db, UPLOADS_DIR));
app.use('/api/expense', require('./routes/expense')(db, UPLOADS_DIR));
app.use('/api/reports', require('./routes/reports')(db));
app.use('/api/settings', require('./routes/settings')(db));
app.use('/api/config', require('./routes/config')(db));
app.use('/api/payroll', require('./routes/payroll')(db));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  const { networkInterfaces } = require('os');
  const nets = networkInterfaces();
  let localIP = 'localhost';
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) { localIP = net.address; break; }
    }
  }
  console.log(`\n✅ 凤鸣记账系统已启动`);
  console.log(`   本机访问: http://localhost:${PORT}`);
  console.log(`   局域网访问: http://${localIP}:${PORT}`);
  console.log(`\n   管理员账户: admin / admin123`);
  console.log(`   各负责人默认密码: manager123\n`);
});
