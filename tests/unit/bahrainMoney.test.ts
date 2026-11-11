import { roundStoreMoney, storeMoneyDecimals, storeMoneyFixed, parseStoreCountry } from '../../electron/utils/moneyRounding';
import { formatStoreMoney } from '../../electron/services/storeCountryService';
import { afterEach, describe, expect, it } from 'vitest';
import { setStoreCountry, setStoreVatInclusive } from '../../src/utils/localization/storeProfile';
import { formatAmount, formatCurrency } from '../../src/utils/pricing/money';
import { moneyFixed, moneyMinorUnit, moneyScale, roundMoney } from '../../src/utils/pricing/moneyRounding';
import { calculateVat } from '../../src/utils/pricing/vat';
import { buildCheckoutLines, buildQuotationLines } from '../../src/utils/pricing/checkoutLines';
import { allocateInvoiceDiscount, calculateInvoiceTax, round2 } from '../../src/utils/pricing/taxEngine';
import { changeProductDiscount } from '../../src/utils/pricing/productDiscounts';
import { receiptCreditTotals } from '../../src/utils/pricing/receiptCredits';
import type { CartItem } from '../../src/store/cartStore';

afterEach(() => { setStoreCountry('IN'); setStoreVatInclusive(false); });

const checkoutContext = { invoiceType: 'GST', supplyType: 'INTRA' as const, bosTaxRatePercent: 0, bosTaxInclusive: false, pcsSnapshot: {}, newId: () => 'id' };

describe('BHD keeps fils (three decimals)', () => {
  it('rounds and formats main-process money at country precision', () => {
    expect(parseStoreCountry('BH')).toBe('BH');
    expect(parseStoreCountry('AE')).toBe('AE');
    expect(parseStoreCountry('IN')).toBe('IN');
    expect(parseStoreCountry(null)).toBe('IN');

    expect(storeMoneyDecimals('BH')).toBe(3);
    expect(storeMoneyDecimals('AE')).toBe(2);
    expect(storeMoneyDecimals('IN')).toBe(2);

    expect(roundStoreMoney(1.2345, 'BH')).toBe(1.235);
    expect(roundStoreMoney(1.2345, 'AE')).toBe(1.23);
    expect(roundStoreMoney(1.2345, 'IN')).toBe(1.23);

    expect(storeMoneyFixed(1.5, 'BH')).toBe('1.500');
    expect(storeMoneyFixed(1.5, 'AE')).toBe('1.50');
    expect(storeMoneyFixed(1.5, 'IN')).toBe('1.50');

    expect(formatStoreMoney(1234.5, 'BH')).toBe('BHD 1,234.500');
    expect(formatStoreMoney(1234.5, 'AE')).toBe('AED 1,234.50');
    expect(formatStoreMoney(1234.5, 'IN')).toBe('₹1,234.50');
  });
  it('formats amounts with three decimals', () => {
    setStoreCountry('BH');
    expect(formatCurrency(1234.5)).toBe('BHD 1,234.500');
    expect(formatCurrency(-0.005)).toBe('-BHD 0.005');
    expect(formatCurrency(0.0004)).toBe('BHD 0.000');
    expect(formatAmount(12.3456)).toBe('12.346');
    expect(formatCurrency(5, { decimals: 0 })).toBe('BHD 5');
    expect(moneyFixed(1.5)).toBe('1.500');
  });

  it('rounds to the fils', () => {
    setStoreCountry('BH');
    expect(moneyScale()).toBe(1000);
    expect(moneyMinorUnit()).toBe(0.001);
    expect(roundMoney(1.2345)).toBe(1.235);
    expect(roundMoney(0.0004)).toBe(0);
    expect(round2(2.3456)).toBe(2.346);
  });

  it('extracts and adds 10% VAT to the fils', () => {
    setStoreCountry('BH');
    expect(calculateVat(1.1, 10, true)).toEqual({ taxable: 1, tax: 0.1 });
    expect(calculateVat(0.555, 10, false)).toEqual({ taxable: 0.555, tax: 0.056 });
    expect(calculateVat(0.25, 10, true)).toEqual({ taxable: 0.227, tax: 0.023 });
    expect(calculateVat(0.25, 0, true)).toEqual({ taxable: 0.25, tax: 0 });
  });

  it('builds checkout and quotation lines without losing fils', () => {
    setStoreCountry('BH'); setStoreVatInclusive(false);
    const item = { product_id: 'p', name: 'Bread', quantity: 3, base_price: 0.185, tax_rate_percent: 10 } as CartItem;
    const [line] = buildCheckoutLines([item], checkoutContext);
    expect(line.total).toBeCloseTo(0.555, 9);
    expect(line.tax_amount).toBe(0.056);
    expect(line).toMatchObject({ cgst_amount: 0, sgst_amount: 0, igst_amount: 0 });
    const [quote] = buildQuotationLines([item], { isGstQuotation: true, isInterState: false });
    expect(quote.taxable_amount).toBeCloseTo(0.555, 9);
  });

  it('allocates discounts, pairs product discounts and nets receipt credits in fils', () => {
    setStoreCountry('BH');
    expect(allocateInvoiceDiscount([1, 2], 0.1)).toEqual([0.033, 0.067]);
    const summary = calculateInvoiceTax([{ quantity: 3, unitPrice: 0.185, taxRatePercent: 10 }], { isInterState: false, isUaeStore: true });
    expect(summary).toMatchObject({ subtotal: 0.555, taxTotal: 0.056, grandTotal: 0.611, cgstTotal: 0, sgstTotal: 0, igstTotal: 0 });
    expect(changeProductDiscount(0.75, 'discount_percent', '10')).toMatchObject({ discount_flat: '0.075' });
    expect(changeProductDiscount(0.75, 'discount_flat', '0.075')).toMatchObject({ discount_percent: '10.00' });
    expect(receiptCreditTotals({ grandTotal: 1.255, scrapDeduction: 0.25 })).toMatchObject({ payable: 1.005 });
  });
});

