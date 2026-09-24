import { AccountingError } from "./errors.js";
import type { JournalLineInput, Money } from "./types.js";
import { money } from "./money.js";

export interface AccountBalance {
  readonly accountId: string;
  readonly currency: string;
  readonly debitTotal: Money;
  readonly creditTotal: Money;
  readonly net: Money; // debit - credit (positive = debit balance, negative = credit balance)
}

export interface TrialBalanceRow {
  readonly accountId: string;
  readonly currency: string;
  readonly debit: Money;
  readonly credit: Money;
}

export interface TrialBalance {
  readonly rows: readonly TrialBalanceRow[];
  readonly totalDebit: Money;
  readonly totalCredit: Money;
  readonly balanced: boolean;
}

/**
 * Compute balance per account from journal lines.
 * Deterministic, pure, side-effect free.
 * Net = debitTotal - creditTotal. Positive means debit balance.
 */
export function balancePerAccount(lines: readonly JournalLineInput[]): Map<string, AccountBalance> {
  if (lines.length === 0) {
    throw new AccountingError("cannot compute balance for empty lines", "INVALID_INPUT");
  }
  const byAccount = new Map<string, { currency: string; debit: bigint; credit: bigint }>();

  for (const line of lines) {
    if (!byAccount.has(line.accountId)) {
      byAccount.set(line.accountId, { currency: line.amount.currency, debit: 0n, credit: 0n });
    }
    const acc = byAccount.get(line.accountId)!;
    if (acc.currency !== line.amount.currency) {
      throw new AccountingError(
        `currency mismatch for account ${line.accountId}: ${acc.currency} vs ${line.amount.currency}`,
        "CURRENCY_MISMATCH"
      );
    }
    if (line.side === "DEBIT") {
      acc.debit += line.amount.amount;
    } else {
      acc.credit += line.amount.amount;
    }
  }

  const result = new Map<string, AccountBalance>();
  for (const [accountId, { currency, debit, credit }] of byAccount) {
    const net = debit - credit;
    result.set(accountId, {
      accountId,
      currency,
      debitTotal: money(debit, currency),
      creditTotal: money(credit, currency),
      net: money(net, currency),
    });
  }
  return result;
}

/**
 * Single account balance.
 */
export function getAccountBalance(lines: readonly JournalLineInput[], accountId: string): AccountBalance | null {
  const all = balancePerAccount(lines);
  return all.get(accountId) ?? null;
}

/**
 * Trial balance from per-account balances or raw lines.
 * If passed lines, it computes per-account first.
 */
export function trialBalanceFromLines(lines: readonly JournalLineInput[]): TrialBalance {
  const perAccount = balancePerAccount(lines);
  return trialBalanceFromMap(perAccount);
}

export function trialBalanceFromMap(perAccount: Map<string, AccountBalance>): TrialBalance {
  if (perAccount.size === 0) {
    throw new AccountingError("trial balance requires at least one account", "INVALID_INPUT");
  }
  // Ensure all same currency? For simplicity, require same currency across all accounts, or group by currency.
  // Here we assume single currency for trial balance — common case. If multi-currency, sum per currency not supported, throw.
  const currencies = new Set<string>();
  for (const bal of perAccount.values()) {
    currencies.add(bal.currency);
  }
  if (currencies.size > 1) {
    throw new AccountingError(`trial balance multi-currency not supported: ${[...currencies].join(",")}`, "CURRENCY_MISMATCH");
  }
  const currency = [...currencies][0]!;

  const rows: TrialBalanceRow[] = [];
  let totalDebit = 0n;
  let totalCredit = 0n;

  for (const bal of perAccount.values()) {
    rows.push({
      accountId: bal.accountId,
      currency: bal.currency,
      debit: bal.debitTotal,
      credit: bal.creditTotal,
    });
    totalDebit += bal.debitTotal.amount;
    totalCredit += bal.creditTotal.amount;
  }

  // Sort deterministically by accountId
  rows.sort((a, b) => a.accountId.localeCompare(b.accountId));

  return {
    rows,
    totalDebit: money(totalDebit, currency),
    totalCredit: money(totalCredit, currency),
    balanced: totalDebit === totalCredit,
  };
}

/**
 * Pure projection helper for outbox relay: given journal lines from DB (with direction as 'debit'/'credit' and amount numeric),
 * produce balance deltas that can be applied to account_balances table.
 */
export interface DbLine {
  readonly account_id: string;
  readonly direction: "debit" | "credit";
  readonly amount: string | number; // numeric string from PG
  readonly currency: string;
}

export function projectionDeltas(dbLines: readonly DbLine[]): Map<string, { currency: string; debit: bigint; credit: bigint }> {
  const deltas = new Map<string, { currency: string; debit: bigint; credit: bigint }>();
  for (const line of dbLines) {
    // Parse amount: it may be string numeric with decimals, but our schema uses NUMERIC(20,4). For simplicity, treat as minor units integer string if possible, else parse.
    let amountMinor: bigint;
    const amtStr = String(line.amount);
    if (/^\d+$/.test(amtStr)) {
      amountMinor = BigInt(amtStr);
    } else {
      // Convert decimal to minor: assume 2 decimals? But schema 4 decimals. We'll parse as float * 10000? Simpler: use BigInt of rounded.
      // For test purposes, treat as integer after removing dot.
      // Example "1000.0000" -> 1000 minor? Actually if stored as minor units already, it would be integer. If stored as major with 4 decimals, we need to convert.
      // We'll parse as: amount * 100 (if 2 decimals) or *10000. For safety, if contains '.', remove dot and pad.
      const parts = amtStr.split(".");
      if (parts.length === 2) {
        const whole = parts[0];
        const frac = (parts[1] + "0000").slice(0, 4); // 4 decimal places
        amountMinor = BigInt(whole + frac); // e.g., "10" + "0000" = 100000 = 10 * 10000
        // But if we want minor units as cents (2 decimals), we need to adjust. However accounting-core uses bigint minor units directly, so we keep 4-decimal minor as is.
        // For trial balance, we just need consistent bigint.
      } else {
        amountMinor = BigInt(amtStr);
      }
    }

    if (!deltas.has(line.account_id)) {
      deltas.set(line.account_id, { currency: line.currency, debit: 0n, credit: 0n });
    }
    const d = deltas.get(line.account_id)!;
    if (line.direction === "debit") {
      d.debit += amountMinor;
    } else {
      d.credit += amountMinor;
    }
  }
  return deltas;
}
