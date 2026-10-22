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

/**
 * Returns current business date in Store Timezone (YYYY-MM-DD)
 */
export function getStoreBusinessDate(timeZone: string = getStoreTimezone()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date());
}

/**
 * Converts any UTC date/timestamp to Store Business Date string (YYYY-MM-DD)
 */

/**
 * Internal robust date parser that handles UTC ISO, timestamps, and store wall-clock strings
 */

/**
 * Calculates start and end UTC ISO strings for a business date (YYYY-MM-DD) in store timezone
 */

/**
 * Calculates start and end UTC ISO strings for a custom date range (YYYY-MM-DD to YYYY-MM-DD) in store timezone
 */

/**
 * Formats a UTC timestamp into readable store date and time
 */
