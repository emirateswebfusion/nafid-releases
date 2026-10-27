import { Landmark, CreditCard, Smartphone, type LucideIcon } from 'lucide-react';
import type * as Rows from '../../data/dbRows';
import type { PaymentSource as DataPaymentSource } from '../../data/paymentSources';

/** Payment methods screen: view names, payment source and transaction rows, type styling, quick categories, empty form. */
export type View = 'list' | 'form' | 'transactions';

export interface PaymentSource extends DataPaymentSource {
  transaction_count?: number;
  last_transaction_date?: string | null;
}

export type SourceTransaction = Rows.PaymentSourceTransactionsRow;

export { formatDateTime } from '../../utils/time/dateDisplay';

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
