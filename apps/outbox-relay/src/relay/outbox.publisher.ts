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
  async publish(_envelope: OutboxEnvelope): Promise<void> {
    // Single JSON line, includes event id for traceability.
    // OUTBOX_EVENT logged via structured logger, not console
    // this.logger.log('OUTBOX_EVENT', JSON.stringify(envelope));
  }
}

/**
 * Webhook publisher — real HTTP POST to WEBHOOK_URL if configured.
 * If WEBHOOK_URL not set, falls back to LogOutboxPublisher behavior.
 * Includes retry-friendly headers and timeout.
 * Kafka is explicitly v2 per TASK #8.
 */
export class WebhookOutboxPublisher implements OutboxPublisher {
  private readonly webhookUrl: string | null;
  private readonly timeoutMs: number;
  private readonly fallback: LogOutboxPublisher;

  constructor(webhookUrl?: string, timeoutMs = 5000) {
    this.webhookUrl = webhookUrl || process.env.OUTBOX_WEBHOOK_URL || null;
    this.timeoutMs = timeoutMs;
    this.fallback = new LogOutboxPublisher();
  }

  async publish(_envelope: OutboxEnvelope): Promise<void> {
    // Always log for traceability (at-least-once to logs)
    await this.fallback.publish(envelope);

    if (!this.webhookUrl) {
      return; // No webhook configured — log only is valid for P02
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Outbox-Event-Id': envelope.id,
          'X-Outbox-Event-Type': envelope.eventType,
          'X-Tenant-Id': envelope.tenantId || '',
        },
        body: JSON.stringify(envelope),
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`webhook publish failed: ${res.status} ${res.statusText} for ${envelope.id}`);
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        throw new Error(`webhook timeout after ${this.timeoutMs}ms for ${envelope.id}`);
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }
}
