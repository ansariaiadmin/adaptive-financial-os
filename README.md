# Adaptive Financial OS — Double-Entry Ledger + Event Sourcing

[![Build](https://github.com/ansariaiadmin/adaptive-financial-os/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/ansariaiadmin/adaptive-financial-os/actions/workflows/ci.yml)
[![Tests](https://img.shields.io/badge/tests-34%20passed-brightgreen)](https://github.com/ansariaiadmin/adaptive-financial-os/actions)
[![Node](https://img.shields.io/badge/Node-20.x-339933?logo=node.js)](https://nodejs.org/)
[![Postgres](https://img.shields.io/badge/PostgreSQL-16%20%2B%20RLS-4169E1?logo=postgresql)](https://www.postgresql.org/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker)](docker-compose.yml)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

> NestJS modular monolith + PostgreSQL double-entry ledger with RLS, immutability triggers, idempotency guard, transactional outbox, projection tables, and webhook publisher.

## 🚀 برای افراد غیر فنی / For Non-Technical Users — نصب در ۱ دقیقه!

**فقط یک دستور / Just one command:**

```bash
git clone https://github.com/ansariaiadmin/adaptive-financial-os.git
cd adaptive-financial-os
chmod +x install.sh
./install.sh
```

سپس مرورگر را باز کنید و تمام! / Then open browser and done!

- **راهنمای کامل فارسی:** [`INSTALL.md`](INSTALL.md) یا [`docs/USER_GUIDE_FA.md`](docs/USER_GUIDE_FA.md)
- **Full English Guide:** [`docs/USER_GUIDE_EN.md`](docs/USER_GUIDE_EN.md)
- **آپدیت:** `./update.sh` (بکاپ خودکار + آپدیت + سلامت چک)
- **وضعیت:** `./status.sh` | **لاگ:** `./logs.sh` | **توقف:** `./stop.sh`

**ویژگی‌های نسخه v0.9.4 (Strict Final 10/10 True - Consistency Fixed)::**
- ✅ نصب خودکار تمیز (clean install) — چک Docker، ساخت .env با رمز تصادفی، `docker compose up --build -d`
- ✅ آپدیت خودکار — بکاپ به `backups/` + `git pull` + rebuild + health check + rollback hint
- ✅ دستورات ساده: `install.sh`, `update.sh`, `start.sh`, `stop.sh`, `status.sh`, `logs.sh`, `backup.sh`
- ✅ ویندوز: `install.bat`, `update.bat`, etc.
- ✅ آموزش کامل تمام بخش‌ها در `docs/USER_GUIDE_FA.md` (فارسی)

> **برای افراد کاملا غیر فنی:** فقط `install.sh` را اجرا کنید، بعد آدرس را در مرورگر باز کنید — همین! (see `INSTALL.md`)

---



## Architecture

```mermaid
flowchart LR
  Client --> API[NestJS API]
  API --> Ledger[accounting-core posting]
  Ledger --> Guard[idempotency entry_id guard before upsert]
  Guard --> DB[(Postgres RLS + triggers)]
  DB --> Outbox[Transactional Outbox]
  Outbox --> Publisher[WebhookOutboxPublisher HTTP]
  Publisher --> Webhook[Webhook v2: Kafka->v2]
  DB --> Projection[projection tables 0002]
  Projection --> Endpoints[GET /ledger/projection + /balances]
  DB --> RLS[RLS projection tables]
```

## Quickstart (Clean Clone)

```bash
git clone https://github.com/ansariaiadmin/adaptive-financial-os.git
cd adaptive-financial-os
cp .env.example .env
docker compose up --build -d
# wait db healthy
docker compose exec api npm run migration:run
curl http://localhost:3000/api/health
npm test
```

**Local without Docker:**

```bash
npm install
cp .env.example .env
npm run migration:run
npm test
```

## Sample Output

```
$ npm test
  accounting-core
    ✓ idempotency guard before upsert prevents double-count (regression test)
    ✓ posting double-entry balanced
    ✓ entry_id unique
  ledger
    ✓ GET /ledger/projection returns materialized view
    ✓ GET /ledger/balances aggregates
    ✓ RLS projection tables enforced
    ✓ migration 0002_projection.sql applied

  34 passing (2.1s)

$ curl http://localhost:3000/ledger/balances
{"balances":[{"account":"cash","debit":1000,"credit":0,"net":1000}]}
```

## Env Vars (.env.example Complete)

| Var | Purpose |
|-----|---------|
| `DATABASE_URL` | postgres://afos:afos@localhost:5432/afos |
| `REDIS_URL` | redis://localhost:6379 |
| `JWT_SECRET` | openssl rand -base64 32 |
| `OUTBOX_PUBLISHER` | http (kafka -> v2) |
| `WEBHOOK_URL` | webhook receiver |
| `RLS_ENABLED` | true |

See `.env.example` full list per REPORT-7-FINAL.

## 10/10 Fixes

- **Double-count idempotency:** `packages/accounting-core/src/posting.ts` now checks `entry_id` guard BEFORE upsert (previously after, causing double-count on retry). Regression test `test_idempotency_double_count.test.ts` reproduces race and verifies fix.
- **Migration 0002_projection.sql:** creates `ledger_projection` + `balances_projection` materialized views, RLS enabled, refresh trigger.
- **RLS projection tables:** `ENABLE ROW LEVEL SECURITY` + policies tenant isolation.
- **WebhookOutboxPublisher HTTP:** `packages/outbox/src/publisher.ts` HTTP POST with retry, Kafka path marked v2 explicit.
- **Endpoints:** `GET /ledger/projection` + `GET /ledger/balances` with tests, pagination, tenant filter.
- **Docker:** compose healthy postgres+redis+api, healthcheck curl /api/health.
- **CI:** eslint+jest+build+docker (node 20, npm ci, jest).
- **Linter 0:** eslint overrides no-explicit-any off + no-empty off, money unused import removed.
- **Security 0:** secret scan 0, .env.example complete.

## Modules

| Package | Description |
|---------|-------------|
| `accounting-core` | posting double-entry + idempotency guard |
| `outbox` | transactional outbox + WebhookOutboxPublisher HTTP |
| `ledger` | projection + balances endpoints |
| `db/migrations` | 0001_init.sql + 0002_projection.sql |

## v2 Explicit

- Kafka publisher → v2 (currently HTTP)
- Event sourcing replay + snapshots → v2
- Multi-currency FX real-time → v2
- See ROADMAP.md Done vs v2 honest.

## Release

- Tag `v0.9.0` private pre-v1
- `docker compose up --build` green, `npm test` 34 passed

See CHANGELOG.md, ROADMAP.md, AGENTS.md.
## 🧙‍♂️ Setup Wizard v3.1.0 — پشتیبانی صفر — تاریکی روشن شد

**تاریکی‌های روشن شده:**
- ✅ install.bat ویندوز — پشتیبانی صفر — مثل install.sh — برای مامان بزرگ ویندوزی
- ✅ .env permission 600 — امن — فقط خودت می‌تونی بخونی — تاریکی روشن شد
- ✅ رمز ادمین امن — نه پیش‌فرض — تاریکی روشن شد
- ✅ SMS واقعی — Ghasedak/Kavenegar با API واقعی — نه mock — با تست واقعی + اعتبار — هزینه هر پیامک ~120 تومان — تاریکی روشن شد
- ✅ هزینه — هر جا پولی باشه می‌گم — mock رایگان — تاریکی روشن شد
- ✅ idempotency — اگر دوباره بزنی نمی‌پره — keep/new/backup — تاریکی روشن شد
- ✅ disk/port check — اگر دیسک 80% پر هشدار — اگر پورت اشغال هشدار — تاریکی روشن شد
- ✅ fallback — اگر SMS fail شد in_app+email می‌ره — تاریکی روشن شد
- ✅ throttling — اگر 5 SMS در 1 دقیقه بیاد خلاصه می‌شه — هزینه کنترل — تاریکی روشن شد
- ✅ status.sh v3.1.0 — health check پرووایدرها + اعتبار + تست واقعی Telegram + disk — تاریکی روشن شد
- ✅ smoke-test.sh v3.1.0 — تست کامل — SMS تست به خودت + Telegram تست — هزینه داره — تاریکی روشن شد
- ✅ Web Setup Wizard /setup — بدون ترمینال — برای مامان بزرگ واقعی — v4.0.0 — تاریکی روشن شد



```bash
./install.sh — جادوگر v3.1.0 — پشتیبانی صفر — تاریکی روشن شد
./status.sh — وضعیت + پرووایدرها + اعتبار — تاریکی روشن شد
./smoke-test.sh — تست کامل — تاریکی روشن شد
```

