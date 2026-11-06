import type { BarcodeRow, ProductInput, ProductQueryArgs, ProductRow } from './typesA.js';
import { getDb } from '../db/localDb.js';
import { parseCleanDate, getUtcRangeForStoreDateRange, localTimestamp } from './storeTime.js';
import { resolveGstApplicability } from '../utils/gst.js';
import crypto from 'node:crypto';
import * as productsSql from '../db/statements/products.js';

/** UTC bounds of the store days from `filterDate` to `filterDateEnd` (or the same day). */
function storeDateRangeUtc(filterDate: string, filterDateEnd: string | undefined, tenantId: string) {
  const cleanStart = parseCleanDate(filterDate);
  const cleanEnd = filterDateEnd && String(filterDateEnd).trim() !== '' ? parseCleanDate(filterDateEnd as string) : cleanStart;
  return getUtcRangeForStoreDateRange(cleanStart, cleanEnd, tenantId);
}
/** products use-cases for the main process (called by electron/ipc handlers). */


/** IPC `db:getProducts` */
export function getProducts(arg: string | ProductQueryArgs) {
  try {
    const db = getDb();
    const tenantId = typeof arg === 'string' ? arg : arg?.tenant_id;
    if (!tenantId) {
      console.warn('[db:getProducts] Called with no tenant_id — returning []');
      return [];
    }

    console.log(`[db:getProducts] Called — tenantId=${tenantId} arg=${JSON.stringify(arg)}`);

    if (typeof arg === 'string' || (!(arg as ProductQueryArgs).limit && !(arg as ProductQueryArgs).search && !(arg as ProductQueryArgs).barcode && !(arg as ProductQueryArgs).sortBy && !(arg as ProductQueryArgs).filterDate && !(arg as ProductQueryArgs).isGst && !(arg as ProductQueryArgs).dateField && (!(arg as ProductQueryArgs).stockStatus || (arg as ProductQueryArgs).stockStatus === 'all'))) {
      const rows = productsSql.findProductsBySkipStockUpdate(db).all(tenantId, tenantId, tenantId, tenantId);
      console.log(`[db:getProducts] Full list query → ${rows.length} rows returned for tenant ${tenantId}`);
      return rows;
    }

    const { limit, offset, search, sortBy, barcode, filterDate, isGst, dateField, stockStatus } = (arg as ProductQueryArgs);
    const dateRange = filterDate && String(filterDate).trim() !== ''
      ? storeDateRangeUtc(filterDate, (arg as ProductQueryArgs).filterDateEnd, tenantId)
      : null;
    const { statement, params } = productsSql.getProductsStatement(db, { tenantId, limit, offset, search, sortBy, barcode, isGst, dateField, stockStatus, dateRange });
    return statement.all(...params);
  } catch (error) {
    console.error('[db:getProducts]', error);
    return { error: 'Operation failed' };
  }
}

/** IPC `db:getProductsByIds` */
export function getProductsByIds({ tenant_id, product_ids }: { tenant_id: string; product_ids: string[] }) {
  try {
    const db = getDb();
    if (!product_ids?.length) return [];
    const placeholders = product_ids.map(() => '?').join(',');
    return productsSql.findProductsWithGradeByIds(db, placeholders).all(tenant_id || 'global', ...product_ids);
  } catch (error) {
    console.error('[db:getProductsByIds]', error);
    return { error: 'Operation failed' };
  }
}

/** IPC `db:getProductsCount` */
export function getProductsCount(arg: string | ProductQueryArgs) {
  try {
    const db = getDb();
    const tenantId = typeof arg === 'string' ? arg : arg?.tenant_id;
    if (!tenantId) return 0;

    const countArgs = arg as ProductQueryArgs;
    const dateRange = countArgs?.filterDate && String(countArgs.filterDate).trim() !== ''
      ? storeDateRangeUtc(countArgs.filterDate as string, countArgs.filterDateEnd, tenantId)
      : null;
    const { statement, params } = productsSql.getProductsCountStatement(db, tenantId, countArgs, dateRange);
    const result = statement.get(...params) as { count: number };
    return result ? result.count : 0;
  } catch {
    return 0;
  }
}

