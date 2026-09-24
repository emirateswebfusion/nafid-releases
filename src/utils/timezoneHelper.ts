/**
 * Timezone & UTC Helper Utility
 * Standardizes UTC storage in Database and localized presentation in Store Timezone.
 */

// Default store timezone (India IST)
export const DEFAULT_STORE_TIMEZONE = 'Asia/Kolkata';

export const SUPPORTED_TIMEZONES = [
  { value: 'Asia/Kolkata', label: 'India (IST - UTC+05:30)' },
  { value: 'Asia/Dubai', label: 'UAE / Dubai (GST - UTC+04:00)' },
  { value: 'Asia/Riyadh', label: 'Saudi Arabia (AST - UTC+03:00)' },
  { value: 'Asia/Muscat', label: 'Oman (GST - UTC+04:00)' },
  { value: 'Asia/Qatar', label: 'Qatar (AST - UTC+03:00)' },
  { value: 'Asia/Kuwait', label: 'Kuwait (AST - UTC+03:00)' },
  { value: 'Asia/Bahrain', label: 'Bahrain (AST - UTC+03:00)' },
  { value: 'Europe/London', label: 'UK (GMT/BST - UTC+00:00)' },
  { value: 'America/New_York', label: 'US Eastern (EST/EDT - UTC-05:00)' },
];

let activeStoreTimezone: string = DEFAULT_STORE_TIMEZONE;

export function setStoreTimezone(tz: string) {
  if (tz) {
    activeStoreTimezone = tz;
    try {
      localStorage.setItem('app_store_timezone', tz);
    } catch {}
  }
}

export function getStoreTimezone(): string {
  try {
    const saved = localStorage.getItem('app_store_timezone');
    if (saved) return saved;
  } catch {}
  return activeStoreTimezone || DEFAULT_STORE_TIMEZONE;
}

/**
 * Returns current instant in UTC ISO 8601 string format
 */
export function nowUTC(): string {
  return new Date().toISOString();
}

/**
 * Returns current business date in Store Timezone (YYYY-MM-DD)
 */
export function getStoreBusinessDate(timeZone: string = getStoreTimezone()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date());
}

/**
 * Converts any UTC date/timestamp to Store Business Date string (YYYY-MM-DD)
 */
export function utcToStoreDate(dateInput?: string | Date | number | null, timeZone: string = getStoreTimezone()): string {
  if (!dateInput) {
    return getStoreBusinessDate(timeZone);
  }
  const str = String(dateInput).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;

  const d = parseToDate(dateInput, timeZone);
  if (isNaN(d.getTime())) {
    return getStoreBusinessDate(timeZone);
  }
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(d);
}

/**
 * Internal robust date parser that handles UTC ISO, timestamps, and store wall-clock strings
 */
function parseToDate(dateInput: Date | string | number | null | undefined, timeZone: string = getStoreTimezone()): Date {
  if (!dateInput) return new Date();
  if (dateInput instanceof Date) return dateInput;
  if (typeof dateInput === 'number') return new Date(dateInput);

  let dateStr = String(dateInput).trim();
  if (!dateStr) return new Date();

  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  }

  // If string explicitly contains UTC 'Z' or offset like +04:00, parse absolute instant
  if (/Z$/i.test(dateStr) || /[\+\-]\d{2}:?\d{2}$/.test(dateStr)) {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) return d;
  }

  // Standard SQL / SQLite datetime stored in UTC (e.g. "YYYY-MM-DD HH:mm:ss" or "YYYY-MM-DDTHH:mm:ss")
  const match = dateStr.match(/^(\d{4})[-/](\d{2})[-/](\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2}))?(?:\.(\d+))?/);
  if (match) {
    const [_, y, m, d, hh, mm, ss, ms] = match;
    return new Date(Date.UTC(
      Number(y),
      Number(m) - 1,
      Number(d),
      Number(hh),
      Number(mm),
      Number(ss || 0),
      Number((ms || '0').substring(0, 3))
    ));
  }

  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? new Date() : d;
}

function parseWallClockToUtc(dateStr: string, isEnd: boolean, timeZone: string = getStoreTimezone()): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  const targetH = isEnd ? 23 : 0;
  const targetMin = isEnd ? 59 : 0;
  const targetSec = isEnd ? 59 : 0;

  const baseUtc = new Date(Date.UTC(y, m - 1, d, targetH, targetMin, targetSec));
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false,
    });
    const parts = Object.fromEntries(formatter.formatToParts(baseUtc).map(p => [p.type, p.value]));
    let h = parseInt(parts.hour, 10);
    if (h === 24) h = 0;
    const tzAsUtc = Date.UTC(
      parseInt(parts.year, 10),
      parseInt(parts.month, 10) - 1,
      parseInt(parts.day, 10),
      h,
      parseInt(parts.minute, 10),
      parseInt(parts.second, 10)
    );
    const offsetMs = tzAsUtc - baseUtc.getTime();
    const resolved = new Date(baseUtc.getTime() - offsetMs);
    return isEnd ? new Date(resolved.getTime() + 999) : resolved;
  } catch {
    return baseUtc;
  }
}

/**
 * Calculates start and end UTC ISO strings for a business date (YYYY-MM-DD) in store timezone
 */
export function getBusinessDayUtcRange(dateStr?: string, timeZone: string = getStoreTimezone()): { startUtc: string; endUtc: string } {
  const targetDate = dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? dateStr : getStoreBusinessDate(timeZone);
  const startLocal = parseWallClockToUtc(targetDate, false, timeZone);
  const endLocal = parseWallClockToUtc(targetDate, true, timeZone);

  return {
    startUtc: startLocal.toISOString(),
    endUtc: endLocal.toISOString(),
  };
}

/**
 * Calculates start and end UTC ISO strings for a custom date range (YYYY-MM-DD to YYYY-MM-DD) in store timezone
 */
export function getBusinessDateRangeUtc(fromDate?: string, toDate?: string, timeZone: string = getStoreTimezone()): { startUtc: string; endUtc: string } {
  const startDay = fromDate || toDate || getStoreBusinessDate(timeZone);
  const endDay = toDate || fromDate || getStoreBusinessDate(timeZone);

  const { startUtc } = getBusinessDayUtcRange(startDay, timeZone);
  const { endUtc } = getBusinessDayUtcRange(endDay, timeZone);

  return { startUtc, endUtc };
}

/**
 * Formats a UTC timestamp into readable store date and time
 */
export function formatStoreDateTime(
  dateInput?: string | Date | number | null,
  options?: { timeZone?: string; is12h?: boolean; dateOnly?: boolean; timeOnly?: boolean }
): string {
  if (!dateInput) return '—';
  const d = parseToDate(dateInput, options?.timeZone || getStoreTimezone());
  if (isNaN(d.getTime())) return String(dateInput);

  const tz = options?.timeZone || getStoreTimezone();
  const is12h = options?.is12h !== false;

  if (options?.dateOnly) {
    return d.toLocaleDateString('en-IN', { timeZone: tz, day: '2-digit', month: 'short', year: 'numeric' });
  }

  if (options?.timeOnly) {
    return d.toLocaleTimeString('en-IN', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: is12h });
  }

  const datePart = d.toLocaleDateString('en-IN', { timeZone: tz, day: '2-digit', month: 'short', year: 'numeric' });
  const timePart = d.toLocaleTimeString('en-IN', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: is12h });
  return `${datePart} ${timePart}`;
}
