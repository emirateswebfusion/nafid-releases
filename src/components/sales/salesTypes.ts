/**
 * Loose row types for Sales History. Rows come from the invoice queries with joined and legacy fields that the
 * `Invoice` / `InvoiceItem` data types do not describe yet, so they stay untyped here, in one place, until the screen
 * is typed. Use these aliases instead of writing `any` in Sales History code.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- legacy invoice row, typed later in one place
export type SalesInvoiceRow = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- legacy invoice item row, typed later in one place
export type SalesInvoiceItemRow = any;

/** Cached details of one invoice for the Sales History drawer (items, returned items, whether it can be returned). */
export interface InvoiceDetails {
  items: SalesInvoiceItemRow[];
  returned: SalesInvoiceItemRow[];
  canReturn: boolean;
}

export interface InvoiceDetailsCacheEntry extends InvoiceDetails {
  promise?: Promise<InvoiceDetails>;
}
