import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_STAFF_DATA_MASKING_CONFIG,
  calculateMaskedSalesRevenue,
  calculateMaskedStockValuation,
  getStaffSalesDateScope,
  isStaffRole,
  parseStaffDataMaskingConfig,
  shouldApplyStaffMasking,
  type StaffDataMaskingConfig,
} from '../../src/utils/staffDataMasking';

describe('isStaffRole', () => {
  it('identifies admin roles as non-staff (case-insensitive and trimmed)', () => {
    expect(isStaffRole('ADMIN')).toBe(false);
    expect(isStaffRole('owner')).toBe(false);
    expect(isStaffRole('SUPER_ADMIN')).toBe(false);
    expect(isStaffRole('Administrator')).toBe(false);
  });

  it('treats staff, biller, and missing roles as staff', () => {
    expect(isStaffRole('STAFF')).toBe(true);
    expect(isStaffRole('BILLER')).toBe(true);
    expect(isStaffRole('cashier')).toBe(true);
    expect(isStaffRole(null)).toBe(true);
    expect(isStaffRole(undefined)).toBe(true);
    expect(isStaffRole('')).toBe(true);
  });
});

describe('shouldApplyStaffMasking', () => {
  const enabledConfig: StaffDataMaskingConfig = {
    ...DEFAULT_STAFF_DATA_MASKING_CONFIG,
    enabled: true,
  };

  it('returns false when masking is disabled or config is missing', () => {
    expect(shouldApplyStaffMasking('STAFF', null)).toBe(false);
    expect(shouldApplyStaffMasking('STAFF', { ...enabledConfig, enabled: false })).toBe(false);
  });

  it('returns false for admin roles even when masking is enabled', () => {
    expect(shouldApplyStaffMasking('ADMIN', enabledConfig)).toBe(false);
    expect(shouldApplyStaffMasking('OWNER', enabledConfig)).toBe(false);
    expect(shouldApplyStaffMasking('SUPER_ADMIN', enabledConfig)).toBe(false);
  });

  it('returns true for staff and biller roles when enabled', () => {
    expect(shouldApplyStaffMasking('STAFF', enabledConfig)).toBe(true);
    expect(shouldApplyStaffMasking('BILLER', enabledConfig)).toBe(true);
  });
});

describe('parseStaffDataMaskingConfig', () => {
  it('returns default config for null, undefined or invalid input', () => {
    expect(parseStaffDataMaskingConfig(null)).toEqual(DEFAULT_STAFF_DATA_MASKING_CONFIG);
    expect(parseStaffDataMaskingConfig(undefined)).toEqual(DEFAULT_STAFF_DATA_MASKING_CONFIG);
    expect(parseStaffDataMaskingConfig('invalid json')).toEqual(DEFAULT_STAFF_DATA_MASKING_CONFIG);
    expect(parseStaffDataMaskingConfig(123)).toEqual(DEFAULT_STAFF_DATA_MASKING_CONFIG);
  });

  it('parses JSON string and sanitizes values', () => {
    const raw = JSON.stringify({
      enabled: true,
      stock_valuation_mode: 'FIXED_OVERRIDE',
      stock_fixed_amount: 500000,
      stock_percentage_offset: -10, // negative, should fallback to default 60
      sales_history_scope: 'THIS_WEEK',
      sales_revenue_mode: 'PERCENTAGE_OFFSET',
      sales_revenue_percentage: 40,
    });
    const parsed = parseStaffDataMaskingConfig(raw);
    expect(parsed.enabled).toBe(true);
    expect(parsed.stock_valuation_mode).toBe('FIXED_OVERRIDE');
    expect(parsed.stock_fixed_amount).toBe(500000);
    expect(parsed.stock_percentage_offset).toBe(60);
    expect(parsed.sales_history_scope).toBe('THIS_WEEK');
    expect(parsed.sales_revenue_mode).toBe('PERCENTAGE_OFFSET');
    expect(parsed.sales_revenue_percentage).toBe(40);
  });
});

describe('calculateMaskedStockValuation', () => {
  const baseConfig: StaffDataMaskingConfig = {
    ...DEFAULT_STAFF_DATA_MASKING_CONFIG,
    enabled: true,
  };

  it('passes through original valuation for non-staff or disabled config', () => {
    const resAdmin = calculateMaskedStockValuation(100000, baseConfig, false);
    expect(resAdmin).toEqual({ displayAmount: 100000, isMasked: false, isHidden: false });

    const resDisabled = calculateMaskedStockValuation(100000, { ...baseConfig, enabled: false }, true);
    expect(resDisabled).toEqual({ displayAmount: 100000, isMasked: false, isHidden: false });
  });

  it('hides stock valuation in HIDDEN mode', () => {
    const res = calculateMaskedStockValuation(100000, { ...baseConfig, stock_valuation_mode: 'HIDDEN' }, true);
    expect(res).toEqual({ displayAmount: 0, isMasked: true, isHidden: true });
  });

  it('applies fixed override in FIXED_OVERRIDE mode', () => {
    const res = calculateMaskedStockValuation(
      100000,
      { ...baseConfig, stock_valuation_mode: 'FIXED_OVERRIDE', stock_fixed_amount: 250000 },
      true,
    );
    expect(res).toEqual({ displayAmount: 250000, isMasked: true, isHidden: false });
  });

  it('applies percentage offset in PERCENTAGE_OFFSET mode', () => {
    const res = calculateMaskedStockValuation(
      200000,
      { ...baseConfig, stock_valuation_mode: 'PERCENTAGE_OFFSET', stock_percentage_offset: 75 },
      true,
    );
    expect(res).toEqual({ displayAmount: 150000, isMasked: true, isHidden: false });
  });
});

