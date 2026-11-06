import { afterEach, expect, it } from 'vitest';
import { parseUTCDate, utcForWallClock } from '../../electron/utils/utc';
import { storeDate, storeTime, formatDateTime } from '../../src/utils/time/dateDisplay';
import { setStoreTimezone } from '../../src/utils/time/timezoneHelper';
import { setAppTimeFormat } from '../../src/utils/time/timeFormat';
import * as mobile from '../../../nafid-mobile app/src/utils/timezoneHelper';
afterEach(() => { setStoreTimezone('Asia/Kolkata'); setAppTimeFormat('12h'); });
it('parses UTC legacy fractions, explicit offsets and epoch zero', () => {
  expect(parseUTCDate('2026-11-04 20:15:00.1').toISOString()).toBe('2026-11-04T20:15:00.100Z');
  expect(parseUTCDate('2026-11-05T00:15:00+04:00').toISOString()).toBe('2026-11-04T20:15:00.000Z');
  expect(parseUTCDate(0).getTime()).toBe(0);
});
it('enforces selected display clock and preserves date-only labels', () => {
  setStoreTimezone('Asia/Dubai'); setAppTimeFormat('24h');
  expect(storeDate('2026-11-04 20:15:00','en-CA')).toBe('2026-11-05');
  expect(storeTime('2026-11-04 20:15:00','en-GB',{hour:'2-digit',minute:'2-digit',hour12:true})).toBe('00:15');
  setStoreTimezone('America/New_York');
  expect(storeDate('2026-11-05','en-CA')).toBe('2026-11-05');
  expect(formatDateTime(undefined)).toBe('—');
  expect(storeDate(undefined)).toBe('—');
  expect(storeTime(null)).toBe('—');
});
it('handles 23/25 hour days and deterministic DST input', () => {
  const day = (date: string) => utcForWallClock(date,'00:00','America/New_York').getTime();
  expect(day('2026-03-09')-day('2026-03-08')).toBe(23*3600000);
  expect(day('2026-11-02')-day('2026-11-01')).toBe(25*3600000);
  expect(utcForWallClock('2026-11-01','01:30','America/New_York').toISOString()).toBe('2026-11-01T05:30:00.000Z');
});
it('mobile and POS use the same shop clock for legacy timestamps', () => {
  for (const zone of ['Asia/Dubai','Asia/Kolkata','America/New_York']) {
    setStoreTimezone(zone); mobile.setStoreTimezone(zone);
    for (const format of ['12h','24h'] as const) {
      setAppTimeFormat(format); mobile.setStoreTimeFormat(format);
      expect(mobile.formatStoreDateTime('2026-11-04 20:15:00',{timeOnly:true})).toBe(storeTime('2026-11-04 20:15:00','en-GB',{hour:'2-digit',minute:'2-digit'}));
    }
  }
});
