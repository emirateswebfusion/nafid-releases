import { describe, expect, it } from 'vitest';
import {
  calculateCashierSettlement,
  type CashierSettlementInvoice,
} from '../../electron/utils/cashierSettlement';

describe('calculateCashierSettlement', () => {
  it('calculates standard full payment settlement', () => {
    const inv: CashierSettlementInvoice = {
      subtotal: 500,
      tax_total: 90,
      grand_total: 590,
    };
    const res = calculateCashierSettlement(inv, 590, 0);
    expect(res).toEqual({
      discountTotal: 0,
      discountType: 'FIXED',
      discountValue: 0,
      grandTotal: 590,
      receivedAmount: 590,
      expectedRefundAmount: 0,
      actualRefundPaid: 0,
      settlementDiscount: 0,
    });
  });

  it('applies cashier settlement discount clamped to old grand total', () => {
    const inv: CashierSettlementInvoice = {
      subtotal: 100,
      tax_total: 18,
      grand_total: 118,
      discount_total: 10,
    };
    // requestedDiscount of 18 -> new discountTotal is 10 + 18 = 28, grandTotal becomes 90 (100 + 18 - 28)
    const res = calculateCashierSettlement(inv, 90, 18);
    expect(res.settlementDiscount).toBe(18);
    expect(res.discountTotal).toBe(28);
    expect(res.discountValue).toBe(28);
    expect(res.discountType).toBe('FIXED');
    expect(res.grandTotal).toBe(90);
    expect(res.receivedAmount).toBe(90);

    // discount requested larger than grand total is clamped
    const clampedRes = calculateCashierSettlement(inv, 0, 500);
    expect(clampedRes.settlementDiscount).toBe(118);
    expect(clampedRes.grandTotal).toBe(0);
  });

  it('treats negative received amount as actual refund paid without modifying bill total', () => {
    // When customer has a net refund (e.g. from scrap/returns), settlement cashier pays out cash
    const inv: CashierSettlementInvoice = {
      subtotal: 100,
      tax_total: 0,
      scrap_deduction: 150,
      grand_total: 0,
    };
    // receivedAmount = -50 (Rs. 50 paid out as cash refund to customer)
    const res = calculateCashierSettlement(inv, -50, 10);
    expect(res.receivedAmount).toBe(0);
    expect(res.actualRefundPaid).toBe(50);
    expect(res.expectedRefundAmount).toBe(50);
    expect(res.settlementDiscount).toBe(0); // refunds forbid ad-hoc discounts
    expect(res.grandTotal).toBe(0);
  });

  it('computes expected refund amount when deductions exceed pre-deduction total', () => {
    const inv: CashierSettlementInvoice = {
      subtotal: 100,
      tax_total: 18,
      scrap_deduction: 80,
      return_deduction: 60,
    };
    // preDeductionTotal = 118; scrap + return = 140; expectedRefund = 140 - 118 = 22
    const res = calculateCashierSettlement(inv, 0, 0);
    expect(res.expectedRefundAmount).toBe(22);
    expect(res.actualRefundPaid).toBe(22);
    expect(res.grandTotal).toBe(0);
  });

  it('accounts for loyalty points redeemed discount', () => {
    const inv: CashierSettlementInvoice = {
      subtotal: 200,
      tax_total: 36,
      points_redeemed_discount: 30,
      grand_total: 206,
    };
    const res = calculateCashierSettlement(inv, 206, 0);
    expect(res.grandTotal).toBe(206);
    expect(res.receivedAmount).toBe(206);
  });

  it('handles empty, null, or zeroed invoice values safely', () => {
    const res = calculateCashierSettlement({}, 0, 0);
    expect(res.grandTotal).toBe(0);
    expect(res.receivedAmount).toBe(0);
    expect(res.discountTotal).toBe(0);
    expect(res.expectedRefundAmount).toBe(0);
  });
});
