/**
 * Domain types for deterministic double-entry posting.
 * All amounts are integer minor units (e.g. cents) to avoid float errors.
 */
export type UUID = string;
export type ISODateTime = string;

export type AccountType = "ASSET" | "LIABILITY" | "EQUITY" | "INCOME" | "EXPENSE";
export type DebitCredit = "DEBIT" | "CREDIT";

export interface Money {
  /** Integer minor units. Never use floats for money. */
  readonly amount: bigint;
  /** ISO 4217 currency code. */
  readonly currency: string;
}

export interface Account {
  readonly id: UUID;
  readonly tenantId: UUID;
  readonly code: string;
  readonly name: string;
  readonly type: AccountType;
  readonly currency: string;
  readonly createdAt: ISODateTime;
}

export interface JournalLineInput {
  readonly accountId: UUID;
  readonly side: DebitCredit;
  readonly amount: Money;
  readonly memo?: string;
}

export interface JournalEntryInput {
  readonly tenantId: UUID;
  readonly idempotencyKey: string;
  readonly bookingDate: string; // ISO date (YYYY-MM-DD)
  readonly currency: string;
  readonly memo?: string;
  readonly lines: readonly JournalLineInput[];
}

export interface JournalLine {
  readonly id: UUID;
  readonly entryId: UUID;
  readonly accountId: UUID;
  readonly side: DebitCredit;
  readonly amount: Money;
  readonly memo?: string;
}

export interface JournalEntry {
  readonly id: UUID;
  readonly tenantId: UUID;
  readonly idempotencyKey: string;
  readonly bookingDate: string;
  readonly currency: string;
  readonly memo?: string;
  readonly status: "POSTED";
  readonly postedAt: ISODateTime;
  readonly lines: readonly JournalLine[];
}
