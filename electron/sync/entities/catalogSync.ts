import { getDb } from '../../db/localDb.js';
import { BATCH_SIZE, isGstApplicableProduct, parseIsDeleted, toSqliteDate } from '../syncConfig.js';
import { notifyPullProgress } from '../syncProgress.js';
import { pullPaginated, pushBatch, reconcilePending } from '../syncTransport.js';

/** Catalog sync: grades, pricing tiers, product pricing, products and combo offers (push and pull). */
// ── Product Grades Sync (Edge → Cloud) ───────────────────────────────────────────
export async function syncGrades(token: string, tenantId: string) {
  const db = getDb();
  const pending = db.prepare(`SELECT * FROM product_grades WHERE sync_status = 'PENDING' AND tenant_id = ?`).all(tenantId) as any[];

  if (pending.length === 0) return;
  console.log(`[SyncWorker] Pushing ${pending.length} product grades to cloud in batches of ${BATCH_SIZE}...`);

  const updateStmt = db.prepare(`UPDATE product_grades SET sync_status = 'SYNCED' WHERE grade_id = ? AND tenant_id = ?`);

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    const synced = await pushBatch(
      '/api/sync/product_grades',
      token,
      batch,
      'product_grades',
      `Grades batch ${Math.floor(i / BATCH_SIZE) + 1}`,
    );
    if (synced.length > 0) {
      const tx = db.transaction((ids: string[]) => { for (const id of ids) updateStmt.run(id, tenantId); });
      tx(synced);
    }
  }
}

// ── Pricing Tiers Sync (Edge → Cloud) ────────────────────────────────────────
export async function syncPricingTiers(token: string, tenantId: string) {
  const db = getDb();
  const pending = db.prepare(`SELECT * FROM pricing_tiers WHERE sync_status = 'PENDING' AND (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL)`).all(tenantId) as any[];

  if (pending.length === 0) return;

  // Sanitize any non-UUID or pseudo-tier pricing_tier_id before pushing
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  for (const t of pending) {
    if (!t.pricing_tier_id || !uuidRegex.test(t.pricing_tier_id) || t.pricing_tier_id === '__mrp__') {
      const newUuid = crypto.randomUUID();
      const oldId = t.pricing_tier_id;
      try {
        db.prepare(`UPDATE product_pricing SET pricing_tier_id = ? WHERE pricing_tier_id = ?`).run(newUuid, oldId);
        db.prepare(`UPDATE parties SET pricing_tier_id = ? WHERE pricing_tier_id = ?`).run(newUuid, oldId);
        db.prepare(`UPDATE customers SET pricing_tier_id = ? WHERE pricing_tier_id = ?`).run(newUuid, oldId);
        db.prepare(`UPDATE pricing_tiers SET pricing_tier_id = ?, tenant_id = ? WHERE pricing_tier_id = ?`).run(newUuid, tenantId, oldId);
        t.pricing_tier_id = newUuid;
      } catch (err: any) {
        console.warn('[SyncWorker] Error remapping non-UUID pricing tier:', err.message);
      }
    }
  }

  console.log(`[SyncWorker] Pushing ${pending.length} pricing tiers to cloud in batches of ${BATCH_SIZE}...`);

  const updateStmt = db.prepare(`UPDATE pricing_tiers SET sync_status = 'SYNCED', tenant_id = ? WHERE pricing_tier_id = ?`);

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    const tiers = batch.map((t: any) => ({
      ...t,
      tenant_id: tenantId,
      is_active: !!t.is_active,
      is_default: !!t.is_default,
      is_deleted: !!t.is_deleted,
    }));

    const synced = await pushBatch(
      '/api/sync/pricing_tiers',
      token,
      tiers,
      'pricing_tiers',
      `Pricing tiers batch ${Math.floor(i / BATCH_SIZE) + 1}`,
    );
    if (synced.length > 0) {
      const tx = db.transaction((ids: string[]) => { for (const id of ids) updateStmt.run(tenantId, id); });
      tx(synced);
    }
  }
}

