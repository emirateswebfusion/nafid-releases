import { resolveLinePrice } from './linePricing';

/** Invoice line rates already include catalog and cashier adjustments. Apply only the invoice discount. */
export function priceReturnSource(unitPrice: number, taxAmount: number, subtotal: number, discount: number) {
  const ratio = subtotal > 0 ? Math.min(1, Math.max(0, discount / subtotal)) : 0;
  return { unit_price: resolveLinePrice({ discount_percent: ratio * 100 }, unitPrice).unitRate,
    rawUnitPrice: unitPrice, tax_amount: taxAmount * (1 - ratio) };
}

interface ReturnLine {
  isReturnItem?: boolean;
  quantity: number | string;
  originalUnitPrice?: number;
  originalQuantity?: number;
  originalTaxAmount?: number;
  rawUnitPrice?: number;
}
const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

/** Prorate the stored invoice tax, including zero-tax and BOS lines, instead of today's catalog tax rate. */
export function priceReturnLine(item: ReturnLine) {
  const quantity = Math.max(0, Number(item.quantity) || 0);
  const originalQuantity = Number(item.originalQuantity) || 0;
  const unit_price = Number(item.originalUnitPrice) || 0;
  const total = round2(unit_price * quantity);
  const tax_amount = round2(originalQuantity > 0 ? (Number(item.originalTaxAmount) || 0) * quantity / originalQuantity : 0);
  return { unit_price, total, tax_amount };
}

export function totalReturnLines(items: ReturnLine[]) {
  const lines = items.filter(i => i.isReturnItem);
  const subtotal = round2(lines.reduce((sum, item) => sum + priceReturnLine(item).total, 0));
  const tax = round2(lines.reduce((sum, item) => sum + priceReturnLine(item).tax_amount, 0));
  const original = round2(lines.reduce((sum, item) => sum + (item.rawUnitPrice ?? item.originalUnitPrice ?? 0) * Math.max(0, Number(item.quantity) || 0), 0));
  return { subtotal, tax, total: round2(subtotal + tax), original, discount: round2(Math.max(0, original - subtotal)) };
}
