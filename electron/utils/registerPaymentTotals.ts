import { roundStoreMoney } from './moneyRounding.js';

interface RegisterInvoice {
  payment_method?: string | null;
  grand_total?: number | null;
  received_amount?: number | null;
  split_details?: string | null;
}

/** Non-cash receipts for display only; they never increase the cash drawer. */
export function calculateRegisterPayments(invoices: RegisterInvoice[], selected: string[], countryOrDecimals?: string | number | null): Record<string, number> {
  const totals: Record<string, number> = Object.fromEntries(selected.map(m => [m, 0]));
  for (const invoice of invoices) {
    const method = invoice.payment_method?.toUpperCase();
    const grand = Math.max(0, Number(invoice.grand_total) || 0);
    if (method === 'SPLIT' || method === 'CREDIT') {
      let split: unknown;
      try { split = JSON.parse(invoice.split_details || 'null'); } catch { continue; }
      if (!split || typeof split !== 'object') continue;
      const parts = split as Record<string, unknown>;
      for (const key of selected) {
        const value = key === 'BANK_TRANSFER' ? (parts.bank_transfer ?? parts.bank) : parts[key.toLowerCase()];
        totals[key] += Math.min(grand, Math.max(0, Number(value) || 0));
      }
    } else {
      const key = method === 'BANK' ? 'BANK_TRANSFER' : method;
      if (key && Object.prototype.hasOwnProperty.call(totals, key)) {
        const received = Number(invoice.received_amount);
        totals[key] += received > 0 ? Math.min(grand, received) : grand;
      }
    }
  }
  return Object.fromEntries(Object.entries(totals).map(([key, value]) => [key, roundStoreMoney(value, countryOrDecimals)]));
}
