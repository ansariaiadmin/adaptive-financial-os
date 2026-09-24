# adaptive-financial-os — Tranche P00-P01

Adaptive Financial OS: NestJS modular monolith + PostgreSQL double-entry ledger
with RLS, immutability triggers, idempotency, and transactional outbox.

## Quick start (docker compose)

```bash
unzip adaptive-financial-os-P00-P01.zip -d afos && cd afos
docker compose up --build -d
```

First boot of the `db` container runs `db/migrations/0001_init.sql`
automatically (mounted at `/docker-entrypoint-initdb.d`). Then apply the seed:

```bash
docker exec -it afos-db psql -U afos -d afos -f /sql/seed.sql
```

Check status:

```bash
docker compose ps          # both services must be "healthy"
```

If migrations were not applied on first boot, run manually:

```bash
docker exec -i afos-db psql -U afos -d afos -v ON_ERROR_STOP=1 < db/migrations/0001_init.sql
```

## API testing

Health:
```bash
curl http://localhost:3000/health
# {"status":"ok","db":"up",...}
```

Get tenant id (from seed):
```bash
docker exec -it afos-db psql -U afos -d afos \
  -c "SELECT id FROM tenants WHERE name='demo-tenant';"
```

Post an entry (replace `<tenant_id>`):
```bash
curl -X POST http://localhost:3000/ledger/entries \
  -H 'Content-Type: application/json' \
  -d '{
    "idempotencyKey": "test-key-1",
    "tenantId": "<tenant_id>",
    "description": "invoice #1 settled",
    "lines": [
      { "accountCode": "1000", "amount": "250", "direction": "debit",  "currency": "USD" },
      { "accountCode": "4000", "amount": "250", "direction": "credit", "currency": "USD" }
    ]
  }'
```

Idempotency test — repeat the same POST: the same entry is returned, no duplicate.
Balance test — set debit 300 / credit 250: you get HTTP 400 `Unbalanced entry`.

List entries:
```bash
curl "http://localhost:3000/ledger/entries?tenantId=<tenant_id>"
curl "http://localhost:3000/ledger/entries/<entry_id>?tenantId=<tenant_id>"
```

## Local development (without Docker)

```bash
cd apps/api
pnpm install          # or npm install
pnpm start:dev        # needs PGHOST/PGUSER/... env vars pointing at Postgres
```

## Verify integrity

```bash
python3 scripts/verify-manifest.py
# all files OK  (manifest.sha256)
```

## Structure
```
apps/api/        NestJS app (health, ledger, database modules)
db/              migrations + seed
docker-compose.yml, Dockerfile, .dockerignore
scripts/         verify-manifest.py, build-zip.sh
docs at root:    ARCHITECTURE.md, SECURITY.md, generation_protocol.md
```
