#!/usr/bin/env bash
# Apply migrations + seed to a running PostgreSQL (env: PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE).
set -euo pipefail
cd "$(dirname "$0")/.."
: "${PGHOST:=localhost}" "${PGPORT:=5432}" "${PGUSER:=afos}" "${PGPASSWORD:=afos}" "${PGDATABASE:=afos}"
export PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE
psql -v ON_ERROR_STOP=1 -f db/migrations/0001_init.sql
psql -v ON_ERROR_STOP=1 -f db/seed.sql
