export class AccountingError extends Error {
  override readonly name = "AccountingError";
  constructor(
    message: string,
    readonly code:
      | "UNBALANCED_ENTRY"
      | "EMPTY_LINES"
      | "CURRENCY_MISMATCH"
      | "NEGATIVE_AMOUNT"
      | "INVALID_DATE"
      | "INVALID_INPUT"
  ) {
    super(message);
  }
}