describe('calculateMaskedSalesRevenue', () => {
  const baseConfig: StaffDataMaskingConfig = {
    ...DEFAULT_STAFF_DATA_MASKING_CONFIG,
    enabled: true,
  };

  it('passes through original revenue for non-staff or disabled config', () => {
    const res = calculateMaskedSalesRevenue(50000, baseConfig, false);
    expect(res).toEqual({ displayAmount: 50000, isMasked: false, isHidden: false });
  });

  it('hides sales revenue in HIDDEN mode', () => {
    const res = calculateMaskedSalesRevenue(50000, { ...baseConfig, sales_revenue_mode: 'HIDDEN' }, true);
    expect(res).toEqual({ displayAmount: 0, isMasked: true, isHidden: true });
  });

  it('applies fixed override in FIXED_OVERRIDE mode', () => {
    const res = calculateMaskedSalesRevenue(
      50000,
      { ...baseConfig, sales_revenue_mode: 'FIXED_OVERRIDE', sales_revenue_fixed_amount: 12000 },
      true,
    );
    expect(res).toEqual({ displayAmount: 12000, isMasked: true, isHidden: false });
  });

  it('applies percentage offset in PERCENTAGE_OFFSET mode', () => {
    const res = calculateMaskedSalesRevenue(
      80000,
      { ...baseConfig, sales_revenue_mode: 'PERCENTAGE_OFFSET', sales_revenue_percentage: 50 },
      true,
    );
    expect(res).toEqual({ displayAmount: 40000, isMasked: true, isHidden: false });
  });
});

describe('getStaffSalesDateScope', () => {
  const baseConfig: StaffDataMaskingConfig = {
    ...DEFAULT_STAFF_DATA_MASKING_CONFIG,
    enabled: true,
  };

  it('returns unlocked ALL scope for non-staff or when disabled', () => {
    const res = getStaffSalesDateScope(baseConfig, false);
    expect(res).toEqual({ startDate: null, endDate: null, isLocked: false, scopeLabel: 'All Records' });
  });

  it('calculates TODAY scope locked to current date', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 26, 12, 0, 0)); // 26 Oct 2026
    const res = getStaffSalesDateScope({ ...baseConfig, sales_history_scope: 'TODAY' }, true);
    expect(res).toEqual({
      startDate: '2026-10-26',
      endDate: '2026-10-26',
      isLocked: true,
      scopeLabel: "Today's Sales Only",
    });
    vi.useRealTimers();
  });

  it('calculates THIS_WEEK scope starting from Monday', () => {
    vi.useFakeTimers();
    // 2026-10-26 is Monday
    vi.setSystemTime(new Date(2026, 9, 28, 12, 0, 0)); // 28 Oct 2026 (Wednesday)
    const res = getStaffSalesDateScope({ ...baseConfig, sales_history_scope: 'THIS_WEEK' }, true);
    expect(res.startDate).toBe('2026-10-26');
    expect(res.endDate).toBe('2026-10-28');
    expect(res.isLocked).toBe(true);
    expect(res.scopeLabel).toBe("This Week's Sales");
    vi.useRealTimers();
  });

  it('calculates THIS_MONTH scope starting from 1st of month', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 26, 12, 0, 0)); // 26 Oct 2026
    const res = getStaffSalesDateScope({ ...baseConfig, sales_history_scope: 'THIS_MONTH' }, true);
    expect(res.startDate).toBe('2026-10-01');
    expect(res.endDate).toBe('2026-10-26');
    expect(res.isLocked).toBe(true);
    expect(res.scopeLabel).toBe("This Month's Sales");
    vi.useRealTimers();
  });

  it('calculates LAST_N_DAYS scope', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 26, 12, 0, 0)); // 26 Oct 2026
    const res = getStaffSalesDateScope({ ...baseConfig, sales_history_scope: 'LAST_N_DAYS', sales_history_days: 7 }, true);
    expect(res.startDate).toBe('2026-10-20');
    expect(res.endDate).toBe('2026-10-26');
    expect(res.isLocked).toBe(true);
    expect(res.scopeLabel).toBe('Last 7 Days');
    vi.useRealTimers();
  });
});