// ── Product Pricing Sync (Edge → Cloud) ──────────────────────────────────────
export async function syncProductPricing(token: string, tenantId: string) {
  const db = getDb();
  const pending = db.prepare(`SELECT * FROM product_pricing WHERE sync_status = 'PENDING' AND (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL)`).all(tenantId) as any[];

  if (pending.length === 0) return;

  // Sanitize any non-UUID product_pricing_id before pushing
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const fixIdStmt = db.prepare(`UPDATE product_pricing SET product_pricing_id = ?, tenant_id = ? WHERE product_id = ? AND pricing_tier_id = ?`);
  for (const pp of pending) {
    if (!pp.product_pricing_id || !uuidRegex.test(pp.product_pricing_id)) {
      const newUuid = crypto.randomUUID();
      fixIdStmt.run(newUuid, tenantId, pp.product_id, pp.pricing_tier_id);
      pp.product_pricing_id = newUuid;
    }
  }

  console.log(`[SyncWorker] Pushing ${pending.length} product pricing rows to cloud in batches of ${BATCH_SIZE}...`);

  const updateStmt = db.prepare(`
    UPDATE product_pricing
    SET sync_status = 'SYNCED', tenant_id = ?
    WHERE (product_pricing_id = ? OR (product_id = ? AND pricing_tier_id = ?))
  `);

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    const pricing = batch.map((pp: any) => ({
      ...pp,
      tenant_id: tenantId,
      is_deleted: !!pp.is_deleted,
    }));

    const synced = await pushBatch(
      '/api/sync/product_pricing',
      token,
      pricing,
      'product_pricing',
      `Product pricing batch ${Math.floor(i / BATCH_SIZE) + 1}`,
    );
    if (synced.length > 0) {
      const syncedSet = new Set(synced);
      const tx = db.transaction((rows: any[]) => {
        for (const pp of rows) {
          if (syncedSet.has(pp.product_pricing_id) || syncedSet.has(pp.product_id)) {
            updateStmt.run(tenantId, pp.product_pricing_id, pp.product_id, pp.pricing_tier_id);
          }
        }
      });
      tx(batch);
    }
  }
}

// ── Product Sync (Edge → Cloud) ──────────────────────────────────────────────
export async function syncProducts(token: string, tenantId: string) {
  const db = getDb();
  const pending = db.prepare(`SELECT * FROM products WHERE sync_status = 'PENDING' AND tenant_id = ?`).all(tenantId) as any[];

  if (pending.length === 0) return;
  console.log(`[SyncWorker] Pushing ${pending.length} products to cloud in batches of ${BATCH_SIZE}...`);

  const updateStmt = db.prepare(`UPDATE products SET sync_status = 'SYNCED' WHERE product_id = ? AND tenant_id = ?`);

  let totalSynced = 0;
  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    const products = batch.map((p: any) => ({
      ...p,
      is_deleted: p.is_deleted === true || p.is_deleted === 1 || p.is_deleted === '1' || p.is_deleted === 'true',
      is_gst_applicable: isGstApplicableProduct(p.is_gst_applicable, p.hsn_sac_code),
      weight_override_allowed: p.weight_override_allowed === true || p.weight_override_allowed === 1 || p.weight_override_allowed === '1' || p.weight_override_allowed === 'true',
      is_service_item: p.is_service_item === true || p.is_service_item === 1 || p.is_service_item === '1' || p.is_service_item === 'true',
      domain_attributes: (() => { 
          try { 
            const parsed = JSON.parse(p.domain_attributes || '{}');
            return typeof parsed === 'string' ? JSON.parse(parsed) : parsed;
          } catch { return {}; }
        })(),
    }));

    const synced = await pushBatch(
      '/api/sync/products',
      token,
      products,
      'products',
      `Products batch ${Math.floor(i / BATCH_SIZE) + 1} (${i + 1}-${Math.min(i + BATCH_SIZE, pending.length)})`,
    );
    if (synced.length > 0) {
      totalSynced += synced.length;
      const tx = db.transaction((ids: string[]) => { for (const id of ids) updateStmt.run(id, tenantId); });
      tx(synced);
    }
  }
  console.log(`[SyncWorker] Pushed ${totalSynced} products to cloud.`);
}

