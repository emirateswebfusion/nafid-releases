import type { Db } from '../types.js';

/** SQL used by electron/sync/entities/catalogSync.ts. Each factory prepares its statement on the given connection. */

export const selectProductGrades = (db: Db) => db.prepare(`SELECT * FROM product_grades WHERE sync_status = 'PENDING' AND tenant_id = ?`);
export const updateProductGrades = (db: Db) => db.prepare(`UPDATE product_grades SET sync_status = 'SYNCED' WHERE grade_id = ? AND tenant_id = ?`);
export const selectPricingTiers = (db: Db) => db.prepare(`SELECT * FROM pricing_tiers WHERE sync_status = 'PENDING' AND (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL)`);
export const updateProductPricing = (db: Db) => db.prepare(`UPDATE product_pricing SET pricing_tier_id = ? WHERE pricing_tier_id = ?`);
export const updateParties = (db: Db) => db.prepare(`UPDATE parties SET pricing_tier_id = ? WHERE pricing_tier_id = ?`);
export const updateCustomers = (db: Db) => db.prepare(`UPDATE customers SET pricing_tier_id = ? WHERE pricing_tier_id = ?`);
export const updatePricingTiers = (db: Db) => db.prepare(`UPDATE pricing_tiers SET pricing_tier_id = ?, tenant_id = ? WHERE pricing_tier_id = ?`);
export const updatePricingTiers2 = (db: Db) => db.prepare(`UPDATE pricing_tiers SET sync_status = 'SYNCED', tenant_id = ? WHERE pricing_tier_id = ?`);
export const selectProductPricing = (db: Db) => db.prepare(`SELECT * FROM product_pricing WHERE sync_status = 'PENDING' AND (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL)`);
export const updateProductPricing2 = (db: Db) => db.prepare(`UPDATE product_pricing SET product_pricing_id = ?, tenant_id = ? WHERE product_id = ? AND pricing_tier_id = ?`);
export const updateProductPricing3 = (db: Db) => db.prepare(`
    UPDATE product_pricing
    SET sync_status = 'SYNCED', tenant_id = ?
    WHERE (product_pricing_id = ? OR (product_id = ? AND pricing_tier_id = ?))
  `);
export const selectProducts = (db: Db) => db.prepare(`SELECT * FROM products WHERE sync_status = 'PENDING' AND tenant_id = ?`);
export const updateProducts = (db: Db) => db.prepare(`UPDATE products SET sync_status = 'SYNCED' WHERE product_id = ? AND tenant_id = ?`);
export const insertProductGrades = (db: Db) => db.prepare(`
    INSERT INTO product_grades (
      grade_id, tenant_id, category, grade_name, rate, purchase_price, offer_price, is_deleted,
      sync_status, created_at, updated_at
    ) VALUES (
      @grade_id, @tenant_id, @category, @grade_name, @rate, @purchase_price, @offer_price, @is_deleted,
      'SYNCED', @created_at, @updated_at
    )
    ON CONFLICT(grade_id) DO UPDATE SET
      category = excluded.category,
      grade_name = excluded.grade_name,
      rate = excluded.rate,
      purchase_price = excluded.purchase_price,
      offer_price = excluded.offer_price,
      is_deleted = excluded.is_deleted,
      created_at = COALESCE(product_grades.created_at, excluded.created_at),
      updated_at = excluded.updated_at,
      sync_status = 'SYNCED'
    WHERE product_grades.sync_status != 'PENDING'
  `);
export const selectPricingTiers2 = (db: Db) => db.prepare(`
    SELECT pricing_tier_id FROM pricing_tiers
    WHERE (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL)
      AND LOWER(TRIM(name)) = LOWER(?)
    LIMIT 1
  `);
export const insertPricingTiers = (db: Db) => db.prepare(`
    INSERT INTO pricing_tiers (
      pricing_tier_id, tenant_id, name, is_active, sort_order, is_default, is_deleted,
      sync_status, created_at, updated_at
    ) VALUES (
      @pricing_tier_id, @tenant_id, @name, @is_active, @sort_order, @is_default, @is_deleted,
      'SYNCED', @created_at, @updated_at
    )
    ON CONFLICT(pricing_tier_id) DO UPDATE SET
      tenant_id = excluded.tenant_id,
      name = excluded.name,
      is_active = excluded.is_active,
      sort_order = excluded.sort_order,
      is_default = excluded.is_default,
      is_deleted = excluded.is_deleted,
      created_at = COALESCE(pricing_tiers.created_at, excluded.created_at),
      updated_at = excluded.updated_at,
      sync_status = 'SYNCED'
    WHERE pricing_tiers.sync_status != 'PENDING' OR excluded.updated_at >= pricing_tiers.updated_at
  `);
export const deleteProductPricing = (db: Db) => db.prepare(`
                  DELETE FROM product_pricing 
                  WHERE pricing_tier_id = ? AND product_id IN (
                    SELECT product_id FROM product_pricing WHERE pricing_tier_id = ?
                  )
                `);
