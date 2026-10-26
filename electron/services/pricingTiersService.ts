import type { PricingTierInput } from './typesB.js';
import { getDb } from '../db/localDb.js';
import crypto from 'node:crypto';
import * as pricingTiersSql from '../db/statements/pricingTiers.js';
/** pricingTiers use-cases for the main process (called by electron/ipc handlers). */

/** IPC `db:getPricingTiers` */
export function getPricingTiers(tenantId: string) {
  try {
    const db = getDb();
    const tid = tenantId || 'global';
    return pricingTiersSql.findPricingTiers(db).all(tid);
  } catch (error) {
    console.error('[db:getPricingTiers]', error);
    return [];
  }
}

/** IPC `db:addPricingTier` */
export function addPricingTier(t: PricingTierInput) {
  try {
    const db = getDb();
    const tid = t.tenant_id || 'global';
    const cleanName = String(t.name || '').trim();
    if (!cleanName) return { success: false, error: 'Name is required' };

    // Check if an existing tier with the same name exists
    const existing = pricingTiersSql.findPricingTiers2(db).get(tid, cleanName) as PricingTierInput;

    const isActive = (t.is_active === false || t.is_active === 0 || t.is_active === '0') ? 0 : 1;

    if (existing) {
      pricingTiersSql.updatePricingTierIsActiveAndIsDeleted(db).run(isActive, existing.pricing_tier_id);
      return { success: true, pricing_tier_id: existing.pricing_tier_id };
    }

    const nextSort = pricingTiersSql.findPricingTiersCOALESCEMAXsortOrderAndNextSort(db).get(tid) as { next_sort: number };
    const tierId = t.pricing_tier_id || crypto.randomUUID();

    pricingTiersSql.insertPricingTier(db).run(tierId, tid, cleanName, isActive, t.sort_order ?? (nextSort?.next_sort || 0));
    return { success: true, pricing_tier_id: tierId };
  } catch (error) {
    console.error('[db:addPricingTier]', error);
    return { success: false, error: (error as Error).message || 'Operation failed' };
  }
}

/** IPC `db:updatePricingTier` */
export function updatePricingTier(t: PricingTierInput) {
  try {
    const db = getDb();
    const isActive = (t.is_active === false || t.is_active === 0 || t.is_active === '0') ? 0 : 1;
    const cleanName = String(t.name || '').trim();
    pricingTiersSql.updatePricingTierByPricingTierId(db).run(cleanName, isActive, t.sort_order ?? 0, t.pricing_tier_id);
    return { success: true };
  } catch (error) {
    console.error('[db:updatePricingTier]', error);
    return { success: false, error: 'Operation failed' };
  }
}

/** IPC `db:deletePricingTier` */
export function deletePricingTier(tierId: string) {
  try {
    const db = getDb();
    pricingTiersSql.updatePricingTierIsDeleted(db).run(tierId);
    return { success: true };
  } catch (error) {
    console.error('[db:deletePricingTier]', error);
    return { success: false, error: 'Operation failed' };
  }
}

/** IPC `db:reorderPricingTiers` */
export function reorderPricingTiers(tiers: Array<{ pricing_tier_id: string; sort_order: number }>) {
  try {
    const db = getDb();
    const stmt = pricingTiersSql.updatePricingTierSortOrder(db);
    const tx = db.transaction((rows: Array<{ pricing_tier_id: string; sort_order: number }>) => {
      for (const r of rows) stmt.run(r.sort_order ?? 0, r.pricing_tier_id);
    });
    tx(tiers);
    return { success: true };
  } catch (error) {
    console.error('[db:reorderPricingTiers]', error);
    return { success: false, error: 'Operation failed' };
  }
}

