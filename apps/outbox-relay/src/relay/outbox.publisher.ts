export interface OutboxEnvelope {
  id: string;
  tenantId: string | null;
  aggregateType: string;
  aggregateId: string | null;
  eventType: string;
  payload: unknown;
  occurredAt: string | null;
}

export interface OutboxPublisher {
  publish(envelope: OutboxEnvelope): Promise<void>;
}

/**
 * Log/stdout publisher: one JSON line per event.
 * ARCHITECTURE.md / generation_protocol.md define no HTTP/webhook sink,
 * so stdout is the delivery channel for this phase (at-least-once to logs).
 */
export class LogOutboxPublisher implements OutboxPublisher {
  async publish(envelope: OutboxEnvelope): Promise<void> {
    // Single JSON line, includes event id for traceability.
    console.log('OUTBOX_EVENT ' + JSON.stringify(envelope));
  }
}
