import { getStoreTimezone } from '../../utils/timezoneHelper';
import { parseUTCDate } from '../../utils/receiptGenerator';

/** Quotation screen: quotation and line-item rows as the quotations IPC returns them, and date labelling. */
export interface Quotation {
  items?: QuotationItem[]; quotation_id: string;
  quotation_number: string;
  customer_name: string;
  customer_phone: string;
  customer_address: string;
  customer_gstin?: string;
  customer_state?: string;
  is_gst?: number;
  discount_total?: number;
  round_off?: number;
  biller_name?: string;
  terms_conditions: string;
  subtotal: number;
  tax_total: number;
  grand_total: number;
  status: string;
  converted_to_invoice: number;
  invoice_id: string;
  created_at: string;
}

export interface QuotationItem {
  created_at?: string; hsn_sac_code?: string; billing_type?: string; item_id: string;
  product_id: string;
  name: string;
  quantity: number;
  weight?: number;
  rate: number;
  amount: number;
  hsn_code?: string;
  uom?: string;
  tax_rate_percent?: number;
  discount_amount?: number;
  discount_percent?: number;
  taxable_amount?: number;
  cgst_amount?: number;
  sgst_amount?: number;
  igst_amount?: number;
  is_gst_applicable?: boolean | number;
}

export const formatDateLabel = (dateStr: string) => {
  const tz = getStoreTimezone();
  const d = parseUTCDate(dateStr);
  return `${d.toLocaleDateString('en-IN', { timeZone: tz, weekday: 'long' })} — ${d.toLocaleDateString('en-IN', { timeZone: tz, day: '2-digit', month: 'long', year: 'numeric' })}`;
};