/** IPC `db:addProduct` */
export function addProduct(p: ProductInput) {
  try {
    const db = getDb();
    const cleanBarcode = (p.sku_barcode && String(p.sku_barcode).trim() !== '') ? String(p.sku_barcode).trim() : null;
    const cleanItemCode = (p.item_code && String(p.item_code).trim() !== '') ? String(p.item_code).trim() : null;
    const stmt = productsSql.insertProduct(db);
    stmt.run(
      p.product_id,
      p.tenant_id,
      p.name,
      cleanBarcode,
      cleanItemCode,
      p.category,
      p.hsn_sac_code,
      p.purchase_price,
      p.base_price,
      resolveGstApplicability(p.is_gst_applicable, p.hsn_sac_code),
      p.tax_rate_percent,
      p.uom || 'Pcs',
      p.brand_manufacturer,
      p.current_stock,
      p.reorder_level,
       typeof p.domain_attributes === 'string' ? p.domain_attributes : JSON.stringify(p.domain_attributes ?? {}),
       p.discount_percent ?? null,
       p.discount_flat ?? null,
       p.offer_price ?? null,
       p.is_deleted ?? 0,
       (['Kgs', 'Grams', 'Mtrs', 'Ltrs', 'kg', 'kgs', 'gram', 'grams', 'mtr', 'mtrs', 'ltr', 'ltrs'].includes((p.uom || '').toLowerCase()) ? 'WEIGHT' : (p.billing_type || 'PIECE')),
       p.grade_id || null,
       p.pricing_mode || 'FIXED_PRICE',
       p.average_weight_per_piece ?? null,
       p.weight_override_allowed ?? 0,
       p.is_service_item ?? 0
    );
    return { success: true };
  } catch (error) {
    const msg = (error as Error)?.message || 'Operation failed';
    console.error('[db:addProduct]', msg);
    return { success: false, error: msg };
  }
}

/** IPC `db:ensureServiceItem` */
export function ensureServiceItem({ tenant_id }: { tenant_id: string }) {
  try {
    const db = getDb();
    // Gather every live Service Charge candidate: flagged items or rows literally named 'Service Charge'.
    const candidates = productsSql.findProductsByIsServiceItem(db).all(tenant_id) as ProductRow[];
    const isFlagged = (p: ProductRow) => Number(p.is_service_item) === 1;
    const hasBarcode99 = (p: ProductRow) => String(p.sku_barcode || '').trim() === '99';

    // Deterministic canonical pick:
    //   1. flagged + barcode '99'   (the easy-scan item)
    //   2. flagged                  (the true service item)
    //   3. named 'Service Charge' + barcode '99'
    //   4. named 'Service Charge'    (oldest first)
    const canonical = candidates.find((p: ProductRow) => isFlagged(p) && hasBarcode99(p))
      || candidates.find((p: ProductRow) => isFlagged(p))
      || candidates.find((p: ProductRow) => hasBarcode99(p))
      || candidates[0];

    if (!canonical) {
      // Fresh tenant: create one canonical service charge row.
      const barcodeInUse = productsSql.findProductsBySkuBarcode(db).get(tenant_id);
      const barcode = barcodeInUse ? `SVC-${crypto.randomUUID().slice(0, 8)}` : '99';
      const product_id = crypto.randomUUID();
      productsSql.insertProduct2(db).run(product_id, tenant_id, barcode);
      return { success: true, product_id };
    }

    // Soft-delete every duplicate so only the canonical one survives (locally + pushed to cloud).
    const softDelete = productsSql.updateProductIsDeleted(db);
    const deletedHadBarcode99 = candidates.some((c: ProductRow) => c.product_id !== canonical.product_id && hasBarcode99(c));
    for (const c of candidates) {
      if (c.product_id !== canonical.product_id) softDelete.run(tenant_id, c.product_id);
    }

    // Keep the canonical row properly flagged/named, and give it the easy barcode when it has none.
    const canonicalBarcode = String(canonical.sku_barcode || '').trim();
    const canAdopt99 = !canonicalBarcode || (deletedHadBarcode99 && canonicalBarcode !== '99');
    if (canAdopt99) {
      // The soft-deleted duplicate still occupies the UNIQUE '99' — clear it first, then hand it over.
      productsSql.updateProductSkuBarcode(db).run(tenant_id);
      const barcodeTaken = productsSql.findProductsBySkuBarcodeProductId(db).get(tenant_id, canonical.product_id);
      canonical.sku_barcode = barcodeTaken ? (canonicalBarcode || `SVC-${crypto.randomUUID().slice(0, 8)}`) : '99';
    }

    const needsFix = !isFlagged(canonical) || canonical.name !== 'Service Charge' || canonical.sku_barcode !== canonicalBarcode;
    if (needsFix) {
      productsSql.updateProductByProductId(db).run(canonical.sku_barcode, tenant_id, canonical.product_id);
    }

    return { success: true, product_id: canonical.product_id, sku_barcode: canonical.sku_barcode };
  } catch (error) {
    console.error('[db:ensureServiceItem]', error);
    return { success: false, error: (error as Error).message || 'Operation failed' };
  }
}

