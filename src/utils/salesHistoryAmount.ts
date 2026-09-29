export interface SalesHistoryAmountSummary {
  amount: number;
  refund: boolean;
  discount: number;
  refundDifference: number;
}

export function getSalesHistoryAmount(inv: any): SalesHistoryAmountSummary {
  const scrap = Number(inv?.scrap_deduction) || 0;
  const returned = Number(inv?.return_deduction) || 0;
  const subtotal = Number(inv?.subtotal) || 0;
  const tax = Number(inv?.tax_total) || 0;
  const discount = Number(inv?.discount_total) || 0;
  const pointsDiscount = Number(inv?.points_redeemed_discount) || 0;
  const preDeductionTotal = Math.max(0, subtotal + tax - discount - pointsDiscount);
  const expectedRefund = Math.max(0, scrap + returned - preDeductionTotal);
  const actualRefund = Number(inv?.actual_refund_paid) || 0;

  if (inv?.invoice_type !== 'SCRAP' && (actualRefund > 0 || expectedRefund > 0)) {
    return {
      amount: actualRefund > 0 ? actualRefund : expectedRefund,
      refund: true,
      discount: 0,
      refundDifference: actualRefund > 0 ? actualRefund - expectedRefund : 0,
    };
  }

  return { amount: getInvoiceNetTotal(inv), refund: false, discount, refundDifference: 0 };
}

function getInvoiceNetTotal(inv: any): number {
  if (!inv) return 0;
  const subtotal = Number(inv.subtotal) || 0;
  const tax = Number(inv.tax_total) || 0;
  const discount = Number(inv.discount_total) || 0;
  const pointsDiscount = Number(inv.points_redeemed_discount) || 0;
  const scrap = Number(inv.scrap_deduction) || 0;
  const returned = Number(inv.return_deduction) || 0;
  const computedNet = Math.max(0, subtotal + tax - discount - pointsDiscount - scrap - returned);
  const grandTotal = Number(inv.grand_total) || 0;
  if (grandTotal > 0 && grandTotal <= computedNet + 0.01) {
    return grandTotal;
  }
  return computedNet;
}
