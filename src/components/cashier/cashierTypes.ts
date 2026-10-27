import type { DisplayInvoice, DisplayInvoiceItem } from '../sales/invoiceDisplayTypes';
import type * as Rows from '../../data/dbRows';
import type { cashierApi } from '../../data/cashier';
import type { Party } from '../../data/parties';
import type { PaymentSource } from '../../data/paymentSources';

/** IPC rows and display enrichment used by cashier settlement. */
export type CashierInvoiceRow = DisplayInvoice;
export type CashierInvoiceItemRow = DisplayInvoiceItem;
export type CashDrawerRow = import('../../data/cashier').CashDrawerViewRow & {
  /** Joined history columns; absent on the current-drawer query. */
  opened_by_name?: string | null;
  closed_by_name?: string | null;
  total_collected?: number;
  settled_count?: number;
};
export type CashTransactionRow = import('../../data/cashier').CashTransactionViewRow;
export type DaySettlementRow = DisplayInvoice;
export type DayCloseResult = Awaited<ReturnType<typeof cashierApi.dayClosing>>;
export type CashPartyRow = Party;
export type CashCategoryRow = Rows.CashCategoriesRow;
export type CashierUpiSourceRow = PaymentSource;
