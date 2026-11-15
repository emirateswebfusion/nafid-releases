/**
 * Centralized Timezone Abbreviation Formatter
 * Resolves standard, internationally recognized timezone abbreviations
 * according to timezone and actual date, accounting for Daylight Saving Time (DST).
 */

import { parseUTCDate } from './utc';

export interface TimezoneEntry {
  standard: string;
  daylight?: string;
}

/**
 * Standard, internationally recognized timezone abbreviations.
 * Maps IANA identifiers and standard aliases to standard and daylight codes.
 */
export const KNOWN_TIMEZONE_ABBREVIATIONS: Record<string, TimezoneEntry> = {
  // India & South Asia
  'Asia/Calcutta': { standard: 'IST' },
  'Asia/Kolkata': { standard: 'IST' },
  'Asia/Colombo': { standard: 'IST' },
  'Asia/Karachi': { standard: 'PKT' },
  'Asia/Dhaka': { standard: 'BST' },
  'Asia/Kathmandu': { standard: 'NPT' },

  // UAE, Gulf & Middle East
  'Asia/Dubai': { standard: 'GST' },
  'Asia/Muscat': { standard: 'GST' },
  'Asia/Riyadh': { standard: 'AST' },
  'Asia/Qatar': { standard: 'AST' },
  'Asia/Kuwait': { standard: 'AST' },
  'Asia/Bahrain': { standard: 'AST' },
  'Asia/Aden': { standard: 'AST' },
  'Asia/Baghdad': { standard: 'AST' },

  // UK & Ireland
  'Europe/London': { standard: 'GMT', daylight: 'BST' },
  'GB': { standard: 'GMT', daylight: 'BST' },
  'Europe/Dublin': { standard: 'GMT', daylight: 'IST' },

  // United States & Canada
  'America/New_York': { standard: 'EST', daylight: 'EDT' },
  'US/Eastern': { standard: 'EST', daylight: 'EDT' },
  'America/Detroit': { standard: 'EST', daylight: 'EDT' },
  'America/Toronto': { standard: 'EST', daylight: 'EDT' },
  'America/Chicago': { standard: 'CST', daylight: 'CDT' },
  'US/Central': { standard: 'CST', daylight: 'CDT' },
  'America/Denver': { standard: 'MST', daylight: 'MDT' },
  'US/Mountain': { standard: 'MST', daylight: 'MDT' },
  'America/Phoenix': { standard: 'MST' }, // Arizona: no DST
  'America/Los_Angeles': { standard: 'PST', daylight: 'PDT' },
  'US/Pacific': { standard: 'PST', daylight: 'PDT' },
  'America/Anchorage': { standard: 'AKST', daylight: 'AKDT' },
  'US/Alaska': { standard: 'AKST', daylight: 'AKDT' },
  'Pacific/Honolulu': { standard: 'HST' }, // Hawaii: no DST
  'US/Hawaii': { standard: 'HST' },

  // East & Southeast Asia
  'Asia/Tokyo': { standard: 'JST' },
  'Japan': { standard: 'JST' },
  'Asia/Singapore': { standard: 'SGT' },
  'Singapore': { standard: 'SGT' },
  'Asia/Hong_Kong': { standard: 'HKT' },
  'Hongkong': { standard: 'HKT' },
  'Asia/Shanghai': { standard: 'CST' },
  'Asia/Taipei': { standard: 'CST' },
  'Asia/Seoul': { standard: 'KST' },
  'ROK': { standard: 'KST' },
  'Asia/Bangkok': { standard: 'ICT' },
  'Asia/Jakarta': { standard: 'WIB' },
  'Asia/Makassar': { standard: 'WITA' },
  'Asia/Jayapura': { standard: 'WIT' },
  'Asia/Manila': { standard: 'PHT' },
  'Asia/Kuala_Lumpur': { standard: 'MYT' },

  // Australia & New Zealand
  'Australia/Sydney': { standard: 'AEST', daylight: 'AEDT' },
  'Australia/Melbourne': { standard: 'AEST', daylight: 'AEDT' },
  'Australia/Canberra': { standard: 'AEST', daylight: 'AEDT' },
  'Australia/Hobart': { standard: 'AEST', daylight: 'AEDT' },
  'Australia/Brisbane': { standard: 'AEST' }, // Queensland: no DST
  'Australia/Adelaide': { standard: 'ACST', daylight: 'ACDT' },
  'Australia/Darwin': { standard: 'ACST' }, // Northern Territory: no DST
  'Australia/Perth': { standard: 'AWST' }, // Western Australia: no DST
  'Pacific/Auckland': { standard: 'NZST', daylight: 'NZDT' },

  // Europe (Central & Eastern)
  'Europe/Paris': { standard: 'CET', daylight: 'CEST' },
  'Europe/Berlin': { standard: 'CET', daylight: 'CEST' },
  'Europe/Rome': { standard: 'CET', daylight: 'CEST' },
  'Europe/Madrid': { standard: 'CET', daylight: 'CEST' },
  'Europe/Amsterdam': { standard: 'CET', daylight: 'CEST' },
  'Europe/Brussels': { standard: 'CET', daylight: 'CEST' },
  'Europe/Vienna': { standard: 'CET', daylight: 'CEST' },
  'Europe/Zurich': { standard: 'CET', daylight: 'CEST' },
  'Europe/Stockholm': { standard: 'CET', daylight: 'CEST' },
  'Europe/Oslo': { standard: 'CET', daylight: 'CEST' },
  'Europe/Copenhagen': { standard: 'CET', daylight: 'CEST' },
  'Europe/Warsaw': { standard: 'CET', daylight: 'CEST' },
  'Europe/Prague': { standard: 'CET', daylight: 'CEST' },
  'Europe/Athens': { standard: 'EET', daylight: 'EEST' },
  'Europe/Helsinki': { standard: 'EET', daylight: 'EEST' },
  'Europe/Bucharest': { standard: 'EET', daylight: 'EEST' },

  // UTC / GMT
  'UTC': { standard: 'UTC' },
  'GMT': { standard: 'GMT' },
  'Etc/UTC': { standard: 'UTC' },
  'Etc/GMT': { standard: 'GMT' },
};