/** IPC `db:updateProduct` */
export function updateProduct(p: ProductInput) {
  try {
    const db = getDb();
    const cleanBarcode = (p.sku_barcode && String(p.sku_barcode).trim() !== '') ? String(p.sku_barcode).trim() : null;
    const cleanItemCode = (p.item_code && String(p.item_code).trim() !== '') ? String(p.item_code).trim() : null;
    const stmt = productsSql.updateProductByProductId2(db);
    stmt.run(
      p.tenant_id,
      p.name,
      cleanBarcode,
      cleanItemCode,
      p.category,
      p.hsn_sac_code,
      p.purchase_price,
      p.base_price,
      resolveGstApplicability(p.is_gst_applicable, p.hsn_sac_code),
      p.tax_rate_percent,
      p.uom || 'Pcs',
      p.brand_manufacturer,
      p.current_stock,
      p.reorder_level,
       typeof p.domain_attributes === 'string' ? p.domain_attributes : JSON.stringify(p.domain_attributes ?? {}),
       p.discount_percent ?? null,
       p.discount_flat ?? null,
       p.offer_price ?? null,
       p.is_deleted ?? 0,
       (['Kgs', 'Grams', 'Mtrs', 'Ltrs', 'kg', 'kgs', 'gram', 'grams', 'mtr', 'mtrs', 'ltr', 'ltrs'].includes((p.uom || '').toLowerCase()) ? 'WEIGHT' : (p.billing_type || 'PIECE')),
       p.grade_id || null,
       p.pricing_mode || 'FIXED_PRICE',
       p.average_weight_per_piece ?? null,
       p.weight_override_allowed ?? 0,
       p.is_service_item ?? 0,
       p.product_id
    );
    return { success: true };
  } catch (error) {
    const msg = (error as Error)?.message || 'Operation failed';
    console.error('[db:updateProduct]', msg);
    return { success: false, error: msg };
  }
}

/** IPC `db:updateProductGstFlag` */
export function updateProductGstFlag({ tenant_id, product_id, is_gst_applicable }: { tenant_id: string; product_id: string; is_gst_applicable: number }) {
  const db = getDb();
  const res = productsSql.updateProductIsGstApplicable(db).run(is_gst_applicable ? 1 : 0, product_id, tenant_id);
  if (res.changes === 0) return { success: false, error: 'Product not found' };
  return { success: true };
}

/** IPC `db:updateProductName` */
export function updateProductName({ tenant_id, product_id, name }: { tenant_id: string; product_id: string; name: string }) {
  const db = getDb();
  const res = productsSql.updateProductName(db).run(name, product_id, tenant_id);
  if (res.changes === 0) return { success: false, error: 'Product not found' };
  return { success: true };
}

/** IPC `db:deleteProduct` */
export function deleteProduct(productId: string) {
  try {
    const db = getDb();
    // Soft delete
    productsSql.updateProductIsDeletedAlt(db).run(productId);
    return { success: true };
  } catch (error) {
    console.error('[db:deleteProduct]', error);
    return { success: false, error: 'Operation failed' };
  }
}

/** IPC `db:bulkDeleteProducts` */
export function bulkDeleteProducts(productIds: string[]) {
  try {
    const db = getDb();
    if (!Array.isArray(productIds) || productIds.length === 0) {
      return { success: true, count: 0 };
    }
    const placeholders = productIds.map(() => '?').join(',');
    const stmt = productsSql.softDeleteProductsByIds(db, placeholders);
    const res = stmt.run(...productIds);
    return { success: true, count: res.changes };
  } catch (error) {
    console.error('[db:bulkDeleteProducts]', error);
    return { success: false, error: 'Bulk delete failed: ' + ((error as Error)?.message || 'Unknown error') };
  }
}

