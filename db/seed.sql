-- Adaptive Financial OS - seed data
-- Run AFTER 0001_init.sql, as a role allowed to insert into tenants/accounts.
BEGIN;

INSERT INTO tenants (name) VALUES ('demo-tenant') ON CONFLICT (name) DO NOTHING;

WITH t AS (SELECT id FROM tenants WHERE name = 'demo-tenant')
INSERT INTO accounts (tenant_id, code, name, currency)
SELECT t.id, v.code, v.name, 'USD'
FROM t, (VALUES
  ('1000','Cash'),
  ('2000','Accounts Payable'),
  ('4000','Revenue'),
  ('5000','Expenses')
) AS v(code, name)
ON CONFLICT (tenant_id, code) DO NOTHING;

-- Balanced demo entry: pay 100 expense from cash (deferred trigger validates at COMMIT)
WITH t AS (SELECT id FROM tenants WHERE name = 'demo-tenant'),
e AS (
  INSERT INTO journal_entries (tenant_id, description)
  SELECT t.id, 'Demo: pay 100 expense from cash' FROM t
  RETURNING id, tenant_id
),
ins AS (
  INSERT INTO journal_lines (tenant_id, entry_id, account_id, amount, direction, currency)
  SELECT e.tenant_id, e.id, a.id, 100, 'debit', 'USD'
  FROM e JOIN accounts a ON a.code = '5000' AND a.tenant_id = e.tenant_id
  UNION ALL
  SELECT e.tenant_id, e.id, a.id, 100, 'credit', 'USD'
  FROM e JOIN accounts a ON a.code = '1000' AND a.tenant_id = e.tenant_id
  RETURNING 1
)
SELECT count(*) FROM ins;

COMMIT;
