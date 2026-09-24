# Architecture — adaptive-financial-os

## Overview
A modular monolith (NestJS) on PostgreSQL, designed for financial-grade correctness:
immutability, double-entry balance, tenant isolation, idempotency, and an outbox.

```
┌────────────┐     HTTP      ┌──────────────────────┐      SQL       ┌────────────┐
│  clients   │ ────────────► │  apps/api (NestJS)   │ ─────────────► │ PostgreSQL │
└────────────┘               │  health / ledger     │   RLS enforced │ 16         │
                             └──────────────────────┘                └────────────┘
```

## Modules
- **health** — `GET /health`: liveness + DB ping.
- **ledger** — `POST /ledger/entries`, `GET /ledger/entries`, `GET /ledger/entries/:id`.
- **database** — global `pg.Pool` provider with graceful shutdown.

## Database (db/migrations/0001_init.sql)
| Table | Purpose |
|---|---|
| tenants | multi-tenant roots |
| accounts | chart of accounts per tenant |
| journal_entries | entry headers |
| journal_lines | double-entry lines (debit/credit) |
| idempotency_keys | `(tenant_id, key) → entry_id` |
| audit_log | append-only audit trail |
| outbox_events | transactional outbox |

### Guarantees
- **Balanced entries**: deferred constraint trigger `trg_balanced_entry` validates
  `SUM(debit) == SUM(credit)` per entry at COMMIT.
- **Immutability**: `BEFORE UPDATE OR DELETE` triggers reject mutations on
  `journal_entries`, `journal_lines`, `idempotency_keys`.
- **RLS**: every policy filters by `current_setting('app.current_tenant')`.
  The API sets this per request inside its transaction.

## Flow of a posting
1. Idempotency check against `idempotency_keys`.
2. Server-side balance validation (fast fail) + DB trigger (hard guarantee).
3. Single transaction: outbox event → entry header → lines → idempotency key → audit log.
4. Any failure → ROLLBACK (nothing half-written).
