import { describe, it, expect } from 'vitest';
import {
  getFinancialYearForDate,
  getNextFinancialYear,
  getPreviousFinancialYear,
  getAvailableFinancialYears,
  generateSuggestedPrefix,
  parseFinancialYearsConfig,
  isDateInLockedFinancialYear,
} from '../../src/utils/time/financialYear';

describe('financialYear utility', () => {
  describe('India (IN) rules - April 1 to March 31', () => {
    it('determines FY for dates within the same calendar year but after April 1', () => {
      const fy = getFinancialYearForDate('2026-11-08', 'IN');
      expect(fy.id).toBe('2026-27');
      expect(fy.label).toBe('FY 2026-2027');
      expect(fy.shortLabel).toBe('FY 26-27');
      expect(fy.yearCode).toBe('2627');
      expect(fy.startDate).toBe('2026-04-01');
      expect(fy.endDate).toBe('2027-03-31');
    });

    it('determines FY for January/February/March dates', () => {
      const fy = getFinancialYearForDate('2026-03-15', 'IN');
      expect(fy.id).toBe('2025-26');
      expect(fy.label).toBe('FY 2025-2026');
      expect(fy.shortLabel).toBe('FY 25-26');
      expect(fy.startDate).toBe('2025-04-01');
      expect(fy.endDate).toBe('2026-03-31');
    });

    it('determines boundary date April 1 correctly', () => {
      const fy = getFinancialYearForDate('2026-04-01', 'IN');
      expect(fy.id).toBe('2026-27');
      expect(fy.startDate).toBe('2026-04-01');
    });

    it('determines boundary date March 31 correctly', () => {
      const fy = getFinancialYearForDate('2026-03-31', 'IN');
      expect(fy.id).toBe('2025-26');
      expect(fy.endDate).toBe('2026-03-31');
    });

    it('generates next and previous FY accurately', () => {
      const current = getFinancialYearForDate('2026-05-01', 'IN');
      const next = getNextFinancialYear(current, 'IN');
      expect(next.id).toBe('2027-28');
      expect(next.startDate).toBe('2027-04-01');
      expect(next.endDate).toBe('2028-03-31');

      const prev = getPreviousFinancialYear(current, 'IN');
      expect(prev.id).toBe('2025-26');
      expect(prev.startDate).toBe('2025-04-01');
      expect(prev.endDate).toBe('2026-03-31');
    });

    it('suggests clean document prefix', () => {
      const fy = getFinancialYearForDate('2026-08-15', 'IN');
      expect(generateSuggestedPrefix(fy, 'POS1', 'IN')).toBe('POS1-2627-');
      expect(generateSuggestedPrefix(fy, 'CTR2', 'IN')).toBe('CTR2-2627-');
    });
  });

  describe('UAE (AE) rules - January 1 to December 31', () => {
    it('determines FY for UAE calendar year', () => {
      const fy = getFinancialYearForDate('2026-07-20', 'AE');
      expect(fy.id).toBe('2026');
      expect(fy.label).toBe('FY 2026');
      expect(fy.shortLabel).toBe('FY 2026');
      expect(fy.yearCode).toBe('2026');
      expect(fy.startDate).toBe('2026-01-01');
      expect(fy.endDate).toBe('2026-12-31');
    });

    it('generates next and previous FY for UAE', () => {
      const current = getFinancialYearForDate('2026-01-10', 'AE');
      const next = getNextFinancialYear(current, 'AE');
      expect(next.id).toBe('2027');
      expect(next.startDate).toBe('2027-01-01');
      expect(next.endDate).toBe('2027-12-31');

      const prev = getPreviousFinancialYear(current, 'AE');
      expect(prev.id).toBe('2025');
      expect(prev.startDate).toBe('2025-01-01');
      expect(prev.endDate).toBe('2025-12-31');
    });

    it('suggests clean document prefix for UAE', () => {
      const fy = getFinancialYearForDate('2026-03-01', 'AE');
      expect(generateSuggestedPrefix(fy, 'DXB1', 'AE')).toBe('DXB1-2026-');
    });
  });

  describe('Financial years list and locking checks', () => {
    it('lists available financial years around current', () => {
      const list = getAvailableFinancialYears(2, 1, 'IN');
      expect(list.length).toBe(4);
    });

    it('parses financial years configuration with defaults', () => {
      const config = parseFinancialYearsConfig(null, 'IN');
      expect(config.lockPriorYears).toBe(true);
      expect(config.lockedYearIds).toEqual([]);
    });

    it('identifies dates in locked financial years', () => {
      const config = {
        activeYearId: '2026-27',
        lockPriorYears: true,
        lockedYearIds: ['2024-25', '2025-26'],
      };

      // 2025-02-10 is in FY 2024-25 which is locked
      expect(isDateInLockedFinancialYear('2025-02-10', config, 'IN')).toBe(true);

      // Date in active FY is not locked
      expect(isDateInLockedFinancialYear('2026-10-10', config, 'IN')).toBe(false);
    });
  });
});
