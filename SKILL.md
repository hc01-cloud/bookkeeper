---
name: zhang-bu
description: >
  Deploy and configure the 账簿 (Zhang-Bu) accounting web app for any business client.
  This skill covers: initial deployment from scratch, company-specific configuration,
  payroll setup with local social security rates, multi-client instance management,
  data backup/restore, and troubleshooting. Triggers on phrases like:
  "deploy the accounting app", "set up zhang-bu", "configure the bookkeeping system",
  "create a new accounting instance", "帮我部署记账系统", "配置新的账簿实例",
  "初始化财务系统", "给客户部署一套账簿", "setup a new client instance",
  "add a company to the accounting system", "部署一套给XX公司".
---

# 账簿 · Zhang-Bu — Universal Deployment Skill

## What this skill does

This skill enables **any AI coding assistant** (Claude Code, Codex, WorkBuddy, etc.)
to deploy a fully customized instance of the Zhang-Bu accounting web app for a
business client. The app is a single-file SPA + Express backend + SQLite database
that requires zero external database servers.

**Before writing any code, read `CLAUDE.md` for the full technical architecture.**

## Platform auto-detection

As the AI assistant, determine which platform you're running on:

| Signal | Platform |
|--------|----------|
| `claude` in agent name or system prompt mentions "Claude Code" | **Claude Code** |
| System prompt mentions "Codex" or "OpenAI" | **Codex** |
| System prompt mentions "WorkBuddy" | **WorkBuddy** |
| Unknown / generic shell access | **Generic (works everywhere)** |

All commands in this skill are platform-agnostic shell commands. Use the same
commands regardless of which AI platform you're on.

---

## Phase 0 — Pre-flight check

Before deploying, verify the environment:

```bash
# 1. Node.js v22+ required (for built-in node:sqlite)
node --version

# 2. Check if project exists
ls package.json && echo "Project found" || echo "Need to clone first"

# 3. Check npm
npm --version
```

If Node.js < v22: instruct the user to upgrade (the app uses `node:sqlite` which
is only available in Node 22+).

If the project doesn't exist: clone it first:
```bash
git clone <repo-url> accounting-app
cd accounting-app
```

---

## Phase 1 — Install and initialize

### Step 1: Install dependencies

```bash
npm install
```

If `npm install` fails with permission errors, try `npm install --legacy-peer-deps`.

After install, the `postinstall` hook will warn if no `.env` file exists — this is
expected on first run.

### Step 2: Configure the app

Two approaches — let the user choose:

**Approach A: Interactive wizard (recommended for new users)**

```bash
npm run setup
```

The wizard asks:
- Company name, short name, tagline
- Province, city, social security policy year
- Social security rates (8 values, defaults provided)
- Admin username, password, display name
- Default manager password
- Whether to create seed data
- Port number

It auto-generates a random `SESSION_SECRET` and writes `.env`.

**Approach B: Manual config (for scripted/automated deployments)**

```bash
cp .env.example .env
# Then edit .env with actual values
```

Key variables that MUST be changed per client:

| Variable | Purpose | Example |
|----------|---------|---------|
| `COMPANY_NAME` | Company display name | `某某科技有限公司` |
| `CITY_NAME` / `CITY_PROVINCE` | Location for SS rates | `深圳` / `广东省` |
| `SS_PENSION_PERSONAL` … `SS_MATERNITY_COMPANY` | 8 social security rates | See local policy |
| `SS_YEAR` | Policy year | `2026` |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | Admin credentials | Change from defaults! |
| `PORT` | Server port | `3000` (change for multi-instance) |

### Step 3: Start the server

```bash
npm start
```

Expected output:
```
📊 ==== 某某公司记账系统已启动 ====
📍 地址: http://0.0.0.0:3000
🔑 账号: admin / admin123
📁 数据库: db/accounting.db
=====================================
```

### Step 4: Verify it works