/**
 * Calculates the wall-clock offset in minutes from UTC for a given instant and timezone.
 * Uses Intl.DateTimeFormat to remain independent of the host computer's local timezone.
 */
export function getTimezoneOffsetMinutes(date: Date, timeZone: string): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hourCycle: 'h23',
    }).formatToParts(date);

    let y = 0, m = 0, d = 0, h = 0, min = 0, s = 0;
    for (const p of parts) {
      if (p.type === 'year') y = Number(p.value);
      else if (p.type === 'month') m = Number(p.value);
      else if (p.type === 'day') d = Number(p.value);
      else if (p.type === 'hour') h = Number(p.value);
      else if (p.type === 'minute') min = Number(p.value);
      else if (p.type === 'second') s = Number(p.value);
    }
    const asUtc = Date.UTC(y, m - 1, d, h, min, s);
    return Math.round((asUtc - date.getTime()) / 60000);
  } catch {
    return 0;
  }
}

/**
 * Determines whether Daylight Saving Time (DST) is active for a date in a timezone.
 * Samples opposite seasons (January & July) in the same calendar year to find the
 * timezone's standard baseline offset.
 */
export function isDaylightSavingTime(date: Date, timeZone: string): boolean {
  try {
    const year = date.getUTCFullYear();
    const jan = new Date(Date.UTC(year, 0, 15, 12, 0, 0));
    const jul = new Date(Date.UTC(year, 6, 15, 12, 0, 0));
    const offsetJan = getTimezoneOffsetMinutes(jan, timeZone);
    const offsetJul = getTimezoneOffsetMinutes(jul, timeZone);
    if (offsetJan === offsetJul) return false;
    const standardOffset = Math.min(offsetJan, offsetJul);
    return getTimezoneOffsetMinutes(date, timeZone) > standardOffset;
  } catch {
    return false;
  }
}

/**
 * Format a minute offset into a clean UTC offset label (e.g. UTC+05:30 or UTC-05:00).
 */
export function formatUtcOffset(offsetMinutes: number): string {
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMinutes);
  const hours = String(Math.floor(abs / 60)).padStart(2, '0');
  const minutes = String(abs % 60).padStart(2, '0');
  return `UTC${sign}${hours}:${minutes}`;
}

/**
 * Resolves the standard timezone abbreviation for a given IANA timezone and date.
 * If the timezone has Daylight Saving Time, resolves to either the standard or
 * daylight abbreviation according to the actual date instant.
 *
 * For unknown or ambiguous timezones without a standard abbreviation, falls back
 * to a clean UTC offset string without inventing abbreviations.
 */
export function getTimezoneAbbreviation(
  timeZone?: string | null,
  date: Date | string | number = new Date()
): string {
  if (!timeZone || typeof timeZone !== 'string') return 'UTC';

  const cleanTz = timeZone.trim();
  const instant = parseUTCDate(date);
  const validDate = isNaN(instant.getTime()) ? new Date() : instant;

  const entry = KNOWN_TIMEZONE_ABBREVIATIONS[cleanTz];
  if (entry) {
    if (entry.daylight) {
      return isDaylightSavingTime(validDate, cleanTz) ? entry.daylight : entry.standard;
    }
    return entry.standard;
  }

  // Attempt Intl short timeZoneName if it returns an internationally recognized abbreviation
  try {
    const raw = new Intl.DateTimeFormat('en-US', { timeZone: cleanTz, timeZoneName: 'short' })
      .formatToParts(validDate)
      .find((p) => p.type === 'timeZoneName')?.value;
    if (raw && /^[A-Z]{2,5}$/.test(raw) && raw !== 'GMT') {
      return raw;
    }
  } catch {
    // Continue to UTC offset fallback
  }

  // Clear UTC offset fallback for ambiguous or unmapped regions
  try {
    const offsetMinutes = getTimezoneOffsetMinutes(validDate, cleanTz);
    return formatUtcOffset(offsetMinutes);
  } catch {
    return cleanTz;
  }
}

/**
 * Generates an option label for timezone select dropdowns (e.g. Settings).
 * Example: 'India (IST - UTC+05:30)' or 'Japan (JST - UTC+09:00)'
 */
export function formatTimezoneOptionLabel(timeZone: string, regionName?: string): string {
  const now = new Date();
  const entry = KNOWN_TIMEZONE_ABBREVIATIONS[timeZone];
  const offsetStr = formatUtcOffset(getTimezoneOffsetMinutes(now, timeZone));
  const abbr = entry ? (entry.daylight ? `${entry.standard}/${entry.daylight}` : entry.standard) : getTimezoneAbbreviation(timeZone, now);
  const region = regionName || timeZone.split('/')[1]?.replace(/_/g, ' ') || timeZone;
  return `${region} (${abbr} - ${offsetStr})`;
}
