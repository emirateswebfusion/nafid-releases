import { storeDate } from '../../utils/time/dateDisplay';
import { getStoreLocale, isVatStore, localizeTaxText } from '../../utils/localization/storeProfile';
import type { PurchaseBill } from './purchaseTypes';
/** Purchase bill screen helpers: date formatting and the focusable fields of the bill form (keyboard navigation). */
import { getStoreTimezone } from '../../utils/time/timezoneHelper';
import { parseUTCDate } from '../../utils/print/receiptGenerator';

export const formatDate = (d: string | null) => {
  if (!d) return '—';
  const tz = getStoreTimezone();
  const date = parseUTCDate(d);
  if (isNaN(date.getTime())) return d;
  return storeDate(d, getStoreLocale(), { timeZone: tz, day: '2-digit', month: 'short', year: 'numeric' });
};

/** The saved tax category stays GST; interstate bills display the more specific IGST badge. */
export const purchaseBillTypeLabel = (bill: Pick<PurchaseBill, 'bill_type' | 'is_interstate'>): string => {
  const type = bill.bill_type || 'GST';
  return type === 'GST' && !isVatStore() && bill.is_interstate ? 'IGST' : localizeTaxText(type);
};

export const getPurchaseBillFocusables = (root: ParentNode): HTMLElement[] =>
  Array.from(root.querySelectorAll<HTMLElement>(
    '[data-select-trigger]:not([disabled]), input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), [data-enter-submit]:not([disabled])'
  )).filter(element => element.getClientRects().length > 0);