```bash
# Check branding API (public, no auth needed)
curl -s http://localhost:3000/api/branding | python3 -m json.tool | head -30

# Check login works
curl -c /tmp/zb_cookie -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin123"}'

# Verify auth
curl -b /tmp/zb_cookie http://localhost:3000/api/auth/me
```

Expected: branding returns JSON with company name, city, SS rates; login returns
`{"ok":true}`; auth check returns user object with `role: "admin"`.

---

## Phase 2 — Client-specific configuration

After the app is running, configure it for the specific client's business.

### Understand the client's business

Ask the user:

1. **Organizational structure**: What departments, business lines, or projects does
   the company have? (e.g., 销售部, 项目部, 行政)
2. **Income categories**: What are their revenue sources? (e.g., 产品销售收入,
   服务收入, 活动收入)
3. **Expense categories**: What do they spend on? (e.g., 原材料, 租金, 人力成本,
   办公耗材)
4. **Payment methods**: How do they receive/pay money? (e.g., 微信支付, 支付宝,
   银行转账, 现金)
5. **Staff**: Who needs access? What role (admin vs manager)? Which business line
   does each manager oversee?
6. **Employees for payroll**: Names, social security base salary, gross salary,
   any special deductions (子女教育, 赡养老人, 住房租金, etc.)

### Set up business lines

First, log in (save the cookie for subsequent API calls):

```bash
# Extract credentials from .env
ADMIN_USER=$(grep ADMIN_USERNAME .env | cut -d= -f2)
ADMIN_PASS=$(grep ADMIN_PASSWORD .env | cut -d= -f2)

# Login
curl -c /tmp/zb_cookie -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"$ADMIN_USER\",\"password\":\"$ADMIN_PASS\"}"
```

Then create business lines:

```bash
# Add a business line
curl -b /tmp/zb_cookie -X POST http://localhost:3000/api/config/business-lines \
  -H 'Content-Type: application/json' \
  -d '{"name":"销售部","code":"sales","color":"#1565C0","sort_order":1}'

# List all business lines
curl -b /tmp/zb_cookie http://localhost:3000/api/config/business-lines

# Delete a business line
curl -b /tmp/zb_cookie -X DELETE http://localhost:3000/api/config/business-lines/<id>

# Update a business line
curl -b /tmp/zb_cookie -X PUT http://localhost:3000/api/config/business-lines/<id> \
  -H 'Content-Type: application/json' \
  -d '{"name":"新名称","color":"#FF5722","sort_order":2}'
```

### Set up categories

```bash
# Add income category
curl -b /tmp/zb_cookie -X POST http://localhost:3000/api/config/income-categories \
  -H 'Content-Type: application/json' \
  -d '{"name":"产品销售收入","sort_order":1}'

# Add expense category
curl -b /tmp/zb_cookie -X POST http://localhost:3000/api/config/expense-categories \
  -H 'Content-Type: application/json' \
  -d '{"name":"原材料采购","sort_order":1}'

# List categories
curl -b /tmp/zb_cookie http://localhost:3000/api/config/income-categories
curl -b /tmp/zb_cookie http://localhost:3000/api/config/expense-categories
```

### Remove default seed data

The seed data from `.env` contains generic examples. Delete what doesn't apply:

```bash
# Get all business lines, delete the unwanted ones
curl -b /tmp/zb_cookie http://localhost:3000/api/config/business-lines
# For each unwanted line: curl -b /tmp/zb_cookie -X DELETE .../<id>

# Similarly for categories
curl -b /tmp/zb_cookie http://localhost:3000/api/config/income-categories
curl -b /tmp/zb_cookie http://localhost:3000/api/config/expense-categories
```

### Create manager accounts

Each business line manager gets a separate account with `role: "manager"`:

```bash
curl -b /tmp/zb_cookie -X POST http://localhost:3000/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"name":"张三","username":"zhangsan","password":"pass123","role":"manager","business_line":"sales"}'
```

Managers can only see/edit records belonging to their assigned business line.

### Set up payroll

