/** Purchase bill screen helpers: date formatting and the focusable fields of the bill form (keyboard navigation). */
import { getStoreTimezone } from '../../utils/timezoneHelper';
import { parseUTCDate } from '../../utils/receiptGenerator';

export const formatDate = (d: string | null) => {
  if (!d) return '—';
  const tz = getStoreTimezone();
  const date = parseUTCDate(d);
  if (isNaN(date.getTime())) return d;
  return date.toLocaleDateString('en-IN', { timeZone: tz, day: '2-digit', month: 'short', year: 'numeric' });
};

export const getPurchaseBillFocusables = (root: ParentNode): HTMLElement[] =>
  Array.from(root.querySelectorAll<HTMLElement>(
    '[data-select-trigger]:not([disabled]), input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), [data-enter-submit]:not([disabled])'
  )).filter(element => element.getClientRects().length > 0);
