import type * as Rows from '../../data/dbRows';
import type { Party as DataParty } from '../../data/parties';
import type { CustomerListItem } from '../../data/customers';
/** Row and view types of the customers screen (customer, party, loyalty transaction, invoice and item, combo offer). */
export interface PricingTier {
  pricing_tier_id: string;
  name: string;
}

export interface Customer extends CustomerListItem {
}

export interface Party extends DataParty {
  has_overdue?: boolean;
  overdue_bills_count?: number;
  overdue_amount?: number;
}

export interface LoyaltyTx extends Rows.LoyaltyTransactionsRow {
}

export interface InvoiceRecord extends Rows.InvoicesRow {
  biller_name?: string;
  is_credit_bill?: boolean;
  outstanding_amount?: number;
  is_overdue?: boolean;
  overdue_days?: number;
  remaining_days?: number;
  credit_status?: 'OVERDUE' | 'DUE_SOON' | 'ACTIVE' | 'PAID' | 'NON_CREDIT' | string;
}

export interface InvoiceItemRow {
  item_id?: string;
  tax_amount?: number | null;
  name?: string;
  quantity?: number;
  unit_price?: number;
  total?: number;
  billing_type?: string;
  pieces_sold?: number;
  pieces_override?: number;
  unit?: string;
  uom?: string;
  brand_manufacturer?: string;
  hsn_code?: string;
  tax_rate_percent?: number;
  product_id?: string;
  combo_id?: string;
  combo_details?: string;
}

export type InvoiceStyle = 'standard' | 'boxed' | 'modern' | 'classic' | 'half-a4';

export type ComboItemLine = { product_id: string; quantity: number; product_name?: string };

export type ComboOffer = { combo_id?: string; name?: string; items?: ComboItemLine[] };

export type View = 'list' | 'detail';

export type DetailTab = 'purchases' | 'points';
