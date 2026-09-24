import { describe, expect, it } from "vitest";
import { ProjectionService } from "../src/relay/projection.service.js";

describe("ProjectionService.computeDeltas", () => {
  it("computes debit and credit per account", () => {
    const lines = [
      { account_id: "a1", direction: "debit" as const, amount: "1000", currency: "USD" },
      { account_id: "a2", direction: "credit" as const, amount: "1000", currency: "USD" },
    ];
    const deltas = ProjectionService.computeDeltas(lines);
    expect(deltas.size).toBe(2);
    expect(deltas.get("a1")?.debit).toBe(1000);
    expect(deltas.get("a2")?.credit).toBe(1000);
  });

  it("aggregates same account multiple lines", () => {
    const lines = [
      { account_id: "a1", direction: "debit" as const, amount: 500, currency: "USD" },
      { account_id: "a1", direction: "debit" as const, amount: 300, currency: "USD" },
      { account_id: "a1", direction: "credit" as const, amount: 100, currency: "USD" },
    ];
    const deltas = ProjectionService.computeDeltas(lines);
    expect(deltas.get("a1")?.debit).toBe(800);
    expect(deltas.get("a1")?.credit).toBe(100);
  });

  it("handles empty", () => {
    const deltas = ProjectionService.computeDeltas([]);
    expect(deltas.size).toBe(0);
  });
});

describe("ProjectionService envelope handling", () => {
  it("should skip non journal_entry.posted events", async () => {
    // Mock DB service that should not be called for non-posted events
    const mockDb = {
      query: async () => ({ rows: [] }),
    } as any;
    const svc = new ProjectionService(mockDb);
    const envelope = {
      id: "evt-1",
      tenantId: "t1",
      aggregateType: "journal_entry",
      aggregateId: "entry-1",
      eventType: "something.else",
      payload: {},
      occurredAt: new Date().toISOString(),
    };
    const result = await svc.project(envelope);
    expect(result).toBe(false);
  });

  it("should return false when aggregateId missing", async () => {
    const mockDb = {
      query: async () => ({ rows: [] }),
    } as any;
    const svc = new ProjectionService(mockDb);
    const envelope = {
      id: "evt-2",
      tenantId: "t1",
      aggregateType: "journal_entry",
      aggregateId: null,
      eventType: "journal_entry.posted",
      payload: {},
      occurredAt: new Date().toISOString(),
    };
    const result = await svc.project(envelope);
    expect(result).toBe(false);
  });
});
