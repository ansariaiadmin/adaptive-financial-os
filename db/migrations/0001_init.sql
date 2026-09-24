-- Adaptive Financial OS - 0001_init.sql
-- Initial schema: tenants, accounts, journal_entries, journal_lines,
-- idempotency_keys, audit_log, outbox_events + RLS + immutability triggers
-- + balanced-entry enforcement. Run as migration role (superuser/owner).

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);

CREATE TABLE journal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  description TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  outbox_id UUID
);

CREATE TABLE journal_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  entry_id UUID NOT NULL REFERENCES journal_entries(id),
  account_id UUID NOT NULL REFERENCES accounts(id),
  amount NUMERIC(20,4) NOT NULL CHECK (amount > 0),
  direction TEXT NOT NULL CHECK (direction IN ('debit','credit')),
  currency TEXT NOT NULL DEFAULT 'USD',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE idempotency_keys (
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  key TEXT NOT NULL,
  entry_id UUID NOT NULL REFERENCES journal_entries(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, key)
);

CREATE TABLE audit_log (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID,
  action TEXT NOT NULL,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE outbox_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  aggregate_type TEXT NOT NULL,
  aggregate_id UUID,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  event_type TEXT NOT NULL,
  payload JSONB,
  published_at TIMESTAMPTZ,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_journal_lines_entry   ON journal_lines(entry_id);
CREATE INDEX idx_journal_lines_account ON journal_lines(account_id);
CREATE INDEX idx_journal_entries_tenant ON journal_entries(tenant_id);
CREATE INDEX idx_outbox_unpublished ON outbox_events(created_at) WHERE published_at IS NULL;
CREATE INDEX idx_outbox_tenant_status ON outbox_events(tenant_id, status, created_at);
CREATE INDEX idx_outbox_status ON outbox_events(status, created_at);
CREATE INDEX idx_idempotency_tenant_key ON idempotency_keys(tenant_id, key);

-- Balanced entry enforcement: sum(debits) must equal sum(credits) per entry.
-- DEFERRED so multi-row inserts within one transaction are validated at COMMIT.
CREATE OR REPLACE FUNCTION enforce_balanced_entry() RETURNS trigger AS $$
DECLARE
  d NUMERIC; c NUMERIC;
BEGIN
  SELECT COALESCE(SUM(amount) FILTER (WHERE direction='debit'), 0),
         COALESCE(SUM(amount) FILTER (WHERE direction='credit'), 0)
    INTO d, c
  FROM journal_lines
  WHERE entry_id = NEW.entry_id;
  IF d <> c THEN
    RAISE EXCEPTION 'Unbalanced journal entry %: debits=% credits=%', NEW.entry_id, d, c;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER trg_balanced_entry
  AFTER INSERT ON journal_lines
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION enforce_balanced_entry();

-- Immutability: ledger tables reject UPDATE/DELETE.
CREATE OR REPLACE FUNCTION forbid_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% on % is forbidden: ledger tables are immutable', TG_OP, TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_entries_immutable BEFORE UPDATE OR DELETE ON journal_entries
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER trg_lines_immutable BEFORE UPDATE OR DELETE ON journal_lines
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER trg_idem_immutable BEFORE UPDATE OR DELETE ON idempotency_keys
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

-- Row Level Security: app must SET app.current_tenant = '<uuid>'.
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE idempotency_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbox_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_accounts ON accounts
  USING (tenant_id::text = current_setting('app.current_tenant', true));
CREATE POLICY tenant_isolation_entries ON journal_entries
  USING (tenant_id::text = current_setting('app.current_tenant', true));
CREATE POLICY tenant_isolation_lines ON journal_lines
  USING (tenant_id::text = current_setting('app.current_tenant', true));
CREATE POLICY tenant_isolation_idem ON idempotency_keys
  USING (tenant_id::text = current_setting('app.current_tenant', true));
CREATE POLICY tenant_isolation_audit ON audit_log
  USING (tenant_id IS NULL OR tenant_id::text = current_setting('app.current_tenant', true));
CREATE POLICY tenant_isolation_outbox ON outbox_events
  USING (tenant_id IS NULL OR tenant_id::text = current_setting('app.current_tenant', true));

-- Application role
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'afos_app') THEN
    CREATE ROLE afos_app LOGIN PASSWORD 'afos_app_password';
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO afos_app;
GRANT SELECT, INSERT, UPDATE ON
  tenants, accounts, journal_entries, journal_lines,
  idempotency_keys, audit_log, outbox_events
TO afos_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO afos_app;

COMMIT;