1. **Verify social security rates** at `工资管理 → 社保配置` match the client's
   city and policy year.

   ```bash
   curl -b /tmp/zb_cookie http://localhost:3000/api/payroll/ss-config

   # Update if needed
   curl -b /tmp/zb_cookie -X PUT http://localhost:3000/api/payroll/ss-config \
     -H 'Content-Type: application/json' \
     -d '{
       "pension_personal": 0.08,
       "pension_company": 0.16,
       "medical_personal": 0.02,
       "medical_company": 0.08,
       "unemployment_personal": 0.005,
       "unemployment_company": 0.005,
       "injury_company": 0.004,
       "maternity_company": 0.008
     }'
   ```

   → **Important**: SS rates in `.env` overwrite the database on every server
   restart. To persist changes permanently, update `.env` and restart.

2. **Add employees** at `工资管理 → 员工档案`:

   ```bash
   curl -b /tmp/zb_cookie -X POST http://localhost:3000/api/payroll/employees \
     -H 'Content-Type: application/json' \
     -d '{
       "name": "李四",
       "id_number": "440000199001011234",
       "ss_base": 5000,
       "base_salary": 8000,
       "business_line": "sales",
       "status": "active"
     }'
   ```

3. **Add special deductions** (专项附加扣除) per employee:

   ```bash
   curl -b /tmp/zb_cookie -X POST http://localhost:3000/api/payroll/employees/<id>/deductions \
     -H 'Content-Type: application/json' \
     -d '{"type":"子女教育","amount":2000}'
   ```

4. **Calculate monthly payroll**:

   ```bash
   curl -b /tmp/zb_cookie -X POST http://localhost:3000/api/payroll/calculate \
     -H 'Content-Type: application/json' \
     -d '{"year":2026,"month":8}'
   ```

   This returns per-employee breakdowns: gross pay, social security deductions
   (personal + company), taxable income, income tax, net pay, and total company cost.

5. **Save payroll records** (also auto-creates expense records):

   ```bash
   curl -b /tmp/zb_cookie -X POST http://localhost:3000/api/payroll/records \
     -H 'Content-Type: application/json' \
     -d '{"year":2026,"month":8,"records":[...]}'
   ```

   Saving payroll automatically creates expense records linked to each employee's
   business line, so the expense report includes salary costs.

### Verify the complete setup

```bash
# 1. Branding is correct
curl -s http://localhost:3000/api/branding | python3 -m json.tool | grep -E 'companyName|cityName|ssYear'

# 2. Login works with configured credentials
curl -c /tmp/zb_cookie -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"$ADMIN_USER\",\"password\":\"$ADMIN_PASS\"}"

# 3. Business lines are configured
curl -b /tmp/zb_cookie http://localhost:3000/api/config/business-lines | python3 -m json.tool

# 4. Payroll is ready
curl -b /tmp/zb_cookie http://localhost:3000/api/payroll/employees | python3 -m json.tool

# 5. Reports export works
curl -b /tmp/zb_cookie -o /tmp/report.xlsx \
  "http://localhost:3000/api/reports/export?year=2026&month=8"
file /tmp/report.xlsx  # should say "Microsoft Excel"
```

---

## API reference (complete)

