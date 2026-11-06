import { storeDate } from '../../utils/time/dateDisplay';
import type { Product as ProductRow } from '../../data/products';

import type { Product as DataProduct } from '../../data/products';

export type Product = DataProduct;

export const toInventoryProducts = (rows: ProductRow[]): Product[] =>
  rows as unknown as Product[];

export const isGstProduct = (product: Pick<Product, 'is_gst_applicable' | 'hsn_sac_code'>) =>
  Number(product.is_gst_applicable) === 1 || String(product.hsn_sac_code || '').trim() !== '';

export const DEFAULT_FORM = {
  item_code: '',
  sku_barcode: '',
  name: '',
  category: '',
  brand_manufacturer: '',
  uom: 'Pcs',
  purchase_price: '' as string | number,
  base_price: '' as string | number,
  current_stock: '' as string | number,
  reorder_level: '' as string | number,
  is_gst_applicable: false,
  gst_type: 'REAL' as 'REAL' | 'PAPER',
  hsn_sac_code: '',
  tax_rate_percent: 0,
  domain_attributes: {} as Record<string, unknown> & { dimensions?: string; material?: string; batch_number?: string; expiry_date?: string; purity?: string; weight_grams?: string; making_charge_pct?: string; hallmark_huid?: string; pcs?: string | number; pcs_stock?: string | number; paper_mrp?: string | number },
  discount_percent: '' as string | number | null,
  discount_flat: '' as string | number | null,
  offer_price: '' as string | number | null,
  billing_type: 'PIECE',
  grade_id: '',
  pricing_mode: 'FIXED_PRICE',
  show_gst_purchase: false,
  gst_same_as_current: false,
  gst_purchase_price: '' as string | number,
  gst_purchase_quantity: '' as string | number,
  gst_supplier_id: '',
  gst_supplier_name: '',
  gst_bill_number: '',
  gst_bill_date: storeDate(new Date(), 'en-CA'),
  gst_purchase_is_dummy: false,
};
