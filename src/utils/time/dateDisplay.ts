import { getStoreProfile } from '../localization/storeProfile';
import { getStoreTimezone } from './timezoneHelper';
import { parseUTCDate } from './utc';
import { getAppTimeFormat } from './timeFormat';
type DateValue = Date | string | number | null | undefined;
function display(value: DateValue, kind: 'date' | 'time' | 'datetime', locales?: Intl.LocalesArgument, options: Intl.DateTimeFormatOptions = {}): string {
  if (value === null || value === undefined || value === '') return '—';
  const instant = parseUTCDate(value);
  if (Number.isNaN(instant.getTime())) return '—';
  const dateOnly = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
  const format = { ...options, timeZone: dateOnly ? 'UTC' : getStoreTimezone(), ...(kind !== 'date' || options.hour || options.timeStyle ? { hour12: getAppTimeFormat() !== '24h' } : {}) };
  const locale = locales || getStoreProfile().locale;
  return kind === 'date' ? instant.toLocaleDateString(locale, format) : kind === 'time' ? instant.toLocaleTimeString(locale, format) : instant.toLocaleString(locale, format);
}
export function storeDate(value: DateValue, locales?: Intl.LocalesArgument, options?: Intl.DateTimeFormatOptions): string { return display(value, 'date', locales, options); }
export function storeTime(value: DateValue, locales?: Intl.LocalesArgument, options?: Intl.DateTimeFormatOptions): string { return display(value, 'time', locales, options); }
export function storeDateTime(value: DateValue, locales?: Intl.LocalesArgument, options?: Intl.DateTimeFormatOptions): string { return display(value, 'datetime', locales, options); }
export function formatDateTime(value: DateValue): string { return display(value, 'datetime', undefined, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
export function formatShortDate(value: DateValue): string { return display(value, 'date', undefined, { day: '2-digit', month: 'short', year: 'numeric' }); }
