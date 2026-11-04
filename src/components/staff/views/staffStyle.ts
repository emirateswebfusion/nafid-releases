import { getStoreLocale } from '../../../utils/localization/storeProfile';
import type { StaffMember } from '../staffTypes';

/** Shared class names and helpers of the staff screen (components live in staffUi.tsx). */

/** Surface used for every panel on the staff screen. */
export const STAFF_PANEL = 'bg-card border border-border/70 rounded-2xl shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(15,23,42,0.08)]';

/** Small uppercase label above a value. */
export const STAFF_LABEL = 'text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground';

/** Table header cell and body cell classes shared by the ledger and attendance tables. */
export const STAFF_TH = 'px-5 py-3 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground';
export const STAFF_TD = 'px-5 py-3.5';

export function staffInitials(name?: string | null): string {
  return (name || 'ST')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() || '')
    .join('') || 'ST';
}

export function isAdminStaff(staff: StaffMember): boolean {
  return (staff.role_designation || '').toUpperCase() === 'ADMIN' || (staff.user_role || '').toUpperCase() === 'ADMIN';
}

/** Positive balance is owed to the staff member; negative means the staff member owes the shop. */
export function balanceTone(balance?: number | null): { text: string; label: string } {
  const value = Number(balance) || 0;
  if (value > 0) return { text: 'text-amber-600 dark:text-amber-400', label: 'Payable to staff' };
  if (value < 0) return { text: 'text-rose-600 dark:text-rose-400', label: 'Staff owes shop' };
  return { text: 'text-emerald-600 dark:text-emerald-400', label: 'Fully settled' };
}

export function formatStaffDate(dateStr?: string | null): string {
  if (!dateStr) return 'Not recorded';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString(getStoreLocale(), { day: 'numeric', month: 'short', year: 'numeric' });
}
