import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import type { OutboxEnvelope } from './outbox.publisher';

/**
 * Projection ledger service.
 * Reads journal_entries + journal_lines for a given outbox event and projects to:
 * - ledger_projection (append-only materialized view of entries)
 * - account_balances (upserted per account)
 *
 * Idempotent: uses entry_id as key, ON CONFLICT DO NOTHING / DO UPDATE.
 */

interface JournalLineRow {
  account_id: string;
  direction: 'debit' | 'credit';
  amount: string;
  currency: string;
  tenant_id: string;
}

@Injectable()
export class ProjectionService {
  private readonly logger = new Logger(ProjectionService.name);

  constructor(private readonly db: DatabaseService) {}

  /**
   * Ensure projection tables exist. Called on module init.
   * Safe to run multiple times.
   */
  async ensureTables(): Promise<void> {
    await this.db.query(`
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
    `);
    await this.db.query(`
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
    `);
    await this.db.query(`
      CREATE INDEX IF NOT EXISTS idx_ledger_projection_tenant ON ledger_projection(tenant_id, created_at);
    `);
    await this.db.query(`
      CREATE INDEX IF NOT EXISTS idx_account_balances_tenant ON account_balances(tenant_id);
    `);
  }

  /**
   * Project a single outbox envelope to ledger_projection + account_balances.
   * Returns true if projected, false if skipped (unknown event type).
   * Throws on DB error — caller should handle retry / dead_letter.
   */
  /**
   * Project a single outbox envelope to ledger_projection + account_balances.
   * Idempotency guard: checks ledger_projection entry_id before upserting balances
   * to prevent double-count on at-least-once redelivery.
   * Transactional: projection + balances in one transaction.
   */
  async project(envelope: OutboxEnvelope): Promise<boolean> {
    if (envelope.eventType !== 'journal_entry.posted') {
      this.logger.log(`skip projection for event type ${envelope.eventType} id=${envelope.id}`);
      return false;
    }

    const entryId = envelope.aggregateId;
    if (!entryId) {
      this.logger.warn(`projection skip: missing aggregateId for envelope ${envelope.id}`);
      return false;
    }

    const tenantId = envelope.tenantId;

    // Fetch entry + lines (outside transaction for read)
    const entryRes = await this.db.query(
      `SELECT id, tenant_id, description, occurred_at, created_at FROM journal_entries WHERE id = $1 LIMIT 1`,
      [entryId],
    );
    if (entryRes.rows.length === 0) {
      this.logger.warn(`projection: entry ${entryId} not found for envelope ${envelope.id}`);
      return false;
    }
    const entry = entryRes.rows[0] as any;

    const linesRes = await this.db.query<JournalLineRow>(
      `SELECT account_id, direction, amount::text as amount, currency, tenant_id FROM journal_lines WHERE entry_id = $1`,
      [entryId],
    );
    const lines = linesRes.rows;

    // Compute totals
    let totalDebit = 0;
    let totalCredit = 0;
    for (const l of lines) {
      const amt = parseFloat(l.amount);
      if (l.direction === 'debit') totalDebit += amt;
      else totalCredit += amt;
    }

    // Idempotency guard + transactional projection
    const client = await this.db.getPool().connect();
    try {
      await client.query('BEGIN');

      // Guard: if already projected, skip to avoid double-count
      const existing = await client.query(
        `SELECT entry_id FROM ledger_projection WHERE entry_id = $1 LIMIT 1`,
        [entryId],
      );
      if (existing.rows.length > 0) {
        await client.query('ROLLBACK');
        this.logger.log(`projection idempotent skip: entry ${entryId} already projected`);
        return true; // already projected, treat as success
      }

      // Insert projection with RETURNING to confirm
      const insertRes = await client.query(
        `INSERT INTO ledger_projection (entry_id, tenant_id, description, occurred_at, lines_count, total_debit, total_credit, payload)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (entry_id) DO NOTHING
         RETURNING entry_id`,
        [
          entryId,
          entry.tenant_id || tenantId,
          entry.description,
          entry.occurred_at,
          lines.length,
          totalDebit,
          totalCredit,
          JSON.stringify({ envelopeId: envelope.id, lines: lines.map(l => ({ account_id: l.account_id, direction: l.direction, amount: l.amount })) }),
        ],
      );

      if (insertRes.rows.length === 0) {
        // Race condition: another worker inserted concurrently
        await client.query('ROLLBACK');
        this.logger.log(`projection race skip: entry ${entryId} already projected by concurrent worker`);
        return true;
      }

      // Upsert account_balances per account — only after successful projection insert
      for (const line of lines) {
        const amt = parseFloat(line.amount);
        const debitDelta = line.direction === 'debit' ? amt : 0;
        const creditDelta = line.direction === 'credit' ? amt : 0;
        const netDelta = debitDelta - creditDelta;

        await client.query(
          `INSERT INTO account_balances (tenant_id, account_id, currency, debit_total, credit_total, net_balance, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, now())
           ON CONFLICT (tenant_id, account_id) DO UPDATE SET
             debit_total = account_balances.debit_total + EXCLUDED.debit_total,
             credit_total = account_balances.credit_total + EXCLUDED.credit_total,
             net_balance = account_balances.net_balance + EXCLUDED.net_balance,
             updated_at = now()`,
          [line.tenant_id || tenantId, line.account_id, line.currency, debitDelta, creditDelta, netDelta],
        );
      }

      await client.query('COMMIT');
      this.logger.log(`projected entry ${entryId} with ${lines.length} lines (debit=${totalDebit} credit=${totalCredit})`);
      return true;
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch {}
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Pure helper for tests — computes projection deltas without DB.
   */
  static computeDeltas(lines: readonly { account_id: string; direction: 'debit' | 'credit'; amount: string | number; currency: string }[]) {
    const map = new Map<string, { currency: string; debit: number; credit: number }>();
    for (const l of lines) {
      if (!map.has(l.account_id)) map.set(l.account_id, { currency: l.currency, debit: 0, credit: 0 });
      const d = map.get(l.account_id)!;
      const amt = typeof l.amount === 'string' ? parseFloat(l.amount) : l.amount;
      if (l.direction === 'debit') d.debit += amt;
      else d.credit += amt;
    }
    return map;
  }
}