export const selectPricingTiers3 = (db: Db) => db.prepare('SELECT pricing_tier_id FROM pricing_tiers WHERE pricing_tier_id = ?');
export const deletePricingTiers = (db: Db) => db.prepare('DELETE FROM pricing_tiers WHERE pricing_tier_id = ?');
export const selectProductPricing2 = (db: Db) => db.prepare(`SELECT product_id, pricing_tier_id FROM product_pricing WHERE product_pricing_id = ?`);
export const insertProductPricing = (db: Db) => db.prepare(`
    INSERT INTO product_pricing (
      product_pricing_id, tenant_id, product_id, pricing_tier_id, price, is_deleted,
      sync_status, created_at, updated_at
    ) VALUES (
      @product_pricing_id, @tenant_id, @product_id, @pricing_tier_id, @price, @is_deleted,
      'SYNCED', @created_at, @updated_at
    )
    ON CONFLICT(product_id, pricing_tier_id) DO UPDATE SET
      product_pricing_id = excluded.product_pricing_id,
      tenant_id = excluded.tenant_id,
      price = excluded.price,
      is_deleted = excluded.is_deleted,
      created_at = COALESCE(product_pricing.created_at, excluded.created_at),
      updated_at = excluded.updated_at,
      sync_status = 'SYNCED'
    WHERE product_pricing.sync_status != 'PENDING'
  `);
export const updateProductPricing5 = (db: Db) => db.prepare(`
        UPDATE product_pricing 
        SET sync_status = 'SYNCED' 
        WHERE sync_status = 'PENDING' 
          AND (product_pricing_id = ? OR (product_id = ? AND pricing_tier_id = ?))
          AND (updated_at <= ? OR updated_at IS NULL)
      `);
export const insertProducts = (db: Db) => db.prepare(`
    INSERT INTO products (
      product_id, tenant_id, name, sku_barcode, item_code, category, hsn_sac_code,
      purchase_price, base_price, is_gst_applicable, tax_rate_percent,
      uom, brand_manufacturer, current_stock, reorder_level, is_deleted, domain_attributes,
      discount_percent, discount_flat, offer_price,
      billing_type, grade_id, pricing_mode, average_weight_per_piece, weight_override_allowed,
      is_service_item, print_status, sync_status, created_at, updated_at
    ) VALUES (
      @product_id, @tenant_id, @name, @sku_barcode, @item_code, @category, @hsn_sac_code,
      @purchase_price, @base_price, @is_gst_applicable, @tax_rate_percent,
      @uom, @brand_manufacturer, @current_stock, @reorder_level, @is_deleted, @domain_attributes,
      @discount_percent, @discount_flat, @offer_price,
      @billing_type, @grade_id, @pricing_mode, @average_weight_per_piece, @weight_override_allowed,
      @is_service_item, @print_status, 'SYNCED', @created_at, @updated_at
    )
    ON CONFLICT(product_id) DO UPDATE SET
      name = excluded.name,
      sku_barcode = excluded.sku_barcode,
      item_code = excluded.item_code,
      category = excluded.category,
      hsn_sac_code = excluded.hsn_sac_code,
      purchase_price = excluded.purchase_price,
      base_price = excluded.base_price,
      is_gst_applicable = excluded.is_gst_applicable,
      tax_rate_percent = excluded.tax_rate_percent,
      uom = excluded.uom,
      brand_manufacturer = excluded.brand_manufacturer,
      current_stock = excluded.current_stock,
      reorder_level = excluded.reorder_level,
      is_deleted = excluded.is_deleted,
      domain_attributes = excluded.domain_attributes,
      discount_percent = excluded.discount_percent,
      discount_flat = excluded.discount_flat,
      offer_price = excluded.offer_price,
      billing_type = excluded.billing_type,
      grade_id = excluded.grade_id,
      pricing_mode = excluded.pricing_mode,
      average_weight_per_piece = excluded.average_weight_per_piece,
      weight_override_allowed = excluded.weight_override_allowed,
      is_service_item = excluded.is_service_item,
      print_status = COALESCE(excluded.print_status, products.print_status),
      created_at = COALESCE(products.created_at, excluded.created_at),
      updated_at = excluded.updated_at,
      sync_status = 'SYNCED'
    WHERE products.sync_status != 'PENDING'
  `);
export const selectComboOffers = (db: Db) => db.prepare(`SELECT * FROM combo_offers WHERE sync_status = 'PENDING' AND tenant_id = ?`);
export const selectComboItems = (db: Db) => db.prepare(`SELECT product_id, quantity FROM combo_items WHERE combo_id = ?`);
export const updateComboOffers = (db: Db) => db.prepare(`UPDATE combo_offers SET sync_status = 'SYNCED' WHERE combo_id = ? AND tenant_id = ?`);
export const insertComboOffers = (db: Db) => db.prepare(`
    INSERT INTO combo_offers (
      combo_id, tenant_id, name, sku_barcode, combo_price,
      is_active, is_deleted, description, sync_status, created_at, updated_at
    ) VALUES (
      @combo_id, @tenant_id, @name, @sku_barcode, @combo_price,
      @is_active, @is_deleted, @description, 'SYNCED', @created_at, @updated_at
    )
    ON CONFLICT(combo_id) DO UPDATE SET
      name = excluded.name,
      sku_barcode = excluded.sku_barcode,
      combo_price = excluded.combo_price,
      is_active = excluded.is_active,
      is_deleted = excluded.is_deleted,
      description = excluded.description,
      created_at = COALESCE(combo_offers.created_at, excluded.created_at),
      updated_at = excluded.updated_at,
      sync_status = 'SYNCED'
    WHERE combo_offers.sync_status != 'PENDING'
  `);
export const deleteComboItems = (db: Db) => db.prepare(`DELETE FROM combo_items WHERE combo_id = ?`);
export const insertComboItems = (db: Db) => db.prepare(`
    INSERT INTO combo_items (combo_item_id, combo_id, tenant_id, product_id, quantity, created_at)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `);
