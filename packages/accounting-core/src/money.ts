import { AccountingError } from "./errors.js";
import type { Money } from "./types.js";

const CURRENCY_RE = /^[A-Z]{3}$/;

/** Create money in minor units (e.g. 1234 = 12.34 with 2 decimals). */
export function money(amount: bigint | number, currency: string): Money {
  if (typeof amount === "number" && !Number.isSafeInteger(amount)) {
    throw new AccountingError("amount must be a safe integer", "INVALID_INPUT");
  }
  if (!CURRENCY_RE.test(currency)) {
    throw new AccountingError(`invalid currency code: ${currency}`, "INVALID_INPUT");
  }
  return { amount: BigInt(amount), currency };
}

export function addMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return { amount: a.amount + b.amount, currency: a.currency };
}

export function sumMoney(items: readonly Money[]): Money {
  if (items.length === 0) {
    throw new AccountingError("cannot sum empty money list", "INVALID_INPUT");
  }
  const first = items[0]!;
  return items.slice(1).reduce((acc, m) => addMoney(acc, m), first);
}

export function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new AccountingError(
      `currency mismatch: ${a.currency} vs ${b.currency}`,
      "CURRENCY_MISMATCH"
    );
  }
}

export function moneyEquals(a: Money, b: Money): boolean {
  return a.amount === b.amount && a.currency === b.currency;
}
