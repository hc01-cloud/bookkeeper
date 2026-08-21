const config = require('./config');

const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const { initDB } = require('./db/schema');

const app = express();
const PORT = config.PORT;
const UPLOADS_DIR = config.UPLOADS_DIR;

fs.mkdirSync(path.join(UPLOADS_DIR, 'shifts'), { recursive: true });
fs.mkdirSync(path.join(UPLOADS_DIR, 'receipts'), { recursive: true });
fs.mkdirSync(path.join(UPLOADS_DIR, 'csv'), { recursive: true });
fs.mkdirSync(path.join(UPLOADS_DIR, 'ocr_temp'), { recursive: true });

const db = initDB(config);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOADS_DIR));

app.use(session({
  secret: config.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: config.SESSION_MAX_AGE }
}));

// ── 品牌配置 API（无需登录）──────────────────────────
app.get('/api/branding', (req, res) => {
  res.json({
    appName: config.APP_NAME,
    appShortName: config.APP_SHORT_NAME,
    appTagline: config.APP_TAGLINE,
    companyName: config.COMPANY_NAME,
    htmlTitle: config.HTML_TITLE,
    htmlLang: config.HTML_LANG,
    fontFamily: config.FONT_FAMILY,
    locale: config.LOCALE,
    loginHeadline: config.LOGIN_HEADLINE,
    loginSubtext: config.LOGIN_SUBTEXT,
    loginTitle: config.LOGIN_TITLE,
    loginSubtitle: config.LOGIN_SUBTITLE,
    cityName: config.CITY_NAME,
    cityProvince: config.CITY_PROVINCE,
    ssYear: config.SS_YEAR,
    ssRates: config.SS_RATES,
    taxExemption: config.TAX_EXEMPTION,
    paymentMethods: config.PAYMENT_METHODS,
    ticketTypes: config.TICKET_TYPES,
    specialDeductionTypes: config.SPECIAL_DEDUCTION_TYPES,
  });
});

// ── API 路由 ──────────────────────────────────────────
app.use('/api/auth', require('./routes/auth')(db));
app.use('/api/income', require('./routes/income')(db, UPLOADS_DIR));
app.use('/api/expense', require('./routes/expense')(db, UPLOADS_DIR));
app.use('/api/reports', require('./routes/reports')(db, config));
app.use('/api/settings', require('./routes/settings')(db));
app.use('/api/config', require('./routes/config')(db));
app.use('/api/payroll', require('./routes/payroll')(db, config));

// ── SPA fallback ──────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── 启动 ──────────────────────────────────────────────
app.listen(PORT, config.BIND_ADDRESS, () => {
  const { networkInterfaces } = require('os');
  const nets = networkInterfaces();
  let localIP = 'localhost';
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) { localIP = net.address; break; }
    }
  }
  const appLabel = config.COMPANY_NAME ? `${config.COMPANY_NAME}记账系统` : '记账系统';
  console.log(`\n✅ ${appLabel}已启动`);
  console.log(`   本机访问: http://localhost:${PORT}`);
  console.log(`   局域网访问: http://${localIP}:${PORT}`);
  console.log(`\n   管理员账户: ${config.ADMIN_USERNAME} / ${config.ADMIN_PASSWORD}`);
  if (config.SEED_MANAGERS.length > 0) {
    console.log(`   各负责人默认密码: ${config.MANAGER_DEFAULT_PASSWORD}\n`);
  } else {
    console.log();
  }
});
