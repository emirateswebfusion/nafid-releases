import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SUPPORTED_TIMEZONES,
  addCalendarDays,
  getStoreBusinessDate,
  storeWallClockToUtcIso,
  toStoreWallClock,
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

  it('accepts legacy object settings and resets an absent or invalid shop timezone', () => {
    setStoreTimezone({ timezone: 'Asia/Dubai' });
    expect(getStoreTimezone()).toBe('Asia/Dubai');
    setStoreTimezone(null);
    expect(getStoreTimezone()).toBe('Asia/Kolkata');
    setStoreTimezone('Invalid/Zone');
    expect(getStoreTimezone()).toBe('Asia/Kolkata');
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

describe('shop wall clock for date and time inputs', () => {
  it('bill 7488: 02/11 23:30 typed for an India shop is 18:00 UTC, whatever zone the PC is in', () => {
    expect(storeWallClockToUtcIso('2026-11-02', '23:30', 'Asia/Kolkata')).toBe('2026-11-02T18:00:00.000Z');
    expect(storeWallClockToUtcIso('2026-11-02', '23:30', 'Asia/Dubai')).toBe('2026-11-02T19:30:00.000Z');
    expect(storeWallClockToUtcIso('2026-11-02', '00:13', 'Asia/Kolkata')).toBe('2026-11-01T18:43:00.000Z');
  });
  it('shows a stored instant on the shop clock, also SQLite UTC text without a zone', () => {
    expect(toStoreWallClock('2026-11-01T20:13:00.000Z', 'Asia/Kolkata')).toEqual({ date: '2026-11-02', time: '01:43' });
    expect(toStoreWallClock('2026-11-02 18:00:00', 'Asia/Kolkata')).toEqual({ date: '2026-11-02', time: '23:30' });
    expect(toStoreWallClock('2026-11-02T18:00:00.000Z', 'Asia/Dubai')).toEqual({ date: '2026-11-02', time: '22:00' });
  });
  it('round-trips every quarter hour of a day, including daylight-saving days', () => {
    for (const [tz, day] of [['Asia/Kolkata', '2026-11-02'], ['Europe/London', '2026-03-29'], ['America/New_York', '2026-11-01']] as const) {
      for (let q = 0; q < 96; q++) {
        const time = `${String(Math.floor(q / 4)).padStart(2, '0')}:${String((q % 4) * 15).padStart(2, '0')}`;
        const back = toStoreWallClock(storeWallClockToUtcIso(day, time, tz), tz);
        // A time skipped by a daylight-saving jump moves forward; every other time comes back unchanged.
        if (back.date === day && back.time !== time) expect(back.time > time).toBe(true);
        else expect(back).toEqual({ date: day, time });
      }
    }
  });
  it('steps calendar days across months and years', () => {
    expect(addCalendarDays('2026-11-01', -1)).toBe('2026-10-31');
    expect(addCalendarDays('2026-12-31', 1)).toBe('2027-01-01');
  });
});
