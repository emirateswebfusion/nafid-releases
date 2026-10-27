import { describe, expect, it } from 'vitest';
import { getInvoicePreDeductionTotal, getSalesTaxBreakdown } from '../../src/utils/pricing/salesHistoryAmount';

describe('Sales History GST summary', () => {
  it('uses the stored GST without adding tax to an inclusive amount again', () => {
    expect(getSalesTaxBreakdown({ totalSalesBeforeDeductions: 118, totalTax: 18 })).toEqual({
      salesExcludingGst: 100, gstAmount: 18, grandTotalIncludingGst: 118,
    });
  });
  it('keeps invoice and points discounts but separates scrap / return credits', () => {
    const invoice = { subtotal: 100, tax_total: 18, discount_total: 10, points_redeemed_discount: 3, scrap_deduction: 5, return_deduction: 2, grand_total: 98 };
    expect(getSalesTaxBreakdown({ totalSalesBeforeDeductions: getInvoicePreDeductionTotal(invoice), totalTax: invoice.tax_total })).toEqual({
      salesExcludingGst: 87, gstAmount: 18, grandTotalIncludingGst: 105,
    });
  });
  it('keeps tax-free BOS sales unchanged', () => {
    expect(getSalesTaxBreakdown({ totalSalesBeforeDeductions: 100, totalTax: 0 })).toEqual({
      salesExcludingGst: 100, gstAmount: 0, grandTotalIncludingGst: 100,
    });
  });
  it('rounds displayed totals to paise and reconciles the three figures', () => {
    const result = getSalesTaxBreakdown({ totalSalesBeforeDeductions: 0.1 + 0.2, totalTax: 0.05 });
    expect(result).toEqual({ salesExcludingGst: 0.25, gstAmount: 0.05, grandTotalIncludingGst: 0.3 });
  });
});
