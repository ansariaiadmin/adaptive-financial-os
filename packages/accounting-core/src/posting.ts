import { AccountingError } from "./errors.js";
import { money, sumMoney } from "./money.js";
import type { JournalEntryInput, JournalLineInput, Money } from "./types.js";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface ValidatedEntry {
  readonly tenantId: string;
  readonly idempotencyKey: string;
  readonly bookingDate: string;
  readonly currency: string;
  readonly memo?: string;
  readonly lines: readonly JournalLineInput[];
  readonly totalDebit: Money;
  readonly totalCredit: Money;
}

/**
 * Deterministic, side-effect-free validation of a double-entry journal entry.
 * Throws AccountingError on any rule violation; returns a canonical entry with
 * deterministically sorted lines that callers may persist immutably.
 */
export function validateEntry(input: JournalEntryInput): ValidatedEntry {
  if (!input.tenantId) throw new AccountingError("tenantId is required", "INVALID_INPUT");
  if (!input.idempotencyKey || input.idempotencyKey.length > 128) {
    throw new AccountingError("idempotencyKey must be 1..128 chars", "INVALID_INPUT");
  }
  if (!DATE_RE.test(input.bookingDate)) {
    throw new AccountingError(
      `bookingDate must be YYYY-MM-DD: ${input.bookingDate}`,
      "INVALID_DATE"
    );
  }
  if (input.lines.length < 2) {
    throw new AccountingError("double-entry requires at least two lines", "EMPTY_LINES");
  }

  for (const line of input.lines) {
    if (!line.accountId) throw new AccountingError("line.accountId is required", "INVALID_INPUT");
    if (line.amount.amount < 0n) {
      throw new AccountingError("line amounts must be non-negative", "NEGATIVE_AMOUNT");
    }
    if (line.amount.amount === 0n) {
      throw new AccountingError("line amounts must be non-zero", "INVALID_INPUT");
    }
    if (line.amount.currency !== input.currency) {
      throw new AccountingError(
        `line currency ${line.amount.currency} != entry currency ${input.currency}`,
        "CURRENCY_MISMATCH"
      );
    }
  }

  const debits = input.lines.filter((l) => l.side === "DEBIT");
  const credits = input.lines.filter((l) => l.side === "CREDIT");
  if (debits.length === 0 || credits.length === 0) {
    throw new AccountingError(
      "entry must have at least one debit and one credit",
      "UNBALANCED_ENTRY"
    );
  }

  const totalDebit = sumMoney(debits.map((l) => l.amount));
  const totalCredit = sumMoney(credits.map((l) => l.amount));

  if (totalDebit.amount !== totalCredit.amount) {
    throw new AccountingError(
      `unbalanced entry: debit=${totalDebit.amount} credit=${totalCredit.amount}`,
      "UNBALANCED_ENTRY"
    );
  }

  const lines = [...input.lines].sort(
    (a, b) =>
      a.accountId.localeCompare(b.accountId) ||
      (a.side === b.side ? 0 : a.side === "DEBIT" ? -1 : 1) ||
      (a.amount.amount < b.amount.amount ? -1 : a.amount.amount > b.amount.amount ? 1 : 0)
  );

  const out: ValidatedEntry = {
    tenantId: input.tenantId,
    idempotencyKey: input.idempotencyKey,
    bookingDate: input.bookingDate,
    currency: input.currency,
    lines,
    totalDebit,
    totalCredit
  };
  if (input.memo !== undefined) out.memo = input.memo;
  return out;
}