describe('two-decimal currencies are untouched', () => {
  // Deterministic pseudo-random amounts, including the half-paisa boundaries where rounding differences would show.
  const amounts: number[] = [0, 0.005, 0.015, 1.005, 1.255, 2.675, 10.235, 1234.565, -1.005, -2.675];
  let seed = 20261110;
  for (let i = 0; i < 5000; i++) {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    amounts.push((seed % 100000000) / 1000 - 20000);
  }

  for (const country of ['IN', 'AE'] as const) {
    it(`${country}: every helper equals the previous two-decimal arithmetic`, () => {
      setStoreCountry(country);
      expect(moneyScale()).toBe(100);
      expect(moneyMinorUnit()).toBe(0.01);
      for (const amount of amounts) {
        expect(roundMoney(amount)).toBe(Math.round(amount * 100) / 100);
        expect(round2(amount)).toBe(Math.round((Number(amount) || 0) * 100) / 100);
        expect(moneyFixed(amount)).toBe(amount.toFixed(2));
        const rate = 5;
        const legacyRound = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
        const legacyTax = legacyRound(amount * (rate / 100) / (1 + rate / 100));
        expect(calculateVat(amount, rate, true)).toEqual({ taxable: legacyRound(amount - legacyTax), tax: legacyTax });
      }
    });
  }

  it('formats INR and AED with two decimals', () => {
    expect(formatCurrency(1234567.5)).toBe('₹12,34,567.50');
    expect(formatAmount(1234.5)).toBe('1,234.50');
    setStoreCountry('AE');
    expect(formatCurrency(1234567.5)).toBe('AED 1,234,567.50');
    expect(formatAmount(1234.5)).toBe('1,234.50');
    expect(changeProductDiscount(75, 'discount_percent', '10')).toMatchObject({ discount_flat: '7.50' });
  });
});
