import { getStoreCountry, type StoreCountry } from '../localization/storeProfile';
import { parseUTCDate } from './utc';

export interface FinancialYear {
  id: string; // e.g. '2026-27' or '2026'
  label: string; // e.g. 'FY 2026-2027' or 'FY 2026'
  shortLabel: string; // e.g. 'FY 26-27' or 'FY 2026'
  yearCode: string; // e.g. '2627' or '2026'
  startDate: string; // YYYY-MM-DD (e.g. '2026-04-01' or '2026-01-01')
  endDate: string; // YYYY-MM-DD (e.g. '2027-03-31' or '2026-12-31')
  isLocked?: boolean;
}

export interface FinancialYearsConfig {
  activeYearId: string;
  lockPriorYears: boolean;
  lockedYearIds: string[];
  updatedAt?: string;
}

export const FINANCIAL_YEARS_CONFIG_KEY = 'financial_years_config';

/**
 * Returns the financial year details for a specific date and country.
 * - India (IN): April 1 of year Y to March 31 of year Y+1.
 * - UAE (AE) / Other: January 1 of year Y to December 31 of year Y.
 */
export function getFinancialYearForDate(
  dateInput: Date | string | number = new Date(),
  country: StoreCountry = getStoreCountry()
): FinancialYear {
  const d = parseUTCDate(dateInput);
  const year = d.getFullYear();
  const month = d.getMonth(); // 0-indexed: 0 = Jan, 2 = Mar, 3 = Apr, 11 = Dec

  if (country === 'IN') {
    // If month is Jan, Feb, Mar (0, 1, 2), FY belongs to (year - 1) to year
    const startYear = month < 3 ? year - 1 : year;
    const endYear = startYear + 1;
    const startShort = String(startYear).slice(-2);
    const endShort = String(endYear).slice(-2);

    return {
      id: `${startYear}-${endShort}`,
      label: `FY ${startYear}-${endYear}`,
      shortLabel: `FY ${startShort}-${endShort}`,
      yearCode: `${startShort}${endShort}`,
      startDate: `${startYear}-04-01`,
      endDate: `${endYear}-03-31`,
    };
  }

  // UAE (Calendar year)
  return {
    id: `${year}`,
    label: `FY ${year}`,
    shortLabel: `FY ${year}`,
    yearCode: `${year}`,
    startDate: `${year}-01-01`,
    endDate: `${year}-12-31`,
  };
}

/**
 * Returns the current active financial year based on current store date.
 */
export function getCurrentFinancialYear(country: StoreCountry = getStoreCountry()): FinancialYear {
  return getFinancialYearForDate(new Date(), country);
}

/**
 * Returns the immediate next financial year relative to a given financial year.
 */
export function getNextFinancialYear(
  current: FinancialYear,
  country: StoreCountry = getStoreCountry()
): FinancialYear {
  const [startYearStr] = current.startDate.split('-');
  const nextStartYear = parseInt(startYearStr, 10) + 1;

  if (country === 'IN') {
    const nextEndYear = nextStartYear + 1;
    const startShort = String(nextStartYear).slice(-2);
    const endShort = String(nextEndYear).slice(-2);
    return {
      id: `${nextStartYear}-${endShort}`,
      label: `FY ${nextStartYear}-${nextEndYear}`,
      shortLabel: `FY ${startShort}-${endShort}`,
      yearCode: `${startShort}${endShort}`,
      startDate: `${nextStartYear}-04-01`,
      endDate: `${nextEndYear}-03-31`,
    };
  }

  return {
    id: `${nextStartYear}`,
    label: `FY ${nextStartYear}`,
    shortLabel: `FY ${nextStartYear}`,
    yearCode: `${nextStartYear}`,
    startDate: `${nextStartYear}-01-01`,
    endDate: `${nextStartYear}-12-31`,
  };
}

/**
 * Returns the immediate previous financial year relative to a given financial year.
 */
