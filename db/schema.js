const { DatabaseSync } = require('node:sqlite');
const bcrypt = require('bcryptjs');
const path = require('path');

function initDB(config) {
  const DB_PATH = config.DB_PATH;
  // 确保 db 目录存在
  const dbDir = path.dirname(DB_PATH);
  if (!require('fs').existsSync(dbDir)) {
    require('fs').mkdirSync(dbDir, { recursive: true });
  }

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

  // ── 种子数据（仅首次运行）─────────────────────────────
  if (config.SEED_ON_FIRST_RUN) {

    // 业务线
    const blCount = db.prepare('SELECT COUNT(*) as cnt FROM business_lines').get().cnt;
    if (blCount === 0) {
      const insertBL = db.prepare('INSERT INTO business_lines (code, name, color, sort_order) VALUES (?, ?, ?, ?)');
      (config.SEED_BUSINESS_LINES || []).forEach(bl => {
        insertBL.run(bl.code, bl.name, bl.color, bl.sort_order || 0);
      });
    }

    // 收入类目
    const incCatCount = db.prepare('SELECT COUNT(*) as cnt FROM income_categories').get().cnt;
    if (incCatCount === 0) {
      const insertIC = db.prepare('INSERT INTO income_categories (name, sort_order) VALUES (?, ?)');
      (config.SEED_INCOME_CATEGORIES || []).forEach((n, i) => insertIC.run(n, i + 1));
    }

    // 支出类目
    const expCatCount = db.prepare('SELECT COUNT(*) as cnt FROM expense_categories').get().cnt;
    if (expCatCount === 0) {
      const insertEC = db.prepare('INSERT INTO expense_categories (name, sort_order) VALUES (?, ?)');
      (config.SEED_EXPENSE_CATEGORIES || []).forEach((n, i) => insertEC.run(n, i + 1));
    }
  }

  // ── 工资 / 社保相关表（始终创建）───────────────────────
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

  // 社保比例（INSERT OR REPLACE 保证始终为最新配置值）
  const ups = db.prepare("INSERT OR REPLACE INTO ss_config (key, value) VALUES (?, ?)");
  const rates = config.SS_RATES;
  Object.entries(rates).forEach(([k, v]) => ups.run(k, v));

  // ── 表结构迁移（向前兼容）───────────────────────────────
  const incCols = db.prepare("PRAGMA table_info(income_records)").all().map(c => c.name);
  if (!incCols.includes('ticket_type')) db.exec("ALTER TABLE income_records ADD COLUMN ticket_type TEXT DEFAULT '无票'");
  if (!incCols.includes('ticket_no'))   db.exec("ALTER TABLE income_records ADD COLUMN ticket_no TEXT");

  const expCols = db.prepare("PRAGMA table_info(expense_records)").all().map(c => c.name);
  if (!expCols.includes('ticket_type'))    db.exec("ALTER TABLE expense_records ADD COLUMN ticket_type TEXT DEFAULT '无票'");
  if (!expCols.includes('ticket_no'))      db.exec("ALTER TABLE expense_records ADD COLUMN ticket_no TEXT");
  if (!expCols.includes('payment_method')) db.exec("ALTER TABLE expense_records ADD COLUMN payment_method TEXT DEFAULT '银行转账'");
  if (!expCols.includes('source'))         db.exec("ALTER TABLE expense_records ADD COLUMN source TEXT DEFAULT 'manual'");

  const empCols = db.prepare("PRAGMA table_info(employees)").all().map(c => c.name);
  if (!empCols.includes('employment_type')) db.exec("ALTER TABLE employees ADD COLUMN employment_type TEXT DEFAULT '全职'");
  if (!empCols.includes('daily_wage'))      db.exec("ALTER TABLE employees ADD COLUMN daily_wage REAL DEFAULT 0");

  // ── 创建默认账号（仅首次）─────────────────────────────────
  if (config.SEED_ON_FIRST_RUN) {
    const admin = db.prepare('SELECT id FROM users WHERE username = ?').get(config.ADMIN_USERNAME);
    if (!admin) {
      const hash = bcrypt.hashSync(config.ADMIN_PASSWORD, 10);
      db.prepare(`INSERT INTO users (name, username, password, role, business_line) VALUES (?, ?, ?, ?, ?)`)
        .run(config.ADMIN_DISPLAY_NAME, config.ADMIN_USERNAME, hash, 'admin', null);

      const managers = config.SEED_MANAGERS || [];
      if (managers.length > 0) {
        const insertUser = db.prepare(`INSERT INTO users (name, username, password, role, business_line) VALUES (?, ?, ?, ?, ?)`);
        managers.forEach(m => {
          insertUser.run(m.name, m.username, bcrypt.hashSync(config.MANAGER_DEFAULT_PASSWORD, 10), 'manager', m.business_line);
        });
      }
    }
  }

  return db;
}

module.exports = { initDB };
