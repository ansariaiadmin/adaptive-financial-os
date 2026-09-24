-- Adaptive Financial OS - 0002_projection.sql
-- Projection tables for outbox relay: ledger_projection + account_balances
-- Compatible with existing auto-create in ProjectionService.ensureTables()
-- Adds RLS + policies + grants

BEGIN;

-- Ledger projection: append-only materialized view of posted entries
CREATE TABLE IF NOT EXISTS ledger_projection (
  entry_id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  description TEXT,
  occurred_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  lines_count INT NOT NULL DEFAULT 0,
  total_debit NUMERIC(20,4) NOT NULL DEFAULT 0,
  total_credit NUMERIC(20,4) NOT NULL DEFAULT 0,
  payload JSONB
);

-- Account balances: mutable upserted per account, net = debit - credit
CREATE TABLE IF NOT EXISTS account_balances (
  tenant_id UUID NOT NULL,
  account_id UUID NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  debit_total NUMERIC(20,4) NOT NULL DEFAULT 0,
  credit_total NUMERIC(20,4) NOT NULL DEFAULT 0,
  net_balance NUMERIC(20,4) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, account_id)
);

-- Indexes (IF NOT EXISTS for idempotency)
CREATE INDEX IF NOT EXISTS idx_ledger_projection_tenant ON ledger_projection(tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_account_balances_tenant ON account_balances(tenant_id);

-- Immutability for ledger_projection (append-only, like journal_entries)
-- Reuse forbid_mutation() from 0001
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_ledger_projection_immutable'
  ) THEN
    CREATE TRIGGER trg_ledger_projection_immutable
      BEFORE UPDATE OR DELETE ON ledger_projection
      FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
  END IF;
END $$;

-- RLS
ALTER TABLE ledger_projection ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_balances ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if rerun (idempotent)
DROP POLICY IF EXISTS tenant_isolation_ledger_projection ON ledger_projection;
DROP POLICY IF EXISTS tenant_isolation_account_balances ON account_balances;

CREATE POLICY tenant_isolation_ledger_projection ON ledger_projection
  USING (tenant_id::text = current_setting('app.current_tenant', true));

CREATE POLICY tenant_isolation_account_balances ON account_balances
  USING (tenant_id::text = current_setting('app.current_tenant', true));

-- Grants to afos_app (if exists) — idempotent
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'afos_app') THEN
    GRANT SELECT, INSERT, UPDATE ON ledger_projection, account_balances TO afos_app;
  END IF;
END $$;

-- Also grant to current user for local dev (no-op if already owner)
GRANT SELECT, INSERT, UPDATE, DELETE ON ledger_projection, account_balances TO CURRENT_USER;

COMMIT;
