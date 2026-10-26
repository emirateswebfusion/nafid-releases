import type * as Rows from '../../data/dbRows';
import type { PurchaseBillItemWithProduct } from '../../data/purchases';
import type { Product as DataProduct } from '../../data/products';
/** Purchase bill, bill item and product row shapes used by the purchase bill screen, and the form section handle. */
export interface PurchaseBill extends Rows.PurchaseBillsRow {
  supplier_phone?: string;
}

export interface PurchaseBillItem extends PurchaseBillItemWithProduct {}

export interface Product extends DataProduct {
  gst_purchase_quantity: number;
}

export interface PurchaseBillFormHandle {
  save: () => Promise<boolean>;
  hasItems: boolean;
  focusSearch: () => void;
  addItem: (item: PurchaseAddItem) => void;
  getItems: () => PurchaseFormItem[];
  replaceItems: (items: PurchaseFormItem[]) => void;
}

/** A line of the purchase bill being entered (form state; quantities and prices are kept as typed strings). */
export interface PurchaseFormItem {
  product_id: string;
  name: string;
  quantity: string;
  purchase_price: string;
  selling_price: string;
  offer_price?: string;
  stock?: string;
  is_gst_applicable?: number | null;
  tax_rate_percent?: number | null;
  hsn_sac_code?: string | null;
  skip_stock_update?: number | null;
  is_new_product_clone?: boolean;
  clone_metadata?: {
    barcode: string;
    item_code: string;
    brand_manufacturer: string;
    category: string;
    uom: string;
    reorder_level: number;
    original_product_id?: string;
    original_product_name?: string;
    original_product_is_gst?: boolean;
  };
}

/** The bill being edited, as the purchase form, its loader and its save hook receive it. */
export interface PurchaseBillEditingData {
  purchase_bill_id: string;
  bill_number: string;
  invoice_number?: string | null;
  payment_type: string;
  total_amount?: number;
}

/** A product added to a purchase bill section (from search, a clone, or the other section). */
export interface PurchaseAddItem {
  product_id: string;
  name: string;
  quantity: string;
  purchase_price: string;
  selling_price: string;
  offer_price?: string;
  is_gst_applicable?: number | null;
  tax_rate_percent?: number | null;
  hsn_sac_code?: string | null;
  sku_barcode?: string | null;
  item_code?: string | null;
  skip_stock_update?: number | null;
}
