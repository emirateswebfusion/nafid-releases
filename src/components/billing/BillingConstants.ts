import {
  Clock,
  Wallet,
  BookOpen,
  Smartphone,
  FileText,
  Banknote,
  Split
} from 'lucide-react';
import { formatCurrency as formatMoney } from '../../utils/pricing/money';

export const INDIAN_STATES = [
  { code: 'MH', name: 'Maharashtra' },
  { code: 'DL', name: 'Delhi' },
  { code: 'KA', name: 'Karnataka' },
  { code: 'TN', name: 'Tamil Nadu' },
  { code: 'TS', name: 'Telangana' },
  { code: 'AP', name: 'Andhra Pradesh' },
  { code: 'GJ', name: 'Gujarat' },
  { code: 'WB', name: 'West Bengal' },
  { code: 'UP', name: 'Uttar Pradesh' },
  { code: 'HR', name: 'Haryana' },
  { code: 'KL', name: 'Kerala' },
  { code: 'MP', name: 'Madhya Pradesh' },
  { code: 'RJ', name: 'Rajasthan' },
  { code: 'PB', name: 'Punjab' },
  { code: 'BR', name: 'Bihar' },
  { code: 'OD', name: 'Odisha' },
  { code: 'AS', name: 'Assam' },
  { code: 'UT', name: 'Uttarakhand' },
  { code: 'GA', name: 'Goa' },
];

export type PaymentMethod = 'PENDING' | 'CASH' | 'CARD' | 'UPI' | 'CHEQUE' | 'CREDIT' | 'SPLIT';

export const PAYMENT_OPTIONS: { value: PaymentMethod; label: string; icon: typeof Wallet; color: string }[] = [
  { value: 'PENDING', label: 'Pending', icon: Clock, color: 'text-gray-500' },
  { value: 'CARD', label: 'Card', icon: Wallet, color: 'text-blue-500' },
  { value: 'CREDIT', label: 'Credit', icon: BookOpen, color: 'text-amber-500' },
  { value: 'UPI', label: 'UPI', icon: Smartphone, color: 'text-violet-500' },
  { value: 'CHEQUE', label: 'Cheque', icon: FileText, color: 'text-indigo-500' },
  { value: 'CASH', label: 'Cash', icon: Banknote, color: 'text-emerald-500' },
  { value: 'SPLIT', label: 'Split', icon: Split, color: 'text-purple-500' },
];

/** Billing screens show compact, ungrouped amounts (₹1234.50). */
export function formatCurrency(amount: unknown): string {
  return formatMoney(amount, { grouping: false });
}

const scannerBurstTracker: Record<string, { count: number; lastTime: number; snapshot: number | string }> = {};

export function detectScannerBurst(
  _keyTimes: Record<string, number>,
  _snapshots: Record<string, number | string>,
  productId: string,
  currentValue: number | string,
  restore: (v: number | string) => void,
): boolean {
  const now = Date.now();
  const tracker = scannerBurstTracker[productId] || { count: 0, lastTime: 0, snapshot: currentValue };
  if (tracker.lastTime && now - tracker.lastTime <= 35) {
    tracker.count += 1;
    tracker.lastTime = now;
    scannerBurstTracker[productId] = tracker;
    if (tracker.count >= 4) {
      if (tracker.snapshot !== undefined) restore(tracker.snapshot);
      return true;
    }
  } else {
    scannerBurstTracker[productId] = { count: 1, lastTime: now, snapshot: currentValue };
  }
  return false;
}

