import { getStoreProfile } from '../localization/storeProfile';
import { getStoreTimezone } from './timezoneHelper';
import { parseUTCDate, getAppTimeFormat } from '../print/receiptGenerator';

/** Display helpers for stored UTC timestamps, in the store timezone. Empty / missing values show as an em dash. */

/** "26 Oct 2026, 09:30 am" (12 / 24 h per the app time format). */
export function formatDateTime(d: string | null | undefined): string {
  if (!d) return '—';
  const tz = getStoreTimezone();
  return parseUTCDate(d).toLocaleString(getStoreProfile().locale, { timeZone: tz, day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: getAppTimeFormat() !== '24h' });
}

/** "26 Oct 2026". */
export function formatShortDate(d: string | null | undefined): string {
  if (!d) return '—';
  const tz = getStoreTimezone();
  return parseUTCDate(d).toLocaleDateString(getStoreProfile().locale, { timeZone: tz, day: '2-digit', month: 'short', year: 'numeric' });
}
