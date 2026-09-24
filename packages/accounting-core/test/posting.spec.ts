import { describe, expect, it } from "vitest";
import { AccountingError } from "../src/errors.js";
import { money } from "../src/money.js";
import { validateEntry } from "../src/posting.js";
import type { JournalEntryInput } from "../src/types.js";

const T = "00000000-0000-4000-8000-000000000001";
const CASH = "00000000-0000-4000-8000-00000000000a";
const REV = "00000000-0000-4000-8000-00000000000b";

const base: JournalEntryInput = {
  tenantId: T,
  idempotencyKey: "order-1",
  bookingDate: "2026-01-15",
  currency: "USD",
  lines: [
    { accountId: CASH, side: "DEBIT", amount: money(1000n, "USD") },
    { accountId: REV, side: "CREDIT", amount: money(1000n, "USD") }
  ]
};

describe("validateEntry", () => {
  it("accepts a balanced entry", () => {
    const v = validateEntry(base);
    expect(v.totalDebit.amount).toBe(1000n);
    expect(v.totalCredit.amount).toBe(1000n);
  });

  it("rejects unbalanced entries", () => {
    const bad: JournalEntryInput = {
      ...base,
      lines: [
        { accountId: CASH, side: "DEBIT", amount: money(1000n, "USD") },
        { accountId: REV, side: "CREDIT", amount: money(999n, "USD") }
      ]
    };
    expect(() => validateEntry(bad)).toThrowError(AccountingError);
  });

  it("rejects zero amounts", () => {
    const bad: JournalEntryInput = {
      ...base,
      lines: [base.lines[0]!, { ...base.lines[1]!, amount: money(0n, "USD") }]
    };
    expect(() => validateEntry(bad)).toThrowError(/non-zero/);
  });

  it("rejects negative amounts", () => {
    const bad: JournalEntryInput = {
      ...base,
      lines: base.lines.map((l) => ({ ...l, amount: money(-1n, "USD") }))
    };
    expect(() => validateEntry(bad)).toThrowError(/non-negative/);
  });

  it("rejects currency mismatch between a line and the entry", () => {
    const bad: JournalEntryInput = {
      ...base,
      lines: [
        { accountId: CASH, side: "DEBIT", amount: money(1000n, "USD") },
        { accountId: REV, side: "CREDIT", amount: money(1000n, "EUR") }
      ]
    };
    expect(() => validateEntry(bad)).toThrowError(/currency/);
  });

  it("requires at least one debit and one credit", () => {
    const bad: JournalEntryInput = {
      ...base,
      lines: [
        { accountId: CASH, side: "DEBIT", amount: money(100n, "USD") },
        { accountId: REV, side: "DEBIT", amount: money(100n, "USD") }
      ]
    };
    expect(() => validateEntry(bad)).toThrowError(/debit and one credit/);
  });

  it("rejects invalid booking date", () => {
    expect(() => validateEntry({ ...base, bookingDate: "15-01-2026" })).toThrowError(/bookingDate/);
  });

  it("rejects empty idempotency key", () => {
    expect(() => validateEntry({ ...base, idempotencyKey: "" })).toThrowError(/idempotencyKey/);
  });

  it("rejects a single-line entry", () => {
    expect(() => validateEntry({ ...base, lines: [base.lines[0]!] })).toThrowError(/two lines/);
  });

  it("produces deterministic line ordering", () => {
    const shuffled: JournalEntryInput = {
      ...base,
      lines: [base.lines[1]!, base.lines[0]!]
    };
    const v = validateEntry(shuffled);
    expect(v.lines[0]!.accountId).toBe(CASH);
    expect(v.lines[1]!.accountId).toBe(REV);
  });

  it("round-trips money formatting", () => {
    const m = money(123456n, "IRR");
    expect(moneyEquals(m, money(123456n, "IRR"))).toBe(true);
    expect(moneyEquals(m, money(123457n, "IRR"))).toBe(false);
  });
});

function moneyEquals(a: { amount: bigint; currency: string }, b: { amount: bigint; currency: string }) {
  return a.amount === b.amount && a.currency === b.currency;
}
