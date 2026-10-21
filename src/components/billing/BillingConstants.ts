import {
  Clock,
  Wallet,
  BookOpen,
  Smartphone,
  FileText,
  Banknote,
  Split
} from 'lucide-react';

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

export function formatCurrency(amount: any): string {
  const num = Number(amount || 0);
  return `\u20B9${(isNaN(num) ? 0 : num).toFixed(2)}`;
}

export const scannerBurstTracker: Record<string, { count: number; lastTime: number; snapshot: number | string }> = {};

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


export function toLocalDatetimeInputString(dateInput: string | Date | null | undefined): string {
  if (!dateInput) return '';
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  const YYYY = d.getFullYear();
  const MM = pad(d.getMonth() + 1);
  const DD = pad(d.getDate());
  const hh = pad(d.getHours());
  const mm = pad(d.getMinutes());
  return `${YYYY}-${MM}-${DD}T${hh}:${mm}`;
}

export function formatDisplayBillDate(dateInput: string | null | undefined): { text: string; isToday: boolean; isCustom: boolean } {
  const now = new Date();
  if (!dateInput) {
    const formatted = now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    return { text: formatted, isToday: true, isCustom: false };
  }
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) {
    const formatted = now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    return { text: formatted, isToday: true, isCustom: false };
  }
  const isToday = d.toDateString() === now.toDateString();
  const datePart = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const timePart = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  return { text: `${datePart}, ${timePart}`, isToday, isCustom: true };
}

