import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../database/database.service';
import { WebhookOutboxPublisher, OutboxEnvelope, OutboxPublisher } from './outbox.publisher';
import { ProjectionService } from './projection.service';

interface ClaimedRow {
  id: string;
  tenant_id: string | null;
  aggregate_type: string;
  aggregate_id: string | null;
  event_type: string;
  payload: unknown;
  created_at: Date | string | null;
}

interface Attempt {
  attempts: number;
  nextAttemptAt: number; // epoch ms
}

const MAP_PRUNE_THRESHOLD = 10_000;

function num(v: unknown, dflt: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : dflt;
}

/**
 * Outbox relay worker.
 *
 * Lifecycle: pending -> published, or pending -> dead_letter (worker convention;
 * 'dead_letter' is not in the schema/protocol docs, VARCHAR(32) allows it).
 *
 * Retry bookkeeping is IN-MEMORY ONLY (schema has no attempts/next_attempt_at
 * columns): if this process restarts, attempt counters reset — acceptable for P03.
 *
 * At-least-once semantics: the claim transaction commits before publishing,
 * so a crash after claim but before mark-success re-delivers the same event.
 */
@Injectable()
export class OutboxRelayService implements OnModuleDestroy {
  private readonly logger = new Logger(OutboxRelayService.name);
  private running = false;
  private readonly publisher: OutboxPublisher;
  private readonly backoff: Map<string, Attempt> = new Map();
  private pollCount = 0;

  private pollIntervalMs: number;
  private batchSize: number;
  private maxAttempts: number;
  private backoffBaseMs: number;
  private backoffMaxMs: number;
  private jitterRatio: number;

  constructor(
    private readonly db: DatabaseService,
    private readonly config: ConfigService,
    private readonly projection: ProjectionService,
  ) {
    // Defensive parsing: fall back to defaults on NaN / non-positive values.
    this.pollIntervalMs = num(this.config.get('OUTBOX_POLL_INTERVAL_MS'), 2000);
    this.batchSize = num(this.config.get('OUTBOX_BATCH_SIZE'), 50);
    this.maxAttempts = num(this.config.get('OUTBOX_MAX_ATTEMPTS'), 5);
    this.backoffBaseMs = num(this.config.get('OUTBOX_BACKOFF_BASE_MS'), 1000);
    this.backoffMaxMs = num(this.config.get('OUTBOX_BACKOFF_MAX_MS'), 30000);
    const jr = Number(this.config.get('OUTBOX_JITTER_RATIO'));
    this.jitterRatio = Number.isFinite(jr) && jr >= 0 ? jr : 0.2;
    // Real webhook publisher — if OUTBOX_WEBHOOK_URL set, does HTTP POST, else log-only
    this.publisher = new WebhookOutboxPublisher(
      this.config.get('OUTBOX_WEBHOOK_URL'),
      num(this.config.get('OUTBOX_WEBHOOK_TIMEOUT_MS'), 5000),
    );
  }

  async start(): Promise<void> {
    this.running = true;
    try {
      await this.projection.ensureTables();
      this.logger.log('projection tables ensured (ledger_projection, account_balances)');
    } catch (err) {
      this.logger.warn(`ensureTables failed (will retry on projection): ${this.errMsg(err)}`);
    }
    this.logger.log(
      `outbox relay started (poll=${this.pollIntervalMs}ms batch=${this.batchSize} ` +
      `maxAttempts=${this.maxAttempts})`,
    );
    this.loop();
  }

  private async loop(): Promise<void> {
    while (this.running) {
      try {
        await this.processOnce();
      } catch (err) {
        // Log and continue: transient DB errors must not kill the worker.
        this.logger.error(`poll cycle failed: ${this.errMsg(err)}`);
      }
      await this.sleep(this.pollIntervalMs);
    }
    this.logger.log('outbox relay loop stopped');
  }

