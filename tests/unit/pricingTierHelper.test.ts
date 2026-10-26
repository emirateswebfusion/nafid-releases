import { describe, expect, it } from 'vitest';
import {
  MRP_TIER_ID,
  sortTiersWithMrp,
  type PricingTier,
} from '../../src/utils/pricingTierHelper';

describe('sortTiersWithMrp', () => {
  it('creates a default synthetic MRP tier when tier list is empty or undefined', () => {
    const listFromEmpty = sortTiersWithMrp([]);
    expect(listFromEmpty).toHaveLength(1);
    expect(listFromEmpty[0]).toEqual({
      pricing_tier_id: MRP_TIER_ID,
      tenant_id: 'global',
      name: 'Base (MRP)',
      is_active: 1,
      sort_order: 0,
      is_default: true,
      is_mrp: true,
    });

    // handles null / undefined gracefully
    const listFromUndefined = sortTiersWithMrp(undefined as unknown as PricingTier[]);
    expect(listFromUndefined).toHaveLength(1);
    expect(listFromUndefined[0].pricing_tier_id).toBe(MRP_TIER_ID);
  });

  it('filters out deleted tiers', () => {
    const dbTiers: PricingTier[] = [
      { pricing_tier_id: 't1', name: 'Wholesale', is_active: 1, sort_order: 1, is_deleted: true },
      { pricing_tier_id: 't2', name: 'VIP', is_active: 1, sort_order: 2, is_deleted: 1 },
      { pricing_tier_id: 't3', name: 'Retail Plus', is_active: 1, sort_order: 3, is_deleted: 0 },
    ];
    const result = sortTiersWithMrp(dbTiers);
    const ids = result.map((t) => t.pricing_tier_id);
    expect(ids).toContain('t3');
    expect(ids).toContain(MRP_TIER_ID);
    expect(ids).not.toContain('t1');
    expect(ids).not.toContain('t2');
  });

  it('sets is_default to false on MRP tier when a custom tier is already marked default', () => {
    const dbTiers: PricingTier[] = [
      { pricing_tier_id: 't1', name: 'Wholesale', is_active: 1, sort_order: 1, is_default: true },
    ];
    const result = sortTiersWithMrp(dbTiers);
    const mrp = result.find((t) => t.pricing_tier_id === MRP_TIER_ID);
    expect(mrp?.is_default).toBe(false);

    const dbTiersNum: PricingTier[] = [
      { pricing_tier_id: 't2', name: 'Dealer', is_active: 1, sort_order: 1, is_default: 1 },
    ];
    const resultNum = sortTiersWithMrp(dbTiersNum);
    expect(resultNum.find((t) => t.pricing_tier_id === MRP_TIER_ID)?.is_default).toBe(false);

    const dbTiersStr: PricingTier[] = [
      { pricing_tier_id: 't3', name: 'Distributor', is_active: 1, sort_order: 1, is_default: '1' },
    ];
    const resultStr = sortTiersWithMrp(dbTiersStr);
    expect(resultStr.find((t) => t.pricing_tier_id === MRP_TIER_ID)?.is_default).toBe(false);
  });

  it('recognizes existing MRP pseudo-tiers by id or is_mrp flag and enriches them', () => {
    const existingMrp: PricingTier[] = [
      { pricing_tier_id: '', name: '', is_active: 1, sort_order: 5 },
    ];
    const result = sortTiersWithMrp(existingMrp, 0);
    expect(result).toHaveLength(1);
    expect(result[0].pricing_tier_id).toBe(MRP_TIER_ID);
    expect(result[0].name).toBe('Base (MRP)');
    expect(result[0].sort_order).toBe(5);
    expect(result[0].is_mrp).toBe(true);
    expect(result[0].is_default).toBe(true);
  });

  it('sorts tiers ascending by sort_order with null sort_order treated as 0', () => {
    const tiers: PricingTier[] = [
      { pricing_tier_id: 't3', name: 'Tier 3', is_active: 1, sort_order: 30 },
      { pricing_tier_id: 't1', name: 'Tier 1', is_active: 1, sort_order: 10 },
      { pricing_tier_id: 't2', name: 'Tier 2', is_active: 1, sort_order: null },
    ];
    const result = sortTiersWithMrp(tiers, 15);
    expect(result.map((t) => t.pricing_tier_id)).toEqual(['t2', 't1', MRP_TIER_ID, 't3']);
  });
});
