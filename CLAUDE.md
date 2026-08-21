# 账簿项目说明

> **跨平台通用 Skill**：本项目 `SKILL.md` 可在 Claude Code、Codex (OpenAI)、WorkBuddy
> 等 AI 编码助手中使用。触发词包括"部署记账系统"、"配置账簿"、"setup accounting"等。
> 完整说明见 README.md 的「AI 助手集成」章节。

## 技术栈

- **运行时**：Node.js v22+，使用内置 `node:sqlite`（`DatabaseSync`），无需安装额外数据库
- **框架**：Express + express-session（内存 session）
- **端口**：默认 3000（由 `.env` 的 `PORT` 配置）
- **数据库**：`db/accounting.db`（SQLite），`db/schema.js` 负责初始化和迁移
- **配置系统**：`.env` → `config.js`（所有可配置项的统一入口）

## 项目结构

```
accounting-app/
├── server.js              # 入口，路由挂载
├── config.js              # 统一配置模块（.env → 全局 config 对象）
├── .env.example           # 配置模板（含中文注释）
├── scripts/
│   └── setup.js           # 交互式初始化向导
├── db/
│   └── schema.js          # 建表、迁移、seed 数据（接受 config 参数）
├── routes/
│   ├── auth.js            # 登录/登出
│   ├── income.js          # 收入录入、交班单 OCR、流水导入
│   ├── expense.js         # 支出录入
│   ├── reports.js         # Excel 报表导出（使用 config）
│   ├── config.js          # 业务线/类目 CRUD
│   ├── payroll.js         # 工资核算、员工档案、社保配置（使用 config）
│   └── settings.js        # 系统设置（OCR API key 等）
├── public/
│   └── index.html         # 单页应用（动态加载 /api/branding）
└── uploads/               # 上传的图片文件（不入 git）
```

## 配置系统

所有可配置项通过 `.env` → `config.js` → server/routes/SPA 传递：

- `config.js`：加载 `.env`，提供默认值，自动生成 SESSION_SECRET
- `/api/branding`：无需认证，返回品牌名、城市、社保费率、支付方式、票据类型等，供前端动态加载
- 前端 `loadBranding()` → `applyBranding()` → `refreshFormFields()` 在页面初始化时动态替换所有品牌文案
- `db/schema.js` 的 `initDB(config)` 从 config 读取所有种子数据
- `routes/reports.js` 和 `routes/payroll.js` 接受 config 参数用于 Excel creator、税率、起征点

## 关键设计

- 前端是单文件 SPA（`public/index.html`），不使用任何前端框架
- 所有配置（业务线、类目）通过 `/api/config/*` 动态加载，不硬编码
- 社保比例存在 `ss_config` 表，可通过管理界面修改
- 个税按月度简易法计算（月应纳税所得额 → 七级累进税率）
- 票据字段：`ticket_type`（专票/普票/收据/无票）+ `ticket_no`

## 数据库迁移

`schema.js` 的 `initDB()` 在每次启动时运行，使用 `PRAGMA table_info` 检测字段是否存在再 `ALTER TABLE`，保证向前兼容，不会重建已有数据。

## 默认账号

- 管理员及密码在 `.env` 中配置（`ADMIN_USERNAME` / `ADMIN_PASSWORD`），默认 `admin` / `admin123`
- 为各客户部署时通过 `npm run setup` 或编辑 `.env` 修改

首次部署后请立即修改密码。

## 常见操作

```bash
npm start          # 启动（生产）
npm run dev        # 启动（开发，同上）
```

备份数据：复制 `db/accounting.db` 即可。
