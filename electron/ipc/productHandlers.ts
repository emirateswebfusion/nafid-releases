import { ipcMain } from 'electron';
import crypto from 'node:crypto';
import { getDb } from '../db/localDb.js';
import {
  safeHandler,
  validateString,
  validateNumber,
  validateOptionalString,
  validateOptionalNumber,
  validateObject,
  validateArray,
  resolveGstApplicability,
  localTimestamp,
  parseCleanDate,
  getUtcRangeForStoreDateRange
} from './common.js';



export function buildProductSearchConditions(search: string, tablePrefix: string = 'p.') {
  const cleanSearch = String(search).trim();
  const wordTokens = cleanSearch.split(/[^\p{L}\p{N}]+/gu).filter(w => w.length > 0);
  const p = tablePrefix;

  const buildSingleFieldGroup = (val: string) => {
    const valNoSpace = val.replace(/\s+/g, '');
    const valClean = val.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
    const cleanPattern = valClean.length > 0 ? `%${valClean}%` : `%${val}%`;
    const sql = `(${p}name LIKE ? OR REPLACE(${p}name, ' ', '') LIKE ? OR CLEAN_STR(${p}name) LIKE ? OR ${p}sku_barcode LIKE ? OR REPLACE(${p}sku_barcode, ' ', '') LIKE ? OR CLEAN_STR(${p}sku_barcode) LIKE ? OR ${p}item_code LIKE ? OR REPLACE(${p}item_code, ' ', '') LIKE ? OR CLEAN_STR(${p}item_code) LIKE ? OR ${p}brand_manufacturer LIKE ? OR REPLACE(${p}brand_manufacturer, ' ', '') LIKE ? OR CLEAN_STR(${p}brand_manufacturer) LIKE ? OR ${p}category LIKE ? OR REPLACE(${p}category, ' ', '') LIKE ? OR CLEAN_STR(${p}category) LIKE ? OR ${p}hsn_sac_code LIKE ? OR CLEAN_STR(${p}hsn_sac_code) LIKE ?)`;
    const params = [
      `%${val}%`, `%${valNoSpace}%`, cleanPattern,
      `%${val}%`, `%${valNoSpace}%`, cleanPattern,
      `%${val}%`, `%${valNoSpace}%`, cleanPattern,
      `%${val}%`, `%${valNoSpace}%`, cleanPattern,
      `%${val}%`, `%${valNoSpace}%`, cleanPattern,
      `%${val}%`, cleanPattern,
    ];
    return { sql, params };
  };

  const fullGroup = buildSingleFieldGroup(cleanSearch);

  if (wordTokens.length <= 1) {
    return {
      sql: `(${fullGroup.sql} OR ${p}product_id = ?)`,
      params: [...fullGroup.params, cleanSearch]
    };
  }

  const tokenClauses: string[] = [];
  const tokenParams: any[] = [];
  for (const token of wordTokens) {
    const tGroup = buildSingleFieldGroup(token);
    tokenClauses.push(tGroup.sql);
    tokenParams.push(...tGroup.params);
  }

  const sql = `((${tokenClauses.join(' AND ')}) OR ${fullGroup.sql} OR ${p}product_id = ?)`;
  const params = [...tokenParams, ...fullGroup.params, cleanSearch];

  return { sql, params };
}