/** IPC `db:bulkImportProducts` */
export function bulkImportProducts(products: ProductInput[]) {
  try {
    const db = getDb();
    
    if (!products.length) return { success: true };
    const tenantId = products[0].tenant_id;
    
    // Get pricing tiers for this tenant to map names to IDs
    interface PricingTier { pricing_tier_id: string; name: string; }
    const tiers = productsSql.findPricingTiers(db).all(tenantId) as PricingTier[];
    const tierNameToId = new Map<string, string>();
    for (const t of tiers) {
      tierNameToId.set(t.name.toLowerCase().trim(), t.pricing_tier_id);
    }
    
    // Helper: get or create tier by name dynamically (auto-create if missing)
    const getOrCreateTierId = (tierName: string): string => {
      const trimmed = tierName.trim();
      const normalized = trimmed.toLowerCase();
      const tierId = tierNameToId.get(normalized);
      if (tierId) return tierId;

      // Dynamic match against existing tiers (strip spaces and non-alphanumeric chars)
      const cleanName = normalized.replace(/[^a-z0-9]/g, '');
      if (cleanName) {
        for (const t of tiers) {
          const cleanTier = t.name.toLowerCase().replace(/[^a-z0-9]/g, '');
          if (
            cleanName === cleanTier ||
            cleanName === `${cleanTier}price` ||
            cleanName === `${cleanTier}rate` ||
            cleanTier.includes(cleanName) ||
            cleanName.includes(cleanTier)
          ) {
            tierNameToId.set(normalized, t.pricing_tier_id);
            return t.pricing_tier_id;
          }
        }
      }
      
      // Auto-create missing tier dynamically with the exact provided name
      const newTierId = crypto.randomUUID();
      const now = localTimestamp(new Date());
      productsSql.insertPricingTier(db).run(newTierId, tenantId, trimmed, tiers.length, now, now);
      
      tierNameToId.set(normalized, newTierId);
      if (cleanName) tierNameToId.set(cleanName, newTierId);
      tiers.push({ pricing_tier_id: newTierId, name: trimmed });
      console.log('[bulkImportProducts] Auto-created dynamic tier:', trimmed, '->', newTierId);
      return newTierId;
    };
    
    const transaction = db.transaction((prods) => {
      const findExistingByBarcode = productsSql.findProductsBySkuBarcodeProductId2(db);
      const findExistingByItemCode = productsSql.findProductsByItemCode(db);
      const findExistingByName = productsSql.findProducts(db);

      const insertStmt = productsSql.insertProduct3(db);

      const updateStmt = productsSql.updateProductByProductId3(db);
      
      const tierStmt = productsSql.upsertProductPricing(db);
      
      const now = new Date();
      for (const p of prods) {
        now.setMilliseconds(now.getMilliseconds() + 1);
        const timestamp = localTimestamp(now);

        const cleanBarcode = (p.sku_barcode && String(p.sku_barcode).trim()) ? String(p.sku_barcode).trim() : null;
        const cleanItemCode = (p.item_code && String(p.item_code).trim()) ? String(p.item_code).trim() : null;
        const cleanName = (p.name && String(p.name).trim()) ? String(p.name).trim() : '';

        let existingId: string | null = null;
        if (cleanBarcode) {
          const row = findExistingByBarcode.get(tenantId, cleanBarcode) as ProductRow | undefined;
          if (row?.product_id) existingId = row.product_id;
        }
        if (!existingId && cleanItemCode) {
          const row = findExistingByItemCode.get(tenantId, cleanItemCode) as ProductRow | undefined;
          if (row?.product_id) existingId = row.product_id;
        }
        if (!existingId && cleanName) {
          const row = findExistingByName.get(tenantId, cleanName, p.brand_manufacturer || '') as ProductRow | undefined;
          if (row?.product_id) existingId = row.product_id;
        }

        const effectiveProductId = existingId || p.product_id || crypto.randomUUID();

        if (existingId) {
          updateStmt.run(
            p.name,
            cleanBarcode,
            cleanItemCode,
            p.category || null,
            p.hsn_sac_code || null,
            p.purchase_price || 0,
            p.base_price || 0,
            resolveGstApplicability(p.is_gst_applicable, p.hsn_sac_code),
            p.tax_rate_percent || 0,
            p.uom || 'Pcs',
            p.brand_manufacturer || null,
            p.current_stock || 0,
            p.reorder_level || 0,
            typeof p.domain_attributes === 'string' ? p.domain_attributes : JSON.stringify(p.domain_attributes ?? {}),
            p.discount_percent ?? null,
            p.discount_flat ?? null,
            p.offer_price ?? null,
            p.billing_type || 'PIECE',
            p.grade_id || null,
            p.pricing_mode || 'FIXED_PRICE',
            p.average_weight_per_piece ?? null,
            p.weight_override_allowed ?? 0,
            timestamp,
            existingId
          );
        } else {
          insertStmt.run(
            effectiveProductId,
            p.tenant_id,
            p.name,
            cleanBarcode,
            cleanItemCode,
            p.category || null,
            p.hsn_sac_code || null,
            p.purchase_price || 0,
            p.base_price || 0,
            resolveGstApplicability(p.is_gst_applicable, p.hsn_sac_code),
            p.tax_rate_percent || 0,
            p.uom || 'Pcs',
            p.brand_manufacturer || null,
            p.current_stock || 0,
            p.reorder_level || 0,
            typeof p.domain_attributes === 'string' ? p.domain_attributes : JSON.stringify(p.domain_attributes ?? {}),
            p.discount_percent ?? null,
            p.discount_flat ?? null,
            p.offer_price ?? null,
            p.billing_type || 'PIECE',
            p.grade_id || null,
            p.pricing_mode || 'FIXED_PRICE',
            p.average_weight_per_piece ?? null,
            p.weight_override_allowed ?? 0,
            timestamp,
            timestamp
          );
        }
        
        // Handle tier prices - support both tier_id keys and tier_name keys
        if (p.tier_prices && typeof p.tier_prices === 'object') {
          for (const [key, price] of Object.entries(p.tier_prices)) {
            const priceNum = Number(price);
            if (!isNaN(priceNum) && priceNum >= 0) {
              let tierId = tierNameToId.get(key.toLowerCase().trim());
              // Also try direct tier_id match
              if (!tierId) {
                const directMatch = tiers.find(t => t.pricing_tier_id === key);
                if (directMatch) tierId = directMatch.pricing_tier_id;
              }
              // Auto-create tier if not found
              if (!tierId) {
                tierId = getOrCreateTierId(key);
              }
              if (tierId) {
                tierStmt.run(crypto.randomUUID(), tenantId, effectiveProductId, tierId, priceNum, timestamp, timestamp);
              }
            }
          }
        }
      }
    });
    transaction(products);
    return { success: true };
  } catch (error) {
    console.error('[db:bulkImportProducts]', error);
    return { success: false, error: (error as Error)?.message || 'Operation failed' };
  }
}

