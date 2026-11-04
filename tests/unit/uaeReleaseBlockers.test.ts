import { afterEach, expect, it } from 'vitest';
import { setStoreCountry, setStoreVatInclusive } from '../../src/utils/localization/storeProfile';
import { buildQuotationLines } from '../../src/utils/pricing/checkoutLines';
import { restoreVatPrice } from '../../src/utils/pricing/vat';
import { quotationNetRate, restoreQuotationSellingPrice } from '../../src/utils/pricing/quotationPrice';
import { receiptCreditTotals } from '../../src/utils/pricing/receiptCredits';
import { generateQuotationHtml } from '../../src/utils/print/quotationHtmlGenerator';
import { defaultQuotationTerms } from '../../src/utils/localization/quotationTerms';
import type { CartItem } from '../../src/store/cartStore';
import { generateUaeInvoiceHtml, generateUaeReceipt } from '../../src/utils/print/uaeInvoice';

afterEach(() => { setStoreCountry('IN'); setStoreVatInclusive(false); });
const item = { product_id: 'p', name: 'Test', quantity: 1, base_price: 105, tax_rate_percent: 5 } as CartItem;
const options = { isGstQuotation: true, isInterState: false };
const bill = { shopName: 'Test shop', invoiceNumber: 'TEST', invoiceType: 'GST', date: '2026-10-29T10:00:00Z',
  items: [{ name: 'Test', quantity: 1, unit_price: 100, total: 100, tax_rate_percent: 5 }],
  subtotal: 100, tax: 5, discount: 0, grandTotal: 105 };

it('uses the selected profile and price basis in new quotation terms', () => {
  setStoreCountry('IN');
  expect(defaultQuotationTerms()).toContain('GST extra as applicable.');
  setStoreCountry('AE'); setStoreVatInclusive(true);
  expect(defaultQuotationTerms()).toContain('Prices include VAT where applicable.');
  expect(defaultQuotationTerms()).not.toContain('GST');
  setStoreVatInclusive(false);
  expect(defaultQuotationTerms()).toContain('VAT extra as applicable.');
});

it('stores a net UAE quotation rate so save/reopen/resave never adds VAT twice', () => {
  setStoreCountry('AE'); setStoreVatInclusive(true);
  const [first] = buildQuotationLines([item], options);
  expect(first.rate).toBe(100);
  const sellingPrice = restoreVatPrice(first.rate, first.tax_rate_percent, true);
  const [second] = buildQuotationLines([{ ...item, offer_price: sellingPrice }], options);
  expect(sellingPrice).toBe(105);
  expect(second).toMatchObject({ rate: 100, amount: 100, taxable_amount: 100 });
});

it.each([
  { rate: 105, quantity: 1, taxable_amount: 100, amount: 100 }, // Older inclusive quote.
  { rate: 100, quantity: 1, taxable_amount: 100, amount: 100 }, // Corrected quote.
  { rate: 105, quantity: 2, amount: 200 }, // Legacy rows without taxable_amount.
  { rate: 105, quantity: 0.5, taxable_amount: 50, amount: 50 },
])('recovers the original selling price from a persisted quotation: %j', stored => {
  expect(quotationNetRate(stored)).toBe(100);
  expect(restoreQuotationSellingPrice({ ...stored, tax_rate_percent: 5 }, true)).toBe(105);
  expect(restoreQuotationSellingPrice({ ...stored, tax_rate_percent: 5 }, false)).toBe(100);
});

it('prints the authoritative net unit rate of an older UAE quotation', () => {
  setStoreCountry('AE');
  const html = generateQuotationHtml({ shopName: 'Test', quotationNumber: 'Q-1', date: bill.date,
    isGstEnabled: true, items: [{ name: 'Test', quantity: 1, rate: 105, amount: 100, tax_rate_percent: 5 }],
    subtotal: 100, taxTotal: 5, grandTotal: 105 });
  expect(html).toContain('<td>AED 100.00</td>');
  expect(html).not.toContain('<td>AED 105.00</td>');
});

it('keeps zero-rated and non-taxable quotation prices intact', () => {
  setStoreCountry('AE'); setStoreVatInclusive(true);
  for (const product of [{ ...item, tax_rate_percent: 0 }, { ...item, is_gst_applicable: false }]) {
    const [line] = buildQuotationLines([product], options);
    expect(line).toMatchObject({ rate: 105, amount: 105, taxable_amount: 105, tax_rate_percent: 0 });
  }
});

it('restores the saved line-rounded total without introducing fractional fils', () => {
  const stored = { quantity: 0.5, rate: 0.02, taxable_amount: 0.01, amount: 0.01, tax_rate_percent: 5 };
  expect(restoreQuotationSellingPrice(stored, true)).toBe(0.02);
  expect(restoreQuotationSellingPrice({ ...stored, quantity: 3, amount: 0.1, taxable_amount: 0.1 }, true) * 3).toBe(0.11);
});

it('preserves discounted fractional quotation totals over repeated reopens', () => {
  setStoreCountry('AE'); setStoreVatInclusive(true);
  let product: CartItem = { ...item, base_price: 210, catalog_discount_percent: 50, quantity: 0.5 };
  for (let iteration = 0; iteration < 3; iteration++) {
    const [line] = buildQuotationLines([product], options);
    expect(line).toMatchObject({ rate: 100, taxable_amount: 50, amount: 50 });
    expect(line.amount + Math.round(line.amount * line.tax_rate_percent) / 100).toBe(52.5);
    product = { ...product, offer_price: restoreQuotationSellingPrice(line, true), discount_flat: null, discount_percent: null };
  }
});

it.each([
  { scrapDeduction: 20, returnDeduction: 0, payable: 85 },
  { scrapDeduction: 0, returnDeduction: 20, payable: 85 },
  { scrapDeduction: 10, returnDeduction: 15, payable: 80 },
  { scrapDeduction: 20.25, returnDeduction: 0, payable: 84.75 },
])('prints the payable once after credits: $payable AED', credits => {
  setStoreCountry('AE');
  for (const isReprint of [false, true]) {
    // Both checkout and sales-history reprint supply the pre-credit total.
    const data = { ...bill, ...credits, isReprint };
    expect(generateUaeReceipt(data)).toContain(`TOTAL incl. VAT: AED ${credits.payable.toFixed(2)}`);
    expect(generateUaeInvoiceHtml(data)).toContain(`<th>Total (including VAT) / <span class="ar" dir="rtl" lang="ar">الإجمالي شامل الضريبة</span></th><td><b>AED ${credits.payable.toFixed(2)}</b>`);
    expect(data.grandTotal).toBe(105);
  }
});

it('retains fils, reports excess-credit refunds, and does not subtract points twice', () => {
  setStoreCountry('AE');
  expect(receiptCreditTotals({ grandTotal: 95, scrapDeduction: 20 })).toEqual({ payable: 75, refund: 0 });
  const pointsBill = { ...bill, grandTotal: 95, pointsRedeemedDiscount: 10, scrapDeduction: 20 };
  expect(generateUaeReceipt(pointsBill)).toContain('TOTAL incl. VAT: AED 75.00');
  const refundBill = { ...bill, returnDeduction: 110.25 };
  expect(receiptCreditTotals(refundBill)).toEqual({ payable: 0, refund: 5.25 });
  expect(generateUaeReceipt(refundBill)).toContain('Refund amount: AED 5.25');
  expect(generateUaeInvoiceHtml(refundBill)).toContain('<td>AED 5.25</td>');
  expect(generateUaeReceipt({ ...bill, grandTotal: 85 })).toContain('TOTAL incl. VAT: AED 85.00');
});
