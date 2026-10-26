/** Stock report screen: product, grade / party / sales rows, category stats, sales totals and masked valuation. */
import type { calculateMaskedStockValuation } from '../../utils/staffDataMasking';

export interface Product {
  product_id: string;
  tenant_id: string;
  name: string;
  item_code: string;
  sku_barcode: string;
  category: string;
  brand_manufacturer: string;
  uom: string;
  purchase_price: number;
  base_price: number;
  current_stock: number;
  reorder_level: number;
  is_gst_applicable: number;
  hsn_sac_code: string;
  tax_rate_percent: number;
  domain_attributes: string;
  discount_percent?: number | null;
  discount_flat?: number | null;
  offer_price?: number | null;
  billing_type?: string;
  grade_id?: string;
  pricing_mode?: string;
  sync_status: string;
  is_service_item?: number;
  created_at?: string;
  updated_at?: string;
  paper_stock?: number;
}

export interface EnrichedProduct extends Product {
  rate: number;
  finalSellingPrice: number;
  totalWeight: number;
  totalPcs: number;
  isLowStock: boolean;
  isOutOfStock: boolean;
  gradeName: string;
  gstQty: number;
  estimateQty: number;
  gstPurchasedQty: number;
  gstPaperStock: number;
}

export interface ProductBillQty {
  product_id: string;
  gst_qty: number;
  estimate_qty: number;
  gst_purchased_qty?: number;
}

/** A grade row as the grades IPC returns it. */
export type StockGradeRow = import('../../data/grades').Grade;

/** A party row as the parties IPC returns it. */
export type StockPartyRow = import('../../data/parties').Party;

/** A sales summary row as the product sales summary IPC returns it. */
export type StockSalesSummaryRow = Awaited<ReturnType<typeof import('../../data/products').productsApi.getProductSalesSummary>>[number] & { is_service_item?: number };

/** One category row of the stock report breakdown. */
export interface StockCategoryStat {
  name: string;
  stock: number;
  purchase: number;
  mrp: number;
  selling: number;
  pct: number;
  count: number;
}

/** Product totals of the product sales summary tab. */
export interface StockSalesTotals {
  products: number;
  gst: number;
  bos: number;
  bosProducts: number;
}

/** A valuation as the staff data masking helpers return it. */
export type MaskedValuation = ReturnType<typeof calculateMaskedStockValuation>;
