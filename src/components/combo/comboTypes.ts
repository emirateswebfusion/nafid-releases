import type * as Rows from '../../data/dbRows';
import type { Product as DataProduct } from '../../data/products';
/** Combo offers screen: combo and product rows plus the effective offer price helper. */
export interface ComboItem {
  combo_item_id?: string;
  product_id: string;
  quantity: number;
  product_name?: string;
  product_price?: number;
  offer_price?: number;
  product_stock?: number | null;
  sku_barcode?: string | null;
  uom?: string | null;
}

export interface ComboOffer extends Rows.ComboOffersRow {
  items: ComboItem[];
}

export interface Product extends DataProduct {
}

export function getEffectiveOfferPrice(prod: Partial<Product> & { product_price?: number }): number {
  const base = Number(prod.base_price || prod.product_price || 0);
  if (prod.offer_price && Number(prod.offer_price) > 0) return Number(prod.offer_price);
  if (prod.discount_flat && Number(prod.discount_flat) > 0) return Math.max(0, base - Number(prod.discount_flat));
  if (prod.discount_percent && Number(prod.discount_percent) > 0) return Math.max(0, base * (1 - Number(prod.discount_percent) / 100));
  return base;
}
