import { storeTime, storeDate } from '../../utils/time/dateDisplay';
import { getStoreLocale } from '../../utils/localization/storeProfile';
/** Cashier settlement helpers: payment methods / options, labels and colours, time and business-date formatting. */
import { Banknote, CreditCard, Smartphone, Wallet, FileText, SplitSquareHorizontal } from 'lucide-react';
import { getStoreTimezone, getStoreBusinessDate } from '../../utils/time/timezoneHelper';
import { parseUTCDate, getAppTimeFormat } from '../../utils/print/receiptGenerator';

export type PaymentMethod = 'CASH' | 'CARD' | 'UPI' | 'BANK_TRANSFER' | 'CHEQUE' | 'SPLIT';

export const PAYMENT_OPTIONS: { value: PaymentMethod; label: string; icon: typeof Banknote }[] = [
  { value: 'CASH',          label: 'Cash',  icon: Banknote             },
  { value: 'CARD',          label: 'Card',  icon: CreditCard           },
  { value: 'UPI',           label: 'UPI',   icon: Smartphone           },
  { value: 'BANK_TRANSFER', label: 'Bank',  icon: Wallet               },
  { value: 'CHEQUE',        label: 'Cheque', icon: FileText             },
  { value: 'SPLIT',         label: 'Split', icon: SplitSquareHorizontal},
];

export function formatTime(d: string | null): string {
  if (!d) return '';
  const tz = getStoreTimezone();
  return storeTime(parseUTCDate(d), getStoreLocale(), { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: getAppTimeFormat() !== '24h' });
}

export function todayStr(): string {
  return getStoreBusinessDate();
}

export function formatBusinessDate(d: string | null | undefined): string {
  if (!d) return '—';
  const cleanStr = String(d).split('T')[0].split(' ')[0];
  const parts = cleanStr.split('-');
  let date: Date;
  if (parts.length === 3 && parts[0].length === 4) {
    const [year, month, day] = parts;
    date = new Date(Number(year), Number(month) - 1, Number(day));
  } else {
    date = parseUTCDate(d);
  }
  if (isNaN(date.getTime())) return String(d);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const dayName = storeDate(cleanStr, 'en-US', { weekday: 'long' }).toUpperCase();
  return `${day}-${month}-${year} ${dayName}`;
}

export const PAYMENT_LABELS: Record<string, string> = {
  PENDING: 'Pending',
  CASH: 'Cash',
  CARD: 'Card',
  UPI: 'UPI',
  CHEQUE: 'Cheque',
  CREDIT: 'Credit',
};

export const PAYMENT_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  PENDING:{ bg: 'bg-gray-500/10',   text: 'text-gray-500',    dot: '#6b7280' },
  CASH:   { bg: 'bg-emerald-500/10', text: 'text-emerald-500', dot: '#10b981' },
  CARD:   { bg: 'bg-blue-500/10',   text: 'text-blue-500',    dot: '#3b82f6' },
  UPI:    { bg: 'bg-violet-500/10', text: 'text-violet-500',  dot: '#8b5cf6' },
  CHEQUE: { bg: 'bg-indigo-500/10', text: 'text-indigo-500',  dot: '#6366f1' },
  CREDIT: { bg: 'bg-amber-500/10',  text: 'text-amber-500',   dot: '#f59e0b' },
};

export function formatDate(dateStr: string | null | undefined) {
  const tz = getStoreTimezone();
  const d = parseUTCDate(dateStr);
  return {
    date: storeDate(d, getStoreLocale(), { timeZone: tz, day: '2-digit', month: 'short', year: 'numeric' }),
    time: storeTime(d, getStoreLocale(), { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: getAppTimeFormat() !== '24h' }),
  };
}
