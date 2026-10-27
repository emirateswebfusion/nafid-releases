import { describe, expect, it } from 'vitest';
import type { CartItem } from '../../src/store/cartStore';
import {
  buildCheckoutLines,
  buildQuotationLines,
  buildReceiptLines,
  resolveSupplyType,
  splitTaxAmount,
} from '../../src/utils/pricing/checkoutLines';

const item = (over: Partial<CartItem>): CartItem => ({
  product_id: 'p1', name: 'Rice', quantity: 2, base_price: 100, tax_rate_percent: 18, ...over,
} as CartItem);
const ctx = { invoiceType: 'GST', supplyType: 'INTRA' as const, bosTaxRatePercent: 0, bosTaxInclusive: false, pcsSnapshot: {}, newId: () => 'id' };

describe('resolveSupplyType', () => {
  it('is inter-state only for GST bills between different known states', () => {
    expect(resolveSupplyType('GST', 'Kerala', 'karnataka ')).toBe('INTER');
    expect(resolveSupplyType('GST', 'Kerala', ' KERALA')).toBe('INTRA');
    expect(resolveSupplyType('GST', 'Kerala', '')).toBe('INTRA');
    expect(resolveSupplyType('GST', '', 'Tamil Nadu')).toBe('INTRA');
    expect(resolveSupplyType('GST', '   ', '   ')).toBe('INTRA');
    expect(resolveSupplyType('BILL_OF_SUPPLY', 'Kerala', 'Goa')).toBe('INTRA');
    expect(resolveSupplyType('ESTIMATE', 'Kerala', 'Goa')).toBe('INTRA');
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

  it('calculates exclusive bill-of-supply tax', () => {
    const [line] = buildCheckoutLines([item({ quantity: 2, base_price: 100 })], { ...ctx, invoiceType: 'BILL_OF_SUPPLY', bosTaxRatePercent: 5, bosTaxInclusive: false });
    // total = 200, tax = 200 * 0.05 = 10; intra split: cgst = 5, sgst = 5
    expect(line.tax_amount).toBe(10);
    expect(line.cgst_amount).toBe(5);
    expect(line.sgst_amount).toBe(5);
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

  it('handles zero tax rate items', () => {
    const [line] = buildCheckoutLines([item({ tax_rate_percent: 0 })], ctx);
    expect(line.tax_amount).toBe(0);
    expect(line.cgst_rate).toBe(0);
    expect(line.sgst_rate).toBe(0);
    expect(line.cgst_amount).toBe(0);
    expect(line.sgst_amount).toBe(0);
  });

  it('handles weighed items with fractional quantities and pcs snapshots', () => {
    const [line] = buildCheckoutLines(
      [item({ product_id: 'w1', quantity: 0.25, base_price: 400, billing_type: 'WEIGHT', uom: 'KG' })],
      { ...ctx, pcsSnapshot: { w1: 3 } },
    );
    expect(line.total).toBe(100);
    expect(line.unit_price).toBe(400);
    expect(line.pieces_sold).toBe(3);
    expect(line.billing_type).toBe('WEIGHT');
    expect(line.uom).toBe('KG');
  });

  it('defaults pieces_sold to 1 when missing from pcsSnapshot', () => {
    const [line] = buildCheckoutLines([item({ product_id: 'p99' })], ctx);
    expect(line.pieces_sold).toBe(1);
  });

  it('uses grade rate for GRADE_RATE products in checkout lines', () => {
    const [line] = buildCheckoutLines([item({ pricing_mode: 'GRADE_RATE', grade_rate: 60, base_price: 50, quantity: 2 })], ctx);
    expect(line.unit_price).toBe(60);
    expect(line.total).toBe(120);
  });

  it('handles zero quantity safely without dividing by zero', () => {
    const [line] = buildCheckoutLines([item({ quantity: 0, base_price: 100 })], ctx);
    expect(line.total).toBe(0);
    expect(line.unit_price).toBe(100);
    expect(line.tax_amount).toBe(0);
  });

  it('reconciles the SGST remainder when tax splits to an odd paisa', () => {
    // base_price 10.5, quantity 1, tax_rate 10% -> total 10.5, tax_amount = 1.05
    const [line] = buildCheckoutLines([item({ base_price: 10.5, quantity: 1, tax_rate_percent: 10 })], ctx);
    expect(line.tax_amount).toBe(1.05);
    expect(line.cgst_amount).toBe(0.53);
    expect(line.sgst_amount).toBe(0.52);
    expect(line.cgst_amount + line.sgst_amount).toBe(line.tax_amount);
  });

  it('uses the same reconciled split for quotation lines', () => {
    const [line] = buildQuotationLines([item({ quantity: 1, base_price: 10.5, tax_rate_percent: 10 })], { isGstQuotation: true, isInterState: false });
    expect(line.cgst_amount).toBe(0.53);
    expect(line.sgst_amount).toBe(0.52);
    expect(line.cgst_amount + line.sgst_amount).toBe(1.05);
  });
});

describe('splitTaxAmount', () => {
  it('assigns the rounded remainder to SGST', () => {
    expect(splitTaxAmount(1.05)).toEqual({ cgst: 0.53, sgst: 0.52 });
    expect(splitTaxAmount(18)).toEqual({ cgst: 9, sgst: 9 });
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

  it('labels percentage discounts with % OFF', () => {
    const [line] = buildReceiptLines([item({ discount_percent: 20 })], {});
    expect(line).toMatchObject({ unit_price: 80, discountLabel: '20% OFF', isPriceOverride: true });
  });

  it('labels catalog offers as Offer', () => {
    const [line] = buildReceiptLines([item({ catalog_offer_price: 85 })], {});
    expect(line).toMatchObject({ unit_price: 85, discountLabel: 'Offer' });
  });

  it('preserves combo metadata and piece overrides', () => {
    const [line] = buildReceiptLines([item({ isCombo: true, combo_items: '[{"id":"1"}]', pieces_override: 5 })], {});
    expect(line.isCombo).toBe(true);
    expect(line.combo_items).toBe('[{"id":"1"}]');
    expect(line.pieces_sold).toBe(5);
  });
});

describe('buildQuotationLines', () => {
  it('rounds tax per line and splits it for intra-state GST quotations', () => {
    const [line] = buildQuotationLines([item({ quantity: 3, base_price: 40, discount_flat: 10 })], { isGstQuotation: true, isInterState: false, newId: () => 'q' });
    expect(line).toMatchObject({ rate: 30, base_price: 40, amount: 90, discount_amount: 30, tax_rate_percent: 18, cgst_amount: 8.1, sgst_amount: 8.1, igst_amount: 0 });
  });

  it('uses IGST for inter-state GST quotations', () => {
    const [line] = buildQuotationLines([item({ quantity: 2, base_price: 50 })], { isGstQuotation: true, isInterState: true, newId: () => 'q' });
    expect(line).toMatchObject({ tax_rate_percent: 18, cgst_amount: 0, sgst_amount: 0, igst_amount: 18, cgst_rate: 0, sgst_rate: 0, igst_rate: 18 });
  });

  it('drops tax on non-GST quotations', () => {
    const [line] = buildQuotationLines([item({})], { isGstQuotation: false, isInterState: false });
    expect(line).toMatchObject({ tax_rate_percent: 0, cgst_amount: 0, igst_amount: 0, amount: 200 });
  });

  it('respects is_gst_applicable: false on individual items', () => {
    const [line] = buildQuotationLines(
      [item({ is_gst_applicable: false } as Partial<CartItem>)],
      { isGstQuotation: true, isInterState: false },
    );
    expect(line.tax_rate_percent).toBe(0);
    expect(line.cgst_amount).toBe(0);
    expect(line.sgst_amount).toBe(0);
  });
});