export function getPreviousFinancialYear(
  current: FinancialYear,
  country: StoreCountry = getStoreCountry()
): FinancialYear {
  const [startYearStr] = current.startDate.split('-');
  const prevStartYear = parseInt(startYearStr, 10) - 1;

  if (country === 'IN') {
    const prevEndYear = prevStartYear + 1;
    const startShort = String(prevStartYear).slice(-2);
    const endShort = String(prevEndYear).slice(-2);
    return {
      id: `${prevStartYear}-${endShort}`,
      label: `FY ${prevStartYear}-${prevEndYear}`,
      shortLabel: `FY ${startShort}-${endShort}`,
      yearCode: `${startShort}${endShort}`,
      startDate: `${prevStartYear}-04-01`,
      endDate: `${prevEndYear}-03-31`,
    };
  }

  return {
    id: `${prevStartYear}`,
    label: `FY ${prevStartYear}`,
    shortLabel: `FY ${prevStartYear}`,
    yearCode: `${prevStartYear}`,
    startDate: `${prevStartYear}-01-01`,
    endDate: `${prevStartYear}-12-31`,
  };
}

/**
 * Generates a list of recent financial years (e.g. past 3 years + current year + next year).
 */
export function getAvailableFinancialYears(
  countBack: number = 3,
  countForward: number = 1,
  country: StoreCountry = getStoreCountry()
): FinancialYear[] {
  const current = getCurrentFinancialYear(country);
  const years: FinancialYear[] = [];

  // Previous years
  let walker = current;
  const pastList: FinancialYear[] = [];
  for (let i = 0; i < countBack; i++) {
    walker = getPreviousFinancialYear(walker, country);
    pastList.unshift(walker);
  }

  years.push(...pastList);
  years.push(current);

  // Future years
  walker = current;
  for (let i = 0; i < countForward; i++) {
    walker = getNextFinancialYear(walker, country);
    years.push(walker);
  }

  return years;
}

/**
 * Generates a suggested document prefix for a financial year and terminal code.
 * e.g., India: 'POS1-2627-' or '26-27/'
 * e.g., UAE: 'POS1-2026-'
 */
export function generateSuggestedPrefix(
  fy: FinancialYear,
  terminalCode: string = 'POS1',
  country: StoreCountry = getStoreCountry()
): string {
  const cleanCode = terminalCode.trim().replace(/[^A-Z0-9]/gi, '').toUpperCase() || 'POS1';
  if (country === 'IN') {
    return `${cleanCode}-${fy.yearCode}-`;
  }
  return `${cleanCode}-${fy.yearCode}-`;
}

/**
 * Safely parses the stored financial years config.
 */
export function parseFinancialYearsConfig(raw: unknown, country: StoreCountry = getStoreCountry()): FinancialYearsConfig {
  const current = getCurrentFinancialYear(country);
  const defaultConfig: FinancialYearsConfig = {
    activeYearId: current.id,
    lockPriorYears: true,
    lockedYearIds: [],
  };

  if (!raw) return defaultConfig;

  let parsed = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return defaultConfig;
    }
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return defaultConfig;
  }

  const p = parsed as Record<string, unknown>;
  const activeYearId = typeof p.activeYearId === 'string' && p.activeYearId.trim() ? p.activeYearId.trim() : current.id;
  const lockPriorYears = p.lockPriorYears !== false;
  const lockedYearIds = Array.isArray(p.lockedYearIds) ? (p.lockedYearIds.filter(x => typeof x === 'string') as string[]) : [];

  return {
    activeYearId,
    lockPriorYears,
    lockedYearIds,
    updatedAt: typeof p.updatedAt === 'string' ? p.updatedAt : undefined,
  };
}

/**
 * Checks if a date falls inside a locked financial year.
 */
export function isDateInLockedFinancialYear(
  dateStr: string,
  config: FinancialYearsConfig,
  country: StoreCountry = getStoreCountry()
): boolean {
  if (!dateStr || !config.lockPriorYears) return false;
  const dateFy = getFinancialYearForDate(dateStr, country);

  // Explicitly locked
  if (config.lockedYearIds.includes(dateFy.id)) {
    return true;
  }

  // If lockPriorYears is enabled and date's FY is prior to activeYearId
  const currentFy = getFinancialYearForDate(new Date(), country);
  const activeFyId = config.activeYearId || currentFy.id;
  if (dateFy.id !== activeFyId && dateFy.endDate < currentFy.startDate) {
    return true;
  }

  return false;
}
