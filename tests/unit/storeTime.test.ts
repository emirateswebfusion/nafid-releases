import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockDb = { prepare: vi.fn() };
vi.mock('../../electron/db/localDb.js', () => ({
  getDb: () => mockDb,
}));

const mockFindSetting = { get: vi.fn() };
vi.mock('../../electron/db/statements/storeTime.js', () => ({
  findOneSettingByKey: () => mockFindSetting,
}));

const {
  getStoreTimezoneSetting,
  getUtcRangeForStoreDateRange,
  localDate,
  localTimestamp,
  parseCleanDate,
  storeWallClockToUtc,
} = await import('../../electron/services/storeTime');

describe('storeTime service (main process)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockFindSetting.get.mockReturnValue(null);
  });

  describe('getStoreTimezoneSetting', () => {
    it('defaults to Asia/Kolkata when db or tenantId is missing or setting not found', () => {
      expect(getStoreTimezoneSetting(null)).toBe('Asia/Kolkata');
      expect(getStoreTimezoneSetting(mockDb as never, '')).toBe('Asia/Kolkata');
      mockFindSetting.get.mockReturnValue(null);
      expect(getStoreTimezoneSetting(mockDb as never, 'ten-1')).toBe('Asia/Kolkata');
    });

    it('parses JSON string setting or direct timezone string', () => {
      mockFindSetting.get.mockReturnValue({ value: JSON.stringify({ timezone: 'Asia/Dubai' }) });
      expect(getStoreTimezoneSetting(mockDb as never, 'ten-1')).toBe('Asia/Dubai');

      mockFindSetting.get.mockReturnValue({ value: 'Asia/Dubai' });
      expect(getStoreTimezoneSetting(mockDb as never, 'ten-1')).toBe('Asia/Dubai');

      mockFindSetting.get.mockReturnValue({ value: JSON.stringify('Asia/Riyadh') });
      expect(getStoreTimezoneSetting(mockDb as never, 'ten-1')).toBe('Asia/Riyadh');
    });
  });

  describe('storeWallClockToUtc', () => {
    it('converts store wall-clock time in Asia/Kolkata (+05:30) to correct UTC instant', () => {
      // 10:30 AM in IST (+05:30) is 05:00 UTC
      const utcDate = storeWallClockToUtc('2026-10-26', 10, 30, 0, 'Asia/Kolkata');
      expect(utcDate.toISOString()).toBe('2026-10-26T05:00:00.000Z');
    });

    it('converts store wall-clock time in Asia/Dubai (+04:00) to correct UTC instant', () => {
      // 10:30 AM in Dubai (+04:00) is 06:30 UTC
      const utcDate = storeWallClockToUtc('2026-10-26', 10, 30, 0, 'Asia/Dubai');
      expect(utcDate.toISOString()).toBe('2026-10-26T06:30:00.000Z');
    });
  });

  describe('localTimestamp and localDate', () => {
    it('returns ISO timestamp string', () => {
      const dt = new Date('2026-10-26T12:00:00.000Z');
      expect(localTimestamp(dt)).toBe('2026-10-26T12:00:00.000Z');
    });

    it('computes business date string in store timezone', () => {
      // 2026-10-26 at 20:00 UTC is 2026-10-27 in Asia/Kolkata (+5:30)
      const lateUtc = new Date('2026-10-26T20:00:00.000Z');
      mockFindSetting.get.mockReturnValue({ value: JSON.stringify({ timezone: 'Asia/Kolkata' }) });
      expect(localDate(lateUtc, 'ten-1')).toBe('2026-10-27');
    });
  });

  describe('parseCleanDate', () => {
    it('cleans YYYY-MM-DD or YYYY/MM/DD formats', () => {
      expect(parseCleanDate('2026/10/26', 'Asia/Kolkata')).toBe('2026-10-26');
      expect(parseCleanDate('2026-10-26T15:30:00Z', 'Asia/Kolkata')).toBe('2026-10-26');
    });

    it('converts a UTC timestamp to its selected shop date without changing date-only inputs', () => {
      expect(parseCleanDate('2026-10-28T23:00:00Z', 'Asia/Dubai')).toBe('2026-10-29');
      expect(parseCleanDate('2026-10-28 01:00:00', 'America/New_York')).toBe('2026-10-27');
      expect(parseCleanDate('2026-10-28', 'Asia/Dubai')).toBe('2026-10-28');
    });

    it('normalizes DD-MM-YYYY or DD/MM/YYYY dates into YYYY-MM-DD', () => {
      expect(parseCleanDate('26-10-2026', 'Asia/Kolkata')).toBe('2026-10-26');
      expect(parseCleanDate('26/10/2026', 'Asia/Kolkata')).toBe('2026-10-26');
    });
  });

  describe('getUtcRangeForStoreDateRange', () => {
    it('computes start-of-day and end-of-day UTC ISO bounds for store timezone', () => {
      mockFindSetting.get.mockReturnValue({ value: JSON.stringify({ timezone: 'Asia/Kolkata' }) });
      const { startUtc, endUtc } = getUtcRangeForStoreDateRange('2026-10-26', '2026-10-26', 'ten-1');
      // In Asia/Kolkata:
      // Start 2026-10-26 00:00:00 IST -> 2026-10-25T18:30:00.000Z
      // End 2026-10-26 23:59:59 IST -> 2026-10-26T18:29:59.999Z
      expect(startUtc).toBe('2026-10-25T18:30:00.000Z');
      expect(endUtc).toBe('2026-10-26T18:29:59.999Z');
    });
  });
});
