import { getDb } from '../../db/localDb.js';
import { BATCH_SIZE, isGstApplicableProduct, parseIsDeleted, toSqliteDate } from '../syncConfig.js';
import { notifyPullProgress } from '../syncProgress.js';
import { pullPaginated, pushBatch, reconcilePending } from '../syncTransport.js';
import * as catalogSyncSql from '../../db/statements/sync/catalogSync.js';

/** Catalog sync: grades, pricing tiers, product pricing, products and combo offers (push and pull). */
// ── Product Grades Sync (Edge → Cloud) ───────────────────────────────────────────
export async function syncGrades(token: string, tenantId: string) {
  const db = getDb();
  const pending = catalogSyncSql.selectProductGrades(db).all(tenantId) as Record<string, unknown>[];

  if (pending.length === 0) return;
  console.log(`[SyncWorker] Pushing ${pending.length} product grades to cloud in batches of ${BATCH_SIZE}...`);

  const updateStmt = catalogSyncSql.updateProductGrades(db);

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
  const pending = catalogSyncSql.selectPricingTiers(db).all(tenantId) as Record<string, unknown>[];

  if (pending.length === 0) return;

  // Sanitize any non-UUID or pseudo-tier pricing_tier_id before pushing
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  for (const t of pending) {
    if (!t.pricing_tier_id || !uuidRegex.test((t.pricing_tier_id as string)) || t.pricing_tier_id === '__mrp__') {
      const newUuid = crypto.randomUUID();
      const oldId = t.pricing_tier_id;
      try {
        catalogSyncSql.updateProductPricing(db).run(newUuid, oldId);
        catalogSyncSql.updateParties(db).run(newUuid, oldId);
        catalogSyncSql.updateCustomers(db).run(newUuid, oldId);
        catalogSyncSql.updatePricingTiers(db).run(newUuid, tenantId, oldId);
        t.pricing_tier_id = newUuid;
      } catch (err) {
        console.warn('[SyncWorker] Error remapping non-UUID pricing tier:', (err as Error).message);
      }
    }
  }

  console.log(`[SyncWorker] Pushing ${pending.length} pricing tiers to cloud in batches of ${BATCH_SIZE}...`);

  const updateStmt = catalogSyncSql.updatePricingTiers2(db);

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    const tiers = batch.map((t: Record<string, unknown>) => ({
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
  const pending = catalogSyncSql.selectProductPricing(db).all(tenantId) as Record<string, unknown>[];

  if (pending.length === 0) return;

  // Sanitize any non-UUID product_pricing_id before pushing
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const fixIdStmt = catalogSyncSql.updateProductPricing2(db);
  for (const pp of pending) {
    if (!pp.product_pricing_id || !uuidRegex.test((pp.product_pricing_id as string))) {
      const newUuid = crypto.randomUUID();
      fixIdStmt.run(newUuid, tenantId, pp.product_id, pp.pricing_tier_id);
      pp.product_pricing_id = newUuid;
    }
  }

  console.log(`[SyncWorker] Pushing ${pending.length} product pricing rows to cloud in batches of ${BATCH_SIZE}...`);

  const updateStmt = catalogSyncSql.updateProductPricing3(db);

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    const pricing = batch.map((pp: Record<string, unknown>) => ({
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
      const tx = db.transaction((rows: Record<string, unknown>[]) => {
        for (const pp of rows) {
          if (syncedSet.has((pp.product_pricing_id as string)) || syncedSet.has((pp.product_id as string))) {
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
  const pending = catalogSyncSql.selectProducts(db).all(tenantId) as Record<string, unknown>[];

  if (pending.length === 0) return;
  console.log(`[SyncWorker] Pushing ${pending.length} products to cloud in batches of ${BATCH_SIZE}...`);

  const updateStmt = catalogSyncSql.updateProducts(db);

  let totalSynced = 0;
  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    const products = batch.map((p: Record<string, unknown>) => ({
      ...p,
      is_deleted: p.is_deleted === true || p.is_deleted === 1 || p.is_deleted === '1' || p.is_deleted === 'true',
      is_gst_applicable: isGstApplicableProduct(p.is_gst_applicable, p.hsn_sac_code),
      weight_override_allowed: p.weight_override_allowed === true || p.weight_override_allowed === 1 || p.weight_override_allowed === '1' || p.weight_override_allowed === 'true',
      is_service_item: p.is_service_item === true || p.is_service_item === 1 || p.is_service_item === '1' || p.is_service_item === 'true',
      domain_attributes: (() => { 
          try { 
            const parsed = JSON.parse((p.domain_attributes as string) || ('{}' as string));
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
      const syncedSet = new Set(synced);
      const tx = db.transaction((rows: Record<string, unknown>[]) => {
        for (const p of rows) {
          if (syncedSet.has(p.product_id as string)) {
            updateStmt.run(p.product_id, tenantId, p.updated_at ?? null, p.current_stock ?? null);
          }
        }
      });
      tx(batch);
    }
  }
  console.log(`[SyncWorker] Pushed ${totalSynced} products to cloud.`);
}

// ── Pull Product Grades (Cloud → Edge) ─────────────────────────────────────────────
export async function pullGrades(token: string, tenantId: string): Promise<boolean> {
  const db = getDb();

  const upsert = catalogSyncSql.insertProductGrades(db);

  const result = await pullPaginated({
    token,
    tenantId,
    table: 'product_grades',
    urlPath: '/api/sync/product_grades',
    label: 'grades',
    onProgress: (fetched) => notifyPullProgress('grades', fetched),
    processPage: (rows) => {
      const tx = db.transaction((grades: Record<string, unknown>[]) => {
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
              created_at: toSqliteDate((g.created_at as string | number | Date | null | undefined)),
              updated_at: toSqliteDate((g.updated_at as string | number | Date | null | undefined)),
            });
          } catch (e) {
            console.error('[SyncWorker] Error pulling grade:', (e as Error).message);
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

  const findByName = catalogSyncSql.selectPricingTiers2(db);
  const updateTierId = catalogSyncSql.updatePricingTiers(db);
  const remapProductPricing = catalogSyncSql.updateProductPricing(db);
  const remapParties = catalogSyncSql.updateParties(db);
  const remapCustomers = catalogSyncSql.updateCustomers(db);

  const upsert = catalogSyncSql.insertPricingTiers(db);

  const result = await pullPaginated({
    token,
    tenantId,
    table: 'pricing_tiers',
    urlPath: '/api/sync/pricing_tiers',
    label: 'pricing tiers',
    onProgress: (fetched) => notifyPullProgress('pricing tiers', fetched),
    processPage: (rows) => {
      const tx = db.transaction((tiers: Record<string, unknown>[]) => {
        for (const t of tiers) {
          try {
            const cleanName = String(t.name || '').trim();
            const existing = findByName.get(tenantId, cleanName) as { pricing_tier_id: string } | undefined;
            if (existing && existing.pricing_tier_id !== t.pricing_tier_id) {
              try {
                // Remove duplicates in product_pricing to avoid UNIQUE(product_id, pricing_tier_id) error
                catalogSyncSql.deleteProductPricing(db).run(existing.pricing_tier_id, t.pricing_tier_id);
                remapProductPricing.run(t.pricing_tier_id, existing.pricing_tier_id);
                remapParties.run(t.pricing_tier_id, existing.pricing_tier_id);
                remapCustomers.run(t.pricing_tier_id, existing.pricing_tier_id);

                const targetExisting = catalogSyncSql.selectPricingTiers3(db).get(t.pricing_tier_id);
                if (targetExisting) {
                  catalogSyncSql.deletePricingTiers(db).run(existing.pricing_tier_id);
                } else {
                  updateTierId.run(t.pricing_tier_id, tenantId, existing.pricing_tier_id);
                }
              } catch (remapErr) {
                console.warn('[SyncWorker] Error remapping tier ID:', (remapErr as Error).message);
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
              created_at: toSqliteDate((t.created_at as string | number | Date | null | undefined)),
              updated_at: toSqliteDate((t.updated_at as string | number | Date | null | undefined)),
            });
          } catch (e) {
            console.error('[SyncWorker] Error pulling pricing tier:', (e as Error).message);
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

  const findConflictingId = catalogSyncSql.selectProductPricing2(db);

  const upsert = catalogSyncSql.insertProductPricing(db);

  const result = await pullPaginated({
    token,
    tenantId,
    table: 'product_pricing',
    urlPath: '/api/sync/product_pricing',
    label: 'product pricing',
    onProgress: (fetched) => notifyPullProgress('product pricing', fetched),
    processPage: (rows) => {
      const tx = db.transaction((pricing: Record<string, unknown>[]) => {
        for (const pp of pricing) {
          try {
            const conflict = findConflictingId.get(pp.product_pricing_id) as Record<string, unknown>;
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
              created_at: toSqliteDate((pp.created_at as string | number | Date | null | undefined)),
              updated_at: toSqliteDate((pp.updated_at as string | number | Date | null | undefined)),
            });
          } catch (e) {
            console.error('[SyncWorker] Error pulling product pricing row:', (e as Error).message);
          }
        }
      });
      tx(rows);
      const reconcileStmt = catalogSyncSql.updateProductPricing5(db);
      let reconciled = 0;
      for (const r of rows) {
        try {
          const res = reconcileStmt.run(r.product_pricing_id, r.product_id, r.pricing_tier_id, toSqliteDate((r.updated_at as string | number | Date | null | undefined)));
          if (res.changes > 0) reconciled += res.changes;
        } catch { /* ignore */ }
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

  const upsert = catalogSyncSql.insertProducts(db);

  const result = await pullPaginated({
    token,
    tenantId,
    table: 'products',
    urlPath: '/api/sync/products',
    label: 'products',
    onProgress: (fetched) => notifyPullProgress('products', fetched),
    processPage: (rows) => {
      const tx = db.transaction((products: Record<string, unknown>[]) => {
        const checkExists = catalogSyncSql.selectProductExists(db);
        for (const p of products) {
          const currentP = { ...p };
          const isDeletedRow = parseIsDeleted(currentP.is_deleted) === 1;
          if (isDeletedRow && !checkExists.get(currentP.product_id)) {
            // Do not insert ghost soft-deleted products that don't exist locally
            continue;
          }
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
                created_at: toSqliteDate((currentP.created_at as string | number | Date | null | undefined)),
                updated_at: toSqliteDate((currentP.updated_at as string | number | Date | null | undefined)),
              });
              success = true;
            } catch (e) {
              if ((e as Error).message?.includes('UNIQUE constraint failed')) {
                const suffix = (currentP.product_id as string).substring(0, 4).toUpperCase();
                if ((e as Error).message.includes('products.name')) currentP.name = `${currentP.name} (Cloud-${suffix})`;
                if ((e as Error).message.includes('products.sku_barcode')) currentP.sku_barcode = `${currentP.sku_barcode}-${suffix}`;
                if ((e as Error).message.includes('products.item_code')) currentP.item_code = `${currentP.item_code}-${suffix}`;
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
  const pending = catalogSyncSql.selectComboOffers(db).all(tenantId) as Record<string, unknown>[];

  if (pending.length === 0) return;
  console.log(`[SyncWorker] Pushing ${pending.length} combo offers to cloud in batches of ${BATCH_SIZE}...`);

  const getItemsStmt = catalogSyncSql.selectComboItems(db);
  const updateStmt = catalogSyncSql.updateComboOffers(db);

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    const combos = batch.map((c: Record<string, unknown>) => {
      const items = getItemsStmt.all(c.combo_id) as Record<string, unknown>[];
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

  const upsertCombo = catalogSyncSql.insertComboOffers(db);

  const deleteItems = catalogSyncSql.deleteComboItems(db);
  const insertItem = catalogSyncSql.insertComboItems(db);

  const result = await pullPaginated({
    token,
    tenantId,
    table: 'combo_offers',
    urlPath: '/api/sync/combo_offers',
    label: 'combo offers',
    onProgress: (fetched) => notifyPullProgress('combo offers', fetched),
    processPage: (rows) => {
      const tx = db.transaction((combos: Record<string, unknown>[]) => {
        for (const c of combos) {
          try {
            const cid = c.combo_id;
            upsertCombo.run({
              combo_id: cid,
              tenant_id: tenantId,
              name: (c as { name: string }).name || '',
              sku_barcode: c.sku_barcode ? String(c.sku_barcode).trim() : null,
              combo_price: Number(c.combo_price) || 0,
              is_active: parseIsDeleted(c.is_active) ? 1 : (c.is_active === false || c.is_active === 0 ? 0 : 1),
              is_deleted: parseIsDeleted(c.is_deleted),
              description: c.description || null,
              created_at: toSqliteDate((c.created_at as string | number | Date | null | undefined)),
              updated_at: toSqliteDate((c.updated_at as string | number | Date | null | undefined)),
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
          } catch (e) {
            console.error('[SyncWorker] Error pulling combo offer row:', (e as Error).message);
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
