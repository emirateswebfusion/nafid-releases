import { parseUTCDate, utcForWallClock } from './utc';
export {
  getTimezoneAbbreviation,
  formatTimezoneOptionLabel,
  getTimezoneOffsetMinutes,
  isDaylightSavingTime,
  formatUtcOffset,
  KNOWN_TIMEZONE_ABBREVIATIONS,
} from './timezoneFormatter';
/**
 * Timezone & UTC Helper Utility
 * Standardizes UTC storage in Database and localized presentation in Store Timezone.
 */

import { getStoreProfile } from '../localization/storeProfile';

// Legacy shops keep India unless a country is explicitly selected.
const DEFAULT_STORE_TIMEZONE = 'Asia/Kolkata';

export const SUPPORTED_TIMEZONES = [
  { value: 'Asia/Kolkata', label: 'India (IST - UTC+05:30)' },
  { value: 'Asia/Calcutta', label: 'India (IST - UTC+05:30)' },
  { value: 'Asia/Dubai', label: 'UAE / Dubai (GST - UTC+04:00)' },
  { value: 'Asia/Riyadh', label: 'Saudi Arabia (AST - UTC+03:00)' },
  { value: 'Asia/Muscat', label: 'Oman (GST - UTC+04:00)' },
  { value: 'Asia/Qatar', label: 'Qatar (AST - UTC+03:00)' },
  { value: 'Asia/Kuwait', label: 'Kuwait (AST - UTC+03:00)' },
  { value: 'Asia/Bahrain', label: 'Bahrain (AST - UTC+03:00)' },
  { value: 'Asia/Tokyo', label: 'Japan (JST - UTC+09:00)' },
  { value: 'Asia/Singapore', label: 'Singapore (SGT - UTC+08:00)' },
  { value: 'Australia/Sydney', label: 'Australia Eastern (AEST/AEDT - UTC+10:00)' },
  { value: 'Europe/London', label: 'UK (GMT/BST - UTC+00:00)' },
  { value: 'America/New_York', label: 'US Eastern (EST/EDT - UTC-05:00)' },
];

let activeStoreTimezone: string = DEFAULT_STORE_TIMEZONE;

export function normalizeStoreTimezone(value: unknown): string {
  let parsed = value;
  if (typeof parsed === 'string' && /^[{"]/.test(parsed)) {
    try { parsed = JSON.parse(parsed); } catch { return DEFAULT_STORE_TIMEZONE; }
  }
  const tz = typeof parsed === 'string' ? parsed : parsed && typeof parsed === 'object' && 'timezone' in parsed ? parsed.timezone : null;
  if (typeof tz !== 'string' || !tz) return getStoreProfile().timezone;
  try { new Intl.DateTimeFormat('en', { timeZone: tz }); return tz; } catch { return DEFAULT_STORE_TIMEZONE; }
}

export function setStoreTimezone(value: unknown) {
  const tz = normalizeStoreTimezone(value);
  if (tz) {
    activeStoreTimezone = tz;
    try {
      localStorage.setItem('app_store_timezone', tz);
    } catch { /* ignore */ }
  }
}

export function getStoreTimezone(): string {
  try {
    const saved = localStorage.getItem('app_store_timezone');
    if (saved) return normalizeStoreTimezone(saved);
  } catch { /* ignore */ }
  return activeStoreTimezone || DEFAULT_STORE_TIMEZONE;
}


/**
 * Returns current business date in Store Timezone (YYYY-MM-DD)
 */
export function getStoreBusinessDate(timeZone: string = getStoreTimezone(), value: Date | string | number = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(parseUTCDate(value));
}

/** An instant from a Date, epoch ms, ISO text, or SQLite UTC text without a zone ("2026-11-02 18:37:00"). */
function toInstant(value: Date | string | number): Date {
  if (value instanceof Date || typeof value === 'number') return new Date(value);
  const s = String(value).trim();
  const zoned = /(Z|[+-]\d{2}:?\d{2})$/i.test(s);
  return new Date(zoned ? s : `${s.replace(' ', 'T')}Z`);
}

/**
 * The shop's wall clock for an instant: date `YYYY-MM-DD` and time `HH:mm` in the store timezone, never the PC's.
 * Date and time pickers show this, so a bill entered on a PC set to another zone keeps the shop's date and time.
 */
export function toStoreWallClock(value: Date | string | number = new Date(), timeZone: string = getStoreTimezone()): { date: string; time: string } {
  const d = toInstant(value);
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(isNaN(d.getTime()) ? new Date() : d).map((p) => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

/** The UTC ISO instant of a wall-clock date (`YYYY-MM-DD`) and time (`HH:mm`) in the store timezone. */
export function storeWallClockToUtcIso(date: string, time: string = '00:00', timeZone: string = getStoreTimezone()): string {
  return utcForWallClock(date, time || '00:00', timeZone).toISOString();
}

/** The calendar date `days` after (or before, when negative) a `YYYY-MM-DD` date. */
export function addCalendarDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Synthetic local Date for calendar arithmetic only, never timestamp storage. */
export function storeCalendarDate(value: Date | string | number = new Date()): Date {
  const day = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : getStoreBusinessDate(getStoreTimezone(), value);
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}
export function calendarDateKey(value: Date): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}
