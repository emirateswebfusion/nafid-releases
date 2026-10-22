import { describe, expect, it } from 'vitest';
import {
  getInvoiceNetTotal,
  getInvoicePreDeductionTotal,
  getSalesHistoryAmount,
} from '../../src/utils/salesHistoryAmount';

describe('getInvoiceNetTotal', () => {
  it('prefers the stored grand total', () => {
    expect(getInvoiceNetTotal({ grand_total: 118, subtotal: 100, tax_total: 18 })).toBe(118);
  });

  it('falls back to subtotal + tax - discounts - deductions', () => {
    expect(
      getInvoiceNetTotal({
        subtotal: 100,
        tax_total: 18,
        discount_total: 5,
        points_redeemed_discount: 3,
        scrap_deduction: 10,
        return_deduction: 2,
      }),
    ).toBe(98);
  });

  it('never returns a negative total', () => {
    expect(getInvoiceNetTotal({ subtotal: 10, tax_total: 0, discount_total: 50 })).toBe(0);
  });
});

describe('getInvoicePreDeductionTotal', () => {
  it('subtracts invoice-level discounts but not scrap/return deductions', () => {
    expect(
      getInvoicePreDeductionTotal({
        subtotal: 100,
        tax_total: 18,
        discount_total: 10,
        scrap_deduction: 5,
        return_deduction: 5,
      }),
    ).toBe(108);
  });
});

describe('getSalesHistoryAmount', () => {
  it('returns the net total for a normal sale', () => {
    expect(getSalesHistoryAmount({ grand_total: 118 })).toEqual({
      amount: 118,
      refund: false,
      discount: 0,
      refundDifference: 0,
    });
  });

  it('treats an over-deducted return as a refund', () => {
    expect(
      getSalesHistoryAmount({
        subtotal: 100,
        tax_total: 18,
        scrap_deduction: 130,
        grand_total: 0,
      }),
    ).toEqual({
      amount: 12,
      refund: true,
      discount: 0,
      refundDifference: 0,
    });
  });

  it('prefers the recorded refund amount when present', () => {
    expect(
      getSalesHistoryAmount({
        subtotal: 100,
        tax_total: 18,
        scrap_deduction: 130,
        actual_refund_paid: 20,
      }),
    ).toEqual({
      amount: 20,
      refund: true,
      discount: 0,
      refundDifference: 8,
    });
  });

  it('does not flag scrap invoices as refunds', () => {
    const result = getSalesHistoryAmount({
      invoice_type: 'SCRAP',
      subtotal: 100,
      tax_total: 18,
      scrap_deduction: 130,
      grand_total: 0,
    });
    expect(result.refund).toBe(false);
  });

  it('reports the invoice discount for a discounted sale', () => {
    const result = getSalesHistoryAmount({ grand_total: 90, discount_total: 10 });
    expect(result.amount).toBe(90);
    expect(result.discount).toBe(10);
    expect(result.refund).toBe(false);
  });
});
