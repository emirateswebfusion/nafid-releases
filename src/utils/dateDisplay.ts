import { getStoreTimezone } from './timezoneHelper';
import { parseUTCDate, getAppTimeFormat } from './receiptGenerator';

/** Display helpers for stored UTC timestamps, in the store timezone. Empty / missing values show as an em dash. */

/** "26 Oct 2026, 09:30 am" (12 / 24 h per the app time format). */
export function formatDateTime(d: string | null | undefined): string {
  if (!d) return '—';
  const tz = getStoreTimezone();
  return parseUTCDate(d).toLocaleString('en-IN', { timeZone: tz, day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: getAppTimeFormat() !== '24h' });
}

/** "26 Oct 2026". */
export function formatShortDate(d: string | null | undefined): string {
  if (!d) return '—';
  const tz = getStoreTimezone();
  return parseUTCDate(d).toLocaleDateString('en-IN', { timeZone: tz, day: '2-digit', month: 'short', year: 'numeric' });
}