/** IPC `db:setDefaultPricingTier` */
export function setDefaultPricingTier(payload: { tenant_id: string; pricing_tier_id: string }) {
  try {
    const db = getDb();
    let { tenant_id, pricing_tier_id } = payload || {};
    pricing_tier_id = pricing_tier_id || '';

    if (!tenant_id && pricing_tier_id) {
      const targetTier = pricingTiersSql.findPricingTiersByPricingTierId(db).get(pricing_tier_id) as PricingTierInput;
      if (targetTier?.tenant_id) tenant_id = targetTier.tenant_id;
    }
    const tid = tenant_id || 'global';

    if (pricing_tier_id) {
      const targetTier = pricingTiersSql.findPricingTiersByPricingTierId(db).get(pricing_tier_id) as PricingTierInput;
      const actualTenantId = targetTier?.tenant_id || tid;

      pricingTiersSql.updatePricingTierIsDefaultAndPricingTierId(db).run(pricing_tier_id, actualTenantId, tid);
    } else {
      pricingTiersSql.updatePricingTierIsDefault(db).run(tid);
    }

    return { success: true };
  } catch (error) {
    console.error('[db:setDefaultPricingTier]', error);
    return { success: false, error: 'Operation failed' };
  }
}

/** IPC `db:getProductPricing` */
export function getProductPricing(tenantId: string) {
  try {
    const db = getDb();
    const tid = tenantId || 'global';
    return pricingTiersSql.findProductPricing(db).all(tid);
  } catch (error) {
    console.error('[db:getProductPricing]', error);
    return [];
  }
}

/** IPC `db:setProductPricing` */
export function setProductPricing(payload: { tenant_id: string; product_id: string; pricing: Array<{ pricing_tier_id: string; price: number | null }> }) {
  try {
    const db = getDb();
    const { tenant_id, product_id, pricing } = payload;
    if (!tenant_id || !product_id || !Array.isArray(pricing)) return { success: false, error: 'Invalid payload' };
    const tid = tenant_id || 'global';
    const findExisting = pricingTiersSql.findProductPricingByProductIdAndPricingTierId(db);
    const upsert = pricingTiersSql.upsertProductPricing(db);
    const clear = pricingTiersSql.updateProductPricingIsDeleted(db);
    const tx = db.transaction((rows: Array<{ pricing_tier_id: string; price: number | null }>) => {
      for (const item of rows) {
        if (!item?.pricing_tier_id) continue;
        const isEmpty = item.price === null || item.price === undefined || String(item.price).trim() === '';
        if (isEmpty) {
          clear.run(product_id, item.pricing_tier_id, tid);
          continue;
        }
        const existing = findExisting.get(product_id, item.pricing_tier_id, tid) as { product_pricing_id: string };
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        const pricingId = (existing?.product_pricing_id && uuidRegex.test(existing.product_pricing_id)) ? existing.product_pricing_id : crypto.randomUUID();
        upsert.run(pricingId, tid, product_id, item.pricing_tier_id, Number(item.price) || 0);
      }
    });
    tx(pricing);
    return { success: true };
  } catch (error) {
    console.error('[db:setProductPricing]', error);
    return { success: false, error: 'Operation failed' };
  }
}

/** IPC `db:setTierPricing` */
export function setTierPricing(payload: { tenant_id: string; pricing_tier_id: string; pricing: Array<{ product_id: string; price: number | null }> }) {
  try {
    const db = getDb();
    const { tenant_id, pricing_tier_id, pricing } = payload;
    if (!tenant_id || !pricing_tier_id || !Array.isArray(pricing)) return { success: false, error: 'Invalid payload' };
    const findExisting = pricingTiersSql.findProductPricingByProductIdAndPricingTierId(db);
    const upsert = pricingTiersSql.upsertProductPricing(db);
    const clear = pricingTiersSql.updateProductPricingIsDeleted(db);
    const tx = db.transaction((rows: Array<{ product_id: string; price: number | null }>) => {
      for (const item of rows) {
        if (!item?.product_id) continue;
        const isEmpty = item.price === null || item.price === undefined || String(item.price).trim() === '';
        if (isEmpty) {
          clear.run(item.product_id, pricing_tier_id, tenant_id);
          continue;
        }
        const existing = findExisting.get(item.product_id, pricing_tier_id, tenant_id) as { product_pricing_id: string };
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        const pricingId = (existing?.product_pricing_id && uuidRegex.test(existing.product_pricing_id)) ? existing.product_pricing_id : crypto.randomUUID();
        upsert.run(pricingId, tenant_id, item.product_id, pricing_tier_id, Number(item.price) || 0);
      }
    });
    tx(pricing);
    return { success: true };
  } catch (error) {
    console.error('[db:setTierPricing]', error);
    return { success: false, error: 'Operation failed' };
  }
}
