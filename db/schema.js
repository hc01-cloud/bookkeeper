const { DatabaseSync } = require('node:sqlite');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'accounting.db');

function initDB() {
  const db = new DatabaseSync(DB_PATH);

  db.exec(`PRAGMA journal_mode = WAL`);
  db.exec(`PRAGMA foreign_keys = ON`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'manager',
      business_line TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS income_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      business_line TEXT NOT NULL,
      amount REAL NOT NULL,
      payment_method TEXT DEFAULT '现金',
      category TEXT DEFAULT '营业收入',
      description TEXT,
      source TEXT DEFAULT 'manual',
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS expense_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      business_line TEXT NOT NULL,
      category TEXT NOT NULL,
      amount REAL NOT NULL,
      vendor TEXT,
      description TEXT,
      receipt_images TEXT DEFAULT '[]',
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS business_lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      color TEXT DEFAULT '#4caf50',
      sort_order INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS income_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      sort_order INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS expense_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      sort_order INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS shift_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      business_line TEXT NOT NULL,
      shift_no TEXT,
      total_amount REAL NOT NULL,
      transaction_count INTEGER DEFAULT 0,
      cash_amount REAL DEFAULT 0,
      wechat_amount REAL DEFAULT 0,
      alipay_amount REAL DEFAULT 0,
      other_amount REAL DEFAULT 0,
      receipt_image TEXT,
      notes TEXT,
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 初始化业务线（仅首次）
  const blCount = db.prepare('SELECT COUNT(*) as cnt FROM business_lines').get().cnt;
  if (blCount === 0) {
    const insertBL = db.prepare('INSERT INTO business_lines (code, name, color, sort_order) VALUES (?, ?, ?, ?)');
    [
      ['main', '主营业务', '#2e7d32', 1],
      ['secondary', '辅助业务', '#1565c0', 2],
      ['project', '项目业务', '#e65100', 3],
      ['common', '公司公共', '#757575', 4],
    ].forEach(r => insertBL.run(...r));
  }

  // 初始化收入类目
  const incCatCount = db.prepare('SELECT COUNT(*) as cnt FROM income_categories').get().cnt;
  if (incCatCount === 0) {
    const insertIC = db.prepare('INSERT INTO income_categories (name, sort_order) VALUES (?, ?)');
    ['主营业务收入', '服务收入', '产品销售收入', '项目收入', '活动收入', '其他收入'].forEach((n, i) => insertIC.run(n, i + 1));
  }

  // 初始化支出类目
  const expCatCount = db.prepare('SELECT COUNT(*) as cnt FROM expense_categories').get().cnt;
  if (expCatCount === 0) {
    const insertEC = db.prepare('INSERT INTO expense_categories (name, sort_order) VALUES (?, ?)');
    ['原材料采购', '商品采购', '项目物资', '人力成本', '水电费', '办公耗材', '设备维修', '租金', '运输费', '市场推广', '其他支出'].forEach((n, i) => insertEC.run(n, i + 1));
  }

  // 工资相关表
  db.exec(`
    CREATE TABLE IF NOT EXISTS employees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      id_card TEXT,
      position TEXT,
      hire_date TEXT,
      ss_base REAL NOT NULL DEFAULT 0,
      base_salary REAL NOT NULL DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      note TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS employee_deductions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      monthly_amount REAL NOT NULL DEFAULT 0,
      note TEXT,
      FOREIGN KEY (employee_id) REFERENCES employees(id)
    );

    CREATE TABLE IF NOT EXISTS payroll_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL,
      employee_id INTEGER NOT NULL,
      base_salary REAL NOT NULL,
      bonus REAL DEFAULT 0,
      other_income REAL DEFAULT 0,
      gross_salary REAL NOT NULL,
      ss_base REAL NOT NULL,
      pension_personal REAL NOT NULL,
      medical_personal REAL NOT NULL,
      unemployment_personal REAL NOT NULL,
      total_personal_ss REAL NOT NULL,
      special_deductions REAL DEFAULT 0,
      taxable_income REAL NOT NULL,
      income_tax REAL NOT NULL DEFAULT 0,
      net_salary REAL NOT NULL,
      pension_company REAL NOT NULL,
      medical_company REAL NOT NULL,
      unemployment_company REAL NOT NULL,
      injury_company REAL NOT NULL,
      maternity_company REAL NOT NULL,
      total_company_ss REAL NOT NULL,
      total_cost REAL NOT NULL,
      note TEXT,
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS ss_config (
      key TEXT PRIMARY KEY,
      value REAL NOT NULL
    );
  `);

  // 初始化社保比例（惠州2024）
  // 社保比例（广东惠州2026年，INSERT OR REPLACE 保证始终为最新值）
  const ups = db.prepare("INSERT OR REPLACE INTO ss_config (key, value) VALUES (?, ?)");
  [
    ['pension_personal',      0.08  ],  // 养老 个人 8%
    ['pension_company',       0.14  ],  // 养老 公司 14%
    ['medical_personal',      0.02  ],  // 医疗 个人 2%
    ['medical_company',       0.065 ],  // 医疗 公司 6.5%（含生育，已并入）
    ['unemployment_personal', 0.002 ],  // 失业 个人 0.2%
    ['unemployment_company',  0.005 ],  // 失业 公司 0.5%
    ['injury_company',        0.002 ],  // 工伤 公司 0.2%（基准费率，按行业浮动）
    ['maternity_company',     0.0   ],  // 生育 公司 0%（已并入医疗保险）
  ].forEach(([k, v]) => ups.run(k, v));

  // 迁移：添加票据字段（已存在则忽略）
  const incCols = db.prepare("PRAGMA table_info(income_records)").all().map(c => c.name);
  if (!incCols.includes('ticket_type')) db.exec("ALTER TABLE income_records ADD COLUMN ticket_type TEXT DEFAULT '无票'");
  if (!incCols.includes('ticket_no'))   db.exec("ALTER TABLE income_records ADD COLUMN ticket_no TEXT");

  const expCols = db.prepare("PRAGMA table_info(expense_records)").all().map(c => c.name);
  if (!expCols.includes('ticket_type')) db.exec("ALTER TABLE expense_records ADD COLUMN ticket_type TEXT DEFAULT '无票'");
  if (!expCols.includes('ticket_no'))   db.exec("ALTER TABLE expense_records ADD COLUMN ticket_no TEXT");

  // 创建默认管理员
  const admin = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
  if (!admin) {
    const hash = bcrypt.hashSync('admin123', 10);
    db.prepare(`INSERT INTO users (name, username, password, role, business_line) VALUES (?, ?, ?, ?, ?)`)
      .run('管理员', 'admin', hash, 'admin', null);

    const managers = [
      ['茶饮店负责人', 'chadian', 'manager123', 'manager', 'tea'],
      ['小火车负责人', 'huoche', 'manager123', 'manager', 'train'],
      ['泥鳅项目负责人', 'niqiu', 'manager123', 'manager', 'fishing'],
      ['活动承接负责人', 'huodong', 'manager123', 'manager', 'events'],
    ];
    const insertUser = db.prepare(`INSERT INTO users (name, username, password, role, business_line) VALUES (?, ?, ?, ?, ?)`);
    managers.forEach(m => insertUser.run(m[0], m[1], bcrypt.hashSync(m[2], 10), m[3], m[4]));
  }

  return db;
}

module.exports = { initDB, DB_PATH };
