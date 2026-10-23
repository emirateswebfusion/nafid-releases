import { getStoreTimezone } from '../../utils/timezoneHelper';
import { parseUTCDate, getAppTimeFormat } from '../../utils/receiptGenerator';
import { Landmark, CreditCard, Smartphone, type LucideIcon } from 'lucide-react';

/** Payment methods screen: view names, payment source and transaction rows, type styling, quick categories, empty form. */
export type View = 'list' | 'form' | 'transactions';

export interface PaymentSource {
  source_id: string;
  tenant_id: string;
  name: string;
  type: 'BANK' | 'CARD' | 'UPI';
  bank_name?: string | null;
  account_number?: string | null;
  holder_name?: string | null;
  upi_id?: string | null;
  opening_balance: number;
  current_balance: number;
  is_default: number;
  is_enabled: number;
  sort_order: number;
  transaction_count?: number;
  last_transaction_date?: string | null;
}

export interface SourceTransaction {
  transaction_id: string;
  source_id: string;
  type: 'CASH_IN' | 'CASH_OUT';
  amount: number;
  category?: string | null;
  notes?: string | null;
  reference_number?: string | null;
  transaction_date: string;
  running_balance: number;
  entered_by_name?: string | null;
}

export const formatDateTime = (d: string) => {
  if (!d) return '—';
  const tz = getStoreTimezone();
  try {
    return parseUTCDate(d).toLocaleString('en-IN', {
      timeZone: tz,
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: getAppTimeFormat() !== '24h'
    });
  } catch {
    return new Date(d).toLocaleString('en-IN', {
      timeZone: tz,
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
};

export const TYPE_CONFIG: Record<string, { label: string; icon: LucideIcon; gradient: string; badgeBg: string; textColor: string; borderColor: string }> = {
  BANK: {
    label: 'Bank Account',
    icon: Landmark,
    gradient: 'from-sky-600 via-blue-700 to-indigo-900',
    badgeBg: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/30',
    textColor: 'text-sky-600 dark:text-sky-400',
    borderColor: 'border-sky-500/30',
  },
  CARD: {
    label: 'Card Portal',
    icon: CreditCard,
    gradient: 'from-violet-600 via-purple-700 to-slate-900',
    badgeBg: 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/30',
    textColor: 'text-violet-600 dark:text-violet-400',
    borderColor: 'border-violet-500/30',
  },
  UPI: {
    label: 'UPI Gateway',
    icon: Smartphone,
    gradient: 'from-emerald-600 via-teal-700 to-slate-900',
    badgeBg: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
    textColor: 'text-emerald-600 dark:text-emerald-400',
    borderColor: 'border-emerald-500/30',
  },
};

export const QUICK_CATEGORIES = [
  'Invoice Payment',
  'Vendor Payout',
  'Customer Transfer',
  'Cash Settlement',
  'Refund',
  'Adjustment',
];

export const defaultForm = {
  name: '',
  type: 'BANK' as 'BANK' | 'CARD' | 'UPI',
  bank_name: '',
  account_number: '',
  holder_name: '',
  upi_id: '',
  opening_balance: '',
  is_default: false,
  is_enabled: true,
  sort_order: 0,
};