All endpoints except `/api/branding` and `/api/auth/login` require an
authenticated session cookie.

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/branding` | GET | No | Public config (brand name, city, SS rates, payment methods, ticket types, deduction types) |
| `/api/auth/login` | POST | No | Login `{username, password}` — get session cookie |
| `/api/auth/logout` | POST | Yes | Logout |
| `/api/auth/me` | GET | Yes | Current user info |
| `/api/auth/register` | POST | Admin | Create new user account |
| `/api/config/business-lines` | GET/POST | Admin | Business line CRUD |
| `/api/config/business-lines/:id` | PUT/DELETE | Admin | Update/delete business line |
| `/api/config/income-categories` | GET/POST | Admin | Income category CRUD |
| `/api/config/income-categories/:id` | PUT/DELETE | Admin | Update/delete income category |
| `/api/config/expense-categories` | GET/POST | Admin | Expense category CRUD |
| `/api/config/expense-categories/:id` | PUT/DELETE | Admin | Update/delete expense category |
| `/api/income` | GET/POST | Yes | List/create income records |
| `/api/income/:id` | PUT/DELETE | Yes | Update/delete income record |
| `/api/expense` | GET/POST | Yes | List/create expense records |
| `/api/expense/:id` | PUT/DELETE | Yes | Update/delete expense record |
| `/api/income/import` | POST | Yes | Import WeChat/Alipay CSV statements |
| `/api/income/ocr` | POST | Yes | Upload shift handover image for OCR |
| `/api/reports/export?year=&month=` | GET | Yes | Download monthly financial Excel report |
| `/api/payroll/employees` | GET/POST | Admin | List/create employees |
| `/api/payroll/employees/:id` | PUT/DELETE | Admin | Update/delete employee |
| `/api/payroll/employees/:id/deductions` | GET/POST | Admin | List/add special deductions |
| `/api/payroll/calculate` | POST | Admin | Calculate monthly payroll `{year, month}` |
| `/api/payroll/records` | GET/POST | Admin | List/save payroll records |
| `/api/payroll/records/:id` | PUT | Admin | Update payroll record |
| `/api/payroll/export?year=&month=` | GET | Admin | Download payroll Excel report |
| `/api/payroll/ss-config` | GET/PUT | Admin | Get/update social security rates |
| `/api/settings` | GET/PUT | Admin | System settings (OCR API key, etc.) |

---

## Multi-client deployment

To run multiple client instances on one server, each needs:

1. **Its own directory** — clone the repo to separate directories:
   ```bash
   git clone <repo-url> client-a-accounting
   git clone <repo-url> client-b-accounting
   ```

2. **Its own `.env`** with unique:
   - `PORT` (3000, 3001, 3002, ...)
   - `DB_PATH` (or just use the default — each dir has its own `db/`)
   - All branding/social security config

3. **Its own process** — start each separately:
   ```bash
   cd client-a-accounting && npm start &
   cd client-b-accounting && npm start &
   ```

4. **Optional: Reverse proxy** — use nginx or Caddy to map domains to ports:
   ```
   accounting.client-a.com → localhost:3000
   accounting.client-b.com → localhost:3001
   ```

### Docker deployment (optional)

Create a `Dockerfile` for simpler multi-instance deployment:

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
```

Run with:
```bash
docker build -t zhang-bu .
docker run -d -p 3000:3000 -v $(pwd)/db:/app/db --env-file .env zhang-bu
```

---

## Data management

### Backup

The entire database is one file:

```bash
cp db/accounting.db ~/backups/accounting-$(date +%Y%m%d-%H%M%S).db
```

Backup the config too:

```bash
cp .env ~/backups/accounting-env-$(date +%Y%m%d-%H%M%S).bak
```

Schedule automatic backups via cron:

```bash
# Daily at 2am
0 2 * * * cp /path/to/accounting-app/db/accounting.db /path/to/backups/accounting-$(date +\%Y\%m\%d).db
```

### Restore

```bash
# Stop the server first
pkill -f "node server.js"

# Restore the database
cp ~/backups/accounting-20260810.db db/accounting.db

# Restart
npm start
```

### Reset (clean start)

```bash
# Stop server, delete database, restart
pkill -f "node server.js"
rm db/accounting.db
npm start
```

All seed data from `.env` will be re-created on first run.

---

## Configuration architecture

For troubleshooting and advanced customization, understand the config flow:

```
.env (user-editable key=value pairs)
  │
  ▼
config.js (parses .env, provides defaults, exports JS object)
  │
  ├──► server.js (PORT, SESSION_SECRET, startup banner)
  ├──► db/schema.js (seed data: business lines, categories, admin, SS rates)
  ├──► routes/reports.js (Excel creator name)
  ├──► routes/payroll.js (tax brackets, exemption threshold, Excel creator)
  └──► /api/branding endpoint
         │
         ▼
       public/index.html (loadBranding() → applyBranding() → refreshFormFields())
```

