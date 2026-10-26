/** Sales History display helpers: payment labels/colours, tax rate filter options, date formatting, day grouping,
 * revenue per payment filter, invoice type info and split / UPI payment details. */
import { getStoreTimezone } from '../../utils/timezoneHelper';
import { parseUTCDate, getAppTimeFormat } from '../../utils/receiptGenerator';
import { getInvoiceNetTotal } from '../../utils/salesHistoryAmount';
import { Building, User, FileText } from 'lucide-react';

export const PAYMENT_LABELS: Record<string, string> = {
  PENDING: 'Pending',
  CASH: 'Cash',
  CARD: 'Card',
  UPI: 'UPI',
  CHEQUE: 'Cheque',
  CREDIT: 'Credit',
  SPLIT: 'Split',
};

export const PAYMENT_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  PENDING:{ bg: 'bg-gray-500/10',   text: 'text-gray-500',    dot: '#6b7280' },
  CASH:   { bg: 'bg-emerald-500/10', text: 'text-emerald-500', dot: '#10b981' },
  CARD:   { bg: 'bg-blue-500/10',   text: 'text-blue-500',    dot: '#3b82f6' },
  UPI:    { bg: 'bg-violet-500/10', text: 'text-violet-500',  dot: '#8b5cf6' },
  CHEQUE: { bg: 'bg-indigo-500/10', text: 'text-indigo-500',  dot: '#6366f1' },
  CREDIT: { bg: 'bg-amber-500/10',  text: 'text-amber-500',   dot: '#f59e0b' },
  SPLIT:  { bg: 'bg-purple-500/10', text: 'text-purple-500',  dot: '#a855f7' },
};

export const TAX_RATES = [
  { value: 'all', label: 'All GST %' },
  { value: '0', label: '0%' },
  { value: '5', label: '5%' },
  { value: '12', label: '12%' },
  { value: '18', label: '18%' },
  { value: '28', label: '28%' },
];

export function formatDate(dateStr: string) {
  if (!dateStr) return { date: '-', time: '-' };
  try {
    const tz = getStoreTimezone();
    const d = parseUTCDate(dateStr);
    if (isNaN(d.getTime())) return { date: '-', time: '-' };
    return {
      date: d.toLocaleDateString('en-IN', { timeZone: tz, day: '2-digit', month: 'short', year: 'numeric' }),
      time: d.toLocaleTimeString('en-IN', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: getAppTimeFormat() !== '24h' }),
    };
  } catch {
    return { date: '-', time: '-' };
  }
}

export function formatGroupDate(dateStr?: string) {
  if (!dateStr) return '-';
  try {
    const tz = getStoreTimezone();
    const d = parseUTCDate(dateStr);
    if (isNaN(d.getTime())) return '-';
    const dayName = d.toLocaleDateString('en-IN', { timeZone: tz, weekday: 'long' });
    const dateStrFormatted = d.toLocaleDateString('en-IN', { timeZone: tz, day: '2-digit', month: '2-digit', year: 'numeric' });
    return `${dateStrFormatted} ${dayName}`;
  } catch {
    return '-';
  }
}

// For SPLIT invoices filtered by a specific payment method, return only that payment's portion.
// For non-SPLIT invoices, return the net total only if payment method matches the filter.
export function getInvoiceRevenueForFilter(inv: any, paymentFilter: string): number {
  if (!inv) return 0;
  const pmFilter = paymentFilter?.toUpperCase();
  const invPm = inv.payment_method?.toUpperCase() || 'PENDING';
  const singleMethods = ['CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'CHEQUE', 'CREDIT'];

  // If no filter, return net total for all invoices
  if (!pmFilter) return getInvoiceNetTotal(inv);

  // If invoice is SPLIT and we're filtering by a single method, return that method's portion
  if ((invPm === 'SPLIT' || invPm === 'CREDIT') && inv.split_details && singleMethods.includes(pmFilter)) {
    try {
      const sd = typeof inv.split_details === 'string' ? JSON.parse(inv.split_details) : inv.split_details;
      const jsonKey = pmFilter === 'BANK_TRANSFER' ? 'bank_transfer' : pmFilter.toLowerCase();
      return Number(sd[jsonKey]) || 0;
    } catch { return 0; }
  }

  // If invoice payment method matches the filter exactly, return net total
  if (invPm === pmFilter) return getInvoiceNetTotal(inv);

  // Otherwise, this invoice doesn't match the filter - return 0
  return 0;
}

export function groupByDay(invoices: any[]) {
  const tz = getStoreTimezone();
  const map = new Map<string, number>();
  for (const inv of invoices) {
    const day = parseUTCDate(inv.created_at).toLocaleDateString('en-IN', { timeZone: tz, day: '2-digit', month: 'short' });
    map.set(day, (map.get(day) || 0) + getInvoiceNetTotal(inv));
  }
  return Array.from(map, ([date, sales]) => ({ date, sales }));
}

export function getInvoiceTypeInfo(inv: any): { label: string; icon: any; bg: string; text: string; border: string } {
  if (inv.invoice_type === 'GST' && inv.customer_gstin) {
    return { label: 'B2B', icon: Building, bg: 'bg-blue-500/10', text: 'text-blue-500', border: 'border-blue-500/20' };
  }
  if (inv.invoice_type === 'GST') {
    return { label: 'B2C', icon: User, bg: 'bg-violet-500/10', text: 'text-violet-500', border: 'border-violet-500/20' };
  }
  return { label: 'Bill of Supply', icon: FileText, bg: 'bg-amber-500/10', text: 'text-amber-500', border: 'border-amber-500/20' };
}

export function parseSplitDetails(splitDetailsRaw: any) {
  if (!splitDetailsRaw || splitDetailsRaw === 'null') return null;
  let curr = splitDetailsRaw;
  let depth = 0;
  while (typeof curr === 'string' && depth < 5) {
    depth++;
    try {
      curr = JSON.parse(curr);
    } catch {
      break;
    }
  }
  return (curr && typeof curr === 'object') ? curr : null;
}

export function getUpiDetailsFromInvoice(inv: any, upiSourcesList: any[] = []) {
  if (!inv) return null;
  const sd = parseSplitDetails(inv.split_details);
  if (sd?.upi_name || sd?.upi_id) {
    const name = sd.upi_name || 'UPI';
    const upiId = sd.upi_id || '';
    return {
      name,
      upiId,
      label: name && upiId ? `${name} (${upiId})` : (name || upiId)
    };
  }
  if (inv.payment_method === 'UPI' && upiSourcesList && upiSourcesList.length > 0) {
    const matched = (sd?.upi_source_id ? upiSourcesList.find((s) => s.source_id === sd.upi_source_id) : null)
      || upiSourcesList.find((s) => s.is_default === 1)
      || upiSourcesList[0];
    if (matched) {
      return {
        name: matched.name,
        upiId: matched.upi_id || '',
        label: matched.name && matched.upi_id ? `${matched.name} (${matched.upi_id})` : (matched.name || matched.upi_id || 'UPI')
      };
    }
  }
  return null;
}
