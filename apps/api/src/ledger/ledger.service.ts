import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { PostEntryDto } from './dto/post-entry.dto';
import { QueryResultRow } from 'pg';

export interface JournalEntryRow extends QueryResultRow {
  id: string;
  tenant_id: string;
  description: string;
  occurred_at: string;
  created_at: string;
  outbox_id: string | null;
}

@Injectable()
export class LedgerService {
  private readonly logger = new Logger(LedgerService.name);

  constructor(private readonly db: DatabaseService) {}

  async postEntry(dto: PostEntryDto): Promise<{ id: string; status: string; cached?: boolean }> {
    this.validateBalance(dto);

    const client = await this.db.getClient();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.current_tenant', $1, true)", [dto.tenantId]);

      const existing = await client.query<{ entry_id: string }>(
        `SELECT entry_id
         FROM idempotency_keys
         WHERE tenant_id = $1 AND key = $2
         LIMIT 1`,
        [dto.tenantId, dto.idempotencyKey],
      );

      if (existing.rows.length > 0) {
        await client.query('ROLLBACK');
        return { id: existing.rows[0].entry_id, status: 'posted', cached: true };
      }

      const entryRes = await client.query<{ id: string }>(
        `INSERT INTO journal_entries (tenant_id, description)
         VALUES ($1, $2)
         RETURNING id`,
        [dto.tenantId, dto.description],
      );
      const entryId = entryRes.rows[0].id;

      for (const line of dto.lines) {
        const accountRes = await client.query<{ id: string }>(
          `SELECT id FROM accounts WHERE tenant_id = $1 AND code = $2 LIMIT 1`,
          [dto.tenantId, line.accountCode],
        );

        if (accountRes.rows.length === 0) {
          throw new NotFoundException(`Account not found: ${line.accountCode}`);
        }

        await client.query(
          `INSERT INTO journal_lines (tenant_id, entry_id, account_id, amount, direction, currency)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [dto.tenantId, entryId, accountRes.rows[0].id, line.amount, line.direction, line.currency],
        );
      }

      await client.query(
        `INSERT INTO idempotency_keys (tenant_id, key, entry_id)
         VALUES ($1, $2, $3)`,
        [dto.tenantId, dto.idempotencyKey, entryId],
      );

      await client.query(
        `INSERT INTO outbox_events (tenant_id, aggregate_type, aggregate_id, event_type, payload)
         VALUES ($1, 'journal_entry', $2, 'journal_entry.posted', $3)`,
        [dto.tenantId, entryId, JSON.stringify({ entryId, description: dto.description, linesCount: dto.lines.length })],
      );

      await client.query('COMMIT');
      return { id: entryId, status: 'posted' };
    } catch (err: unknown) {
      try {
        await client.query('ROLLBACK');
      } catch {}
      if (err.code === '23505') {
        throw new ConflictException('Concurrent request or duplicate idempotency key');
      }
      this.logger.error(`Failed to post entry: ${err.message}`, err.stack);
      throw new InternalServerErrorException(err.message);
    } finally {
      client.release();
    }
  }

  async listEntries(tenantId: string, limit = 50): Promise<JournalEntryRow[]> {
    const client = await this.db.getClient();
    try {
      await client.query("SELECT set_config('app.current_tenant', $1, true)", [tenantId]);
      const res = await client.query<JournalEntryRow>(
        `SELECT * FROM journal_entries WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT $2`,
        [tenantId, Math.min(limit, 100)],
      );
      return res.rows;
    } finally {
      client.release();
    }
  }

  async getEntry(tenantId: string, id: string) {
    const client = await this.db.getClient();
    try {
      await client.query("SELECT set_config('app.current_tenant', $1, true)", [tenantId]);
      const entryRes = await client.query<JournalEntryRow>(
        `SELECT * FROM journal_entries WHERE id = $1 AND tenant_id = $2`,
        [id, tenantId],
      );
      if (entryRes.rows.length === 0) {
        throw new NotFoundException(`Entry ${id} not found`);
      }
      const linesRes = await client.query(
        `SELECT jl.*, a.code AS account_code, a.name AS account_name
         FROM journal_lines jl
         JOIN accounts a ON a.id = jl.account_id
         WHERE jl.entry_id = $1
         ORDER BY jl.created_at ASC`,
        [id],
      );
      return { entry: entryRes.rows[0], lines: linesRes.rows };
    } finally {
      client.release();
    }
  }

  async listProjections(tenantId: string, limit = 50) {
    const client = await this.db.getClient();
    try {
      await client.query("SELECT set_config('app.current_tenant', $1, true)", [tenantId]);
      // Check if projection table exists
      try {
        const res = await client.query(
          `SELECT * FROM ledger_projection WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT $2`,
          [tenantId, Math.min(limit, 100)],
        );
        return res.rows;
      } catch (err: unknown) {
        if (err.code === '42P01') {
          // Table does not exist yet — return empty
          return [];
        }
        throw err;
      }
    } finally {
      client.release();
    }
  }

  async listBalances(tenantId: string) {
    const client = await this.db.getClient();
    try {
      await client.query("SELECT set_config('app.current_tenant', $1, true)", [tenantId]);
      try {
        const res = await client.query(
          `SELECT ab.*, a.code AS account_code, a.name AS account_name
           FROM account_balances ab
           JOIN accounts a ON a.id = ab.account_id
           WHERE ab.tenant_id = $1
           ORDER BY a.code ASC`,
          [tenantId],
        );
        return res.rows;
      } catch (err: unknown) {
        if (err.code === '42P01') {
          return [];
        }
        throw err;
      }
    } finally {
      client.release();
    }
  }

  async getProjection(tenantId: string, entryId: string) {
    const client = await this.db.getClient();
    try {
      await client.query("SELECT set_config('app.current_tenant', $1, true)", [tenantId]);
      try {
        const res = await client.query(
          `SELECT * FROM ledger_projection WHERE entry_id = $1 AND tenant_id = $2`,
          [entryId, tenantId],
        );
        if (res.rows.length === 0) {
          throw new NotFoundException(`Projection for entry ${entryId} not found`);
        }
        return res.rows[0];
      } catch (err: unknown) {
        if (err.code === '42P01') {
          throw new NotFoundException(`Projection table not yet created`);
        }
        throw err;
      }
    } finally {
      client.release();
    }
  }

  private validateBalance(dto: PostEntryDto): void {
    let debits = 0n;
    let credits = 0n;
    for (const line of dto.lines) {
      const amount = BigInt(line.amount);
      if (line.direction === 'debit') debits += amount;
      else credits += amount;
    }
    if (debits !== credits) {
      throw new BadRequestException(`Unbalanced entry: debits (${debits}) !== credits (${credits})`);
    }
  }
}
