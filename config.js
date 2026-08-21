// 账簿 · 财务管理系统 — 统一配置模块
// 所有可配置项从此文件获取，优先级：.env > 默认值

const path = require('path');
const crypto = require('crypto');

// 加载 .env（尽早执行）
try {
  require('dotenv').config();
} catch (e) {
  // dotenv 未安装时静默跳过，使用默认值
}

function env(key, fallback) {
  const val = process.env[key];
  return val !== undefined && val !== '' ? val : fallback;
}

function envInt(key, fallback) {
  const val = parseInt(process.env[key]);
  return isNaN(val) ? fallback : val;
}

function envFloat(key, fallback) {
  const val = parseFloat(process.env[key]);
  return isNaN(val) ? fallback : val;
}

function envBool(key, fallback) {
  if (process.env[key] === undefined || process.env[key] === '') return fallback;
  return process.env[key] !== 'false' && process.env[key] !== '0';
}

// ── 解析结构化配置 ──

function parseBusinessLines(str) {
  if (!str) return [];
  return str.split(';').filter(Boolean).map(g => {
    const [code, name, color, sort_order] = g.split(':');
    return { code: code.trim(), name: name.trim(), color: color.trim(), sort_order: parseInt(sort_order) || 0 };
  });
}

function parseManagers(str) {
  if (!str) return [];
  return str.split(';').filter(Boolean).map(g => {
    const [name, username, business_line] = g.split(':');
    return { name: name.trim(), username: username.trim(), business_line: business_line.trim() };
  });
}

function parseCsv(str) {
  if (!str) return [];
  return str.split(',').map(s => s.trim()).filter(Boolean);
}

function parseTaxBrackets(str) {
  if (!str) return null;
  try {
    const arr = JSON.parse(str);
    // 按阈值降序排列
    arr.sort((a, b) => b.threshold - a.threshold);
    return arr;
  } catch (e) {
    console.error('⚠️  TAX_BRACKETS_JSON 解析失败，使用默认值');
    return null;
  }
}

function parseDeductionTypes(str) {
  if (!str) return [];
  return str.split(',').map(s => {
    const trimmed = s.trim();
    if (!trimmed) return null;
    const [name, amountStr] = trimmed.split(':');
    return { name: name.trim(), amount: parseFloat(amountStr) || 0 };
  }).filter(Boolean);
}

// ── 配置对象 ──

