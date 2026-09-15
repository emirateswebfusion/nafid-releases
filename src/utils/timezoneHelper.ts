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
 * Converts any UTC date/timestamp to Store Business Date string (YYYY-MM-DD)
 */
export function utcToStoreDate(dateInput?: string | Date | number | null, timeZone: string = getStoreTimezone()): string {
  if (!dateInput) {
    const d = new Date();
    return new Intl.DateTimeFormat('en-CA', { timeZone }).format(d);
  }
  const str = String(dateInput).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;

  const d = new Date(dateInput);
  if (isNaN(d.getTime())) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: getStoreTimezone() }).format(new Date());
  }
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(d);
}

/**
 * Formats a UTC timestamp into readable store date and time
 */
export function formatStoreDateTime(
  dateInput?: string | Date | number | null,
  options?: { timeZone?: string; is12h?: boolean; dateOnly?: boolean; timeOnly?: boolean }
): string {
  if (!dateInput) return '—';
  const d = new Date(dateInput);
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
