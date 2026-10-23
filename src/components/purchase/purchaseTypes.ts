/** Purchase bill, bill item and product row shapes used by the purchase bill screen, and the form section handle. */
export interface PurchaseBill {
  purchase_bill_id: string;
  tenant_id: string;
  bill_number: string;
  supplier_id: string;
  supplier_name: string;
  bill_date: string;
  invoice_number?: string;
  notes: string;
  total_amount: number;
  bill_type: string;
  created_at: string;
  supplier_phone?: string; payment_type?: string;
}

export interface PurchaseBillItem {
  item_id: string;
  purchase_bill_id: string;
  product_id: string;
  name: string;
  product_name?: string;
  quantity: number;
  purchase_price: number;
  total_amount: number;
  is_gst_applicable: number;
  tax_rate_percent: number;
  hsn_sac_code: string;
  sku_barcode?: string;
  item_code?: string;
  skip_stock_update?: number;
}

export interface Product {
  product_id: string;
  name: string;
  sku_barcode: string;
  item_code: string;
  purchase_price: number;
  base_price: number;
  current_stock: number;
  gst_purchase_quantity: number;
  gst_purchase_price: number;
  grade_id?: string;
  pricing_mode?: string;
  grade_rate?: number;
  grade_purchase_price?: number;
  is_gst_applicable?: number;
  tax_rate_percent?: number;
  hsn_sac_code?: string;
  offer_price?: number | null;
  brand_manufacturer?: string;
  category?: string;
  uom?: string;
  reorder_level?: number;
  is_service_item?: number;
  domain_attributes?: any;
}

export interface PurchaseBillFormHandle {
  save: () => Promise<boolean>;
  hasItems: boolean;
  focusSearch: () => void;
  addItem: (item: {
    product_id: string;
    name: string;
    quantity: string;
    purchase_price: string;
    selling_price: string;
    offer_price?: string;
    is_gst_applicable?: number;
    tax_rate_percent?: number;
    hsn_sac_code?: string;
    sku_barcode?: string;
    item_code?: string;
  }) => void;
  getItems: () => Array<{
    product_id: string;
    name: string;
    quantity: string;
    purchase_price: string;
    selling_price: string;
    offer_price?: string;
    stock?: string;
    is_gst_applicable?: number;
    tax_rate_percent?: number;
    hsn_sac_code?: string;
  }>;
  replaceItems: (items: Array<{
    product_id: string;
    name: string;
    quantity: string;
    purchase_price: string;
    selling_price: string;
    offer_price?: string;
    stock?: string;
    is_gst_applicable?: number;
    tax_rate_percent?: number;
    hsn_sac_code?: string;
  }>) => void;
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
  is_gst_applicable?: number;
  tax_rate_percent?: number;
  hsn_sac_code?: string;
  skip_stock_update?: number;
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
