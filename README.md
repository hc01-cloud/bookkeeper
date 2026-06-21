# 账簿 · 财务管理系统

轻量级企业财务管理 Web 应用，适合中小型企业日常账务管理。无需数据库服务器，开箱即用。

## 功能

- **收支管理**：手工录入、交班单 OCR 识别、微信/支付宝流水批量导入
- **票据追踪**：每笔收支记录票据类型（专票/普票/收据/无票）和票号
- **工资核算**：按广东省社保比例自动计算五险、个税、实发工资、企业总成本
- **专项附加扣除**：支持子女教育、住房租金、赡养老人等按员工录入
- **报表导出**：月度财务报表 + 票据汇总 + 工资表，Excel 格式，可直接交代理记账公司
- **多业务线**：支持自定义业务线和收支类目，适配不同公司结构
- **多用户权限**：管理员和业务负责人两级权限

## 环境要求

- Node.js v22 或以上（使用内置 `node:sqlite`，无需额外数据库）
- macOS / Linux / Windows

## 快速开始

```bash
# 1. 克隆项目
git clone https://github.com/your-username/zhang-bu.git
cd zhang-bu

# 2. 安装依赖
npm install

# 3. 启动
npm start
```

浏览器打开 `http://localhost:3000`

默认账号：`admin` / `admin123`

## 首次配置

登录后进入「系统管理」：

1. **业务线**：删除示例业务线，添加公司实际的部门/项目
2. **收入类目 / 支出类目**：按公司实际业务调整
3. **添加员工**（工资管理 → 员工档案）：填写社保基数、基本工资、专项附加扣除

## 社保比例

系统预置广东省惠州市 2026 年社保费率，可在「工资管理 → 社保配置」修改：

| 险种 | 个人 | 公司 |
|------|------|------|
| 养老保险 | 8% | 14% |
| 医疗保险 | 2% | 6.5% |
| 失业保险 | 0.2% | 0.5% |
| 工伤保险 | — | 0.2%（基准，按行业浮动） |
| 生育保险 | — | 0%（已并入医疗） |

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

## 使用 Claude Code Skill 配置

如果你使用 Claude Code，可以直接安装本项目的 Skill，Claude 会引导你完成初始化配置：

```bash
claude skills install ./SKILL.md
```

## 许可

MIT