export function registerProductHandlers(): void {
ipcMain.handle('db:debugSyncState', (event, tenant_id: string) => {
  try {
    const db = getDb();
    const tables = ['products', 'invoices', 'cash_transactions', 'cash_drawer', 'cashier_audit_log'];
    const counts: Record<string, any> = {};
    for (const t of tables) {
      try {
        const row = db.prepare(`SELECT COUNT(*) as total, SUM(CASE WHEN sync_status='SYNCED' THEN 1 ELSE 0 END) as synced, SUM(CASE WHEN sync_status='PENDING' THEN 1 ELSE 0 END) as pending FROM ${t} WHERE tenant_id = ?`).get(tenant_id) as any;
        counts[t] = row;
      } catch (e: any) { counts[t] = { error: e.message }; }
    }
    const cursors = db.prepare(`SELECT key, value FROM sync_meta WHERE key LIKE ?`).all(`pull_cursor:${tenant_id}:%`) as any[];
    const isSyncActive = db.prepare(`SELECT value FROM sync_meta WHERE key = ?`).get(`cash_drawer_conflict_fix_v2:${tenant_id}`) as any;
    console.log('[db:debugSyncState] Table counts:', JSON.stringify(counts, null, 2));
    console.log('[db:debugSyncState] Pull cursors:', JSON.stringify(cursors, null, 2));
    return { counts, cursors, healingFlagSet: !!isSyncActive };
  } catch (e: any) {
    console.error('[db:debugSyncState] Error:', e.message);
    return { error: e.message };
  }
});


ipcMain.handle('db:getProducts', (event, arg: any) => {
  try {
    const db = getDb();
    const tenantId = typeof arg === 'string' ? arg : arg?.tenant_id;
    if (!tenantId) {
      console.warn('[db:getProducts] Called with no tenant_id â€” returning []');
      return [];
    }

    console.log(`[db:getProducts] Called â€” tenantId=${tenantId} arg=${JSON.stringify(arg)}`);

    if (typeof arg === 'string' || (!arg.limit && !arg.search && !arg.barcode && !arg.sortBy && !arg.filterDate && !arg.isGst && !arg.dateField && (!arg.stockStatus || arg.stockStatus === 'all'))) {
      const rows = db.prepare(`
        SELECT p.*, pg.rate as grade_rate, pg.purchase_price as grade_purchase_price,
          CASE WHEN (COALESCE(pb_paper.paper_in, 0) - COALESCE(inv_paper.paper_out, 0)) != 0
               THEN (COALESCE(pb_paper.paper_in, 0) - COALESCE(inv_paper.paper_out, 0))
               WHEN CAST(JSON_EXTRACT(p.domain_attributes, '$.paper_stock') AS REAL) IS NOT NULL
               THEN CAST(JSON_EXTRACT(p.domain_attributes, '$.paper_stock') AS REAL)
               ELSE 0
          END as paper_stock,
          COALESCE(CAST(JSON_EXTRACT(p.domain_attributes, '$.gst_purchase_price') AS REAL), pb_latest.purchase_price, CAST(JSON_EXTRACT(p.domain_attributes, '$.paper_purchase_price') AS REAL)) as gst_purchase_price,
          COALESCE(CAST(JSON_EXTRACT(p.domain_attributes, '$.paper_mrp') AS REAL), pb_latest.selling_price, CAST(JSON_EXTRACT(p.domain_attributes, '$.paper_base_price') AS REAL)) as paper_mrp
        FROM products p 
        LEFT JOIN product_grades pg ON p.grade_id = pg.grade_id 
        LEFT JOIN (
          SELECT product_id, SUM(quantity) as paper_in
          FROM purchase_bill_items
          WHERE skip_stock_update = 1 AND tenant_id = ?
          GROUP BY product_id
        ) pb_paper ON p.product_id = pb_paper.product_id
        LEFT JOIN (
          SELECT product_id, SUM(qty_from_paper_stock) as paper_out
          FROM invoice_items
          WHERE tenant_id = ?
          GROUP BY product_id
        ) inv_paper ON p.product_id = inv_paper.product_id
        LEFT JOIN (
          SELECT pbi.product_id, pbi.purchase_price, pbi.selling_price
          FROM purchase_bill_items pbi
          INNER JOIN (
            SELECT product_id, MAX(rowid) as max_rowid
            FROM purchase_bill_items
            WHERE skip_stock_update = 1 AND tenant_id = ?
            GROUP BY product_id
          ) latest ON pbi.rowid = latest.max_rowid
        ) pb_latest ON p.product_id = pb_latest.product_id
        WHERE p.tenant_id = ? AND p.is_deleted = 0 
        ORDER BY p.name COLLATE NOCASE ASC, p.product_id ASC
      `).all(tenantId, tenantId, tenantId, tenantId);
      console.log(`[db:getProducts] Full list query → ${rows.length} rows returned for tenant ${tenantId}`);
      return rows;
    }

    const { limit, offset, search, sortBy, barcode, filterDate, isGst, dateField, stockStatus } = arg;
    let query = `
      SELECT p.*, pg.rate as grade_rate, pg.purchase_price as grade_purchase_price,
        CASE WHEN (COALESCE(pb_paper.paper_in, 0) - COALESCE(inv_paper.paper_out, 0)) != 0
             THEN (COALESCE(pb_paper.paper_in, 0) - COALESCE(inv_paper.paper_out, 0))
             WHEN CAST(JSON_EXTRACT(p.domain_attributes, '$.paper_stock') AS REAL) IS NOT NULL
             THEN CAST(JSON_EXTRACT(p.domain_attributes, '$.paper_stock') AS REAL)
             ELSE 0
        END as paper_stock,
        COALESCE(CAST(JSON_EXTRACT(p.domain_attributes, '$.gst_purchase_price') AS REAL), pb_latest.purchase_price, CAST(JSON_EXTRACT(p.domain_attributes, '$.paper_purchase_price') AS REAL)) as gst_purchase_price,
        COALESCE(CAST(JSON_EXTRACT(p.domain_attributes, '$.paper_mrp') AS REAL), pb_latest.selling_price, CAST(JSON_EXTRACT(p.domain_attributes, '$.paper_base_price') AS REAL)) as paper_mrp
      FROM products p 
      LEFT JOIN product_grades pg ON p.grade_id = pg.grade_id 
      LEFT JOIN (
        SELECT product_id, SUM(quantity) as paper_in
        FROM purchase_bill_items
        WHERE skip_stock_update = 1 AND tenant_id = ?
        GROUP BY product_id
      ) pb_paper ON p.product_id = pb_paper.product_id
      LEFT JOIN (
        SELECT product_id, SUM(qty_from_paper_stock) as paper_out
        FROM invoice_items
        WHERE tenant_id = ?
        GROUP BY product_id
      ) inv_paper ON p.product_id = inv_paper.product_id
      LEFT JOIN (
        SELECT pbi.product_id, pbi.purchase_price, pbi.selling_price
        FROM purchase_bill_items pbi
        INNER JOIN (
          SELECT product_id, MAX(rowid) as max_rowid
          FROM purchase_bill_items
          WHERE skip_stock_update = 1 AND tenant_id = ?
          GROUP BY product_id
        ) latest ON pbi.rowid = latest.max_rowid
      ) pb_latest ON p.product_id = pb_latest.product_id
      WHERE p.tenant_id = ? AND p.is_deleted = 0
    `;
    const params: any[] = [tenantId, tenantId, tenantId, tenantId];

    if (isGst !== undefined) {
       query += ' AND p.is_gst_applicable = ?';
       params.push(isGst ? 1 : 0);
    }

    if (stockStatus && stockStatus !== 'all') {
      if (stockStatus === 'low_stock' || stockStatus === 'low') {
        query += ' AND p.current_stock <= p.reorder_level AND p.reorder_level > 0 AND p.current_stock > 0';
      } else if (stockStatus === 'out_of_stock' || stockStatus === 'out') {
        query += ' AND p.current_stock <= 0 AND COALESCE((COALESCE(pb_paper.paper_in, 0) - COALESCE(inv_paper.paper_out, 0)), CAST(JSON_EXTRACT(p.domain_attributes, \'$.paper_stock\') AS REAL), 0) <= 0';
      } else if (stockStatus === 'in_stock' || stockStatus === 'in') {
        query += ' AND (p.current_stock > 0 OR COALESCE((COALESCE(pb_paper.paper_in, 0) - COALESCE(inv_paper.paper_out, 0)), CAST(JSON_EXTRACT(p.domain_attributes, \'$.paper_stock\') AS REAL), 0) > 0)';
      } else if (stockStatus === 'no_barcode' || stockStatus === 'no_code') {
        query += " AND (p.sku_barcode IS NULL OR TRIM(p.sku_barcode) = '')";
      }
    }

    if (barcode) {
       const cleanBarcode = String(barcode).trim();
       const cleanBarcodeNoSpace = cleanBarcode.replace(/\s+/g, '');
       const cleanBarcodeClean = cleanBarcode.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
       if (cleanBarcodeClean.length > 0) {
         query += ' AND (TRIM(p.sku_barcode) = ? OR LOWER(p.sku_barcode) = LOWER(?) OR REPLACE(p.sku_barcode, \' \', \'\') = ? OR CLEAN_STR(p.sku_barcode) = ? OR TRIM(p.item_code) = ? OR LOWER(p.item_code) = LOWER(?) OR REPLACE(p.item_code, \' \', \'\') = ? OR CLEAN_STR(p.item_code) = ?)';
         params.push(cleanBarcode, cleanBarcode, cleanBarcodeNoSpace, cleanBarcodeClean, cleanBarcode, cleanBarcode, cleanBarcodeNoSpace, cleanBarcodeClean);
       } else {
         query += ' AND (TRIM(p.sku_barcode) = ? OR LOWER(p.sku_barcode) = LOWER(?) OR REPLACE(p.sku_barcode, \' \', \'\') = ? OR TRIM(p.item_code) = ? OR LOWER(p.item_code) = LOWER(?) OR REPLACE(p.item_code, \' \', \'\') = ?)';
         params.push(cleanBarcode, cleanBarcode, cleanBarcodeNoSpace, cleanBarcode, cleanBarcode, cleanBarcodeNoSpace);
       }
     } else if (search) {
        const cond = buildProductSearchConditions(search, 'p.');
        query += ` AND ${cond.sql}`;
        params.push(...cond.params);
     }

     if (filterDate && String(filterDate).trim() !== '') {
        const dateCol = dateField === 'updated_at' ? 'COALESCE(p.updated_at, p.created_at)' : 'p.created_at';
        const cleanStart = parseCleanDate(filterDate);
        const cleanEnd = arg.filterDateEnd && String(arg.filterDateEnd).trim() !== '' ? parseCleanDate(arg.filterDateEnd) : cleanStart;
        const { startUtc, endUtc } = getUtcRangeForStoreDateRange(cleanStart, cleanEnd, tenantId);
        query += ` AND (${dateCol} >= ? AND ${dateCol} <= ?)`;
        params.push(startUtc, endUtc);
     }

     if (sortBy === 'created_at') query += ' ORDER BY p.created_at DESC, p.product_id ASC';
     else if (sortBy === 'updated_at') query += ' ORDER BY p.updated_at DESC, p.product_id ASC';
     else if (sortBy === 'created_at') query += ' ORDER BY p.created_at DESC, p.product_id ASC';
     else if (sortBy === 'updated_at') query += ' ORDER BY p.updated_at DESC, p.product_id ASC';
     else if (sortBy === 'stock') query += ' ORDER BY p.current_stock ASC, p.product_id ASC';
     else if (search) {
        const cleanSearch = String(search).trim();
        const cleanSearchNoSpace = cleanSearch.replace(/\s+/g, '');
        const cleanSearchClean = cleanSearch.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
        query += ` ORDER BY ` +
          `CASE ` +
            `WHEN TRIM(p.sku_barcode) = ? OR TRIM(p.item_code) = ? OR REPLACE(p.sku_barcode, ' ', '') = ? OR REPLACE(p.item_code, ' ', '') = ? OR CLEAN_STR(p.sku_barcode) = ? OR CLEAN_STR(p.item_code) = ? THEN 1 ` +
            `WHEN TRIM(p.sku_barcode) LIKE ? OR TRIM(p.item_code) LIKE ? OR REPLACE(p.sku_barcode, ' ', '') LIKE ? OR REPLACE(p.item_code, ' ', '') LIKE ? OR CLEAN_STR(p.sku_barcode) LIKE ? OR CLEAN_STR(p.item_code) LIKE ? THEN 2 ` +
            `WHEN p.sku_barcode LIKE ? OR p.item_code LIKE ? OR REPLACE(p.sku_barcode, ' ', '') LIKE ? OR REPLACE(p.item_code, ' ', '') LIKE ? OR CLEAN_STR(p.sku_barcode) LIKE ? OR CLEAN_STR(p.item_code) LIKE ? THEN 3 ` +
            `WHEN LOWER(p.name) = LOWER(?) OR REPLACE(p.name, ' ', '') = ? OR CLEAN_STR(p.name) = ? THEN 4 ` +
            `WHEN p.name LIKE ? OR REPLACE(p.name, ' ', '') LIKE ? OR CLEAN_STR(p.name) LIKE ? THEN 5 ` +
            `WHEN p.name LIKE ? OR REPLACE(p.name, ' ', '') LIKE ? OR CLEAN_STR(p.name) LIKE ? THEN 6 ` +
            `WHEN p.brand_manufacturer LIKE ? OR REPLACE(p.brand_manufacturer, ' ', '') LIKE ? OR CLEAN_STR(p.brand_manufacturer) LIKE ? THEN 7 ` +
            `WHEN p.brand_manufacturer LIKE ? OR REPLACE(p.brand_manufacturer, ' ', '') LIKE ? OR CLEAN_STR(p.brand_manufacturer) LIKE ? THEN 8 ` +
            `ELSE 9 ` +
          `END ASC, ` +
          `p.name COLLATE NOCASE ASC, ` +
          `p.product_id ASC`;
        params.push(
          cleanSearch, cleanSearch, cleanSearchNoSpace, cleanSearchNoSpace, cleanSearchClean, cleanSearchClean,
          `${cleanSearch}%`, `${cleanSearch}%`, `${cleanSearchNoSpace}%`, `${cleanSearchNoSpace}%`, `${cleanSearchClean}%`, `${cleanSearchClean}%`,
          `%${cleanSearch}%`, `%${cleanSearch}%`, `%${cleanSearchNoSpace}%`, `%${cleanSearchNoSpace}%`, `%${cleanSearchClean}%`, `%${cleanSearchClean}%`,
          cleanSearch, cleanSearchNoSpace, cleanSearchClean,
          `${cleanSearch}%`, `${cleanSearchNoSpace}%`, `${cleanSearchClean}%`,
          `%${cleanSearch}%`, `%${cleanSearchNoSpace}%`, `%${cleanSearchClean}%`,
          `${cleanSearch}%`, `${cleanSearchNoSpace}%`, `${cleanSearchClean}%`,
          `%${cleanSearch}%`, `%${cleanSearchNoSpace}%`, `%${cleanSearchClean}%`
        );
     }
    else query += ' ORDER BY p.name COLLATE NOCASE ASC, p.product_id ASC';

    if (limit) {
       query += ' LIMIT ?';
       params.push(limit);
    }
    if (offset) {
       query += ' OFFSET ?';
       params.push(offset);
    }

    return db.prepare(query).all(...params);
  } catch (error: any) {
    console.error('[db:getProducts]', error);
    return { error: 'Operation failed' };
  }
});

ipcMain.handle('db:getProductsByIds', (event, { tenant_id, product_ids }: { tenant_id: string; product_ids: string[] }) => {
  try {
    const db = getDb();
    if (!product_ids?.length) return [];
    const placeholders = product_ids.map(() => '?').join(',');
    return db.prepare(`SELECT p.*, pg.rate as grade_rate, pg.purchase_price as grade_purchase_price FROM products p LEFT JOIN product_grades pg ON p.grade_id = pg.grade_id WHERE (p.tenant_id = ? OR p.tenant_id = 'global' OR p.tenant_id = 'unset' OR p.tenant_id IS NULL) AND p.product_id IN (${placeholders})`).all(tenant_id || 'global', ...product_ids);
  } catch (error: any) {
    console.error('[db:getProductsByIds]', error);
    return { error: 'Operation failed' };
  }
});

ipcMain.handle('db:getProductsCount', (event, arg: any) => {
  try {
    const db = getDb();
    const tenantId = typeof arg === 'string' ? arg : arg?.tenant_id;
    if (!tenantId) return 0;

    let query = 'SELECT COUNT(*) as count FROM products WHERE tenant_id = ? AND is_deleted = 0';
    const params: any[] = [tenantId];
    
    if (arg?.search) {
       const cond = buildProductSearchConditions(arg.search, '');
       query += ` AND ${cond.sql}`;
       params.push(...cond.params);
    }

    if (arg?.filterDate && String(arg.filterDate).trim() !== '') {
       const dateCol = arg?.dateField === 'updated_at' ? 'COALESCE(updated_at, created_at)' : 'created_at';
       const cleanStart = parseCleanDate(arg.filterDate);
       const cleanEnd = arg.filterDateEnd && String(arg.filterDateEnd).trim() !== '' ? parseCleanDate(arg.filterDateEnd) : cleanStart;
       const { startUtc, endUtc } = getUtcRangeForStoreDateRange(cleanStart, cleanEnd, tenantId);
       query += ` AND (${dateCol} >= ? AND ${dateCol} <= ?)`;
       params.push(startUtc, endUtc);
    }

    if (arg?.stockStatus && arg.stockStatus !== 'all') {
      if (arg.stockStatus === 'low_stock' || arg.stockStatus === 'low') {
        query += ' AND current_stock <= reorder_level AND reorder_level > 0 AND current_stock > 0';
      } else if (arg.stockStatus === 'out_of_stock' || arg.stockStatus === 'out') {
        query += ' AND current_stock <= 0';
      } else if (arg.stockStatus === 'in_stock' || arg.stockStatus === 'in') {
        query += ' AND current_stock > 0';
      } else if (arg.stockStatus === 'no_barcode' || arg.stockStatus === 'no_code') {
        query += " AND (sku_barcode IS NULL OR TRIM(sku_barcode) = '')";
      }
    }

    if (arg?.isGst !== undefined) {
      query += ' AND is_gst_applicable = ?';
      params.push(arg.isGst ? 1 : 0);
    }

    const result = db.prepare(query).get(...params) as { count: number };
    return result ? result.count : 0;
  } catch (error: any) {
    return 0;
  }
});

ipcMain.handle('db:addProduct', safeHandler((event, p) => {
  try {
    const db = getDb();
    const cleanBarcode = (p.sku_barcode && String(p.sku_barcode).trim() !== '') ? String(p.sku_barcode).trim() : null;
    const cleanItemCode = (p.item_code && String(p.item_code).trim() !== '') ? String(p.item_code).trim() : null;
    const stmt = db.prepare(`
      INSERT INTO products (
        product_id, tenant_id, name, sku_barcode, item_code, category, hsn_sac_code,
        purchase_price, base_price, is_gst_applicable, tax_rate_percent,
        uom, brand_manufacturer, current_stock, reorder_level, domain_attributes,
        discount_percent, discount_flat, offer_price,
        is_deleted, billing_type, grade_id, pricing_mode, average_weight_per_piece, weight_override_allowed,
        is_service_item, sync_status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);
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
  } catch (error: any) {
    const msg = error?.message || 'Operation failed';
    console.error('[db:addProduct]', msg);
    return { success: false, error: msg };
  }
}));

ipcMain.handle('db:ensureServiceItem', safeHandler((event, { tenant_id }: { tenant_id: string }) => {
  try {
    const db = getDb();
    // Gather every live Service Charge candidate: flagged items or rows literally named 'Service Charge'.
    const candidates = db.prepare(`
      SELECT * FROM products
      WHERE tenant_id = ? AND is_deleted = 0
        AND (is_service_item = 1 OR name = 'Service Charge')
      ORDER BY created_at ASC, product_id ASC
    `).all(tenant_id) as any[];
    const isFlagged = (p: any) => Number(p.is_service_item) === 1;
    const hasBarcode99 = (p: any) => String(p.sku_barcode || '').trim() === '99';

    // Deterministic canonical pick:
    //   1. flagged + barcode '99'   (the easy-scan item)
    //   2. flagged                  (the true service item)
    //   3. named 'Service Charge' + barcode '99'
    //   4. named 'Service Charge'    (oldest first)
    let canonical = candidates.find((p: any) => isFlagged(p) && hasBarcode99(p))
      || candidates.find((p: any) => isFlagged(p))
      || candidates.find((p: any) => hasBarcode99(p))
      || candidates[0];

    if (!canonical) {
      // Fresh tenant: create one canonical service charge row.
      const barcodeInUse = db.prepare("SELECT product_id FROM products WHERE tenant_id = ? AND sku_barcode = '99' AND is_deleted = 0").get(tenant_id);
      const barcode = barcodeInUse ? `SVC-${crypto.randomUUID().slice(0, 8)}` : '99';
      const product_id = crypto.randomUUID();
      db.prepare(`
        INSERT INTO products (product_id, tenant_id, name, sku_barcode, base_price, tax_rate_percent, uom, current_stock, is_service_item, billing_type, pricing_mode, is_deleted, sync_status, created_at, updated_at)
        VALUES (?, ?, 'Service Charge', ?, 0, 0, 'Pcs', 0, 1, 'PIECE', 'FIXED_PRICE', 0, 'PENDING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).run(product_id, tenant_id, barcode);
      return { success: true, product_id };
    }

    // Soft-delete every duplicate so only the canonical one survives (locally + pushed to cloud).
    const softDelete = db.prepare(`
      UPDATE products SET is_deleted = 1, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
      WHERE tenant_id = ? AND product_id = ?
    `);
    const deletedHadBarcode99 = candidates.some((c: any) => c.product_id !== canonical.product_id && hasBarcode99(c));
    for (const c of candidates) {
      if (c.product_id !== canonical.product_id) softDelete.run(tenant_id, c.product_id);
    }

    // Keep the canonical row properly flagged/named, and give it the easy barcode when it has none.
    const canonicalBarcode = String(canonical.sku_barcode || '').trim();
    const canAdopt99 = !canonicalBarcode || (deletedHadBarcode99 && canonicalBarcode !== '99');
    if (canAdopt99) {
      // The soft-deleted duplicate still occupies the UNIQUE '99' â€” clear it first, then hand it over.
      db.prepare(`
        UPDATE products SET sku_barcode = NULL, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
        WHERE tenant_id = ? AND sku_barcode = '99' AND is_deleted = 1
      `).run(tenant_id);
      const barcodeTaken = db.prepare("SELECT product_id FROM products WHERE tenant_id = ? AND sku_barcode = '99' AND is_deleted = 0 AND product_id != ?").get(tenant_id, canonical.product_id);
      canonical.sku_barcode = barcodeTaken ? (canonicalBarcode || `SVC-${crypto.randomUUID().slice(0, 8)}`) : '99';
    }

    const needsFix = !isFlagged(canonical) || canonical.name !== 'Service Charge' || canonical.sku_barcode !== canonicalBarcode;
    if (needsFix) {
      db.prepare(`
        UPDATE products SET name = 'Service Charge', sku_barcode = ?, is_service_item = 1, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
        WHERE tenant_id = ? AND product_id = ?
      `).run(canonical.sku_barcode, tenant_id, canonical.product_id);
    }

    return { success: true, product_id: canonical.product_id, sku_barcode: canonical.sku_barcode };
  } catch (error: any) {
    console.error('[db:ensureServiceItem]', error);
    return { success: false, error: error.message || 'Operation failed' };
  }
}));

ipcMain.handle('db:updateProduct', safeHandler((event, p) => {
  try {
    const db = getDb();
    const cleanBarcode = (p.sku_barcode && String(p.sku_barcode).trim() !== '') ? String(p.sku_barcode).trim() : null;
    const cleanItemCode = (p.item_code && String(p.item_code).trim() !== '') ? String(p.item_code).trim() : null;
    const stmt = db.prepare(`
      UPDATE products 
      SET tenant_id = ?, name = ?, sku_barcode = ?, item_code = ?, category = ?, hsn_sac_code = ?, 
          purchase_price = ?, base_price = ?, is_gst_applicable = ?, tax_rate_percent = ?,
          uom = ?, brand_manufacturer = ?, current_stock = ?, reorder_level = ?, 
          domain_attributes = ?, discount_percent = ?, discount_flat = ?, offer_price = ?, 
          is_deleted = ?, billing_type = ?, grade_id = ?, pricing_mode = ?, 
          average_weight_per_piece = ?, weight_override_allowed = ?,
          is_service_item = ?,
          sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
      WHERE product_id = ?
    `);
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
  } catch (error: any) {
    const msg = error?.message || 'Operation failed';
    console.error('[db:updateProduct]', msg);
    return { success: false, error: msg };
  }
}));

// Lightweight GST/Estimate toggle â€” flips only is_gst_applicable without touching
// any other product field.
ipcMain.handle('db:updateProductGstFlag', safeHandler((event, { tenant_id, product_id, is_gst_applicable }: { tenant_id: string; product_id: string; is_gst_applicable: number }) => {
  const db = getDb();
  const res = db.prepare(`
    UPDATE products
    SET is_gst_applicable = CASE WHEN ? = 1 OR TRIM(COALESCE(hsn_sac_code, '')) <> '' THEN 1 ELSE 0 END,
        sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
    WHERE product_id = ? AND tenant_id = ?
  `).run(is_gst_applicable ? 1 : 0, product_id, tenant_id);
  if (res.changes === 0) return { success: false, error: 'Product not found' };
  return { success: true };
}));

ipcMain.handle('db:updateProductName', safeHandler((event, { tenant_id, product_id, name }: { tenant_id: string; product_id: string; name: string }) => {
  const db = getDb();
  const res = db.prepare(`
    UPDATE products
    SET name = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
    WHERE product_id = ? AND tenant_id = ?
  `).run(name, product_id, tenant_id);
  if (res.changes === 0) return { success: false, error: 'Product not found' };
  return { success: true };
}));

ipcMain.handle('db:deleteProduct', (event, productId) => {
  try {
    const db = getDb();
    // Soft delete
    db.prepare("UPDATE products SET is_deleted = 1, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE product_id = ?").run(productId);
    return { success: true };
  } catch (error: any) {
    console.error('[db:deleteProduct]', error);
    return { success: false, error: 'Operation failed' };
  }
});

ipcMain.handle('db:bulkDeleteProducts', (event, productIds: string[]) => {
  try {
    const db = getDb();
    if (!Array.isArray(productIds) || productIds.length === 0) {
      return { success: true, count: 0 };
    }
    const placeholders = productIds.map(() => '?').join(',');
    const stmt = db.prepare(`UPDATE products SET is_deleted = 1, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE product_id IN (${placeholders})`);
    const res = stmt.run(...productIds);
    return { success: true, count: res.changes };
  } catch (error: any) {
    console.error('[db:bulkDeleteProducts]', error);
    return { success: false, error: 'Bulk delete failed: ' + (error?.message || 'Unknown error') };
  }
});

ipcMain.handle('db:bulkImportProducts', safeHandler((event, products: any[]) => {
  try {
    const db = getDb();
    
    if (!products.length) return { success: true };
    const tenantId = products[0].tenant_id;
    
    // Get pricing tiers for this tenant to map names to IDs
    interface PricingTier { pricing_tier_id: string; name: string; }
    const tiers = db.prepare('SELECT pricing_tier_id, name FROM pricing_tiers WHERE tenant_id = ? AND is_deleted = 0').all(tenantId) as PricingTier[];
    const tierNameToId = new Map<string, string>();
    for (const t of tiers) {
      tierNameToId.set(t.name.toLowerCase().trim(), t.pricing_tier_id);
    }
    
    // Helper: get or create tier by name dynamically (auto-create if missing)
    const getOrCreateTierId = (tierName: string): string => {
      const trimmed = tierName.trim();
      const normalized = trimmed.toLowerCase();
      let tierId = tierNameToId.get(normalized);
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
      db.prepare(`
        INSERT INTO pricing_tiers (pricing_tier_id, tenant_id, name, is_active, sort_order, is_deleted, sync_status, created_at, updated_at)
        VALUES (?, ?, ?, 1, ?, 0, 'PENDING', ?, ?)
      `).run(newTierId, tenantId, trimmed, tiers.length, now, now);
      
      tierNameToId.set(normalized, newTierId);
      if (cleanName) tierNameToId.set(cleanName, newTierId);
      tiers.push({ pricing_tier_id: newTierId, name: trimmed });
      console.log('[bulkImportProducts] Auto-created dynamic tier:', trimmed, '->', newTierId);
      return newTierId;
    };
    
    const transaction = db.transaction((prods) => {
      const findExistingByBarcode = db.prepare(`SELECT product_id FROM products WHERE tenant_id = ? AND sku_barcode = ?`);
      const findExistingByItemCode = db.prepare(`SELECT product_id FROM products WHERE tenant_id = ? AND item_code = ?`);
      const findExistingByName = db.prepare(`SELECT product_id FROM products WHERE tenant_id = ? AND LOWER(TRIM(name)) = LOWER(TRIM(?)) AND COALESCE(brand_manufacturer, '') = COALESCE(?, '')`);

      const insertStmt = db.prepare(`
        INSERT INTO products (
          product_id, tenant_id, name, sku_barcode, item_code, category, hsn_sac_code,
          purchase_price, base_price, is_gst_applicable, tax_rate_percent,
          uom, brand_manufacturer, current_stock, reorder_level, domain_attributes,
          discount_percent, discount_flat, offer_price,
          is_deleted, billing_type, grade_id, pricing_mode, average_weight_per_piece, weight_override_allowed,
          sync_status, print_status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, 'PENDING', 'PENDING', ?, ?)
      `);

      const updateStmt = db.prepare(`
        UPDATE products SET
          name = ?,
          sku_barcode = COALESCE(?, sku_barcode),
          item_code = COALESCE(?, item_code),
          category = COALESCE(?, category),
          hsn_sac_code = COALESCE(?, hsn_sac_code),
          purchase_price = ?,
          base_price = ?,
          is_gst_applicable = ?,
          tax_rate_percent = ?,
          uom = COALESCE(?, uom),
          brand_manufacturer = COALESCE(?, brand_manufacturer),
          current_stock = ?,
          reorder_level = ?,
          domain_attributes = COALESCE(?, domain_attributes),
          discount_percent = ?,
          discount_flat = ?,
          offer_price = ?,
          is_deleted = 0,
          billing_type = COALESCE(?, billing_type),
          grade_id = COALESCE(?, grade_id),
          pricing_mode = COALESCE(?, pricing_mode),
          average_weight_per_piece = COALESCE(?, average_weight_per_piece),
          weight_override_allowed = COALESCE(?, weight_override_allowed),
          sync_status = 'PENDING',
          updated_at = ?
        WHERE product_id = ?
      `);
      
      const tierStmt = db.prepare(`
        INSERT INTO product_pricing (product_pricing_id, tenant_id, product_id, pricing_tier_id, price, is_deleted, sync_status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 0, 'PENDING', ?, ?)
        ON CONFLICT(product_id, pricing_tier_id) DO UPDATE SET
          price = EXCLUDED.price,
          is_deleted = 0,
          sync_status = 'PENDING',
          updated_at = EXCLUDED.updated_at
      `);
      
      const now = new Date();
      for (const p of prods) {
        now.setMilliseconds(now.getMilliseconds() + 1);
        const timestamp = localTimestamp(now);

        const cleanBarcode = (p.sku_barcode && String(p.sku_barcode).trim()) ? String(p.sku_barcode).trim() : null;
        const cleanItemCode = (p.item_code && String(p.item_code).trim()) ? String(p.item_code).trim() : null;
        const cleanName = (p.name && String(p.name).trim()) ? String(p.name).trim() : '';

        let existingId: string | null = null;
        if (cleanBarcode) {
          const row = findExistingByBarcode.get(tenantId, cleanBarcode) as any;
          if (row?.product_id) existingId = row.product_id;
        }
        if (!existingId && cleanItemCode) {
          const row = findExistingByItemCode.get(tenantId, cleanItemCode) as any;
          if (row?.product_id) existingId = row.product_id;
        }
        if (!existingId && cleanName) {
          const row = findExistingByName.get(tenantId, cleanName, p.brand_manufacturer || '') as any;
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
  } catch (error: any) {
    console.error('[db:bulkImportProducts]', error);
    return { success: false, error: error?.message || 'Operation failed' };
  }
}));

ipcMain.handle('db:updatePrintStatus', (event, productIds: string[]) => {
  try {
    const db = getDb();
    const transaction = db.transaction((ids) => {
      const stmt = db.prepare("UPDATE products SET print_status = 'PRINTED', sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE product_id = ?");
      for (const id of ids) {
        stmt.run(id);
      }
    });
    transaction(productIds);
    return { success: true };
  } catch (error: any) {
    console.error('[db:updatePrintStatus]', error);
    return { success: false, error: 'Operation failed' };
  }
});

ipcMain.handle('db:resetPrintStatus', (event, tenant_id: string) => {
  try {
    const db = getDb();
    if (!tenant_id) return { success: false, error: 'Tenant ID required' };
    db.prepare("UPDATE products SET print_status = 'PRINTED', sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE tenant_id = ? AND print_status = 'PENDING' AND is_deleted = 0").run(tenant_id);
    return { success: true };
  } catch (error: any) {
    console.error('[db:resetPrintStatus]', error);
    return { success: false, error: 'Operation failed' };
  }
});

ipcMain.handle('db:getPendingPrintProducts', (event, { tenant_id, limit, date, dateEnd, only_pending = true }: { tenant_id: string, limit: number, date?: string, dateEnd?: string, only_pending?: boolean }) => {
  try {
    const db = getDb();
    if (!tenant_id) return [];
    
    let query = "SELECT * FROM products WHERE tenant_id = ? AND is_deleted = 0 AND current_stock > 0";
    const params: any[] = [tenant_id];

    if (only_pending) {
      query += " AND print_status = 'PENDING'";
    }

    if (date) {
      if (dateEnd) {
        query += " AND date(created_at) BETWEEN ? AND ?";
        params.push(date, dateEnd);
      } else {
        query += " AND date(created_at) = ?";
        params.push(date);
      }
    }
    
    query += " ORDER BY created_at ASC";
    if (limit) { query += " LIMIT ?"; params.push(limit); }
    
    return db.prepare(query).all(...params);
  } catch (error: any) {
    console.error('[db:getPendingPrintProducts]', error);
    return { error: 'Operation failed' };
  }
});

ipcMain.handle('db:adjustStock', (event, { product_id, delta, pcsDelta }) => {
  try {
    const db = getDb();
    if (pcsDelta != null) {
      const row = db.prepare('SELECT domain_attributes FROM products WHERE product_id = ?').get(product_id) as any;
      let da: Record<string, any> = {};
      try { da = JSON.parse(row?.domain_attributes || '{}'); } catch { /* keep empty */ }
      const current = Number(da.pcs_stock ?? da.pcs ?? 0) || 0;
      const nextPcs = Math.max(0, current + pcsDelta);
      da.pcs_stock = nextPcs;
      da.pcs = nextPcs;
      db.prepare(`
        UPDATE products 
        SET domain_attributes = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
        WHERE product_id = ?
      `).run(JSON.stringify(da), product_id);
    }
    if (delta != null) {
      db.prepare(`
        UPDATE products 
        SET current_stock = current_stock + ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
        WHERE product_id = ?
      `).run(delta, product_id);
    }
    return { success: true };
  } catch (error: any) {
    console.error('[db:adjustStock]', error);
    return { success: false, error: 'Operation failed' };
  }
});

ipcMain.handle('db:getGrades', (event, tenantId: string) => {
  try {
    const db = getDb();
    if (!tenantId) return [];
    return db.prepare('SELECT * FROM product_grades WHERE tenant_id = ? AND is_deleted = 0 ORDER BY category, grade_name').all(tenantId);
  } catch (error: any) {
    console.error('[db:getGrades]', error);
    return { error: 'Operation failed' };
  }
});

ipcMain.handle('db:addGrade', safeHandler((event, g) => {
  try {
    const db = getDb();
    db.prepare(`
      INSERT INTO product_grades (grade_id, tenant_id, category, grade_name, rate, purchase_price, offer_price, is_deleted, sync_status) 
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'PENDING')
    `).run(g.grade_id, g.tenant_id, g.category, g.grade_name, g.rate, g.purchase_price || 0, g.offer_price ?? null);
    return { success: true };
  } catch (error: any) {
    console.error('[db:addGrade]', error);
    return { success: false, error: 'Operation failed' };
  }
}));

ipcMain.handle('db:updateGrade', safeHandler((event, g) => {
  try {
    const db = getDb();
    db.prepare(`
      UPDATE product_grades 
      SET category = ?, grade_name = ?, rate = ?, purchase_price = ?, offer_price = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP 
      WHERE grade_id = ?
    `).run(g.category, g.grade_name, g.rate, g.purchase_price || 0, g.offer_price ?? null, g.grade_id);
    return { success: true };
  } catch (error: any) {
    console.error('[db:updateGrade]', error);
    return { success: false, error: 'Operation failed' };
  }
}));

ipcMain.handle('db:deleteGrade', (event, gradeId: string) => {
  try {
    const db = getDb();
    db.prepare(`UPDATE product_grades SET is_deleted = 1, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE grade_id = ?`).run(gradeId);
    return { success: true };
  } catch (error: any) {
    console.error('[db:deleteGrade]', error);
    return { success: false, error: 'Operation failed' };
  }
});

// â”€â”€ Pricing Tier Handlers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
ipcMain.handle('db:getPricingTiers', (event, tenantId: string) => {
  try {
    const db = getDb();
    const tid = tenantId || 'global';
    return db.prepare(`
      SELECT * FROM pricing_tiers
      WHERE (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL)
        AND is_deleted = 0
      ORDER BY sort_order ASC, name COLLATE NOCASE ASC
    `).all(tid);
  } catch (error: any) {
    console.error('[db:getPricingTiers]', error);
    return [];
  }
});

ipcMain.handle('db:addPricingTier', safeHandler((event, t) => {
  try {
    const db = getDb();
    const tid = t.tenant_id || 'global';
    const cleanName = String(t.name || '').trim();
    if (!cleanName) return { success: false, error: 'Name is required' };

    // Check if an existing tier with the same name exists
    const existing = db.prepare(`
      SELECT pricing_tier_id, is_deleted FROM pricing_tiers
      WHERE (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL)
        AND LOWER(TRIM(name)) = LOWER(?)
    `).get(tid, cleanName) as any;

    const isActive = (t.is_active === false || t.is_active === 0 || t.is_active === '0') ? 0 : 1;

    if (existing) {
      db.prepare(`
        UPDATE pricing_tiers
        SET is_active = ?, is_deleted = 0, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
        WHERE pricing_tier_id = ?
      `).run(isActive, existing.pricing_tier_id);
      return { success: true, pricing_tier_id: existing.pricing_tier_id };
    }

    const nextSort = db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_sort FROM pricing_tiers WHERE tenant_id = ? OR tenant_id = \'global\'').get(tid) as any;
    const tierId = t.pricing_tier_id || crypto.randomUUID();

    db.prepare(`
      INSERT INTO pricing_tiers (pricing_tier_id, tenant_id, name, is_active, sort_order, is_deleted, sync_status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 0, 'PENDING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(tierId, tid, cleanName, isActive, t.sort_order ?? (nextSort?.next_sort || 0));
    return { success: true, pricing_tier_id: tierId };
  } catch (error: any) {
    console.error('[db:addPricingTier]', error);
    return { success: false, error: error.message || 'Operation failed' };
  }
}));

ipcMain.handle('db:updatePricingTier', safeHandler((event, t) => {
  try {
    const db = getDb();
    const isActive = (t.is_active === false || t.is_active === 0 || t.is_active === '0') ? 0 : 1;
    const cleanName = String(t.name || '').trim();
    db.prepare(`
      UPDATE pricing_tiers
      SET name = COALESCE(NULLIF(?, ''), name), is_active = ?, sort_order = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
      WHERE pricing_tier_id = ?
    `).run(cleanName, isActive, t.sort_order ?? 0, t.pricing_tier_id);
    return { success: true };
  } catch (error: any) {
    console.error('[db:updatePricingTier]', error);
    return { success: false, error: 'Operation failed' };
  }
}));

ipcMain.handle('db:deletePricingTier', (event, tierId: string) => {
  try {
    const db = getDb();
    db.prepare(`UPDATE pricing_tiers SET is_deleted = 1, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE pricing_tier_id = ?`).run(tierId);
    return { success: true };
  } catch (error: any) {
    console.error('[db:deletePricingTier]', error);
    return { success: false, error: 'Operation failed' };
  }
});

ipcMain.handle('db:reorderPricingTiers', safeHandler((event, tiers: Array<{ pricing_tier_id: string; sort_order: number }>) => {
  try {
    const db = getDb();
    const stmt = db.prepare(`UPDATE pricing_tiers SET sort_order = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE pricing_tier_id = ?`);
    const tx = db.transaction((rows: Array<{ pricing_tier_id: string; sort_order: number }>) => {
      for (const r of rows) stmt.run(r.sort_order ?? 0, r.pricing_tier_id);
    });
    tx(tiers);
    return { success: true };
  } catch (error: any) {
    console.error('[db:reorderPricingTiers]', error);
    return { success: false, error: 'Operation failed' };
  }
}));

ipcMain.handle('db:setDefaultPricingTier', safeHandler((event, payload: { tenant_id: string; pricing_tier_id: string }) => {
  try {
    const db = getDb();
    let { tenant_id, pricing_tier_id } = payload || {};
    pricing_tier_id = pricing_tier_id || '';

    if (!tenant_id && pricing_tier_id) {
      const targetTier = db.prepare('SELECT tenant_id FROM pricing_tiers WHERE pricing_tier_id = ?').get(pricing_tier_id) as any;
      if (targetTier?.tenant_id) tenant_id = targetTier.tenant_id;
    }
    const tid = tenant_id || 'global';

    if (pricing_tier_id) {
      const targetTier = db.prepare('SELECT tenant_id FROM pricing_tiers WHERE pricing_tier_id = ?').get(pricing_tier_id) as any;
      const actualTenantId = targetTier?.tenant_id || tid;

      db.prepare(`
        UPDATE pricing_tiers
        SET is_default = CASE WHEN pricing_tier_id = ? THEN 1 ELSE 0 END,
            sync_status = 'PENDING',
            updated_at = CURRENT_TIMESTAMP
        WHERE tenant_id = ? OR tenant_id = ? OR tenant_id = 'global'
      `).run(pricing_tier_id, actualTenantId, tid);
    } else {
      db.prepare(`
        UPDATE pricing_tiers
        SET is_default = 0,
            sync_status = 'PENDING',
            updated_at = CURRENT_TIMESTAMP
        WHERE tenant_id = ? OR tenant_id = 'global'
      `).run(tid);
    }

    return { success: true };
  } catch (error: any) {
    console.error('[db:setDefaultPricingTier]', error);
    return { success: false, error: 'Operation failed' };
  }
}));

ipcMain.handle('db:getProductPricing', (event, tenantId: string) => {
  try {
    const db = getDb();
    const tid = tenantId || 'global';
    return db.prepare(`
      SELECT * FROM product_pricing
      WHERE (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL)
        AND is_deleted = 0
    `).all(tid);
  } catch (error: any) {
    console.error('[db:getProductPricing]', error);
    return [];
  }
});

// â”€â”€ Combo Offers Handlers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
ipcMain.handle('db:getComboOffers', (event, { tenant_id, search, only_active }: { tenant_id: string; search?: string; only_active?: boolean }) => {
  try {
    const db = getDb();
    if (!tenant_id) return [];
    
    let query = `
      SELECT co.*, 
        (
          SELECT json_group_array(json_object(
            'combo_item_id', ci.combo_item_id,
            'product_id', ci.product_id,
            'quantity', ci.quantity,
            'product_name', p.name,
            'product_price', p.base_price,
            'product_stock', p.current_stock,
            'sku_barcode', p.sku_barcode,
            'uom', p.uom
          ))
          FROM combo_items ci
          JOIN products p ON ci.product_id = p.product_id
          WHERE ci.combo_id = co.combo_id AND p.is_deleted = 0
        ) as items_json
      FROM combo_offers co
      WHERE co.tenant_id = ? AND co.is_deleted = 0
    `;
    const params: any[] = [tenant_id];

    if (only_active) {
      query += ` AND co.is_active = 1`;
    }

    if (search) {
      const cleanS = String(search).trim();
      const s = `%${cleanS}%`;
      const sClean = cleanS.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
      const cleanPattern = sClean.length > 0 ? `%${sClean}%` : s;
      query += ` AND (co.name LIKE ? OR co.sku_barcode LIKE ? OR co.description LIKE ? OR CLEAN_STR(co.name) LIKE ? OR CLEAN_STR(co.sku_barcode) LIKE ? OR CLEAN_STR(co.description) LIKE ?)`;
      params.push(s, s, s, cleanPattern, cleanPattern, cleanPattern);
    }

    query += ` ORDER BY co.name COLLATE NOCASE ASC`;
    const rows = db.prepare(query).all(...params) as any[];

    return rows.map(r => {
      let items = [];
      try { items = JSON.parse(r.items_json || '[]'); } catch {}
      return { ...r, items };
    });
  } catch (error: any) {
    console.error('[db:getComboOffers]', error);
    return [];
  }
});

ipcMain.handle('db:getComboOfferDetails', (event, { combo_id }: { combo_id: string }) => {
  try {
    const db = getDb();
    if (!combo_id) return null;
    const combo = db.prepare(`SELECT * FROM combo_offers WHERE combo_id = ? AND is_deleted = 0`).get(combo_id) as any;
    if (!combo) return null;

    const items = db.prepare(`
      SELECT ci.*, p.name as product_name, p.base_price as product_price, p.current_stock as product_stock, p.sku_barcode, p.uom
      FROM combo_items ci
      JOIN products p ON ci.product_id = p.product_id
      WHERE ci.combo_id = ? AND p.is_deleted = 0
    `).all(combo_id) as any[];

    return { ...combo, items };
  } catch (error: any) {
    console.error('[db:getComboOfferDetails]', error);
    return null;
  }
});

ipcMain.handle('db:saveComboOffer', safeHandler((event, payload: {
  combo_id?: string;
  tenant_id: string;
  name: string;
  sku_barcode?: string;
  combo_price: number;
  is_active?: number;
  description?: string;
  items: Array<{ product_id: string; quantity: number }>;
}) => {
  try {
    const db = getDb();
    const { combo_id: reqComboId, tenant_id, name, sku_barcode, combo_price, is_active, description, items } = payload;
    if (!tenant_id || !name || !items || items.length === 0) {
      return { success: false, error: 'Name and items are required' };
    }

    const cleanBarcode = (sku_barcode || '').trim() || null;
    const combo_id = reqComboId || crypto.randomUUID();

    const tx = db.transaction(() => {
      db.prepare(`
        INSERT INTO combo_offers (combo_id, tenant_id, name, sku_barcode, combo_price, is_active, is_deleted, description, sync_status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 0, ?, 'PENDING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT(combo_id) DO UPDATE SET
          name = excluded.name,
          sku_barcode = excluded.sku_barcode,
          combo_price = excluded.combo_price,
          is_active = excluded.is_active,
          description = excluded.description,
          sync_status = 'PENDING',
          updated_at = CURRENT_TIMESTAMP
      `).run(
        combo_id,
        tenant_id,
        name.trim(),
        cleanBarcode,
        Number(combo_price) || 0,
        is_active ?? 1,
        description?.trim() || null
      );

      db.prepare(`DELETE FROM combo_items WHERE combo_id = ?`).run(combo_id);
      const insertItem = db.prepare(`
        INSERT INTO combo_items (combo_item_id, combo_id, tenant_id, product_id, quantity, created_at)
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `);
      for (const item of items) {
        insertItem.run(
          crypto.randomUUID(),
          combo_id,
          tenant_id,
          item.product_id,
          Number(item.quantity) || 1
        );
      }
    });

    tx();
    return { success: true, combo_id };
  } catch (error: any) {
    console.error('[db:saveComboOffer]', error);
    return { success: false, error: error.message || 'Operation failed' };
  }
}));

ipcMain.handle('db:deleteComboOffer', (event, { combo_id }: { combo_id: string }) => {
  try {
    const db = getDb();
    if (!combo_id) return { success: false, error: 'Missing combo ID' };
    db.prepare(`UPDATE combo_offers SET is_deleted = 1, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE combo_id = ?`).run(combo_id);
    return { success: true };
  } catch (error: any) {
    console.error('[db:deleteComboOffer]', error);
    return { success: false, error: 'Operation failed' };
  }
});

ipcMain.handle('db:toggleComboOfferActive', (event, { combo_id, is_active }: { combo_id: string; is_active: number }) => {
  try {
    const db = getDb();
    if (!combo_id) return { success: false, error: 'Missing combo ID' };
    db.prepare(`UPDATE combo_offers SET is_active = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE combo_id = ?`).run(is_active ? 1 : 0, combo_id);
    return { success: true };
  } catch (error: any) {
    console.error('[db:toggleComboOfferActive]', error);
    return { success: false, error: 'Operation failed' };
  }
});

// Upsert/delete per-tier prices for a single product
// payload: { tenant_id, product_id, pricing: [{ pricing_tier_id, price }] }
ipcMain.handle('db:setProductPricing', safeHandler((event, payload: { tenant_id: string; product_id: string; pricing: Array<{ pricing_tier_id: string; price: number | null }> }) => {
  try {
    const db = getDb();
    const { tenant_id, product_id, pricing } = payload;
    if (!tenant_id || !product_id || !Array.isArray(pricing)) return { success: false, error: 'Invalid payload' };
    const tid = tenant_id || 'global';
    const findExisting = db.prepare(`SELECT product_pricing_id FROM product_pricing WHERE product_id = ? AND pricing_tier_id = ? AND (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL)`);
    const upsert = db.prepare(`
      INSERT INTO product_pricing (product_pricing_id, tenant_id, product_id, pricing_tier_id, price, is_deleted, sync_status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 0, 'PENDING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(product_id, pricing_tier_id) DO UPDATE SET
        price = excluded.price,
        is_deleted = 0,
        sync_status = 'PENDING',
        updated_at = CURRENT_TIMESTAMP
    `);
    const clear = db.prepare(`UPDATE product_pricing SET is_deleted = 1, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE product_id = ? AND pricing_tier_id = ? AND (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL)`);
    const tx = db.transaction((rows: Array<{ pricing_tier_id: string; price: number | null }>) => {
      for (const item of rows) {
        if (!item?.pricing_tier_id) continue;
        const isEmpty = item.price === null || item.price === undefined || String(item.price).trim() === '';
        if (isEmpty) {
          clear.run(product_id, item.pricing_tier_id, tid);
          continue;
        }
        const existing = findExisting.get(product_id, item.pricing_tier_id, tid) as any;
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        const pricingId = (existing?.product_pricing_id && uuidRegex.test(existing.product_pricing_id)) ? existing.product_pricing_id : crypto.randomUUID();
        upsert.run(pricingId, tid, product_id, item.pricing_tier_id, Number(item.price) || 0);
      }
    });
    tx(pricing);
    return { success: true };
  } catch (error: any) {
    console.error('[db:setProductPricing]', error);
    return { success: false, error: 'Operation failed' };
  }
}));

// Bulk upsert/delete of product prices for one tier
// payload: { tenant_id, pricing_tier_id, pricing: [{ product_id, price }] }
ipcMain.handle('db:setTierPricing', safeHandler((event, payload: { tenant_id: string; pricing_tier_id: string; pricing: Array<{ product_id: string; price: number | null }> }) => {
  try {
    const db = getDb();
    const { tenant_id, pricing_tier_id, pricing } = payload;
    if (!tenant_id || !pricing_tier_id || !Array.isArray(pricing)) return { success: false, error: 'Invalid payload' };
    const tid = tenant_id || 'global';
    const findExisting = db.prepare(`SELECT product_pricing_id FROM product_pricing WHERE product_id = ? AND pricing_tier_id = ? AND (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL)`);
    const upsert = db.prepare(`
      INSERT INTO product_pricing (product_pricing_id, tenant_id, product_id, pricing_tier_id, price, is_deleted, sync_status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 0, 'PENDING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(product_id, pricing_tier_id) DO UPDATE SET
        price = excluded.price,
        is_deleted = 0,
        sync_status = 'PENDING',
        updated_at = CURRENT_TIMESTAMP
    `);
    const clear = db.prepare(`UPDATE product_pricing SET is_deleted = 1, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE product_id = ? AND pricing_tier_id = ? AND (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL)`);
    const tx = db.transaction((rows: Array<{ product_id: string; price: number | null }>) => {
      for (const item of rows) {
        if (!item?.product_id) continue;
        const isEmpty = item.price === null || item.price === undefined || String(item.price).trim() === '';
        if (isEmpty) {
          clear.run(item.product_id, pricing_tier_id, tenant_id);
          continue;
        }
        const existing = findExisting.get(item.product_id, pricing_tier_id, tenant_id) as any;
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        const pricingId = (existing?.product_pricing_id && uuidRegex.test(existing.product_pricing_id)) ? existing.product_pricing_id : crypto.randomUUID();
        upsert.run(pricingId, tenant_id, item.product_id, pricing_tier_id, Number(item.price) || 0);
      }
    });
    tx(pricing);
    return { success: true };
  } catch (error: any) {
    console.error('[db:setTierPricing]', error);
    return { success: false, error: 'Operation failed' };
  }
}));


}

