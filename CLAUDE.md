# 账簿项目说明

## 技术栈

- **运行时**：Node.js v22+，使用内置 `node:sqlite`（`DatabaseSync`），无需安装额外数据库
- **框架**：Express + express-session（内存 session）
- **端口**：3000，绑定 `0.0.0.0`
- **数据库**：`db/accounting.db`（SQLite），`db/schema.js` 负责初始化和迁移

## 项目结构

```
zhang-bu/
├── server.js              # 入口，路由挂载
├── db/
│   └── schema.js          # 建表、迁移、seed 数据
├── routes/
│   ├── auth.js            # 登录/登出
│   ├── income.js          # 收入录入、交班单 OCR、流水导入
│   ├── expense.js         # 支出录入
│   ├── reports.js         # Excel 报表导出
│   ├── config.js          # 业务线/类目 CRUD
│   ├── payroll.js         # 工资核算、员工档案、社保配置
│   └── settings.js        # 系统设置（OCR API key 等）
├── public/
│   └── index.html         # 单页应用（纯 HTML/CSS/JS，无构建工具）
└── uploads/               # 上传的图片文件（不入 git）
```

## 关键设计

- 前端是单文件 SPA（`public/index.html`），不使用任何前端框架
- 所有配置（业务线、类目）通过 `/api/config/*` 动态加载，不硬编码
- 社保比例存在 `ss_config` 表，可通过管理界面修改
- 个税按月度简易法计算（月应纳税所得额 → 七级累进税率）
- 票据字段：`ticket_type`（专票/普票/收据/无票）+ `ticket_no`

## 数据库迁移

`schema.js` 的 `initDB()` 在每次启动时运行，使用 `PRAGMA table_info` 检测字段是否存在再 `ALTER TABLE`，保证向前兼容，不会重建已有数据。

## 默认账号

- 管理员：`admin` / `admin123`
- 普通员工默认密码：`manager123`

首次部署后请立即修改密码。

## 常见操作

```bash
npm start          # 启动（生产）
npm run dev        # 启动（开发，同上）
```

备份数据：复制 `db/accounting.db` 即可。
