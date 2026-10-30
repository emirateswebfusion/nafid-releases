import { afterEach, describe, expect, it } from 'vitest';
import { getStoreProfile, isValidTaxRegistration, normalizeStoreCountry, setStoreCountry, setStoreVatInclusive } from '../../src/utils/localization/storeProfile';
import { formatAmount, formatCurrency } from '../../src/utils/pricing/money';
import { calculateVat } from '../../src/utils/pricing/vat';
import { buildCheckoutLines, buildQuotationLines, buildReceiptLines, resolveSupplyType } from '../../src/utils/pricing/checkoutLines';
import type { CartItem } from '../../src/store/cartStore';
import { normalizeStoreTimezone } from '../../src/utils/time/timezoneHelper';
import { generateInvoiceHtml } from '../../src/utils/print/invoiceHtmlGenerator';
import { generateReceiptText } from '../../src/utils/print/receiptGenerator';

afterEach(() => { setStoreCountry('IN'); setStoreVatInclusive(false); });
const item = { product_id: 'p', name: 'Goods <script>', quantity: 2, base_price: 105, tax_rate_percent: 5 } as CartItem;
const context = { invoiceType: 'GST', supplyType: 'INTRA' as const, bosTaxRatePercent: 0, bosTaxInclusive: false, pcsSnapshot: {}, newId: () => 'id' };

describe('shop country', () => {
  it('preserves India for existing and invalid settings; supports serialized UAE settings', () => {
    for (const value of [null, undefined, 'bad', {}, 'IN']) expect(normalizeStoreCountry(value)).toBe('IN');
    expect(normalizeStoreCountry('"AE"')).toBe('AE');
    expect(formatCurrency(1234567.5)).toBe('₹12,34,567.50');
  });
  it('uses AED, international grouping, Dubai default and 15-digit TRNs', () => {
    setStoreCountry('AE');
    expect(formatCurrency(1234567.5)).toBe('AED 1,234,567.50');
    expect(formatCurrency(-50)).toBe('-AED 50.00');
    expect(formatAmount(1234567.5)).toBe('1,234,567.50');
    expect(getStoreProfile().timezone).toBe('Asia/Dubai');
    expect(normalizeStoreTimezone(null)).toBe('Asia/Dubai');
    expect(isValidTaxRegistration('100000000000003')).toBe(true);
    expect(isValidTaxRegistration('32ABCDE1234F1Z5')).toBe(false);
    expect(isValidTaxRegistration('')).toBe(true);
  });
});

describe('UAE VAT', () => {
  it('extracts inclusive VAT and preserves zero rates', () => {
    expect(calculateVat(105, 5, true)).toEqual({ taxable: 100, tax: 5 });
    expect(calculateVat(100, 5, false)).toEqual({ taxable: 100, tax: 5 });
    expect(calculateVat(105, 0, true)).toEqual({ taxable: 105, tax: 0 });
  });
  it('keeps VAT separate from Indian tax components across emirates', () => {
    setStoreCountry('AE'); setStoreVatInclusive(true);
    expect(resolveSupplyType('GST', 'Dubai', 'Abu Dhabi')).toBe('INTRA');
    const [line] = buildCheckoutLines([item], context);
    expect(line).toMatchObject({ unit_price: 100, total: 200, tax_amount: 10, cgst_amount: 0, sgst_amount: 0, igst_amount: 0 });
    expect(buildReceiptLines([item], {})[0]).toMatchObject({ unit_price: 100, total: 200 });
    expect(buildReceiptLines([item], {}, false)[0].total).toBe(210);
    expect(buildQuotationLines([item], { isGstQuotation: true, isInterState: true })[0]).toMatchObject({ taxable_amount: 200, cgst_amount: 0, sgst_amount: 0, igst_amount: 0 });
  });
  it('prints AED, TRN and VAT without Indian tax components, escaping customer input', () => {
    setStoreCountry('AE');
    const data = { shopName: 'Shop', shopGstin: '100000000000003', shopAddress: 'Dubai', invoiceType: 'GST', invoiceNumber: 'INV-1', date: '2026-10-28T21:30:00Z', items: [{ name: '<script>alert(1)</script>', quantity: 1, unit_price: 100, total: 100 }], subtotal: 100, tax: 5, discount: 0, grandTotal: 105 };
    const html = generateInvoiceHtml(data);
    expect(html).toContain('TAX INVOICE'); expect(html).toContain('TRN'); expect(html).toContain('AED 105.00');
    expect(html).toContain('&lt;script&gt;'); expect(html).not.toContain('<script>'); expect(html).not.toMatch(/CGST|SGST|IGST|₹/);
    const receipt = generateReceiptText(data, 5.8);
    expect(receipt).toContain('VAT: AED 5.00'); expect(receipt).not.toMatch(/CGST|SGST|IGST|₹/);
    expect(Math.max(...receipt.trimEnd().split('\n').map(line => line.length))).toBeLessThanOrEqual(32);
  });
});
