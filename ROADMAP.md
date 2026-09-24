# Roadmap — adaptive-financial-os

## Done (v0.9.0)

- [x] P00-P01: double-entry ledger, RLS, immutability triggers, idempotency, outbox, balance validation
- [x] P02: accounting-core balance.ts + trialBalance + projectionDeltas, outbox-relay projection.service.ts with ensureTables + project transactional + idempotency guard
- [x] Migration 0002_projection.sql: ledger_projection + account_balances + RLS + immutability
- [x] WebhookOutboxPublisher HTTP real path, Kafka → v2
- [x] Endpoints GET /ledger/projection + /ledger/balances
- [x] Tests: 20 core + 10 relay = 30 passed, idempotency regression
- [x] Docker compose healthy

## v2 (Explicit, Honest)

### Why v2?
- **Kafka Publisher**: Currently Log + Webhook HTTP. v2 will add Kafka publisher with exactly-once semantics via transactional outbox + Kafka idempotent producer. Reason: needs Kafka cluster + schema registry, currently log-only for P02.
- **Real Outbox Publisher**: Currently LogOutboxPublisher + WebhookOutboxPublisher. v2: real webhook retry with DLQ + Kafka. Reason: needs infra.
- **Ledger Projection API**: GET /ledger/projection exists but needs pagination + filtering by date range + aggregation. Reason: requires query optimization.
- **Account Balances Query**: GET /ledger/balances exists but needs historical balances + time-travel. Reason: needs event sourcing.
- **Multi-Currency**: Currently single currency per entry validated, but cross-currency conversion not implemented. v2: FX rates + conversion.
- **OCR/Translation**: Not applicable.

### Next Steps
1. Kafka publisher with idempotent producer
2. DLQ + retry with exponential backoff for webhook
3. Historical balances + time-travel query
4. FX rates + multi-currency conversion
5. Formal audit + pen-test for RLS
