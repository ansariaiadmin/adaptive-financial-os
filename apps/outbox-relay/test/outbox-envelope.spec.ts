import { describe, expect, it } from "vitest";

function toEnvelope(row: any) {
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

describe("outbox envelope conversion", () => {
  it("extracts occurredAt from payload", () => {
    const row = {
      id: "id1",
      tenant_id: "t1",
      aggregate_type: "journal_entry",
      aggregate_id: "entry1",
      event_type: "journal_entry.posted",
      payload: { occurredAt: "2026-01-01T00:00:00Z", entryId: "entry1" },
      created_at: "2026-01-02T00:00:00Z",
    };
    const env = toEnvelope(row);
    expect(env.occurredAt).toBe("2026-01-01T00:00:00Z");
    expect(env.aggregateId).toBe("entry1");
  });

  it("falls back to created_at when payload has no occurredAt", () => {
    const row = {
      id: "id2",
      tenant_id: "t1",
      aggregate_type: "journal_entry",
      aggregate_id: "entry2",
      event_type: "journal_entry.posted",
      payload: { entryId: "entry2" },
      created_at: "2026-01-02T00:00:00Z",
    };
    const env = toEnvelope(row);
    expect(env.occurredAt).toContain("2026-01-02");
  });

  it("handles null created_at", () => {
    const row = {
      id: "id3",
      tenant_id: null,
      aggregate_type: "journal_entry",
      aggregate_id: null,
      event_type: "journal_entry.posted",
      payload: null,
      created_at: null,
    };
    const env = toEnvelope(row);
    expect(env.occurredAt).toBeNull();
  });
});
