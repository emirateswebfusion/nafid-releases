export type FeatureKey =
  | 'billing'
  | 'cash_settlement'
  | 'cash_register'
  | 'inventory'
  | 'combo_offers'
  | 'categories_grades'
  | 'pricing_tiers'
  | 'stock_report'
  | 'quotations'
  | 'purchase_bills'
  | 'warranties'
  | 'returns'
  | 'scrap'
  | 'parties'
  | 'payments'
  | 'customers'
  | 'staff'
  | 'sales_history'
  | 'loyalty';

export type FeatureFlags = Record<FeatureKey, boolean>;

export interface FeatureDef {
  key: FeatureKey;
  label: string;
  desc: string;
}

export const FEATURE_LIST: FeatureDef[] = [
  { key: 'billing', label: 'Billing', desc: 'Create new invoices and manage sales' },
  { key: 'cash_settlement', label: 'Cash Settlement', desc: 'Settle pending bills, manage cash drawer, and day-end closing' },
  { key: 'cash_register', label: 'Cash Register', desc: 'Quick cash-in / cash-out panel on the billing page' },
  { key: 'inventory', label: 'Inventory Manager', desc: 'Manage products, stock levels, and pricing' },
  { key: 'combo_offers', label: 'Combo Offers', desc: 'Create and manage product bundles and combo offers' },
  { key: 'categories_grades', label: 'Categories & Grades', desc: 'Configure category classifications, grade rules, purchase price, and MRP' },
  { key: 'pricing_tiers', label: 'Pricing Tiers', desc: 'Create dynamic price tiers (Retail, Wholesale…) and set per-tier prices' },
  { key: 'stock_report', label: 'Stock Report', desc: 'Print A4 stock reports with PDF export' },
  { key: 'quotations', label: 'Quotations', desc: 'Quotation mode on billing and the quotation manager' },
  { key: 'purchase_bills', label: 'Purchase Bills', desc: 'Record and manage GST purchase bills' },
  { key: 'warranties', label: 'Warranty Bills', desc: 'Register and print warranty certificates' },
  { key: 'returns', label: 'Returns', desc: 'Return mode on billing and the returns manager' },
  { key: 'scrap', label: 'Enable Scrap Management', desc: 'Scrap mode, scrap deduction, and scrap manager' },
  { key: 'parties', label: 'Parties / Credit', desc: 'Track credit parties, balances, and payments' },
  { key: 'payments', label: 'Payment Methods', desc: 'Manage bank accounts, cards & UPI ids for receiving payments' },
  { key: 'customers', label: 'Customers', desc: 'Browse customer list, points balances, and purchase history' },
  { key: 'staff', label: 'Staff Administration', desc: 'Manage biller accounts and permissions' },
  { key: 'sales_history', label: 'Sales History', desc: 'Review past transactions and reports' },
  { key: 'loyalty', label: 'Loyalty Points', desc: 'Earn and redeem loyalty points on purchases' },
];

export const DEFAULT_FEATURE_FLAGS: FeatureFlags = Object.fromEntries(
  FEATURE_LIST.map(f => [f.key, true])
) as FeatureFlags;

export function cashierPageTitle(flags: Partial<Record<string, boolean>> | null | undefined): string {
  if (!flags) return 'Cash Settlement';
  if (flags.cash_settlement && flags.cash_register) return 'Cashier Settlement';
  if (flags.cash_settlement) return 'Cash Settlement';
  return 'Cash Register';
}

const SETTINGS_KEY = 'feature_flags';

let cache: FeatureFlags | null = null;
let cacheStored = false;

export function resetFeatureFlagsCache() {
  cache = null;
  cacheStored = false;
}

export async function loadFeatureFlags(tenantId?: string): Promise<FeatureFlags> {
  if (cache) return cache;
  if (!window.electronAPI) {
    cache = { ...DEFAULT_FEATURE_FLAGS };
    return cache;
  }
  try {
    const stored = await window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: SETTINGS_KEY });
    if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
      cache = { ...DEFAULT_FEATURE_FLAGS };
      for (const def of FEATURE_LIST) {
        const v = (stored as Record<string, unknown>)[def.key];
        if (typeof v === 'boolean') cache[def.key] = v;
      }
      cacheStored = true;
    } else {
      cache = { ...DEFAULT_FEATURE_FLAGS };
      cacheStored = false;
    }
  } catch {
    cache = { ...DEFAULT_FEATURE_FLAGS };
    cacheStored = false;
  }
  return cache;
}

export function getFeatureFlags(): FeatureFlags {
  return cache ? { ...cache } : { ...DEFAULT_FEATURE_FLAGS };
}

export function wereFeatureFlagsStored(): boolean {
  return cacheStored;
}

export function setFeatureFlag(key: FeatureKey, value: boolean) {
  if (!cache) cache = { ...DEFAULT_FEATURE_FLAGS };
  cache[key] = value;
}

export async function saveFeatureFlags(flags: FeatureFlags, tenantId?: string) {
  cache = { ...flags };
  cacheStored = true;
  if (!window.electronAPI) return;
  await window.electronAPI.settingsSet({ tenant_id: tenantId || 'global', key: SETTINGS_KEY, value: { ...flags } });
}