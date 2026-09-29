export interface CashierSettlementInvoice {
  subtotal?: number | null;
  tax_total?: number | null;
  discount_total?: number | null;
  discount_type?: string | null;
  discount_value?: number | null;
  grand_total?: number | null;
  scrap_deduction?: number | null;
  return_deduction?: number | null;
  points_redeemed_discount?: number | null;
}

export interface CashierSettlementResult {
  discountTotal: number;
  discountType: string;
  discountValue: number;
  grandTotal: number;
  receivedAmount: number;
  expectedRefundAmount: number;
  actualRefundPaid: number;
  settlementDiscount: number;
}

const nonNegativeAmount = (value: unknown): number => Math.max(0, Number(value) || 0);

/**
 * Calculate the persisted invoice state after Cashier Settlement.
 * A negative settlement amount is a refund paid to the customer; it must never
 * be inferred as a bill discount. Discounts are applied only when the cashier
 * explicitly supplies a settlement discount.
 */
export function calculateCashierSettlement(
  invoice: CashierSettlementInvoice,
  receivedAmount: number,
  requestedDiscount = 0,
): CashierSettlementResult {
  const subtotal = nonNegativeAmount(invoice.subtotal);
  const taxTotal = nonNegativeAmount(invoice.tax_total);
  const previousDiscount = nonNegativeAmount(invoice.discount_total);
  const scrapDeduction = nonNegativeAmount(invoice.scrap_deduction);
  const returnDeduction = nonNegativeAmount(invoice.return_deduction);
  const pointsDiscount = nonNegativeAmount(invoice.points_redeemed_discount);

  const oldGrandTotal = invoice.grand_total != null
    ? Number(invoice.grand_total) || 0
    : Math.max(0, subtotal + taxTotal - previousDiscount - pointsDiscount - scrapDeduction - returnDeduction);
  const requestedReceived = Number(receivedAmount) || 0;
  const settlementDiscount = requestedReceived < 0
    ? 0
    : Math.min(nonNegativeAmount(requestedDiscount), oldGrandTotal);
  const discountTotal = previousDiscount + settlementDiscount;

  // Preserve the bill's already-calculated net total when Cashier Settlement
  // records a refund. In the ordinary payment path, reflect the explicit
  // settlement discount while retaining scrap/return/points adjustments.
  const grandTotal = requestedReceived < 0
    ? oldGrandTotal
    : Math.max(0, subtotal + taxTotal - discountTotal - pointsDiscount - scrapDeduction - returnDeduction);

  const preDeductionTotal = Math.max(0, subtotal + taxTotal - discountTotal - pointsDiscount);
  const expectedRefundAmount = Math.max(0, scrapDeduction + returnDeduction - preDeductionTotal);
  const actualRefundPaid = requestedReceived < 0
    ? Math.abs(requestedReceived)
    : expectedRefundAmount;

  return {
    discountTotal,
    discountType: settlementDiscount > 0 ? 'FIXED' : (invoice.discount_type || 'FIXED'),
    discountValue: settlementDiscount > 0 ? discountTotal : (Number(invoice.discount_value) || 0),
    grandTotal,
    // Cash receipts belong in received_amount. Refunds are persisted separately
    // in actual_refund_paid so startup repair and cash-sales logic cannot erase
    // or count them as receipts.
    receivedAmount: Math.max(0, requestedReceived),
    expectedRefundAmount,
    actualRefundPaid,
    settlementDiscount,
  };
}
