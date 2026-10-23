/** Customers screen display helpers: dates, initials, bill type and payment method labels / badges. */
import { getStoreTimezone } from '../../utils/timezoneHelper';
import { parseUTCDate, getAppTimeFormat } from '../../utils/receiptGenerator';
import { type InvoiceRecord } from './customerTypes';
import clsx from 'clsx';

export function formatDate(d: string) {
  if (!d) return '—';
  const tz = getStoreTimezone();
  return parseUTCDate(d).toLocaleDateString('en-IN', { timeZone: tz, day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDateTime(d: string) {
  if (!d) return '—';
  const tz = getStoreTimezone();
  return parseUTCDate(d).toLocaleString('en-IN', { timeZone: tz, day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: getAppTimeFormat() !== '24h' });
}

export function getInitials(name: string): string {
  if (!name) return 'C';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export function getBillTypeDisplay(inv: InvoiceRecord): { label: string; color: string; bgColor: string; borderColor: string } {
  const invoiceType = inv.invoice_type;
  const hasCustomerGstin = inv.customer_gstin && inv.customer_gstin.trim() !== '';
  
  if (invoiceType === 'GST') {
    if (hasCustomerGstin) {
      return { label: 'B2B', color: 'text-blue-600 dark:text-blue-400', bgColor: 'bg-blue-500/10', borderColor: 'border-blue-500/20' };
    } else {
      return { label: 'B2C', color: 'text-indigo-600 dark:text-indigo-400', bgColor: 'bg-indigo-500/10', borderColor: 'border-indigo-500/20' };
    }
  } else if (invoiceType === 'BILL_OF_SUPPLY') {
    return { label: 'Bill of Supply', color: 'text-emerald-600 dark:text-emerald-400', bgColor: 'bg-emerald-500/10', borderColor: 'border-emerald-500/20' };
  } else if (invoiceType === 'ESTIMATE') {
    return { label: 'Estimate', color: 'text-amber-600 dark:text-amber-400', bgColor: 'bg-amber-500/10', borderColor: 'border-amber-500/20' };
  }
  return { label: 'Unknown', color: 'text-muted-foreground', bgColor: 'bg-muted/10', borderColor: 'border-border/20' };
}

export function getPaymentMethodDisplay(method?: string): { label: string; color: string; bgColor: string; borderColor: string } {
  const m = (method || 'CASH').toUpperCase();
  const methods: Record<string, { label: string; color: string; bgColor: string; borderColor: string }> = {
    'CASH': { label: 'Cash', color: 'text-emerald-600 dark:text-emerald-400', bgColor: 'bg-emerald-500/10', borderColor: 'border-emerald-500/20' },
    'CARD': { label: 'Card', color: 'text-blue-600 dark:text-blue-400', bgColor: 'bg-blue-500/10', borderColor: 'border-blue-500/20' },
    'UPI': { label: 'UPI', color: 'text-purple-600 dark:text-purple-400', bgColor: 'bg-purple-500/10', borderColor: 'border-purple-500/20' },
    'CREDIT': { label: 'Credit', color: 'text-amber-600 dark:text-amber-400', bgColor: 'bg-amber-500/10', borderColor: 'border-amber-500/20' },
    'CHEQUE': { label: 'Cheque', color: 'text-indigo-600 dark:text-indigo-400', bgColor: 'bg-indigo-500/10', borderColor: 'border-indigo-500/20' },
    'ONLINE': { label: 'Online', color: 'text-cyan-600 dark:text-cyan-400', bgColor: 'bg-cyan-500/10', borderColor: 'border-cyan-500/20' },
    'MIXED': { label: 'Mixed', color: 'text-rose-600 dark:text-rose-400', bgColor: 'bg-rose-500/10', borderColor: 'border-rose-500/20' },
  };
  return methods[m] || { label: m, color: 'text-muted-foreground', bgColor: 'bg-muted/10', borderColor: 'border-border/20' };
}

export function renderPaymentMethodBadge(method: string) {
  const pm = getPaymentMethodDisplay(method);
  return <span className={clsx('px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider font-mono', pm.bgColor, pm.color, pm.borderColor)}>{pm.label}</span>;
}

export function renderBillTypeBadge(inv: InvoiceRecord) {
  const bt = getBillTypeDisplay(inv);
  return <span className={clsx('px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider font-mono', bt.bgColor, bt.color, bt.borderColor)}>{bt.label}</span>;
}