/** IPC `db:updatePrintStatus` */
export function updatePrintStatus(productIds: string[]) {
  try {
    const db = getDb();
    const transaction = db.transaction((ids) => {
      const stmt = productsSql.updateProductPrintStatus(db);
      for (const id of ids) {
        stmt.run(id);
      }
    });
    transaction(productIds);
    return { success: true };
  } catch (error) {
    console.error('[db:updatePrintStatus]', error);
    return { success: false, error: 'Operation failed' };
  }
}

/** IPC `db:resetPrintStatus` */
export function resetPrintStatus(tenant_id: string) {
  try {
    const db = getDb();
    if (!tenant_id) return { success: false, error: 'Tenant ID required' };
    productsSql.updateProductPrintStatusAlt(db).run(tenant_id);
    return { success: true };
  } catch (error) {
    console.error('[db:resetPrintStatus]', error);
    return { success: false, error: 'Operation failed' };
  }
}

/** IPC `db:getPendingPrintProducts` */
export function getPendingPrintProducts({ tenant_id, limit, date, dateEnd, only_pending = true }: { tenant_id: string, limit: number, date?: string, dateEnd?: string, only_pending?: boolean }) {
  try {
    const db = getDb();
    if (!tenant_id) return [];
    
    const { statement, params } = productsSql.getPendingPrintProductsStatement(db, { tenant_id, only_pending, date, dateEnd, limit, dateRange: date ? getUtcRangeForStoreDateRange(date, dateEnd || date, tenant_id) : undefined });
    
    return statement.all(...params);
  } catch (error) {
    console.error('[db:getPendingPrintProducts]', error);
    return { error: 'Operation failed' };
  }
}

/** IPC `db:adjustStock` */
export function adjustStock({ product_id, delta, pcsDelta }: { product_id: string; delta?: number | null; pcsDelta?: number | null }) {
  try {
    const db = getDb();
    if (pcsDelta != null) {
      const row = productsSql.findProductsByProductId(db).get(product_id) as ProductRow | undefined;
      let da: Record<string, unknown> = {};
      try { da = JSON.parse(row?.domain_attributes || '{}'); } catch { /* keep empty */ }
      const current = Number(da.pcs_stock ?? da.pcs ?? 0) || 0;
      const nextPcs = Math.max(0, current + pcsDelta);
      da.pcs_stock = nextPcs;
      da.pcs = nextPcs;
      productsSql.updateProductDomainAttributes(db).run(JSON.stringify(da), product_id);
    }
    if (delta != null) {
      productsSql.updateProductCurrentStock(db).run(delta, product_id);
    }
    return { success: true };
  } catch (error) {
    console.error('[db:adjustStock]', error);
    return { success: false, error: 'Operation failed' };
  }
}