// ── Pull Product Grades (Cloud → Edge) ─────────────────────────────────────────────
export async function pullGrades(token: string, tenantId: string): Promise<boolean> {
  const db = getDb();

  const upsert = db.prepare(`
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

  const result = await pullPaginated({
    token,
    tenantId,
    table: 'product_grades',
    urlPath: '/api/sync/product_grades',
    label: 'grades',
    onProgress: (fetched) => notifyPullProgress('grades', fetched),
    processPage: (rows) => {
      const tx = db.transaction((grades: any[]) => {
        for (const g of grades) {
          try {
            upsert.run({
              grade_id: g.grade_id,
              tenant_id: tenantId,
              category: g.category,
              grade_name: g.grade_name,
              rate: g.rate,
              purchase_price: g.purchase_price ?? 0,
              offer_price: g.offer_price ?? null,
              is_deleted: parseIsDeleted(g.is_deleted),
              created_at: toSqliteDate(g.created_at),
              updated_at: toSqliteDate(g.updated_at),
            });
          } catch (e: any) {
            console.error('[SyncWorker] Error pulling grade:', e.message);
          }
        }
      });
      tx(rows);
      return reconcilePending(db, 'product_grades', 'grade_id', rows);
    },
  });

  if (result.hasChanged && result.count > 0) {
    console.log(`[SyncWorker] Pulled ${result.count} grades from cloud.${result.reconciled > 0 ? ` Reconciled ${result.reconciled}.` : ''}`);
  } else if (result.failed) {
    console.error('[SyncWorker] Pull grades failed.');
  }
  return result.hasChanged && result.count > 0;
}

// ── Pull Pricing Tiers (Cloud → Edge) ──────────────────────────────────────────
export async function pullPricingTiers(token: string, tenantId: string): Promise<boolean> {
  const db = getDb();

  const findByName = db.prepare(`
    SELECT pricing_tier_id FROM pricing_tiers
    WHERE (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL)
      AND LOWER(TRIM(name)) = LOWER(?)
    LIMIT 1
  `);
  const updateTierId = db.prepare(`UPDATE pricing_tiers SET pricing_tier_id = ?, tenant_id = ? WHERE pricing_tier_id = ?`);
  const remapProductPricing = db.prepare(`UPDATE product_pricing SET pricing_tier_id = ? WHERE pricing_tier_id = ?`);
  const remapParties = db.prepare(`UPDATE parties SET pricing_tier_id = ? WHERE pricing_tier_id = ?`);
  const remapCustomers = db.prepare(`UPDATE customers SET pricing_tier_id = ? WHERE pricing_tier_id = ?`);

  const upsert = db.prepare(`
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

  const result = await pullPaginated({
    token,
    tenantId,
    table: 'pricing_tiers',
    urlPath: '/api/sync/pricing_tiers',
    label: 'pricing tiers',
    onProgress: (fetched) => notifyPullProgress('pricing tiers', fetched),
    processPage: (rows) => {
      const tx = db.transaction((tiers: any[]) => {
        for (const t of tiers) {
          try {
            const cleanName = String(t.name || '').trim();
            const existing = findByName.get(tenantId, cleanName) as { pricing_tier_id: string } | undefined;
            if (existing && existing.pricing_tier_id !== t.pricing_tier_id) {
              try {
                // Remove duplicates in product_pricing to avoid UNIQUE(product_id, pricing_tier_id) error
                db.prepare(`
                  DELETE FROM product_pricing 
                  WHERE pricing_tier_id = ? AND product_id IN (
                    SELECT product_id FROM product_pricing WHERE pricing_tier_id = ?
                  )
                `).run(existing.pricing_tier_id, t.pricing_tier_id);
                remapProductPricing.run(t.pricing_tier_id, existing.pricing_tier_id);
                remapParties.run(t.pricing_tier_id, existing.pricing_tier_id);
                remapCustomers.run(t.pricing_tier_id, existing.pricing_tier_id);

                const targetExisting = db.prepare('SELECT pricing_tier_id FROM pricing_tiers WHERE pricing_tier_id = ?').get(t.pricing_tier_id);
                if (targetExisting) {
                  db.prepare('DELETE FROM pricing_tiers WHERE pricing_tier_id = ?').run(existing.pricing_tier_id);
                } else {
                  updateTierId.run(t.pricing_tier_id, tenantId, existing.pricing_tier_id);
                }
              } catch (remapErr: any) {
                console.warn('[SyncWorker] Error remapping tier ID:', remapErr.message);
              }
            }

            upsert.run({
              pricing_tier_id: t.pricing_tier_id,
              tenant_id: tenantId,
              name: cleanName,
              is_active: t.is_active ? 1 : 0,
              sort_order: t.sort_order ?? 0,
              is_default: t.is_default ? 1 : 0,
              is_deleted: parseIsDeleted(t.is_deleted),
              created_at: toSqliteDate(t.created_at),
              updated_at: toSqliteDate(t.updated_at),
            });
          } catch (e: any) {
            console.error('[SyncWorker] Error pulling pricing tier:', e.message);
          }
        }
      });
      tx(rows);
      return reconcilePending(db, 'pricing_tiers', 'pricing_tier_id', rows);
    },
  });

  if (result.hasChanged && result.count > 0) {
    console.log(`[SyncWorker] Pulled ${result.count} pricing tiers from cloud.${result.reconciled > 0 ? ` Reconciled ${result.reconciled}.` : ''}`);
  } else if (result.failed) {
    console.error('[SyncWorker] Pull pricing tiers failed.');
  }
  return result.hasChanged && result.count > 0;
}

// ── Pull Product Pricing (Cloud → Edge) ────────────────────────────────────────
export async function pullProductPricing(token: string, tenantId: string): Promise<boolean> {
  const db = getDb();

  const findConflictingId = db.prepare(`SELECT product_id, pricing_tier_id FROM product_pricing WHERE product_pricing_id = ?`);

  const upsert = db.prepare(`
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

  const result = await pullPaginated({
    token,
    tenantId,
    table: 'product_pricing',
    urlPath: '/api/sync/product_pricing',
    label: 'product pricing',
    onProgress: (fetched) => notifyPullProgress('product pricing', fetched),
    processPage: (rows) => {
      const tx = db.transaction((pricing: any[]) => {
        for (const pp of pricing) {
          try {
            const conflict = findConflictingId.get(pp.product_pricing_id) as any;
            let targetPricingId = pp.product_pricing_id;
            if (conflict && (conflict.product_id !== pp.product_id || conflict.pricing_tier_id !== pp.pricing_tier_id)) {
              targetPricingId = crypto.randomUUID();
            }

            upsert.run({
              product_pricing_id: targetPricingId,
              tenant_id: tenantId,
              product_id: pp.product_id,
              pricing_tier_id: pp.pricing_tier_id,
              price: pp.price ?? 0,
              is_deleted: parseIsDeleted(pp.is_deleted),
              created_at: toSqliteDate(pp.created_at),
              updated_at: toSqliteDate(pp.updated_at),
            });
          } catch (e: any) {
            console.error('[SyncWorker] Error pulling product pricing row:', e.message);
          }
        }
      });
      tx(rows);
      const reconcileStmt = db.prepare(`
        UPDATE product_pricing 
        SET sync_status = 'SYNCED' 
        WHERE sync_status = 'PENDING' 
          AND (product_pricing_id = ? OR (product_id = ? AND pricing_tier_id = ?))
          AND (updated_at <= ? OR updated_at IS NULL)
      `);
      let reconciled = 0;
      for (const r of rows) {
        try {
          const res = reconcileStmt.run(r.product_pricing_id, r.product_id, r.pricing_tier_id, toSqliteDate(r.updated_at));
          if (res.changes > 0) reconciled += res.changes;
        } catch {}
      }
      return reconciled;
    },
  });

  if (result.hasChanged && result.count > 0) {
    console.log(`[SyncWorker] Pulled ${result.count} product pricing rows from cloud.${result.reconciled > 0 ? ` Reconciled ${result.reconciled}.` : ''}`);
  } else if (result.failed) {
    console.error('[SyncWorker] Pull product pricing failed.');
  }
  return result.hasChanged && result.count > 0;
}

// ── Pull Products (Cloud → Edge) ─────────────────────────────────────────────
export async function pullProducts(token: string, tenantId: string): Promise<boolean> {
  const db = getDb();

  const upsert = db.prepare(`
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

  const result = await pullPaginated({
    token,
    tenantId,
    table: 'products',
    urlPath: '/api/sync/products',
    label: 'products',
    onProgress: (fetched) => notifyPullProgress('products', fetched),
    processPage: (rows) => {
      const tx = db.transaction((products: any[]) => {
        for (const p of products) {
          const currentP = { ...p };
          let retryCount = 0;
          let success = false;
          while (retryCount < 2 && !success) {
            try {
              upsert.run({
                product_id: currentP.product_id,
                tenant_id: tenantId,
                name: currentP.name,
                sku_barcode: currentP.sku_barcode || null,
                item_code: currentP.item_code || null,
                category: currentP.category || null,
                hsn_sac_code: currentP.hsn_sac_code || null,
                purchase_price: currentP.purchase_price ?? 0,
                base_price: currentP.base_price,
                is_gst_applicable: isGstApplicableProduct(currentP.is_gst_applicable, currentP.hsn_sac_code) ? 1 : 0,
                tax_rate_percent: currentP.tax_rate_percent ?? 0,
                uom: currentP.uom || 'Pcs',
                brand_manufacturer: currentP.brand_manufacturer || null,
                current_stock: currentP.current_stock ?? 0,
                reorder_level: currentP.reorder_level ?? 0,
                is_deleted: parseIsDeleted(currentP.is_deleted),
                domain_attributes: currentP.domain_attributes 
                  ? (typeof currentP.domain_attributes === 'string' ? currentP.domain_attributes : JSON.stringify(currentP.domain_attributes)) 
                  : '{}',
                discount_percent: currentP.discount_percent ?? null,
                discount_flat: currentP.discount_flat ?? null,
                offer_price: currentP.offer_price ?? null,
                billing_type: currentP.billing_type || 'PIECE',
                grade_id: currentP.grade_id || null,
                pricing_mode: currentP.pricing_mode || 'FIXED_PRICE',
                average_weight_per_piece: currentP.average_weight_per_piece ?? null,
                weight_override_allowed: currentP.weight_override_allowed ? 1 : 0,
                is_service_item: currentP.is_service_item ? 1 : 0,
                print_status: currentP.print_status ?? null,
                created_at: toSqliteDate(currentP.created_at),
                updated_at: toSqliteDate(currentP.updated_at),
              });
              success = true;
            } catch (e: any) {
              if (e.message?.includes('UNIQUE constraint failed')) {
                const suffix = currentP.product_id.substring(0, 4).toUpperCase();
                if (e.message.includes('products.name')) currentP.name = `${currentP.name} (Cloud-${suffix})`;
                if (e.message.includes('products.sku_barcode')) currentP.sku_barcode = `${currentP.sku_barcode}-${suffix}`;
                if (e.message.includes('products.item_code')) currentP.item_code = `${currentP.item_code}-${suffix}`;
                retryCount++;
              } else {
                throw e;
              }
            }
          }
        }
      });
      tx(rows);
      return reconcilePending(db, 'products', 'product_id', rows);
    },
  });

  if (result.hasChanged && result.count > 0) {
    console.log(`[SyncWorker] Pulled ${result.count} products from cloud.${result.reconciled > 0 ? ` Reconciled ${result.reconciled} PENDING.` : ''}`);
  } else if (result.failed) {
    console.error('[SyncWorker] Pull products failed.');
  }
  return result.hasChanged && result.count > 0;
}

// ── Combo Offers Sync (Edge → Cloud) ──────────────────────────────────────────
export async function syncComboOffers(token: string, tenantId: string) {
  const db = getDb();
  const pending = db.prepare(`SELECT * FROM combo_offers WHERE sync_status = 'PENDING' AND tenant_id = ?`).all(tenantId) as any[];

  if (pending.length === 0) return;
  console.log(`[SyncWorker] Pushing ${pending.length} combo offers to cloud in batches of ${BATCH_SIZE}...`);

  const getItemsStmt = db.prepare(`SELECT product_id, quantity FROM combo_items WHERE combo_id = ?`);
  const updateStmt = db.prepare(`UPDATE combo_offers SET sync_status = 'SYNCED' WHERE combo_id = ? AND tenant_id = ?`);

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    const combos = batch.map((c: any) => {
      const items = getItemsStmt.all(c.combo_id) as any[];
      return {
        ...c,
        is_active: !!c.is_active,
        is_deleted: !!c.is_deleted,
        items: items.map(item => ({
          product_id: item.product_id,
          quantity: Number(item.quantity) || 1,
        })),
      };
    });

    const synced = await pushBatch(
      '/api/sync/combo_offers',
      token,
      combos,
      'combo_offers',
      `Combo offers batch ${Math.floor(i / BATCH_SIZE) + 1}`,
    );
    if (synced.length > 0) {
      const tx = db.transaction((ids: string[]) => { for (const id of ids) updateStmt.run(id, tenantId); });
      tx(synced);
    }
  }
}

// ── Pull Combo Offers (Cloud → Edge) ─────────────────────────────────────────
export async function pullComboOffers(token: string, tenantId: string): Promise<boolean> {
  const db = getDb();

  const upsertCombo = db.prepare(`
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

  const deleteItems = db.prepare(`DELETE FROM combo_items WHERE combo_id = ?`);
  const insertItem = db.prepare(`
    INSERT INTO combo_items (combo_item_id, combo_id, tenant_id, product_id, quantity, created_at)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `);

  const result = await pullPaginated({
    token,
    tenantId,
    table: 'combo_offers',
    urlPath: '/api/sync/combo_offers',
    label: 'combo offers',
    onProgress: (fetched) => notifyPullProgress('combo offers', fetched),
    processPage: (rows) => {
      const tx = db.transaction((combos: any[]) => {
        for (const c of combos) {
          try {
            const cid = c.combo_id;
            upsertCombo.run({
              combo_id: cid,
              tenant_id: tenantId,
              name: c.name || '',
              sku_barcode: c.sku_barcode ? String(c.sku_barcode).trim() : null,
              combo_price: Number(c.combo_price) || 0,
              is_active: parseIsDeleted(c.is_active) ? 1 : (c.is_active === false || c.is_active === 0 ? 0 : 1),
              is_deleted: parseIsDeleted(c.is_deleted),
              description: c.description || null,
              created_at: toSqliteDate(c.created_at),
              updated_at: toSqliteDate(c.updated_at),
            });

            if (Array.isArray(c.items)) {
              deleteItems.run(cid);
              for (const item of c.items) {
                insertItem.run(
                  item.combo_item_id || crypto.randomUUID(),
                  cid,
                  tenantId,
                  item.product_id,
                  Number(item.quantity) || 1
                );
              }
            }
          } catch (e: any) {
            console.error('[SyncWorker] Error pulling combo offer row:', e.message);
          }
        }
      });
      tx(rows);
      return reconcilePending(db, 'combo_offers', 'combo_id', rows);
    },
  });

  if (result.hasChanged && result.count > 0) {
    console.log(`[SyncWorker] Pulled ${result.count} combo offers from cloud.${result.reconciled > 0 ? ` Reconciled ${result.reconciled}.` : ''}`);
  } else if (result.failed) {
    console.error('[SyncWorker] Pull combo offers failed.');
  }
  return result.hasChanged && result.count > 0;
}
