import type * as Rows from '../../data/dbRows';
import type { ScrapInvoiceListItem, ScrapTransactionWithCategory } from '../../data/scrap';
import type { PaymentSource } from '../../data/paymentSources';
/** Scrap screen types: view names, scrap category and scrap transaction rows. */
export type View = 'list' | 'category_form' | 'transaction' | 'tx_form' | 'selling' | 'invoices' | 'invoice_detail';

export type ScrapCategory = Rows.ScrapCategoriesRow;

/** A scrap transaction with its category name and unit (the data layer's joined row). */
export type ScrapTransaction = ScrapTransactionWithCategory;

/**
 * Invoice list row from the data contract. Optional legacy display fields are retained because the screen reads them,
 * although `getScrapInvoiceList` does not select them (see task report).
 */
export type ScrapInvoiceRow = ScrapInvoiceListItem & {
  scrap_invoice_number?: string;
  party_phone?: string;
  party_address?: string;
};

/** Invoice transaction row from the joined scrap transaction and category query. */
export type ScrapInvoiceTxRow = ScrapTransactionWithCategory & {
  party_phone?: string | null;
  party_address?: string | null;
};

export type ScrapUpiSourceRow = Pick<PaymentSource, 'source_id' | 'name' | 'upi_id'>;
