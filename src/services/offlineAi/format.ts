/** Formatting and text helpers of the offline AI assistant. */
import { formatCurrency } from '../../utils/pricing/money';
import type { AiRow } from './types';

export function formatINR(val: number | string | null | undefined): string {
  return formatCurrency(val);
}

export function formatQty(val: number | string | null | undefined): string {
  const num = Number(val || 0);
  return num.toLocaleString('en-IN', { maximumFractionDigits: 3 });
}

export function isMalayalam(text: string): boolean {
  return /[\u0D00-\u0D7F]/.test(text || '');
}

export const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Stage A: Input Normalization Pipeline
 */
export function normalizeInput(text: string): string {
  if (!text) return '';
  let str = text.toLowerCase().trim();
  str = str.replace(/\s+/g, ' ');
  str = str.replace(/[?!.]+$|[.,]+$/g, '');
  str = str.replace(/\b(yestarday|yesturday|yday|yesterdy|innale's|yesterdays)\b/gi, 'yesterday');
  str = str.replace(/\b(todays)\b/gi, 'today');
  str = str.replace(/\b(tommorow|tommorrow|tomorow|tmrw)\b/gi, 'tomorrow');
  return str;
}

/**
 * Helper to calculate precise payment breakdown from invoices list
 */
export function calculatePaymentBreakdown(invoices: AiRow[]): {
  totalSales: number;
  cash: number;
  card: number;
  upi: number;
  bank: number;
  cheque: number;
  credit: number;
} {
  const pm = { totalSales: 0, cash: 0, card: 0, upi: 0, bank: 0, cheque: 0, credit: 0 };

  (invoices || []).forEach((inv: AiRow) => {
    if (inv.converted_to_invoice_id) return;
    const grandTotal = Number(inv.grand_total) || 0;
    pm.totalSales += grandTotal;

    const method = (inv.payment_method || 'CASH').toUpperCase();
    if (method === 'SPLIT' && inv.split_details) {
      let sd = inv.split_details;
      while (typeof sd === 'string') {
        try { sd = JSON.parse(sd); } catch { break; }
      }
      if (sd && typeof sd === 'object') {
        pm.cash += Number(sd.cash) || 0;
        pm.card += Number(sd.card) || 0;
        pm.upi += Number(sd.upi) || 0;
        pm.bank += Number(sd.bank_transfer || sd.bank) || 0;
        pm.cheque += Number(sd.cheque) || 0;
        pm.credit += Number(sd.credit) || 0;
      } else {
        pm.cash += grandTotal;
      }
    } else if (method.includes('CASH')) pm.cash += grandTotal;
    else if (method.includes('CARD')) pm.card += grandTotal;
    else if (method.includes('UPI')) pm.upi += grandTotal;
    else if (method.includes('BANK')) pm.bank += grandTotal;
    else if (method.includes('CHEQUE')) pm.cheque += grandTotal;
    else if (method.includes('CREDIT')) pm.credit += grandTotal;
    else pm.cash += grandTotal;
  });

  return pm;
}
