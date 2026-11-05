import { describe, expect, it } from 'vitest';
import { flagsForBusinessProfile, BUSINESS_PROFILES } from '../../src/config/businessProfiles';
import { resolveFeatureFlags, isFeatureEnabled } from '../../src/config/featureFlags';
describe('shop module choices', () => {
  it('restaurant uses shared business pages and only the food-specific operational pages', () => {
    const flags = flagsForBusinessProfile('restaurant');
    for (const key of ['billing', 'cash_settlement', 'inventory', 'sales_history', 'financial_reports', 'dining_tables', 'takeaway_delivery', 'kitchen_display'] as const) expect(flags[key], key).toBe(true);
    for (const key of ['scrap', 'pricing_tiers', 'warranties', 'ecommerce', 'advertisements'] as const) expect(flags[key], key).toBe(false);
  });
  it('keeps wholesale price tiers and scrap specific to suitable recommendations', () => {
    expect(flagsForBusinessProfile('wholesale').pricing_tiers).toBe(true);
    expect(flagsForBusinessProfile('retail').pricing_tiers).toBe(false);
    expect(flagsForBusinessProfile('scrap').scrap).toBe(true);
    for (const profile of BUSINESS_PROFILES.filter(p => p.id !== 'scrap')) expect(flagsForBusinessProfile(profile.id).scrap).toBe(false);
  });
  it('upgrades existing food-order shops without overriding explicit module disables', () => {
    const legacy = resolveFeatureFlags({ restaurant_mode: true, scrap: false, kitchen_display: false });
    expect(legacy.dining_tables).toBe(true);
    expect(legacy.takeaway_delivery).toBe(true);
    expect(legacy.kitchen_display).toBe(false);
    expect(legacy.scrap).toBe(false);
    expect(isFeatureEnabled({ ...legacy, restaurant_mode: false }, 'dining_tables')).toBe(false);
    expect(isFeatureEnabled(null, 'billing')).toBe(false);
  });
});
