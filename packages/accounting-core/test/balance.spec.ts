import { describe, expect, it } from "vitest";
import { money } from "../src/money.js";
import { balancePerAccount, getAccountBalance, trialBalanceFromLines, trialBalanceFromMap, projectionDeltas } from "../src/balance.js";
import type { JournalLineInput } from "../src/types.js";

const CASH = "00000000-0000-4000-8000-00000000000a";
const REV = "00000000-0000-4000-8000-00000000000b";
const EXP = "00000000-0000-4000-8000-00000000000c";

function line(accountId: string, side: "DEBIT" | "CREDIT", amount: bigint): JournalLineInput {
  return { accountId, side, amount: money(amount, "USD") };
}

describe("balancePerAccount", () => {
  it("computes debit and credit totals per account", () => {
    const lines: JournalLineInput[] = [
      line(CASH, "DEBIT", 1000n),
      line(REV, "CREDIT", 1000n),
    ];
    const balances = balancePerAccount(lines);
    expect(balances.size).toBe(2);
    const cashBal = balances.get(CASH)!;
    expect(cashBal.debitTotal.amount).toBe(1000n);
    expect(cashBal.creditTotal.amount).toBe(0n);
    expect(cashBal.net.amount).toBe(1000n);
    const revBal = balances.get(REV)!;
    expect(revBal.creditTotal.amount).toBe(1000n);
    expect(revBal.net.amount).toBe(-1000n);
  });

  it("aggregates multiple lines for same account", () => {
    const lines: JournalLineInput[] = [
      line(CASH, "DEBIT", 1000n),
      line(CASH, "DEBIT", 500n),
      line(CASH, "CREDIT", 200n),
      line(REV, "CREDIT", 1300n),
    ];
    const balances = balancePerAccount(lines);
    const cash = balances.get(CASH)!;
    expect(cash.debitTotal.amount).toBe(1500n);
    expect(cash.creditTotal.amount).toBe(200n);
    expect(cash.net.amount).toBe(1300n);
  });

  it("rejects currency mismatch", () => {
    const lines: JournalLineInput[] = [
      { accountId: CASH, side: "DEBIT", amount: money(1000n, "USD") },
      { accountId: CASH, side: "CREDIT", amount: money(500n, "EUR") },
    ];
    expect(() => balancePerAccount(lines)).toThrowError(/currency mismatch/);
  });

  it("getAccountBalance returns null for missing account", () => {
    const lines: JournalLineInput[] = [line(CASH, "DEBIT", 100n), line(REV, "CREDIT", 100n)];
    expect(getAccountBalance(lines, EXP)).toBeNull();
    expect(getAccountBalance(lines, CASH)?.accountId).toBe(CASH);
  });
});

describe("trialBalance", () => {
  it("produces balanced trial balance", () => {
    const lines: JournalLineInput[] = [
      line(CASH, "DEBIT", 1000n),
      line(REV, "CREDIT", 1000n),
    ];
    const tb = trialBalanceFromLines(lines);
    expect(tb.balanced).toBe(true);
    expect(tb.totalDebit.amount).toBe(1000n);
    expect(tb.totalCredit.amount).toBe(1000n);
    expect(tb.rows.length).toBe(2);
  });

  it("trial balance from map is deterministic sorted", () => {
    const lines: JournalLineInput[] = [
      line(REV, "CREDIT", 2000n),
      line(CASH, "DEBIT", 1500n),
      line(EXP, "DEBIT", 500n),
    ];
    const tb = trialBalanceFromLines(lines);
    expect(tb.balanced).toBe(true);
    // Sorted by accountId
    const ids = tb.rows.map(r => r.accountId);
    const sorted = [...ids].sort();
    expect(ids).toEqual(sorted);
  });

  it("rejects multi-currency trial balance", () => {
    const perAccount = new Map();
    perAccount.set(CASH, {
      accountId: CASH,
      currency: "USD",
      debitTotal: money(100n, "USD"),
      creditTotal: money(0n, "USD"),
      net: money(100n, "USD"),
    });
    perAccount.set(REV, {
      accountId: REV,
      currency: "EUR",
      debitTotal: money(0n, "EUR"),
      creditTotal: money(100n, "EUR"),
      net: money(-100n, "EUR"),
    });
    expect(() => trialBalanceFromMap(perAccount)).toThrowError(/multi-currency/);
  });
});

describe("projectionDeltas", () => {
  it("computes deltas from DB lines", () => {
    const dbLines = [
      { account_id: CASH, direction: "debit" as const, amount: "1000", currency: "USD" },
      { account_id: REV, direction: "credit" as const, amount: "1000", currency: "USD" },
    ];
    const deltas = projectionDeltas(dbLines);
    expect(deltas.size).toBe(2);
    expect(deltas.get(CASH)?.debit).toBe(1000n);
    expect(deltas.get(REV)?.credit).toBe(1000n);
  });

  it("handles decimal amounts like NUMERIC(20,4)", () => {
    const dbLines = [
      { account_id: CASH, direction: "debit" as const, amount: "1000.0000", currency: "USD" },
      { account_id: CASH, direction: "credit" as const, amount: "200.5000", currency: "USD" },
    ];
    const deltas = projectionDeltas(dbLines);
    const cash = deltas.get(CASH)!;
    // 1000.0000 -> 10000000 (1000*10000), 200.5000 -> 2005000
    expect(cash.debit).toBe(10000000n);
    expect(cash.credit).toBe(2005000n);
  });
});
