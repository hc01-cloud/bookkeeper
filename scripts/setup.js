// 记账系统 — 交互式初始化脚本
// 运行: node scripts/setup.js

const readline = require('readline');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
function ask(q) { return new Promise(resolve => rl.question(q, resolve)); }

async function main() {
  console.log('\n╔══════════════════════════════════════╗');
  console.log('║    📊 记账系统 · 初始化向导          ║');
  console.log('╚══════════════════════════════════════╝');
  console.log('\n此向导将帮助您生成 .env 配置文件。');
  console.log('所有问题都有默认值，直接回车 = 使用默认值。\n');

  // ── 品牌 ──
  console.log('── 品牌信息 ──');
  const companyName   = (await ask(`公司名称 [凤鸣]: `)) || '凤鸣';
  const appShortName  = (await ask(`系统简称（侧边栏/登录页）[账簿]: `)) || '账簿';
  const appTagline    = (await ask(`系统副标题 [财务管理系统]: `)) || '财务管理系统';
  const loginHeadline = (await ask(`登录页主标题（支持 <br>）[精准记录，<br>清晰决策]: `)) || '精准记录，<br>清晰决策';

  // ── 地区 ──
  console.log('\n── 地区 / 社保政策 ──');
  const cityProvince = (await ask(`省份 [广东省]: `)) || '广东省';
  const cityName     = (await ask(`城市 [惠州]: `)) || '惠州';
  const ssYear       = (await ask(`社保政策年份 [2026]: `)) || '2026';

  // ── 社保费率 ──
  console.log('\n── 社保费率（直接回车使用默认值）──');
  const ssPensionP  = (await ask(`养老保险 — 个人比例 [0.08]: `)) || '0.08';
  const ssPensionC  = (await ask(`养老保险 — 公司比例 [0.14]: `)) || '0.14';
  const ssMedicalP  = (await ask(`医疗保险 — 个人比例 [0.02]: `)) || '0.02';
  const ssMedicalC  = (await ask(`医疗保险 — 公司比例 [0.065]: `)) || '0.065';
  const ssUnempP    = (await ask(`失业保险 — 个人比例 [0.002]: `)) || '0.002';
  const ssUnempC    = (await ask(`失业保险 — 公司比例 [0.005]: `)) || '0.005';
  const ssInjuryC   = (await ask(`工伤保险 — 公司比例 [0.002]: `)) || '0.002';
  const ssMaternity = (await ask(`生育保险 — 公司比例 [0.0]: `)) || '0.0';

  // ── 管理员 ──
  console.log('\n── 管理员账号 ──');
  const adminUser     = (await ask(`管理员用户名 [admin]: `)) || 'admin';
  const adminPass     = (await ask(`管理员密码 [admin123]: `)) || 'admin123';
  const adminName     = (await ask(`管理员显示名称 [管理员]: `)) || '管理员';
  const mgrPass       = (await ask(`各负责人默认密码 [manager123]: `)) || 'manager123';

  // ── 种子数据 ──
  console.log('\n── 初始数据 ──');
  const seedStr       = (await ask(`是否创建初始数据（业务线/类目/负责人）？(Y/n): `)) || 'Y';
  const seedOnFirst   = seedStr.toLowerCase() !== 'n';

  // ── 服务端 ──
  console.log('\n── 服务端 ──');
  const portStr       = (await ask(`端口 [3000]: `)) || '3000';

  // ── 生成 .env ──
  const sessionSecret = crypto.randomBytes(32).toString('hex');

  const envContent = `# ===== 记账系统配置文件 =====
# 由 npm run setup 自动生成
# 生成时间: ${new Date().toISOString()}

# ===== 服务端 =====
PORT=${portStr}
UPLOADS_DIR=uploads
BIND_ADDRESS=0.0.0.0
SESSION_SECRET=${sessionSecret}
SESSION_MAX_AGE_MS=604800000

# ===== 品牌信息 =====
APP_NAME=${appShortName}
APP_SHORT_NAME=${appShortName}
APP_TAGLINE=${appTagline}
APP_DESCRIPTION=轻量级企业财务管理系统
COMPANY_NAME=${companyName}
HTML_TITLE=${appShortName} · ${appTagline}
HTML_LANG=zh-CN
FONT_FAMILY='PingFang SC', -apple-system, 'Helvetica Neue', 'Microsoft YaHei', sans-serif
LOCALE=zh-CN

# 登录页文案
LOGIN_HEADLINE=${loginHeadline}
LOGIN_SUBTEXT=收支管理 · 票据追踪 · 财务报表<br>为您的团队提供专业财务管理工具
LOGIN_TITLE=登录
LOGIN_SUBTITLE=请输入您的账号信息

# ===== 地区 / 社保政策 =====
CITY_NAME=${cityName}
CITY_PROVINCE=${cityProvince}
SS_YEAR=${ssYear}

# 社保费率
SS_PENSION_PERSONAL=${ssPensionP}
SS_PENSION_COMPANY=${ssPensionC}
SS_MEDICAL_PERSONAL=${ssMedicalP}
SS_MEDICAL_COMPANY=${ssMedicalC}
SS_UNEMPLOYMENT_PERSONAL=${ssUnempP}
SS_UNEMPLOYMENT_COMPANY=${ssUnempC}
SS_INJURY_COMPANY=${ssInjuryC}
SS_MATERNITY_COMPANY=${ssMaternity}

# ===== 税务政策 =====
TAX_EXEMPTION=5000
TAX_BRACKETS_JSON=[{"threshold":80000,"rate":0.45,"deduction":15160},{"threshold":55000,"rate":0.35,"deduction":7160},{"threshold":35000,"rate":0.30,"deduction":4410},{"threshold":25000,"rate":0.25,"deduction":2660},{"threshold":12000,"rate":0.20,"deduction":1410},{"threshold":3000,"rate":0.10,"deduction":210},{"threshold":0,"rate":0.03,"deduction":0}]

# ===== 默认管理员 =====
ADMIN_USERNAME=${adminUser}
ADMIN_PASSWORD=${adminPass}
ADMIN_DISPLAY_NAME=${adminName}
MANAGER_DEFAULT_PASSWORD=${mgrPass}

# ===== 种子数据 =====
SEED_ON_FIRST_RUN=${seedOnFirst}
SEED_BUSINESS_LINES=main:主营业务:#2e7d32:1;secondary:辅助业务:#1565c0:2;project:项目业务:#e65100:3;common:公司公共:#757575:4
SEED_INCOME_CATEGORIES=主营业务收入,服务收入,产品销售收入,项目收入,活动收入,其他收入
SEED_EXPENSE_CATEGORIES=原材料采购,商品采购,项目物资,人力成本,水电费,办公耗材,设备维修,租金,运输费,市场推广,其他支出
SEED_MANAGERS=

# ===== 支付方式 =====
PAYMENT_METHODS=现金,微信支付,支付宝,农商支付,银行转账,混合

# ===== 票据类型 =====
TICKET_TYPES=增值税专用发票,增值税普通发票,收据,无票

# ===== 专项附加扣除类型 =====
SPECIAL_DEDUCTION_TYPES=子女教育:2000,继续教育:400,住房贷款利息:1000,住房租金:800,赡养老人:2000

# ===== 数据库 =====
DB_PATH=db/accounting.db
`;

  const envPath = path.join(__dirname, '..', '.env');
  // 备份旧的 .env
  if (fs.existsSync(envPath)) {
    const bakPath = envPath + '.bak.' + Date.now();
    fs.copyFileSync(envPath, bakPath);
    console.log(`\n📁 旧 .env 已备份为: ${path.basename(bakPath)}`);
  }

  fs.writeFileSync(envPath, envContent);
  console.log(`\n✅ 配置文件已生成: .env`);
  console.log(`   管理员: ${adminUser} / ${adminPass}`);
  console.log(`   负责人默认密码: ${mgrPass}`);
  console.log(`   社保地区: ${cityProvince}${cityName} ${ssYear}`);
  console.log(`\n运行 npm start 启动系统\n`);

  rl.close();
}

main().catch(e => { console.error(e); process.exit(1); });
