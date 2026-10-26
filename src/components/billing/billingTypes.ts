import type { CartItem } from '../../store/cartStore';
import type { SplitDetails, Tab, PaymentMethod } from '../../store/tabStore';
import type { Product, ProductPricingRow } from '../../data/products';
import type { Invoice, InvoiceItem } from '../../data/invoices';
import type { PricingTier } from '../../utils/pricingTierHelper';
import type { Party } from '../../data/parties';
import type { UpiPageConfig } from '../../utils/upiConfig';
import type { Dispatch, SetStateAction, MutableRefObject, KeyboardEvent, ComponentType } from 'react';

export type { CartItem, ProductPricingRow, UpiPageConfig, PaymentMethod, Tab, Party };
export type Tier = PricingTier;
/** A configured payment source offered for UPI payments (a `payment_sources` row or a subset of it). */
export interface UpiSource {
  source_id: string;
  name: string;
  upi_id?: string | null;
  type?: string;
  is_default?: number | boolean | null;
  is_enabled?: number | boolean | null;
}
export type SelectedUpi = Pick<UpiSource, 'upi_id' | 'name' | 'source_id'> | null | undefined;
export type BillingSplitDetails = SplitDetails & {
  bank?: number;
  upi_id?: string;
  upi_name?: string;
  upi_source_id?: string;
  old_due?: number;
  old_balance?: number;
  new_due?: number;
};
export type BillingProduct = Omit<Partial<Product>, 'is_gst_applicable' | 'domain_attributes'> & {
  product_id: string;
  name: string;
  base_price: number;
  is_gst_applicable?: number | boolean | null;
  domain_attributes?: string | Record<string, unknown> | null;
  gst_percent?: number;
  hsn_code?: string;
  hsn?: string;
  barcode?: string;
  grade_rate?: number | null;
  grade_purchase_price?: number | null;
  pieces_per_kg?: number | null;
  tier_prices?: Record<string, number | null>;
  isCombo?: boolean;
  combo_id?: string;
  combo_price?: number;
  combo_items?: CartItem['combo_items'];
  catalog_offer_price?: number | null;
  catalog_discount_flat?: number | null;
  catalog_discount_percent?: number | null;
  gst_qty?: number;
  bos_qty?: number;
};
export type BillingInvoice = Partial<Invoice> & { id?: string };
export type BillingInvoiceItem = InvoiceItem & Partial<Omit<CartItem, keyof InvoiceItem>> & {
  item_tax_rate?: number;
  hsn_code?: string;
  pieces?: number;
  already_returned?: number;
  available_to_return?: number;
  weight?: number;
  rate?: number;
  barcode?: string;
  product_name?: string;
};
export interface HeldBill extends Partial<Invoice> {
  id?: string;
  heldAt?: string;
  items?: CartItem[];
  customerName?: string;
  customerPhone?: string;
  customerGstin?: string;
}
export interface DirectoryRecord {
  name?: string;
  phone?: string | null;
  address?: string | null;
  customer_id?: string | null;
  party_id?: string | null;
  party_type?: string | null;
  balance?: number | string | null;
  current_balance?: number | string | null;
  current_points_balance?: number | string | null;
  gstin?: string | null;
  customer_gstin?: string | null;
  is_staff?: boolean;
  staff_id?: string | null;
  staff_code?: string | null;
  role_designation?: string | null;
  pricing_tier_id?: string | null;
  credit_period_enabled?: number | boolean | null;
  restrict_on_credit_expiry?: number | boolean | null;
  has_overdue?: boolean;
  overdue_bills_count?: number;
  overdue_amount?: number;
  credit_period_days?: number | null;
}
export interface DeductionRow {
  invoice_number?: string;
  return_number?: string;
  customer_name?: string;
  customer_phone?: string;
  payment_status?: string;
  grand_total?: number;
  total_amount?: number;
  adjusted_amount?: number;
}
export interface ScrapTransaction {
  transaction_id?: string;
  scrap_category_id?: string;
  category_name?: string;
  name?: string;
  quantity?: number;
  rate?: number;
  total?: number;
  amount?: number;
  scrap_category_name?: string;
  total_amount?: number;
  created_at?: string;
  unit?: string;
}
export interface ScrapViewData { transactions: ScrapTransaction[]; totalAmount: number; invoiceNumber: string }
export interface GradeForm { grade_name: string; purchase_price: string; rate: string; offer_price: string }
export type { Grade } from '../../data/grades';
export type InputRef = MutableRefObject<HTMLInputElement | null>;
export type ButtonRef = MutableRefObject<HTMLButtonElement | null>;
export type DescriptionRef = MutableRefObject<HTMLInputElement | null>;
export type SetValue<T> = Dispatch<SetStateAction<T>>;
export type UpdateTab = (updates: Partial<Omit<Tab, 'id' | 'snapshot'>>) => void;
export type PartyMatch = (name?: string, phone?: string) => import('./customerDirectory').MatchedParty | null;
export type PaymentOptionRefs = MutableRefObject<Record<string, HTMLButtonElement | null>>;
export type QuantityRefs = MutableRefObject<Record<string, HTMLInputElement | null>>;
export interface PaymentOption { value: PaymentMethod; label: string; icon: ComponentType<{ className?: string }>; color: string; activeBg?: string; activeText?: string; activeBorder?: string; activeIconBg?: string }
export type SplitField = 'CASH' | 'CARD' | 'UPI' | 'CREDIT' | 'CHEQUE';
export type SplitKeyHandler = (e: KeyboardEvent<HTMLInputElement>, field: SplitField) => void;
export type InvoiceStyle = Parameters<typeof import('../../utils/invoiceHtmlGenerator').generateInvoiceHtml>[1];
export interface CheckoutResult { created_at?: string; success: boolean; error?: string; invoice_id?: string; invoice_number?: string; customer_id?: string; points_earned?: number; points_redeemed?: number; loyalty_points_earned?: number }
export type PrintSetting = { billSettings?: { bosTaxRatePercent?: number; bosTaxInclusive?: boolean; showDescription?: boolean } } | null;
export type SettingsEvent = Event & { detail?: { terminalCode?: string; shopName?: string } };
export type ScrapEditEvent = Event & { detail?: { invoiceNumber?: string } };
export type LoyaltySetting = { enabled?: boolean; earningRate?: number; redemptionRate?: number; awardPointsOnPending?: boolean };
export type LoyaltyFlags = { loyalty?: boolean };

export type MostSoldRow = Omit<BillingProduct, 'base_price'> & { base_price?: number; id?: string };
export interface ReturnDeductionRow { return_number: string; customer_name?: string | null; grand_total: number; adjusted_amount?: number | null }
export interface ScrapDeductionRow { invoice_number: string; created_at: string; total_amount: number; total_qty?: number | string | null }
