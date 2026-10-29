/**
 * Timezone & UTC Helper Utility
 * Standardizes UTC storage in Database and localized presentation in Store Timezone.
 */

// Default store timezone (India IST)
const DEFAULT_STORE_TIMEZONE = 'Asia/Kolkata';

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

export function normalizeStoreTimezone(value: unknown): string {
  let parsed = value;
  if (typeof parsed === 'string' && /^[{"]/.test(parsed)) {
    try { parsed = JSON.parse(parsed); } catch { return DEFAULT_STORE_TIMEZONE; }
  }
  const tz = typeof parsed === 'string' ? parsed : parsed && typeof parsed === 'object' && 'timezone' in parsed ? parsed.timezone : null;
  if (typeof tz !== 'string' || !tz) return DEFAULT_STORE_TIMEZONE;
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
export function getStoreBusinessDate(timeZone: string = getStoreTimezone()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date());
}
