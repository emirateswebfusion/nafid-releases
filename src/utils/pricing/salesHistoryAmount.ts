type SalesAmountInvoice = { scrap_deduction?: number | string | null; return_deduction?: number | string | null; subtotal?: number | string | null; tax_total?: number | string | null; discount_total?: number | string | null; points_redeemed_discount?: number | string | null; actual_refund_paid?: number | string | null; grand_total?: number | string | null; invoice_type?: string | null };
export interface SalesHistoryAmountSummary {
  amount: number;
  refund: boolean;
  discount: number;
  refundDifference: number;
}

export function getSalesHistoryAmount(inv: SalesAmountInvoice): SalesHistoryAmountSummary {
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

export function getInvoicePreDeductionTotal(inv: SalesAmountInvoice): number {
  if (!inv) return 0;
  const subtotal = Number(inv.subtotal) || 0;
  const tax = Number(inv.tax_total) || 0;
  const discount = Number(inv.discount_total) || 0;
  const pointsDiscount = Number(inv.points_redeemed_discount) || 0;
  return Math.max(0, subtotal + tax - discount - pointsDiscount);
}

export function getInvoiceNetTotal(inv: SalesAmountInvoice): number {
  if (!inv) return 0;
  const storedNet = Number(inv.grand_total);
  if (inv.grand_total != null && Number.isFinite(storedNet)) {
    return Math.max(0, storedNet);
  }
  const subtotal = Number(inv.subtotal) || 0;
  const tax = Number(inv.tax_total) || 0;
  const discount = Number(inv.discount_total) || 0;
  const pointsDiscount = Number(inv.points_redeemed_discount) || 0;
  const scrap = Number(inv.scrap_deduction) || 0;
  const returned = Number(inv.return_deduction) || 0;
  return Math.max(0, subtotal + tax - discount - pointsDiscount - scrap - returned);
}
