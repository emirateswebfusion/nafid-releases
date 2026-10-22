import type { Db } from './types.js';

/** SQL statements used by services/pricingTiersService.ts. Each factory prepares its statement on the given connection. */

export const findPricingTiers = (db: Db) => db.prepare(`
      SELECT * FROM pricing_tiers
      WHERE (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL)
        AND is_deleted = 0
      ORDER BY sort_order ASC, name COLLATE NOCASE ASC
    `);

export const findPricingTiers2 = (db: Db) => db.prepare(`
      SELECT pricing_tier_id, is_deleted FROM pricing_tiers
      WHERE (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL)
        AND LOWER(TRIM(name)) = LOWER(?)
    `);

export const updatePricingTierIsActiveAndIsDeleted = (db: Db) => db.prepare(`
        UPDATE pricing_tiers
        SET is_active = ?, is_deleted = 0, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
        WHERE pricing_tier_id = ?
      `);

export const findPricingTiersCOALESCEMAXsortOrderAndNextSort = (db: Db) => db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_sort FROM pricing_tiers WHERE tenant_id = ? OR tenant_id = \'global\'');

export const insertPricingTier = (db: Db) => db.prepare(`
      INSERT INTO pricing_tiers (pricing_tier_id, tenant_id, name, is_active, sort_order, is_deleted, sync_status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 0, 'PENDING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);

export const updatePricingTierByPricingTierId = (db: Db) => db.prepare(`
      UPDATE pricing_tiers
      SET name = COALESCE(NULLIF(?, ''), name), is_active = ?, sort_order = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
      WHERE pricing_tier_id = ?
    `);

export const updatePricingTierIsDeleted = (db: Db) => db.prepare(`UPDATE pricing_tiers SET is_deleted = 1, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE pricing_tier_id = ?`);

export const updatePricingTierSortOrder = (db: Db) => db.prepare(`UPDATE pricing_tiers SET sort_order = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE pricing_tier_id = ?`);

export const findPricingTiersByPricingTierId = (db: Db) => db.prepare('SELECT tenant_id FROM pricing_tiers WHERE pricing_tier_id = ?');

export const updatePricingTierIsDefaultAndPricingTierId = (db: Db) => db.prepare(`
        UPDATE pricing_tiers
        SET is_default = CASE WHEN pricing_tier_id = ? THEN 1 ELSE 0 END,
            sync_status = 'PENDING',
            updated_at = CURRENT_TIMESTAMP
        WHERE tenant_id = ? OR tenant_id = ? OR tenant_id = 'global'
      `);

export const updatePricingTierIsDefault = (db: Db) => db.prepare(`
        UPDATE pricing_tiers
        SET is_default = 0,
            sync_status = 'PENDING',
            updated_at = CURRENT_TIMESTAMP
        WHERE tenant_id = ? OR tenant_id = 'global'
      `);

export const findProductPricing = (db: Db) => db.prepare(`
      SELECT * FROM product_pricing
      WHERE (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL)
        AND is_deleted = 0
    `);

export const findProductPricingByProductIdAndPricingTierId = (db: Db) => db.prepare(`SELECT product_pricing_id FROM product_pricing WHERE product_id = ? AND pricing_tier_id = ? AND (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL)`);

export const upsertProductPricing = (db: Db) => db.prepare(`
      INSERT INTO product_pricing (product_pricing_id, tenant_id, product_id, pricing_tier_id, price, is_deleted, sync_status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 0, 'PENDING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(product_id, pricing_tier_id) DO UPDATE SET
        price = excluded.price,
        is_deleted = 0,
        sync_status = 'PENDING',
        updated_at = CURRENT_TIMESTAMP
    `);

export const updateProductPricingIsDeleted = (db: Db) => db.prepare(`UPDATE product_pricing SET is_deleted = 1, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE product_id = ? AND pricing_tier_id = ? AND (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL)`);
