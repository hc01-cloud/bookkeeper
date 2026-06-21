---
name: zhang-bu
description: >
  Setup, configure, and manage the 账簿 (zhang-bu) accounting web app.
  Use this skill whenever the user wants to: initialize the accounting system
  for their company, configure business lines or expense categories, add employees
  and set up payroll, change social security rates, troubleshoot the app, or
  understand how to use any feature. Also triggers when the user says things like
  "帮我配置记账系统", "初始化账簿", "设置业务线", "添加员工工资", or asks how to
  run or deploy this project.
---

# 账簿 · 财务管理系统 Skill

You are helping the user set up and use the 账簿 accounting web app.
Read CLAUDE.md first for the full technical overview.

## First-time setup flow

When a user has just cloned the repo and wants to get started, guide them through this sequence:

1. **Install and start**
   ```bash
   npm install
   npm start
   ```
   Confirm the server starts on port 3000 and `db/accounting.db` was created.

2. **Check the app is running**
   ```bash
   curl -s http://localhost:3000 | grep -o "<title>[^<]*"
   ```

3. **Configure for their company** — ask the user:
   - What are the company's main business lines / departments / projects?
   - What income categories do they use?
   - What expense categories do they commonly have?

   Then use the API to set them up (login first to get a session cookie):
   ```bash
   # Login
   curl -c /tmp/zb_cookie.txt -X POST http://localhost:3000/api/auth/login \
     -H 'Content-Type: application/json' \
     -d '{"username":"admin","password":"admin123"}'

   # Add a business line (color is a hex code)
   curl -b /tmp/zb_cookie.txt -X POST http://localhost:3000/api/config/business-lines \
     -H 'Content-Type: application/json' \
     -d '{"name":"销售部","code":"sales","color":"#1565C0","sort_order":1}'

   # Add income category
   curl -b /tmp/zb_cookie.txt -X POST http://localhost:3000/api/config/income-categories \
     -H 'Content-Type: application/json' \
     -d '{"name":"产品销售收入","sort_order":1}'

   # Add expense category
   curl -b /tmp/zb_cookie.txt -X POST http://localhost:3000/api/config/expense-categories \
     -H 'Content-Type: application/json' \
     -d '{"name":"原材料采购","sort_order":1}'
   ```

4. **Remove default placeholder data** — the seed data contains generic examples.
   Have the user delete them via the admin UI (系统管理 → 业务线管理) or via API.

5. **Create staff accounts**
   ```bash
   curl -b /tmp/zb_cookie.txt -X POST http://localhost:3000/api/auth/register \
     -H 'Content-Type: application/json' \
     -d '{"name":"张三","username":"zhangsan","password":"pass123","role":"manager","business_line":"sales"}'
   ```

6. **Set up payroll** (if needed) — guide the user to:
   - Check social security rates at 工资管理 → 社保配置 and adjust for their city/year
   - Add employees at 工资管理 → 员工档案 with their SS base and base salary
   - Add special deductions (专项附加扣除) per employee if applicable

## Social security rates

Default rates are preset for 广东省惠州市 2026. If the user is in a different city or year, help them find the correct rates and update via:
```bash
curl -b /tmp/zb_cookie.txt -X PUT http://localhost:3000/api/payroll/ss-config \
  -H 'Content-Type: application/json' \
  -d '{
    "pension_personal": 0.08,
    "pension_company": 0.14,
    "medical_personal": 0.02,
    "medical_company": 0.065,
    "unemployment_personal": 0.002,
    "unemployment_company": 0.005,
    "injury_company": 0.002,
    "maternity_company": 0
  }'
```

## Useful API reference

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/login` | POST | Login `{username, password}` |
| `/api/config/business-lines` | GET/POST/PUT/DELETE | Business line CRUD |
| `/api/config/income-categories` | GET/POST/PUT/DELETE | Income category CRUD |
| `/api/config/expense-categories` | GET/POST/PUT/DELETE | Expense category CRUD |
| `/api/income` | GET/POST | Income records |
| `/api/expense` | GET/POST | Expense records |
| `/api/reports/export?year=&month=` | GET | Download Excel report |
| `/api/payroll/employees` | GET/POST | Employee management |
| `/api/payroll/employees/:id/deductions` | POST | Add special deductions |
| `/api/payroll/calculate` | POST | Calculate monthly payroll |
| `/api/payroll/records` | GET/POST | Save/list payroll records |
| `/api/payroll/export?year=&month=` | GET | Download payroll Excel |
| `/api/payroll/ss-config` | GET/PUT | Social security rates |

## Troubleshooting

**Port in use**
```bash
pkill -f "node server.js" && npm start
```

**Database reset** (destroys all data — only for fresh start)
```bash
rm db/accounting.db && npm start
```

**OCR not working** — Tesseract must be installed:
```bash
brew install tesseract tesseract-lang   # macOS
```

**Session lost after restart** — sessions are in-memory; users need to re-login after server restart. This is expected behavior.

## What this app does NOT do

- No double-entry bookkeeping (not a replacement for 用友/金蝶)
- No direct tax filing integration
- No multi-device sync (single server, local network or with a tunnel)
- Designed to work alongside a 代理记账公司 who handles formal accounting and tax filing
