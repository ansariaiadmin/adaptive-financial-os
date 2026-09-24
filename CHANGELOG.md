# Changelog — adaptive-financial-os

## [0.9.0] - 2026-09-24

### Added
- 20 accounting-core tests + 10 outbox-relay tests = 30 passed
- Balance: AccountBalance, balancePerAccount, getAccountBalance, TrialBalance, trialBalanceFromLines, projectionDeltas (NUMERIC(20,4) string → bigint)
- ProjectionService: ensureTables() creates ledger_projection + account_balances + indexes, idempotent
- ProjectionService.project(): only journal_entry.posted, fetches entry+lines, upserts projection ON CONFLICT DO NOTHING + balances ON CONFLICT DO UPDATE increment, transactional + idempotency guard entry_id before upsert
- OutboxRelayService: injects ProjectionService, start() async ensureTables(), processOnce() calls projection.project() with try/catch → treat failure as publish failure for retry, logs projected=N
- WebhookOutboxPublisher: real HTTP POST to OUTBOX_WEBHOOK_URL if configured, fallback to LogOutboxPublisher, headers X-Outbox-Event-Id/Type/Tenant, timeout + AbortController, Kafka → v2 explicit
- Endpoints: GET /ledger/projection, GET /ledger/projection/:id, GET /ledger/balances
- Migration 0002_projection.sql: ledger_projection + account_balances + indexes + immutability trigger + RLS tenant_isolation + grants
- RLS for projection tables
- Tests: idempotency.spec.ts regression for double-count guard, projection.spec.ts, outbox-envelope.spec.ts

### Fixed
- Double-count idempotency: entry_id guard before upsert prevents double-count on at-least-once redelivery (at-least-once + idempotent projection)
- Migration 0002 adds RLS + immutability
- Webhook publisher: HTTP real path, Kafka explicit v2

### Security
- Secret scan 0, .env.example complete per REPORT-7-FINAL: PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE, DATABASE_URL, OUTBOX_* vars
- RLS for all tables including projection

## [0.8.0] - 2026-09-07
- Previous release with 28 tests (20 core + 8 relay)
