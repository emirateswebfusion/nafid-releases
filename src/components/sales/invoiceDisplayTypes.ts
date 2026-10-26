import type { Invoice, InvoiceItemWithProduct } from '../../data/invoices';
import type { ComboItemsRow } from '../../data/dbRows';

/** Catalog combo quantities with optional historical display labels. */
export type DisplayComboItem = Pick<ComboItemsRow, 'product_id' | 'quantity'> & { product_name?: string; name?: string };

/** Fields recovered from catalog lookups, plus optional legacy display fallbacks. */
export interface DisplayInvoiceItem extends Omit<InvoiceItemWithProduct, 'billing_type' | 'hsn_sac_code'> {
  hsn_sac_code?: string | null;
  isCombo?: boolean;
  combo_items?: DisplayComboItem[];
  originalRate?: number;
  discountLabel?: string;
  isPriceOverride?: boolean;
  billing_type?: string | null;
  pieces_per_kg?: number;
  pieces_override?: number | null;
  unit?: string | null;
  hsn_code?: string | null;
  tax_rate?: number | null;
}

/** Legacy balance fallbacks are not selected by the current invoice query. */
export interface DisplayInvoice extends Invoice {
  old_balance?: number | string | null;
  old_due?: number | string | null;
  customer_balance?: number | string | null;
  new_due?: number | string | null;
}

/** Unvalidated historical JSON: amounts are converted with Number at the point of use. */
export interface DisplaySplitDetails extends Record<string, unknown> {
  upi_name?: string;
  upi_id?: string;
  upi_source_id?: string;
}
