# 账簿 · 财务管理系统

轻量级企业财务管理 Web 应用，适合中小型企业日常账务管理。无需数据库服务器，开箱即用。

## 功能

- **收支管理**：手工录入、交班单 OCR 识别、微信/支付宝流水批量导入
- **票据追踪**：每笔收支记录票据类型（专票/普票/收据/无票）和票号
- **工资核算**：自动计算五险一金、个税、实发工资、企业总成本
- **专项附加扣除**：支持子女教育、住房租金、赡养老人等按员工录入
- **报表导出**：月度财务报表 + 票据汇总 + 工资表，Excel 格式
- **多业务线**：支持自定义业务线和收支类目，适配不同公司结构
- **多用户权限**：管理员和业务负责人两级权限
- **品牌定制**：通过 `.env` 配置文件自定义系统名称、登录页文案、社保地区等

## 环境要求

- Node.js v22 或以上（使用内置 `node:sqlite`，无需额外数据库）
- macOS / Linux / Windows

## 快速开始

```bash
# 1. 克隆项目
git clone https://github.com/your-username/accounting-app.git
cd accounting-app

# 2. 安装依赖
npm install

# 3. 初始化配置（交互式问答）
npm run setup

# 4. 启动
npm start
```

浏览器打开 `http://localhost:3000`

默认账号及密码在 `npm run setup` 时自行设置。

## 配置方式

### 方式一：交互式向导（推荐）

```bash
npm run setup
```

按提示输入公司名称、城市、管理员账号等信息，自动生成 `.env` 文件。

### 方式二：手动配置

```bash
cp .env.example .env
# 编辑 .env 文件，修改品牌名、城市、社保费率等
```

### 核心配置项

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `PORT` | 服务端口 | `3000` |
| `APP_SHORT_NAME` | 系统简称（侧边栏/登录页） | `账簿` |
| `APP_TAGLINE` | 系统副标题 | `财务管理系统` |
| `COMPANY_NAME` | 公司名称 | `凤鸣` |
| `CITY_NAME` | 城市 | `惠州` |
| `CITY_PROVINCE` | 省份 | `广东省` |
| `SS_YEAR` | 社保政策年份 | `2026` |
| `ADMIN_USERNAME` | 管理员用户名 | `admin` |
| `ADMIN_PASSWORD` | 管理员密码 | `admin123` |
| `SEED_ON_FIRST_RUN` | 是否创建初始数据 | `true` |
| `SS_PENSION_PERSONAL` | 养老个人比例 | `0.08` |
| `SS_PENSION_COMPANY` | 养老公司比例 | `0.14` |
| `TAX_EXEMPTION` | 月度个税起征点 | `5000` |

完整配置项请查看 `.env.example`。

## 首次使用

登录后进入「系统管理」：

1. **业务线**：删除不需要的示例业务线，添加公司实际的部门/项目
2. **收入类目 / 支出类目**：按公司实际业务调整
3. **添加员工**（工资管理 → 员工档案）：填写社保基数、基本工资、专项附加扣除
4. **社保配置**（工资管理 → 社保配置）：确认费率是否匹配当地最新政策

## 数据存储

数据保存在 `db/accounting.db`（SQLite 文件），备份此文件即备份全部数据。

## OCR 识别（可选）

上传交班单照片自动提取金额，需要安装 Tesseract：

```bash
# macOS
brew install tesseract tesseract-lang

# Ubuntu/Debian
apt-get install tesseract-ocr tesseract-ocr-chi-sim
```

## AI 助手集成（Skill）

本项目包含一个通用 Skill 文件 `SKILL.md`，可被 AI 编码助手自动识别和加载。

### 支持的平台

| 平台 | 安装方式 |
|------|----------|
| **Claude Code** | 自动识别项目根目录的 `SKILL.md`。也可通过 `/install` 从 GitHub 安装 |
| **Codex (OpenAI)** | 项目打开时自动读取 `SKILL.md` 作为项目指令 |
| **WorkBuddy** | 自动读取项目级 `SKILL.md` 文件 |

### 触发条件

当你对 AI 助手说以下内容时，Skill 会自动激活：

- "帮我部署记账系统" / "配置新的账簿实例"
- "给XX客户部署一套账簿"
- "初始化财务系统"
- "deploy the accounting app" / "setup a new client instance"

### Skill 能力

AI 助手将自动完成：
1. 环境检测（Node.js v22+）
2. `npm install` → `npm run setup` 交互式配置
3. 启动服务并验证 `/api/branding` 和登录
4. 根据客户业务配置业务线、收支类目、支付方式
5. 创建员工档案、设置社保费率、计算工资
6. 导出 Excel 报表验证部署成功

完整能力参考 `SKILL.md`。

---

## 许可

MIT