/** IPC `db:getStockReport` */
export function getStockReport(tenantId: string) {
  try {
    const db = getDb();
    if (!tenantId) return [];
    return productsSql.findProducts2(db).all(tenantId);
  } catch (error) {
    console.error('[db:getStockReport]', error);
    return { error: 'Operation failed' };
  }
}

/** IPC `db:getProductBillQuantities` */
export function getProductBillQuantities(tenantId: string) {
  try {
    const db = getDb();
    if (!tenantId) return [];
    return productsSql.findProductsByConvertedTo_AndBillType(db).all(tenantId, tenantId, tenantId);
  } catch (error) {
    console.error('[db:getProductBillQuantities]', error);
    return [];
  }
}

/** IPC `db:getProductSalesSummary` */
export function getProductSalesSummary({ tenant_id, fromDate, toDate }: { tenant_id: string; fromDate?: string; toDate?: string }) {
  try {
    const db = getDb();
    if (!tenant_id) return [];

    let dateClause = '';
    const params: unknown[] = [tenant_id];

    if (fromDate) {
      const cleanStart = parseCleanDate(fromDate);
      const cleanEnd = toDate ? parseCleanDate(toDate) : cleanStart;
      const { startUtc, endUtc } = getUtcRangeForStoreDateRange(cleanStart, cleanEnd, tenant_id);
      dateClause = ' AND (i.created_at >= ? AND i.created_at <= ?)';
      params.push(startUtc, endUtc);
    }

    return productsSql.listProductSalesQuantities(db, dateClause).all(...params);
  } catch (error) {
    console.error('[db:getProductSalesSummary]', error);
    return [];
  }
}

/** IPC `db:productHasEstimateBills` */
export function productHasEstimateBills({ product_id, tenant_id }: { product_id: string; tenant_id: string }) {
  try {
    const db = getDb();
    const row = productsSql.findOnePurchaseBillItemByProductIdAndBillType(db).get(product_id, tenant_id);
    return { success: true, hasEstimate: !!row };
  } catch (error) {
    console.error('[db:productHasEstimateBills]', error);
    return { success: false, error: 'Operation failed' };
  }
}

/** IPC `db:generateBarcode` */
export function generateBarcode({ tenant_id, item_code, strip_suffix }: { tenant_id: string; item_code?: string; strip_suffix?: string }) {
  try {
    const db = getDb();
    const prefix = (item_code || '').trim();
    const suffix = strip_suffix || '';
    let nextNum = 1;
    if (prefix) {
      const rows = productsSql.findProductsSkuBarcode(db).all(tenant_id, `${prefix}%`) as BarcodeRow[];
      for (const row of rows) {
        let base = row.sku_barcode.slice(prefix.length);
        // Strip known suffix (priceCode) from the end before extracting digits
        if (suffix && base.endsWith(suffix)) {
          base = base.slice(0, -suffix.length);
        }
        // Skip standard/manufacturer barcodes (length >= 8 digits) to avoid auto-increment jumps
        if (base.length >= 8) {
          continue;
        }
        const numStr = base.replace(/\D/g, '');
        if (numStr) {
          const num = parseInt(numStr, 10);
          if (num >= nextNum) nextNum = num + 1;
        }
      }
    } else {
      const rows = productsSql.findProductsSkuBarcode2(db).all(tenant_id) as BarcodeRow[];
      for (const row of rows) {
        let base = row.sku_barcode;
        // Strip known suffix from the end
        if (suffix && base.endsWith(suffix)) {
          base = base.slice(0, -suffix.length);
        }
        // Skip standard/manufacturer barcodes (length >= 8 digits) to avoid auto-increment jumps
        if (base.length >= 8) {
          continue;
        }
        const numStr = base.replace(/\D/g, '');
        if (numStr) {
          const num = parseInt(numStr, 10);
          if (num >= nextNum) nextNum = num + 1;
        }
      }
    }
    const digits = Math.max(3, nextNum.toString().length);
    const barcode = prefix + String(nextNum).padStart(digits, '0');
    return { success: true, barcode };
  } catch (error) {
    console.error('[db:generateBarcode]', error);
    return { success: false, error: 'Operation failed' };
  }
}
