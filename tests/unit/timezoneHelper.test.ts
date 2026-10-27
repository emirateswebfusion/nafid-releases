import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SUPPORTED_TIMEZONES,
  getStoreBusinessDate,
  getStoreTimezone,
  setStoreTimezone,
} from '../../src/utils/time/timezoneHelper';
import { formatDateTime, formatShortDate } from '../../src/utils/time/dateDisplay';
import { parseUTCDate } from '../../src/utils/print/receiptGenerator';

describe('timezoneHelper', () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
      clear: () => store.clear(),
    });
    setStoreTimezone('Asia/Kolkata');
  });

  it('lists supported timezones including Asia/Kolkata and Asia/Dubai', () => {
    expect(SUPPORTED_TIMEZONES.some((tz) => tz.value === 'Asia/Kolkata')).toBe(true);
    expect(SUPPORTED_TIMEZONES.some((tz) => tz.value === 'Asia/Dubai')).toBe(true);
  });

  it('persists store timezone in localStorage and retrieves it', () => {
    setStoreTimezone('Asia/Dubai');
    expect(getStoreTimezone()).toBe('Asia/Dubai');
    expect(store.get('app_store_timezone')).toBe('Asia/Dubai');
  });

  it('computes business date in the selected store timezone', () => {
    // 2026-10-26 at 20:00:00 UTC
    // In Asia/Kolkata (+5:30) it is 2026-10-27 01:30
    // In America/New_York (-4:00 EDT) it is 2026-10-26 16:00
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-26T20:00:00Z'));

    expect(getStoreBusinessDate('Asia/Kolkata')).toBe('2026-10-27');
    expect(getStoreBusinessDate('UTC')).toBe('2026-10-26');
    expect(getStoreBusinessDate('America/New_York')).toBe('2026-10-26');

    vi.useRealTimers();
  });
});

describe('dateDisplay', () => {
  beforeEach(() => {
    setStoreTimezone('Asia/Kolkata');
  });

  it('returns em-dash for null, undefined, or empty date strings', () => {
    expect(formatDateTime(null)).toBe('—');
    expect(formatDateTime(undefined)).toBe('—');
    expect(formatDateTime('')).toBe('—');
    expect(formatShortDate(null)).toBe('—');
    expect(formatShortDate(undefined)).toBe('—');
    expect(formatShortDate('')).toBe('—');
  });

  it('formats UTC ISO timestamp into store timezone localized string', () => {
    // 2026-10-26T04:00:00Z in Asia/Kolkata (+5:30) is 09:30 AM
    const res = formatDateTime('2026-10-26T04:00:00Z');
    expect(res).toContain('26');
    expect(res).toContain('Oct');
    expect(res).toContain('2026');
    expect(res).toMatch(/09:30/);
  });

  it('formats short date in store timezone', () => {
    const res = formatShortDate('2026-10-26T04:00:00Z');
    expect(res).toContain('26');
    expect(res).toContain('Oct');
    expect(res).toContain('2026');
  });
});

describe('parseUTCDate', () => {
  it('parses YYYY-MM-DD as UTC midnight', () => {
    const d = parseUTCDate('2026-10-26');
    expect(d.getUTCFullYear()).toBe(2026);
    expect(d.getUTCMonth()).toBe(9); // 0-indexed October
    expect(d.getUTCDate()).toBe(26);
    expect(d.getUTCHours()).toBe(0);
    expect(d.getUTCMinutes()).toBe(0);
  });

  it('parses standard SQLite datetime space-separated string as UTC', () => {
    const d = parseUTCDate('2026-10-26 14:30:45');
    expect(d.getUTCFullYear()).toBe(2026);
    expect(d.getUTCMonth()).toBe(9);
    expect(d.getUTCDate()).toBe(26);
    expect(d.getUTCHours()).toBe(14);
    expect(d.getUTCMinutes()).toBe(30);
    expect(d.getUTCSeconds()).toBe(45);
  });

  it('handles Date instances and numeric timestamps', () => {
    const now = new Date('2026-10-26T12:00:00Z');
    expect(parseUTCDate(now)).toBe(now);
    expect(parseUTCDate(now.getTime()).toISOString()).toBe(now.toISOString());
  });

  it('returns current date for empty, null, or undefined input', () => {
    const before = Date.now();
    const d = parseUTCDate(null);
    const after = Date.now();
    expect(d.getTime()).toBeGreaterThanOrEqual(before);
    expect(d.getTime()).toBeLessThanOrEqual(after);
  });
});