  private async processOnce(): Promise<void> {
    this.pollCount++;
    const now = Date.now();
    const backoffIds = [...this.backoff.entries()]
      .filter(([, a]) => a.nextAttemptAt > now)
      .map(([id]) => id);

    const rows = await this.claim(backoffIds);
    if (rows.length === 0) {
      if (this.pollCount % 15 === 1) {
        this.logger.log(`poll: claimed=0 dispatched=0 failed=0 (backoff=${backoffIds.length})`);
      }
      return;
    }

    const okIds: string[] = [];
    let failed = 0;
    let projected = 0;
    for (const row of rows) {
      try {
        const envelope = this.toEnvelope(row);
        await this.publisher.publish(envelope);
        // Real projection to ledger — P02 close
        try {
          const didProject = await this.projection.project(envelope);
          if (didProject) projected++;
        } catch (projErr) {
          // Projection failure should be treated as publish failure for retry
          throw new Error(`projection failed for ${row.id}: ${this.errMsg(projErr)}`);
        }
        okIds.push(row.id);
      } catch (err) {
        failed++;
        await this.handleFailure(row, err);
      }
    }

    if (okIds.length > 0) {
      await this.markPublished(okIds);
    }
    this.logger.log(
      `poll: claimed=${rows.length} dispatched=${okIds.length} projected=${projected} failed=${failed}`,
    );
    if (this.backoff.size > MAP_PRUNE_THRESHOLD) this.pruneResolved();
  }

  /**
   * Claim rows with FOR UPDATE SKIP LOCKED inside a short transaction that
   * commits immediately (before publishing) — at-least-once delivery.
   * $1 = uuid[] of ids in in-memory backoff (empty array cast is valid).
   */
  private async claim(excludeIds: string[]): Promise<ClaimedRow[]> {
    const client = await this.db.getPool().connect();
    try {
      await client.query('BEGIN');
      const res = await client.query<ClaimedRow>(
        `SELECT id, tenant_id, aggregate_type, aggregate_id, event_type, payload, created_at
           FROM outbox_events
          WHERE status = 'pending'
            AND published_at IS NULL
            AND processed_at IS NULL
            AND NOT (id = ANY($1::uuid[]))
          ORDER BY created_at ASC, id ASC
          LIMIT $2
          FOR UPDATE SKIP LOCKED`,
        [excludeIds, this.batchSize],
      );
      await client.query('COMMIT');
      return res.rows;
    } catch (err) {
      try { await client.query('ROLLBACK'); } catch { /* already aborted */ }
      throw err;
    } finally {
      client.release();
    }
  }

  private toEnvelope(row: ClaimedRow): OutboxEnvelope {
    // occurredAt: journal_entry.posted payloads carry the ledger-created field;
    // fall back to row created_at.
    const payload = row.payload as Record<string, unknown> | null;
    const occurredAt =
      (payload && typeof payload === 'object' && typeof payload['occurredAt'] === 'string'
        ? (payload['occurredAt'] as string)
        : null) ??
      (row.created_at ? new Date(row.created_at).toISOString() : null);
    return {
      id: row.id,
      tenantId: row.tenant_id,
      aggregateType: row.aggregate_type,
      aggregateId: row.aggregate_id,
      eventType: row.event_type,
      payload: row.payload,
      occurredAt,
    };
  }

  private async markPublished(ids: string[]): Promise<void> {
    await this.db.query(
      `UPDATE outbox_events
          SET status = 'published', published_at = now(), processed_at = now()
        WHERE id = ANY($1::uuid[]) AND status = 'pending'`,
      [ids],
    );
    for (const id of ids) this.backoff.delete(id);
  }

  private async handleFailure(row: ClaimedRow, err: unknown): Promise<void> {
    const prev = this.backoff.get(row.id);
    const attempts = (prev ? prev.attempts : 0) + 1;
    // Row stays 'pending' — we simply exclude it from claims until due.
    if (attempts > this.maxAttempts) {
      await this.db.query(
        `UPDATE outbox_events
            SET status = 'dead_letter', processed_at = now()
          WHERE id = $1::uuid AND status = 'pending'`,
        [row.id],
      );
      this.backoff.delete(row.id);
      this.logger.error(
        `event ${row.id} moved to dead_letter after ${attempts} attempts: ${this.errMsg(err)}`,
      );
      return;
    }
    const exp = Math.min(this.backoffBaseMs * Math.pow(2, attempts - 1), this.backoffMaxMs);
    const jitter = Math.random() * this.jitterRatio * this.backoffBaseMs;
    this.backoff.set(row.id, { attempts, nextAttemptAt: Date.now() + exp + jitter });
    this.logger.warn(
      `event ${row.id} publish failed (attempt ${attempts}/${this.maxAttempts}), ` +
      `retrying after backoff: ${this.errMsg(err)}`,
    );
  }

  private pruneResolved(): void {
    const now = Date.now();
    for (const [id, a] of this.backoff) {
      if (a.nextAttemptAt <= now) this.backoff.delete(id);
    }
  }

  private errMsg(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  async onModuleDestroy(): Promise<void> {
    this.running = false;
    // DatabaseService.onModuleDestroy ends the pool after current batch settles.
  }
}
