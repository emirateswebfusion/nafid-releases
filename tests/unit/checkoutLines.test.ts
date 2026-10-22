import { describe, expect, it } from 'vitest';
import type { CartItem } from '../../src/store/cartStore';
import { buildCheckoutLines, buildReceiptLines, resolveSupplyType } from '../../src/utils/checkoutLines';

const item = (over: Partial<CartItem>): CartItem => ({
  product_id: 'p1', name: 'Rice', quantity: 2, base_price: 100, tax_rate_percent: 18, ...over,
} as CartItem);
const ctx = { invoiceType: 'GST', supplyType: 'INTRA' as const, bosTaxRatePercent: 0, bosTaxInclusive: false, pcsSnapshot: {}, newId: () => 'id' };

describe('resolveSupplyType', () => {
  it('is inter-state only for GST bills between different known states', () => {
    expect(resolveSupplyType('GST', 'Kerala', 'karnataka ')).toBe('INTER');
    expect(resolveSupplyType('GST', 'Kerala', ' KERALA')).toBe('INTRA');
    expect(resolveSupplyType('GST', 'Kerala', '')).toBe('INTRA');
    expect(resolveSupplyType('BILL_OF_SUPPLY', 'Kerala', 'Goa')).toBe('INTRA');
  });
});

describe('buildCheckoutLines', () => {
  it('splits intra-state GST into equal CGST and SGST', () => {
    const [line] = buildCheckoutLines([item({})], ctx);
    expect(line).toMatchObject({ total: 200, unit_price: 100, tax_amount: 36, cgst_rate: 9, sgst_rate: 9, igst_rate: 0, cgst_amount: 18, sgst_amount: 18, supply_type: 'INTRA' });
  });
  it('uses IGST for inter-state supply', () => {
    const [line] = buildCheckoutLines([item({})], { ...ctx, supplyType: 'INTER' });
    expect(line).toMatchObject({ igst_rate: 18, igst_amount: 36, cgst_amount: 0, sgst_amount: 0 });
  });
  it('extracts inclusive bill-of-supply tax', () => {
    const [line] = buildCheckoutLines([item({ quantity: 1, base_price: 105 })], { ...ctx, invoiceType: 'BILL_OF_SUPPLY', bosTaxRatePercent: 5, bosTaxInclusive: true });
    expect(line.tax_amount).toBeCloseTo(5);
    expect(line.cgst_amount).toBe(2.5);
  });
  it('bills service items at their price without tax', () => {
    const [line] = buildCheckoutLines([item({ isServiceItem: true, offer_price: 40 })], ctx);
    expect(line).toMatchObject({ quantity: 1, unit_price: 40, total: 40, tax_amount: 0, isServiceItem: true });
  });
  it('applies line discounts before tax', () => {
    const [line] = buildCheckoutLines([item({ discount_percent: 10 })], ctx);
    expect(line.total).toBe(180);
    expect(line.tax_amount).toBeCloseTo(32.4);
  });
});

describe('buildReceiptLines', () => {
  it('labels ad-hoc discounts and keeps the MRP for display', () => {
    const [line] = buildReceiptLines([item({ discount_flat: 15 })], {});
    expect(line).toMatchObject({ unit_price: 85, total: 170, originalRate: 100, discountLabel: '-₹15', isPriceOverride: true });
  });
  it('shows no label for an undiscounted line', () => {
    const [line] = buildReceiptLines([item({})], {});
    expect(line.discountLabel).toBeUndefined();
    expect(line.isPriceOverride).toBe(false);
  });
});

describe('buildQuotationLines', () => {
  it('rounds tax per line and splits it for intra-state GST quotations', async () => {
    const { buildQuotationLines } = await import('../../src/utils/checkoutLines');
    const [line] = buildQuotationLines([item({ quantity: 3, base_price: 40, discount_flat: 10 })], { isGstQuotation: true, isInterState: false, newId: () => 'q' });
    expect(line).toMatchObject({ rate: 30, base_price: 40, amount: 90, discount_amount: 30, tax_rate_percent: 18, cgst_amount: 8.1, sgst_amount: 8.1, igst_amount: 0 });
  });
  it('drops tax on non-GST quotations', async () => {
    const { buildQuotationLines } = await import('../../src/utils/checkoutLines');
    const [line] = buildQuotationLines([item({})], { isGstQuotation: false, isInterState: false });
    expect(line).toMatchObject({ tax_rate_percent: 0, cgst_amount: 0, igst_amount: 0, amount: 200 });
  });
});
