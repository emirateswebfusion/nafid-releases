import { roundMoney } from './moneyRounding';
interface ReceiptCredits {
  /** Print contract: already discounted and VAT-inclusive, before scrap / return credits. */
  grandTotal: number;
  scrapDeduction?: number;
  returnDeduction?: number;
}

/** Does not subtract invoice/points discounts again; they are already in grandTotal. */
export function receiptCreditTotals(data: ReceiptCredits) {
  const credits = Math.max(0, data.scrapDeduction || 0) + Math.max(0, data.returnDeduction || 0);
  const remaining = roundMoney((data.grandTotal - credits));
  return { payable: Math.max(0, remaining), refund: Math.max(0, -remaining) };
}