**Key principle**: `config.js` is the single source of truth. Every module imports
from it. The frontend gets its config via the `/api/branding` endpoint (no auth).

---

## Troubleshooting

### Port already in use

```bash
# Find what's using the port
lsof -i :3000
# Kill it
kill -9 <PID>
# Or use a different port in .env
```

### Database corruption

SQLite WAL mode files (`-wal`, `-shm`) can accumulate:
```bash
ls -la db/
# If .db-wal and .db-shm files exist and are stale, stop the server and they'll be merged
pkill -f "node server.js"
# They should disappear after clean shutdown; if not:
rm db/accounting.db-wal db/accounting.db-shm
npm start
```

### Session lost after restart

Sessions are stored in memory (express-session MemoryStore). After every server
restart, all users must log in again. This is by design. For production
persistence, replace MemoryStore with connect-sqlite3 or connect-redis.

### Social security rates revert after restart

The `.env` SS rates overwrite the database on every startup. This is by design —
it keeps the `.env` as the single source of truth. To permanently change rates:

1. Edit `.env` and update the `SS_*` variables
2. Restart the server

### OCR not working

Tesseract OCR must be installed separately:

| OS | Command |
|----|---------|
| macOS | `brew install tesseract tesseract-lang` |
| Ubuntu/Debian | `apt-get install tesseract-ocr tesseract-ocr-chi-sim` |
| Windows | Download from https://github.com/UB-Mannheim/tesseract/wiki |

### npm install fails

Try:
```bash
npm install --legacy-peer-deps
# or
rm -rf node_modules package-lock.json && npm install
```

### Node version too old

```bash
node --version  # must be v22.0.0 or above
# Upgrade via nvm:
nvm install 22
nvm use 22
```

---

## Security best practices

When deploying for clients, remind them to:

1. **Change default passwords** immediately — use `npm run setup` or edit `.env`
2. **Use strong SESSION_SECRET** — the setup wizard auto-generates one via
   `crypto.randomBytes(32)`
3. **Run behind a reverse proxy** (nginx/Caddy) with HTTPS for production
4. **Restrict network access** — bind to `127.0.0.1` if behind a reverse proxy,
   or use firewall rules to limit access to the port
5. **Backup the database regularly** — it's one file: `cp db/accounting.db ~/backups/`
6. **Don't commit `.env`** — it's in `.gitignore`; never push it to version control
7. **Set `NODE_ENV=production`** for production deployments (disables verbose errors)

---

## What this app does NOT do

Be honest about limitations:

- **Not double-entry bookkeeping** — not a replacement for 用友/金蝶
- **No direct tax filing integration** — does not submit to tax authorities
- **No multi-device sync** — single server, designed for LAN or private network
- **No audit trail** — no change history or undo
- **Designed to work alongside a 代理记账公司** who handles formal accounting and
  tax filing with the tax bureau

This is a day-to-day operational tool, not a compliance tool.

---

## Quick command cheatsheet

```bash
# Start
npm start

# Reconfigure
npm run setup

# Backup
cp db/accounting.db ~/backups/$(date +%Y%m%d-%H%M%S).db

# Reset everything
pkill -f "node server.js"; rm db/accounting.db; npm start

# Check health
curl -s http://localhost:3000/api/branding | python3 -m json.tool | head -10

# Login (adapt credentials)
curl -c /tmp/zb_cookie -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin123"}'

# Export payroll
curl -b /tmp/zb_cookie -o payroll.xlsx \
  "http://localhost:3000/api/payroll/export?year=2026&month=8"

# Export reports
curl -b /tmp/zb_cookie -o report.xlsx \
  "http://localhost:3000/api/reports/export?year=2026&month=8"
```
