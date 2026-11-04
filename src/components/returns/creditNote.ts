import { priceReturnLine, totalReturnLines } from '../../utils/pricing/returnPricing';

export interface CreditNoteLine { productId: string; name: string; quantity: number; unitPrice: number; tax: number }
/** Preserve the old credit note's billed rate and tax, rather than repricing from today's catalog. */
export function creditNoteTotals(lines: CreditNoteLine[]) {
  if (!lines.length || lines.some(line => !line.productId || !line.name.trim() || !Number.isFinite(line.quantity) || line.quantity <= 0 || !Number.isFinite(line.unitPrice) || line.unitPrice < 0 || !Number.isFinite(line.tax) || line.tax < 0)) throw new Error('Choose a product and enter valid positive quantities, rates and line taxes.');
  const source = lines.map(line => ({ isReturnItem: true, quantity: line.quantity, originalUnitPrice: line.unitPrice, originalQuantity: line.quantity, originalTaxAmount: line.tax }));
  const totals = totalReturnLines(source);
  if (totals.total <= 0) throw new Error('The credit note amount must be greater than zero.');
  return { ...totals, items: lines.map((line,index) => ({ product_id: line.productId, name: line.name, quantity: line.quantity, ...priceReturnLine(source[index]) })) };
}
