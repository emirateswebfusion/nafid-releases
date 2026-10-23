/**
 * Loose row types of the cashier settlement screen. The rows come from the cashier IPC queries with joined and legacy
 * fields that have no data types yet, so they stay untyped here, in one place, until the screen is typed.
 * Use these aliases instead of writing `any` in cashier code.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- legacy invoice row (pending / selected / split / latest bill), typed later in one place
export type CashierInvoiceRow = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- legacy invoice item row, typed later in one place
export type CashierInvoiceItemRow = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- legacy cash drawer (day) row, also the settlement history entries, typed later in one place
export type CashDrawerRow = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- legacy cash drawer transaction row, typed later in one place
export type CashTransactionRow = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- legacy settlement row of a closed day, typed later in one place
export type DaySettlementRow = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- legacy result of a day closing, typed later in one place
export type DayCloseResult = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- legacy party row offered for a cash transaction, typed later in one place
export type CashPartyRow = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- legacy custom cash transaction category, typed later in one place
export type CashCategoryRow = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- legacy configured UPI receiving account, typed later in one place
export type CashierUpiSourceRow = any;
