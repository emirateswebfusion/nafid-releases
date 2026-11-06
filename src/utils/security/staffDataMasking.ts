import { storeCalendarDate } from '../time/timezoneHelper';
/**
 * Staff Data Masking & Privacy Utility
 * Allows shop owners/administrators to mask or override aggregate stock valuations
 * and restrict sales history scopes/revenue figures for staff/biller roles,
 * without affecting actual item quantities, unit prices, or barcode billing.
 */

export interface StaffDataMaskingConfig {
  enabled: boolean;

  // Stock Valuation Controls
  stock_valuation_mode: 'ORIGINAL' | 'HIDDEN' | 'FIXED_OVERRIDE' | 'PERCENTAGE_OFFSET';
  stock_fixed_amount: number;       // e.g. 2000000 (20 Lakhs)
  stock_percentage_offset: number;  // e.g. 60 (60% of real total)
  stock_mask_total_qty: boolean;    // Whether to mask total stock units count card as well

  // Sales History & Revenue Controls
  sales_history_scope: 'ALL' | 'TODAY' | 'THIS_WEEK' | 'THIS_MONTH' | 'LAST_N_DAYS';
  sales_history_days: number;       // e.g. 7 days
  sales_revenue_mode: 'ORIGINAL' | 'HIDDEN' | 'FIXED_OVERRIDE' | 'PERCENTAGE_OFFSET';
  sales_revenue_fixed_amount: number; // e.g. 50000 (Fixed demo override)
  sales_revenue_percentage: number;   // e.g. 50%

  // Purchase Cost & Margin Controls
  hide_purchase_cost_for_staff: boolean;
}

export const STAFF_DATA_MASKING_KEY = 'staff_data_masking_config';

export const DEFAULT_STAFF_DATA_MASKING_CONFIG: StaffDataMaskingConfig = {
  enabled: false,
  stock_valuation_mode: 'ORIGINAL',
  stock_fixed_amount: 2000000,
  stock_percentage_offset: 60,
  stock_mask_total_qty: false,

  sales_history_scope: 'ALL',
  sales_history_days: 7,
  sales_revenue_mode: 'ORIGINAL',
  sales_revenue_fixed_amount: 50000,
  sales_revenue_percentage: 50,

  hide_purchase_cost_for_staff: true,
};

export function parseStaffDataMaskingConfig(raw: unknown): StaffDataMaskingConfig {
  if (!raw) return { ...DEFAULT_STAFF_DATA_MASKING_CONFIG };
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (typeof parsed !== 'object' || parsed === null) {
      return { ...DEFAULT_STAFF_DATA_MASKING_CONFIG };
    }
    return {
      enabled: Boolean(parsed.enabled),
      stock_valuation_mode: ['ORIGINAL', 'HIDDEN', 'FIXED_OVERRIDE', 'PERCENTAGE_OFFSET'].includes(parsed.stock_valuation_mode)
        ? parsed.stock_valuation_mode
        : 'ORIGINAL',
      stock_fixed_amount: Number(parsed.stock_fixed_amount) >= 0 ? Number(parsed.stock_fixed_amount) : 2000000,
      stock_percentage_offset: Number(parsed.stock_percentage_offset) >= 0 ? Number(parsed.stock_percentage_offset) : 60,
      stock_mask_total_qty: Boolean(parsed.stock_mask_total_qty),

      sales_history_scope: ['ALL', 'TODAY', 'THIS_WEEK', 'THIS_MONTH', 'LAST_N_DAYS'].includes(parsed.sales_history_scope)
        ? parsed.sales_history_scope
        : 'ALL',
      sales_history_days: Number(parsed.sales_history_days) > 0 ? Number(parsed.sales_history_days) : 7,
      sales_revenue_mode: ['ORIGINAL', 'HIDDEN', 'FIXED_OVERRIDE', 'PERCENTAGE_OFFSET'].includes(parsed.sales_revenue_mode)
        ? parsed.sales_revenue_mode
        : 'ORIGINAL',
      sales_revenue_fixed_amount: Number(parsed.sales_revenue_fixed_amount) >= 0 ? Number(parsed.sales_revenue_fixed_amount) : 50000,
      sales_revenue_percentage: Number(parsed.sales_revenue_percentage) >= 0 ? Number(parsed.sales_revenue_percentage) : 50,

      hide_purchase_cost_for_staff: parsed.hide_purchase_cost_for_staff !== false,
    };
  } catch {
    return { ...DEFAULT_STAFF_DATA_MASKING_CONFIG };
  }
}

