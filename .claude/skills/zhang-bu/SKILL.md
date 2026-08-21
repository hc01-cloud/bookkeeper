---
name: zhang-bu
description: >
  Deploy fully customized accounting systems for business clients. This skill
  handles the complete lifecycle: clone the open-source repo, run the interactive
  setup wizard, configure business lines and categories per client, set up
  payroll with local social security rates, and verify the deployment. Triggers
  when the user wants to deploy or set up an accounting/bookkeeping system,
  especially for a specific company or client. Use this skill from any directory —
  the AI will clone the repo automatically if needed.
---

# 账簿部署 Skill（全局可安装版）

## 触发条件

当用户说以下任意内容时自动激活：

| 中文 | English |
|------|---------|
| 帮我部署记账系统 | deploy the accounting system |
| 给XX客户部署一套账簿 | set up bookkeeping for a new client |
| 初始化财务系统 | initialize the accounting app |
| 配置新的账簿实例 | configure a new zhang-bu instance |
| 部署一套给XX公司 | deploy an instance for Company X |

## 工作原理

这个 Skill 让你从**任意目录**为客户部署记账系统。AI 会自动：

1. Clone 开源仓库到本地
2. 运行 `npm install`
3. 通过 `npm run setup` 交互式配置（公司名、城市、社保费率等）
4. 启动服务并验证
5. 通过 API 配置业务线、收支类目、员工工资
6. 导出 Excel 报表确认部署成功

## 仓库地址

```
https://github.com/your-username/accounting-app.git
```

部署时 AI 会自动 clone 到当前目录下的 `accounting-app/` 或用户指定的路径。

## 部署流程

### 标准流程（单个客户）

1. 确认客户需求：公司名、所在城市、业务线/部门、员工数量
2. Clone 仓库 → `npm install` → `npm run setup`
3. 按客户需求修改 `.env`（或让 setup 向导生成）
4. `npm start` 启动服务
5. curl 验证 `/api/branding` 返回正确的品牌信息
6. 通过 API 配置业务线和类目
7. 添加员工档案、设定社保基数
8. 计算并导出第一个月工资表，确认数据正确

### 多客户部署

```bash
# 每个客户独立目录和端口
git clone <repo-url> client-a && cd client-a && npm install && npm run setup  # 端口 3000
git clone <repo-url> client-b && cd client-b && npm install && npm run setup  # 端口 3001
```

## 技术背景

读取目标项目中的 `CLAUDE.md` 了解完整技术架构。

关键信息：
- 技术栈：Node.js v22+、Express、内置 node:sqlite
- 配置系统：`.env` → `config.js` → `/api/branding` → SPA 前端
- 前端是单文件 `public/index.html`，不用任何框架
- 数据库是 SQLite 单文件 `db/accounting.db`
- 备份即复制 `db/accounting.db`
