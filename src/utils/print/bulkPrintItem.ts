import type { BulkPrintItem } from '../../data/printing';
import type { ProductsRow } from '../../data/dbRows';

type BulkPrintProduct = Pick<ProductsRow,
  'sku_barcode' | 'name' | 'base_price' | 'current_stock' | 'pricing_mode' | 'offer_price' | 'discount_flat' | 'discount_percent'
>;

/** Builds the complete USB label payload, including any displayed special price. */
export function buildBulkPrintItem(product: BulkPrintProduct, gradeRate: number | null): BulkPrintItem {
  const effectiveMrp = gradeRate !== null && product.pricing_mode === 'GRADE_RATE'
    ? gradeRate
    : Number(product.base_price);

  let sp: number | undefined;
  let spType: 'SP' | 'OFF' = 'SP';
  if (product.offer_price) {
    sp = Number(product.offer_price);
    spType = 'OFF';
  } else if (product.discount_flat) {
    sp = effectiveMrp - Number(product.discount_flat);
  } else if (product.discount_percent) {
    sp = effectiveMrp * (1 - Number(product.discount_percent) / 100);
  }
  if (sp !== undefined && sp === effectiveMrp) sp = undefined;

  return {
    barcode: product.sku_barcode as string,
    price: effectiveMrp,
    name: product.name,
    quantity: Math.max(1, product.current_stock as number),
    sp,
    spType,
  };
}
