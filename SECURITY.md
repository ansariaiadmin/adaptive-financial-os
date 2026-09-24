# Security — adaptive-financial-os

## Multi-tenancy (RLS)
All tenant-scoped tables have Row Level Security enabled. Policies compare
`tenant_id` against the session variable `app.current_tenant`. The API sets this
variable with `SET LOCAL` **inside each transaction**, so it can never leak
across pooled connections.

## Ledger immutability
`journal_entries`, `journal_lines`, and `idempotency_keys` reject `UPDATE` and
`DELETE` at the database level. Corrections are made via reversing entries
(not yet in P00-P01 scope).

## Secrets
- No credentials in source. `docker-compose.yml` uses local dev defaults
  (`afos/afos`) — change these before any non-local deployment.
- `afos_app` DB role is intentionally granted only `SELECT/INSERT/UPDATE`
  (no `DELETE`, no DDL).

## Input validation
- DTOs enforce shape (`post-entry.dto.ts`).
- Amounts are `NUMERIC(20,4)` with `CHECK (amount > 0)`.
- Direction constrained to `debit | credit` at DB level.
- Balance check runs both in app code (fast fail, HTTP 400) and in DB (hard).

## Known limitations (P00-P01)
- Authn/authz (JWT, API keys) is not implemented yet.
- Rate limiting, TLS termination, and key rotation are out of scope for this tranche.
