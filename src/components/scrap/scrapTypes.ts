import type * as Rows from '../../data/dbRows';
import type { ScrapTransactionWithCategory } from '../../data/scrap';
/** Scrap screen types: view names, scrap category and scrap transaction rows. */
export type View = 'list' | 'category_form' | 'transaction' | 'tx_form' | 'selling' | 'invoices' | 'invoice_detail';

export interface ScrapCategory extends Rows.ScrapCategoriesRow {
}

/** A scrap transaction with its category name and unit (the data layer's joined row). */
export type ScrapTransaction = ScrapTransactionWithCategory;

/**
 * Loose rows of the scrap screen that have no data types yet (scrap invoices, invoice transaction lines, UPI sources).
 * Kept untyped here, in one place, until the screen is typed; use these aliases instead of writing `any`.
 */
export type ScrapInvoiceRow = {
  invoice_number: string;
  scrap_invoice_number: string;
  party_name?: string;
  customer_phone?: string;
  customer_address?: string;
  created_at: string;
  payment_status?: string | null;
  item_count?: number;
  total_qty?: number;
  units?: string;
  total_amount: number;
  biller_name?: string;
  party_phone?: string;
  party_address?: string;
  party_state?: string;
  customer_state?: string;
};

export type ScrapInvoiceTxRow = {
  transaction_id: string;
  type?: 'PURCHASE' | 'SALE' | string;
  scrap_category_id?: string | null;
  scrap_category_name?: string | null;
  quantity: number;
  rate: number;
  total_amount: number;
  unit?: string | null;
  notes?: string | null;
  created_at: string | null;
  payment_status?: string | null;
  biller_name?: string | null;
  party_name?: string | null;
  party_phone?: string | null;
  party_address?: string | null;
  party_state?: string | null;
  customer_phone?: string | null;
  customer_address?: string | null;
  customer_state?: string | null;
};

export type ScrapUpiSourceRow = {
  source_id: string;
  name: string;
  upi_id?: string;
};
