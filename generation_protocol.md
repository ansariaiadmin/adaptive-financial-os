# Generation Protocol — adaptive-financial-os (Tranche P00-P01)

This repository is produced under a deterministic generation protocol:

## Rules
1. **Every file must be verified** against `manifest.sha256` via `scripts/verify-manifest.py`.
2. **No secrets in code.** All credentials come from environment variables.
3. **Ledger immutability** — no UPDATE/DELETE on ledger tables (DB triggers enforce it).
4. **Balanced entries** — DB constraint trigger enforces debits == credits per entry.
5. **Multi-tenancy** — RLS on all tenant-scoped tables keyed by `app.current_tenant`.
6. **Idempotency** — posting is idempotent per `(tenant_id, idempotency_key)`.
7. **Outbox pattern** — domain events land in `outbox_events` in the same transaction.

## Tranche scope
- P00: repo scaffolding, infra, DB schema.
- P01: NestJS API (health + ledger), migrations, seeds, verification scripts.

## Verification gate
```
python3 scripts/verify-manifest.py   # must report 100% OK
```