export function isStaffRole(role?: string | null): boolean {
  if (!role) return true;
  const r = String(role).toUpperCase().trim();
  return !['ADMIN', 'OWNER', 'SUPER_ADMIN', 'ADMINISTRATOR'].includes(r);
}

export function shouldApplyStaffMasking(role: string | null | undefined, config?: StaffDataMaskingConfig | null): boolean {
  if (!config || !config.enabled) return false;
  return isStaffRole(role);
}

export function calculateMaskedStockValuation(
  realValuation: number,
  config: StaffDataMaskingConfig,
  isStaff: boolean
): { displayAmount: number; isMasked: boolean; isHidden: boolean } {
  if (!isStaff || !config.enabled || config.stock_valuation_mode === 'ORIGINAL') {
    return { displayAmount: realValuation, isMasked: false, isHidden: false };
  }
  if (config.stock_valuation_mode === 'HIDDEN') {
    return { displayAmount: 0, isMasked: true, isHidden: true };
  }
  if (config.stock_valuation_mode === 'FIXED_OVERRIDE') {
    return { displayAmount: Math.max(0, config.stock_fixed_amount), isMasked: true, isHidden: false };
  }
  if (config.stock_valuation_mode === 'PERCENTAGE_OFFSET') {
    const pct = Math.max(0, config.stock_percentage_offset);
    return { displayAmount: (realValuation * pct) / 100, isMasked: true, isHidden: false };
  }
  return { displayAmount: realValuation, isMasked: false, isHidden: false };
}

export function calculateMaskedSalesRevenue(
  realRevenue: number,
  config: StaffDataMaskingConfig,
  isStaff: boolean
): { displayAmount: number; isMasked: boolean; isHidden: boolean } {
  if (!isStaff || !config.enabled || config.sales_revenue_mode === 'ORIGINAL') {
    return { displayAmount: realRevenue, isMasked: false, isHidden: false };
  }
  if (config.sales_revenue_mode === 'HIDDEN') {
    return { displayAmount: 0, isMasked: true, isHidden: true };
  }
  if (config.sales_revenue_mode === 'FIXED_OVERRIDE') {
    return { displayAmount: Math.max(0, config.sales_revenue_fixed_amount), isMasked: true, isHidden: false };
  }
  if (config.sales_revenue_mode === 'PERCENTAGE_OFFSET') {
    const pct = Math.max(0, config.sales_revenue_percentage);
    return { displayAmount: (realRevenue * pct) / 100, isMasked: true, isHidden: false };
  }
  return { displayAmount: realRevenue, isMasked: false, isHidden: false };
}

export function getStaffSalesDateScope(
  config: StaffDataMaskingConfig,
  isStaff: boolean
): { startDate: string | null; endDate: string | null; isLocked: boolean; scopeLabel: string } {
  if (!isStaff || !config.enabled || config.sales_history_scope === 'ALL') {
    return { startDate: null, endDate: null, isLocked: false, scopeLabel: 'All Records' };
  }

  const now = storeCalendarDate();
  const formatYmd = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const todayStr = formatYmd(now);

  if (config.sales_history_scope === 'TODAY') {
    return {
      startDate: todayStr,
      endDate: todayStr,
      isLocked: true,
      scopeLabel: "Today's Sales Only",
    };
  }

  if (config.sales_history_scope === 'THIS_WEEK') {
    const d = new Date(now);
    const dayOfWeek = d.getDay();
    const diff = d.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1); // Monday
    d.setDate(diff);
    return {
      startDate: formatYmd(d),
      endDate: todayStr,
      isLocked: true,
      scopeLabel: "This Week's Sales",
    };
  }

  if (config.sales_history_scope === 'THIS_MONTH') {
    const d = new Date(now.getFullYear(), now.getMonth(), 1);
    return {
      startDate: formatYmd(d),
      endDate: todayStr,
      isLocked: true,
      scopeLabel: "This Month's Sales",
    };
  }

  if (config.sales_history_scope === 'LAST_N_DAYS') {
    const days = Math.max(1, config.sales_history_days || 7);
    const d = new Date(now);
    d.setDate(d.getDate() - (days - 1));
    return {
      startDate: formatYmd(d),
      endDate: todayStr,
      isLocked: true,
      scopeLabel: `Last ${days} Days`,
    };
  }

  return { startDate: null, endDate: null, isLocked: false, scopeLabel: 'All Records' };
}
