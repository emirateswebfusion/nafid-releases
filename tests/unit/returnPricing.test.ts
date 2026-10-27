import { describe, expect, it } from 'vitest';
import { priceReturnSource, priceReturnLine, totalReturnLines } from '../../src/utils/pricing/returnPricing';
import { buildCheckoutLines } from '../../src/utils/pricing/checkoutLines';
import type { CartItem } from '../../src/store/cartStore';
describe('canonical return pricing', () => {
  it.each([0, 10, 100])('reverses checkout line pricing and GST with %s percent invoice discount', discount => {
    const sold: CartItem = { product_id: 'p', name: 'Product', quantity: 22, base_price: 100,
      purchase_price: 20, tax_rate_percent: 18, catalog_discount_percent: 20 };
    const [line] = buildCheckoutLines([sold], { invoiceType: 'GST', supplyType: 'INTRA', bosTaxRatePercent: 0,
      bosTaxInclusive: false, pcsSnapshot: {} });
    const source = priceReturnSource(line.unit_price, line.tax_amount, line.total, line.total * discount / 100);
    const returned = totalReturnLines([{ isReturnItem: true, quantity: 1, originalQuantity: 22,
      originalUnitPrice: source.unit_price, rawUnitPrice: source.rawUnitPrice, originalTaxAmount: source.tax_amount }]);
    expect(returned.subtotal).toBe(80 * (1 - discount / 100));
    expect(returned.tax).toBe(Math.round(14.4 * (1 - discount / 100) * 100) / 100);
    expect(returned.total).toBe(Math.round((returned.subtotal + returned.tax) * 100) / 100);
  });
  it('does not invent GST for an untaxed original bill', () => {
    expect(priceReturnLine({ quantity: 1, originalQuantity: 22, originalUnitPrice: 80, originalTaxAmount: 0 }))
      .toEqual({ unit_price: 80, total: 80, tax_amount: 0 });
  });
  it('rounds line amounts once and sums those same amounts for the header', () => {
    const item = { isReturnItem: true, quantity: 0.25, originalQuantity: 0.5, originalUnitPrice: 0.045, originalTaxAmount: 0.01 };
    const line = priceReturnLine(item);
    const total = totalReturnLines([item, item, { ...item, isReturnItem: false }]);
    expect(total.subtotal).toBe(line.total * 2);
    expect(total.tax).toBe(line.tax_amount * 2);
  });
});
