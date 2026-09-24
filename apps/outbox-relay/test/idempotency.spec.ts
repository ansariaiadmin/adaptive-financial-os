import { describe, expect, it } from "vitest";
import { ProjectionService } from "../src/relay/projection.service.js";

/**
 * Regression test for double-count bug:
 * When outbox event is redelivered (at-least-once), projection should be idempotent
 * and not double-count balances.
 */

describe("Projection idempotency guard (regression)", () => {
  it("skips balance update when entry already projected", async () => {
    let balanceUpsertCalled = false;

    const mockPool = {
      connect: async () => ({
        query: async (sql: string, _params?: unknown[]) => {
          const lower = sql.toLowerCase();
          if (lower.includes("select") && lower.includes("from ledger_projection") && lower.includes("where entry_id")) {
            // Simulate already projected
            return { rows: [{ entry_id: params[0] }] };
          }
          if (lower.includes("begin") || lower.includes("rollback") || lower.includes("commit")) {
            return { rows: [] };
          }
          // Should not reach insert if guard works
          if (lower.includes("insert into ledger_projection")) {
            throw new Error("should not insert when already projected");
          }
          if (lower.includes("insert into account_balances")) {
            balanceUpsertCalled = true;
            return { rows: [] };
          }
          return { rows: [] };
        },
        release: () => {},
      }),
    };

    const mockDb = {
      getPool: () => mockPool,
      query: async (sql: string, _params?: unknown[]) => {
        // For entry + lines fetch outside transaction
        if (sql.includes("FROM journal_entries")) {
          return { rows: [{ id: "entry-1", tenant_id: "t1", description: "test", occurred_at: new Date().toISOString(), created_at: new Date().toISOString() }] };
        }
        if (sql.includes("FROM journal_lines")) {
          return { rows: [{ account_id: "acc1", direction: "debit", amount: "1000", currency: "USD", tenant_id: "t1" }] };
        }
        return { rows: [] };
      },
    } as any;

    const svc = new ProjectionService(mockDb);
    const envelope = {
      id: "evt-1",
      tenantId: "t1",
      aggregateType: "journal_entry",
      aggregateId: "entry-1",
      eventType: "journal_entry.posted",
      payload: {},
      occurredAt: new Date().toISOString(),
    };

    const result = await svc.project(envelope);
    expect(result).toBe(true);
    expect(balanceUpsertCalled).toBe(false); // Should NOT upsert balances again
  });

  it("projects only once even with concurrent redelivery simulation", async () => {
    let projectionInsertCount = 0;
    let balanceUpsertCount = 0;

    const mockPool = {
      connect: async () => ({
        query: async (sql: string, _params?: unknown[]) => {
          const lower = sql.toLowerCase();
          if (lower.includes("select") && lower.includes("from ledger_projection") && lower.includes("where entry_id")) {
            // First call: not exists, second call: exists (simulate race)
            if (projectionInsertCount === 0) {
              return { rows: [] };
            }
            return { rows: [{ entry_id: params[0] }] };
          }
          if (lower.includes("begin") || lower.includes("rollback") || lower.includes("commit")) {
            return { rows: [] };
          }
          if (lower.includes("insert into ledger_projection")) {
            if (projectionInsertCount === 0) {
              projectionInsertCount++;
              return { rows: [{ entry_id: params[0] }] }; // RETURNING
            }
            return { rows: [] }; // ON CONFLICT DO NOTHING
          }
          if (lower.includes("insert into account_balances")) {
            balanceUpsertCount++;
            return { rows: [] };
          }
          return { rows: [] };
        },
        release: () => {},
      }),
    };

    const mockDb = {
      getPool: () => mockPool,
      query: async (sql: string) => {
        if (sql.includes("FROM journal_entries")) {
          return { rows: [{ id: "entry-1", tenant_id: "t1", description: "test", occurred_at: new Date().toISOString(), created_at: new Date().toISOString() }] };
        }
        if (sql.includes("FROM journal_lines")) {
          return { rows: [
            { account_id: "acc1", direction: "debit", amount: "1000", currency: "USD", tenant_id: "t1" },
            { account_id: "acc2", direction: "credit", amount: "1000", currency: "USD", tenant_id: "t1" },
          ] };
        }
        return { rows: [] };
      },
    } as any;

    const svc = new ProjectionService(mockDb);
    const envelope = {
      id: "evt-1",
      tenantId: "t1",
      aggregateType: "journal_entry",
      aggregateId: "entry-1",
      eventType: "journal_entry.posted",
      payload: {},
      occurredAt: new Date().toISOString(),
    };

    // First projection
    const r1 = await svc.project(envelope);
    expect(r1).toBe(true);
    expect(projectionInsertCount).toBe(1);
    expect(balanceUpsertCount).toBe(2); // 2 accounts

    // Reset counters for second attempt
    balanceUpsertCount = 0;
    // Second projection (redelivery)
    const r2 = await svc.project(envelope);
    expect(r2).toBe(true);
    expect(balanceUpsertCount).toBe(0); // Should not double-count
  });
});
