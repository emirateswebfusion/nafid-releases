import { DEFAULT_FEATURE_FLAGS, sanitizeFeatureFlags, type FeatureFlags, type FeatureKey } from './featureFlags';

const CORE: FeatureKey[] = ['billing', 'cash_settlement', 'cash_register', 'inventory', 'stock_report', 'purchase_bills', 'payments', 'customers', 'sales_history', 'financial_reports', 'gst_reports', 'recycle_bin'];
export const BUSINESS_PROFILES = [
  { id: 'retail', name: 'Retail shop', description: 'Daily billing, products, purchases and customers', features: [...CORE, 'returns', 'loyalty'] },
  { id: 'restaurant', name: 'Restaurant / Cafeteria', description: 'Billing, tables, takeaway, delivery and kitchen', features: [...CORE, 'restaurant_mode', 'dining_tables', 'takeaway_delivery', 'kitchen_display', 'staff', 'sales_staff'] },
  { id: 'wholesale', name: 'Wholesale / Distribution', description: 'Price tiers, party credit, quotations and purchases', features: [...CORE, 'pricing_tiers', 'parties', 'quotations', 'returns', 'staff', 'sales_staff'] },
  { id: 'clothing', name: 'Clothing / Textiles', description: 'Retail billing, product categories, exchanges and loyalty', features: [...CORE, 'categories_grades', 'returns', 'loyalty'] },
  { id: 'grocery', name: 'Grocery / Supermarket', description: 'Fast billing, stock, offers, returns and loyalty', features: [...CORE, 'categories_grades', 'combo_offers', 'returns', 'loyalty'] },
  { id: 'hardware', name: 'Hardware / Electronics', description: 'Products, quotations, warranties and customer credit', features: [...CORE, 'categories_grades', 'quotations', 'warranties', 'returns', 'parties'] },
  { id: 'scrap', name: 'Scrap / Recycling', description: 'Scrap purchases, sales, stock and party balances', features: [...CORE, 'scrap', 'parties'] },
] satisfies { id: string; name: string; description: string; features: FeatureKey[] }[];

export function flagsForBusinessProfile(id: string): FeatureFlags {
  const profile = BUSINESS_PROFILES.find(p => p.id === id);
  if (!profile) throw new Error('Unknown business category');
  const flags = { ...DEFAULT_FEATURE_FLAGS };
  for (const key of Object.keys(flags) as FeatureKey[]) flags[key] = profile.features.includes(key);
  return sanitizeFeatureFlags(flags);
}

export function matchingBusinessProfile(flags: FeatureFlags | null): string {
  if (!flags) return 'custom';
  return BUSINESS_PROFILES.find(profile => {
    const recommended = flagsForBusinessProfile(profile.id);
    return (Object.keys(recommended) as FeatureKey[]).every(key => flags[key] === recommended[key]);
  })?.id ?? 'custom';
}