const config = {
  // 服务端
  PORT: envInt('PORT', 3000),
  BIND_ADDRESS: env('BIND_ADDRESS', '0.0.0.0'),
  UPLOADS_DIR: path.resolve(env('UPLOADS_DIR', 'uploads')),
  SESSION_SECRET: env('SESSION_SECRET', '') || crypto.randomBytes(32).toString('hex'),
  SESSION_MAX_AGE: envInt('SESSION_MAX_AGE_MS', 7 * 24 * 60 * 60 * 1000),

  // 品牌
  APP_NAME: env('APP_NAME', '账簿'),
  APP_SHORT_NAME: env('APP_SHORT_NAME', '账簿'),
  APP_TAGLINE: env('APP_TAGLINE', '财务管理系统'),
  APP_DESCRIPTION: env('APP_DESCRIPTION', '轻量级企业财务管理系统'),
  COMPANY_NAME: env('COMPANY_NAME', '凤鸣'),
  HTML_TITLE: env('HTML_TITLE', '账簿 · 财务管理系统'),
  HTML_LANG: env('HTML_LANG', 'zh-CN'),
  FONT_FAMILY: env('FONT_FAMILY', "'PingFang SC', -apple-system, 'Helvetica Neue', 'Microsoft YaHei', sans-serif"),
  LOCALE: env('LOCALE', 'zh-CN'),

  // 登录页
  LOGIN_HEADLINE: env('LOGIN_HEADLINE', '精准记录，<br>清晰决策'),
  LOGIN_SUBTEXT: env('LOGIN_SUBTEXT', '收支管理 · 票据追踪 · 财务报表<br>为您的团队提供专业财务管理工具'),
  LOGIN_TITLE: env('LOGIN_TITLE', '登录'),
  LOGIN_SUBTITLE: env('LOGIN_SUBTITLE', '请输入您的账号信息'),

  // 地区/社保
  CITY_NAME: env('CITY_NAME', '惠州'),
  CITY_PROVINCE: env('CITY_PROVINCE', '广东省'),
  SS_YEAR: env('SS_YEAR', '2026'),
  SS_RATES: {
    pension_personal:      envFloat('SS_PENSION_PERSONAL', 0.08),
    pension_company:       envFloat('SS_PENSION_COMPANY', 0.14),
    medical_personal:      envFloat('SS_MEDICAL_PERSONAL', 0.02),
    medical_company:       envFloat('SS_MEDICAL_COMPANY', 0.065),
    unemployment_personal: envFloat('SS_UNEMPLOYMENT_PERSONAL', 0.002),
    unemployment_company:  envFloat('SS_UNEMPLOYMENT_COMPANY', 0.005),
    injury_company:        envFloat('SS_INJURY_COMPANY', 0.002),
    maternity_company:     envFloat('SS_MATERNITY_COMPANY', 0.0),
  },

  // 税务
  TAX_EXEMPTION: envFloat('TAX_EXEMPTION', 5000),
  TAX_BRACKETS: parseTaxBrackets(env('TAX_BRACKETS_JSON', '')) || [
    { threshold: 80000, rate: 0.45, deduction: 15160 },
    { threshold: 55000, rate: 0.35, deduction:  7160 },
    { threshold: 35000, rate: 0.30, deduction:  4410 },
    { threshold: 25000, rate: 0.25, deduction:  2660 },
    { threshold: 12000, rate: 0.20, deduction:  1410 },
    { threshold:  3000, rate: 0.10, deduction:   210 },
    { threshold:     0, rate: 0.03, deduction:     0 },
  ],

  // 管理员
  ADMIN_USERNAME: env('ADMIN_USERNAME', 'admin'),
  ADMIN_PASSWORD: env('ADMIN_PASSWORD', 'admin123'),
  ADMIN_DISPLAY_NAME: env('ADMIN_DISPLAY_NAME', '管理员'),
  MANAGER_DEFAULT_PASSWORD: env('MANAGER_DEFAULT_PASSWORD', 'manager123'),

  // 种子数据
  SEED_ON_FIRST_RUN: envBool('SEED_ON_FIRST_RUN', true),
  SEED_BUSINESS_LINES: parseBusinessLines(env('SEED_BUSINESS_LINES', '')) || [
    { code: 'main', name: '主营业务', color: '#2e7d32', sort_order: 1 },
    { code: 'secondary', name: '辅助业务', color: '#1565c0', sort_order: 2 },
    { code: 'project', name: '项目业务', color: '#e65100', sort_order: 3 },
    { code: 'common', name: '公司公共', color: '#757575', sort_order: 4 },
  ],
  SEED_INCOME_CATEGORIES: parseCsv(env('SEED_INCOME_CATEGORIES', '')) || [
    '主营业务收入', '服务收入', '产品销售收入', '项目收入', '活动收入', '其他收入'
  ],
  SEED_EXPENSE_CATEGORIES: parseCsv(env('SEED_EXPENSE_CATEGORIES', '')) || [
    '原材料采购', '商品采购', '项目物资', '人力成本', '水电费', '办公耗材', '设备维修', '租金', '运输费', '市场推广', '其他支出'
  ],
  SEED_MANAGERS: parseManagers(env('SEED_MANAGERS', '')) || [],

  // 支付方式 / 票据类型
  PAYMENT_METHODS: parseCsv(env('PAYMENT_METHODS', '')) || [
    '现金', '微信支付', '支付宝', '农商支付', '银行转账', '混合'
  ],
  TICKET_TYPES: parseCsv(env('TICKET_TYPES', '')) || [
    '增值税专用发票', '增值税普通发票', '收据', '无票'
  ],

  // 专项扣除
  SPECIAL_DEDUCTION_TYPES: parseDeductionTypes(env('SPECIAL_DEDUCTION_TYPES', '')) || [
    { name: '子女教育', amount: 2000 },
    { name: '继续教育', amount: 400 },
    { name: '住房贷款利息', amount: 1000 },
    { name: '住房租金', amount: 800 },
    { name: '赡养老人', amount: 2000 },
  ],

  // 数据库
  DB_PATH: env('DB_PATH', path.join(__dirname, 'db', 'accounting.db')),
};

module.exports = config;
