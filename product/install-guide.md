# 账簿系统 · 安装指南

> 恭喜入手！这份指南教你如何用 AI 助手 5 分钟部署专属记账系统。
> 不需要写代码，不需要安装数据库。

---

## 你拿到的安装包是什么？

```
accounting-app/
├── install.sh          ← 一键安装脚本
├── SKILL.md            ← AI 助手说明书（AI 读这个就知道怎么帮你）
├── CLAUDE.md           ← 技术架构说明
├── server.js           ← 主程序
├── config.js           ← 配置模块
├── .env.example        ← 配置模板
├── scripts/setup.js    ← 交互式配置向导
├── public/index.html   ← 网页界面
└── db/schema.js        ← 数据库
```

这是完整的项目源码（MIT 开源协议），你拿到的是全部文件。

---

## 方式一：用 AI 助手部署（推荐，零门槛）

### 如果你有 Claude Code

1. 电脑上安装 [Claude Code](https://claude.ai/code)（免费）
2. 打开终端，进入本项目文件夹：
   ```bash
   cd accounting-app
   ```
3. 对 Claude Code 说：
   ```
   帮我部署记账系统
   ```
4. AI 会问你公司信息（名称、城市、部门等），你回答即可
5. 5 分钟后，浏览器打开 `http://localhost:3000`

### 如果你有 Codex（OpenAI）

1. 安装 [Codex](https://github.com/openai/codex)（免费）
2. 用 Codex 打开本项目文件夹
3. 说：`deploy the accounting system` 或 `部署记账系统`
4. 同上，回答 AI 的问题即可

### 如果你有 WorkBuddy

1. 安装 WorkBuddy
2. 打开本项目文件夹
3. 说：`帮我部署记账系统`
4. 同上

---

## 方式二：自己部署（懂命令行的）

```bash
# 1. 安装依赖
npm install

# 2. 初始化配置（交互式问答）
npm run setup

# 3. 启动服务
npm start

# 4. 浏览器打开
open http://localhost:3000
```

默认账号是你自己在 `npm run setup` 时设置的。

---

## 环境要求

| 需求 | 说明 |
|------|------|
| Node.js | v22 或以上（[下载](https://nodejs.org)） |
| 操作系统 | macOS / Windows / Linux |
| 数据库 | 不需要！系统内置 SQLite |
| 浏览器 | Chrome / Edge / Safari |

---

## 常见问题

**Q: 需要安装 MySQL 或 Oracle 吗？**
A: 不需要！系统使用 Node.js 自带的 SQLite，零配置。

**Q: 部署完 AI 还要继续用吗？**
A: 不用。部署完系统独立运行，和普通网页一样打开浏览器就能用。
   AI 只在部署时帮你配置。

**Q: 数据在哪？安全吗？**
A: 所有数据存储在 `db/accounting.db` 这一个文件里，就在你电脑上。
   不上传任何云端。

**Q: 可以给多家公司用吗？**
A: 可以。每家公司 clone 一份到不同文件夹，用不同端口启动即可。

**Q: 遇到问题怎么办？**
A: 加入售后群（二维码见订单页），或直接在购买平台留言。

---

## 备份数据

全部数据就是一个文件，复制即备份：

```bash
cp db/accounting.db ~/Desktop/记账备份-$(date +%Y%m%d).db
```
