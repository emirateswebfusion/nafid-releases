import type { DisplayInvoice, DisplayInvoiceItem } from './invoiceDisplayTypes';

export type SalesInvoiceRow = DisplayInvoice;
export type SalesInvoiceItemRow = DisplayInvoiceItem;

/** Cached details of one invoice for the Sales History drawer (items, returned items, whether it can be returned). */
export interface InvoiceDetails {
  items: SalesInvoiceItemRow[];
  returned: Awaited<ReturnType<typeof import('../../data/returns').returnsApi.getAlreadyReturnedQuantities>>;
  canReturn: boolean;
}

export interface InvoiceDetailsCacheEntry extends InvoiceDetails {
  promise?: Promise<InvoiceDetails>;
}

/** A configured UPI receiving account as Sales History reads it. */
export interface UpiSourceOption {
  source_id: string;
  name?: string | null;
  upi_id?: string | null;
}
