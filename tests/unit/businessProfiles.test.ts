import { describe, expect, it } from 'vitest';
import { flagsForBusinessProfile, BUSINESS_PROFILES } from '../../src/config/businessProfiles';
import { resolveFeatureFlags, isFeatureEnabled, updateFeatureFlag } from '../../src/config/featureFlags';
describe('shop module choices', () => {
  it('enables required parents through one canonical individual-choice rule', () => {
    const none = resolveFeatureFlags({});
    expect(updateFeatureFlag(none, 'cash_register', true).cash_settlement).toBe(true);
    expect(updateFeatureFlag(none, 'kitchen_display', true).restaurant_mode).toBe(true);
    expect(updateFeatureFlag(updateFeatureFlag(none, 'kitchen_display', true), 'restaurant_mode', false).kitchen_display).toBe(false);
  });
  it('keeps legacy absent settings compatible but never enables explicit empty selections', () => {
    expect(resolveFeatureFlags(null).billing).toBe(true);
    expect(Object.values(resolveFeatureFlags({}))).not.toContain(true);
  });
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
