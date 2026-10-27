import type { Db } from './types.js';
import { counterSalePredicate } from './revenue.js';
import { buildProductSearchConditions } from './productSearch.js';

/** SQL statements used by services/productsService.ts. Each factory prepares its statement on the given connection. */

export const findProductsBySkipStockUpdate = (db: Db) => db.prepare(`
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
      `);

export const insertProduct = (db: Db) => db.prepare(`
      INSERT INTO products (
        product_id, tenant_id, name, sku_barcode, item_code, category, hsn_sac_code,
        purchase_price, base_price, is_gst_applicable, tax_rate_percent,
        uom, brand_manufacturer, current_stock, reorder_level, domain_attributes,
        discount_percent, discount_flat, offer_price,
        is_deleted, billing_type, grade_id, pricing_mode, average_weight_per_piece, weight_override_allowed,
        is_service_item, sync_status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);

export const findProductsByIsServiceItem = (db: Db) => db.prepare(`
      SELECT * FROM products
      WHERE tenant_id = ? AND is_deleted = 0
        AND (is_service_item = 1 OR name = 'Service Charge')
      ORDER BY created_at ASC, product_id ASC
    `);

export const findProductsBySkuBarcode = (db: Db) => db.prepare("SELECT product_id FROM products WHERE tenant_id = ? AND sku_barcode = '99' AND is_deleted = 0");

export const insertProduct2 = (db: Db) => db.prepare(`
        INSERT INTO products (product_id, tenant_id, name, sku_barcode, base_price, tax_rate_percent, uom, current_stock, is_service_item, billing_type, pricing_mode, is_deleted, sync_status, created_at, updated_at)
        VALUES (?, ?, 'Service Charge', ?, 0, 0, 'Pcs', 0, 1, 'PIECE', 'FIXED_PRICE', 0, 'PENDING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `);

export const updateProductIsDeleted = (db: Db) => db.prepare(`
      UPDATE products SET is_deleted = 1, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
      WHERE tenant_id = ? AND product_id = ?
    `);

export const updateProductSkuBarcode = (db: Db) => db.prepare(`
        UPDATE products SET sku_barcode = NULL, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
        WHERE tenant_id = ? AND sku_barcode = '99' AND is_deleted = 1
      `);

export const findProductsBySkuBarcodeProductId = (db: Db) => db.prepare("SELECT product_id FROM products WHERE tenant_id = ? AND sku_barcode = '99' AND is_deleted = 0 AND product_id != ?");

export const updateProductByProductId = (db: Db) => db.prepare(`
        UPDATE products SET name = 'Service Charge', sku_barcode = ?, is_service_item = 1, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
        WHERE tenant_id = ? AND product_id = ?
      `);

export const updateProductByProductId2 = (db: Db) => db.prepare(`
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

export const updateProductIsGstApplicable = (db: Db) => db.prepare(`
    UPDATE products
    SET is_gst_applicable = CASE WHEN ? = 1 OR TRIM(COALESCE(hsn_sac_code, '')) <> '' THEN 1 ELSE 0 END,
        sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
    WHERE product_id = ? AND tenant_id = ?
  `);

export const updateProductName = (db: Db) => db.prepare(`
    UPDATE products
    SET name = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
    WHERE product_id = ? AND tenant_id = ?
  `);

export const updateProductIsDeletedAlt = (db: Db) => db.prepare("UPDATE products SET is_deleted = 1, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE product_id = ?");

export const findPricingTiers = (db: Db) => db.prepare('SELECT pricing_tier_id, name FROM pricing_tiers WHERE tenant_id = ? AND is_deleted = 0');

export const insertPricingTier = (db: Db) => db.prepare(`
        INSERT INTO pricing_tiers (pricing_tier_id, tenant_id, name, is_active, sort_order, is_deleted, sync_status, created_at, updated_at)
        VALUES (?, ?, ?, 1, ?, 0, 'PENDING', ?, ?)
      `);

export const findProductsBySkuBarcodeProductId2 = (db: Db) => db.prepare(`SELECT product_id FROM products WHERE tenant_id = ? AND sku_barcode = ?`);

export const findProductsByItemCode = (db: Db) => db.prepare(`SELECT product_id FROM products WHERE tenant_id = ? AND item_code = ?`);

export const findProducts = (db: Db) => db.prepare(`SELECT product_id FROM products WHERE tenant_id = ? AND LOWER(TRIM(name)) = LOWER(TRIM(?)) AND COALESCE(brand_manufacturer, '') = COALESCE(?, '')`);

export const insertProduct3 = (db: Db) => db.prepare(`
        INSERT INTO products (
          product_id, tenant_id, name, sku_barcode, item_code, category, hsn_sac_code,
          purchase_price, base_price, is_gst_applicable, tax_rate_percent,
          uom, brand_manufacturer, current_stock, reorder_level, domain_attributes,
          discount_percent, discount_flat, offer_price,
          is_deleted, billing_type, grade_id, pricing_mode, average_weight_per_piece, weight_override_allowed,
          sync_status, print_status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, 'PENDING', 'PENDING', ?, ?)
      `);

export const updateProductByProductId3 = (db: Db) => db.prepare(`
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

export const upsertProductPricing = (db: Db) => db.prepare(`
        INSERT INTO product_pricing (product_pricing_id, tenant_id, product_id, pricing_tier_id, price, is_deleted, sync_status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 0, 'PENDING', ?, ?)
        ON CONFLICT(product_id, pricing_tier_id) DO UPDATE SET
          price = EXCLUDED.price,
          is_deleted = 0,
          sync_status = 'PENDING',
          updated_at = EXCLUDED.updated_at
      `);

export const updateProductPrintStatus = (db: Db) => db.prepare("UPDATE products SET print_status = 'PRINTED', sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE product_id = ?");

export const updateProductPrintStatusAlt = (db: Db) => db.prepare("UPDATE products SET print_status = 'PRINTED', sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE tenant_id = ? AND print_status = 'PENDING' AND is_deleted = 0");

export const findProductsByProductId = (db: Db) => db.prepare('SELECT domain_attributes FROM products WHERE product_id = ?');

export const updateProductDomainAttributes = (db: Db) => db.prepare(`
        UPDATE products 
        SET domain_attributes = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
        WHERE product_id = ?
      `);

export const updateProductCurrentStock = (db: Db) => db.prepare(`
        UPDATE products 
        SET current_stock = current_stock + ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
        WHERE product_id = ?
      `);

export const findProducts2 = (db: Db) => db.prepare(`
      SELECT p.*, pg.rate as grade_rate, pg.purchase_price as grade_purchase_price, pg.grade_name, pg.category as grade_category
      FROM products p 
      LEFT JOIN product_grades pg ON p.grade_id = pg.grade_id 
      WHERE p.tenant_id = ? AND p.is_deleted = 0 
      ORDER BY p.category ASC, p.name COLLATE NOCASE ASC
    `);

export const findProductsByConvertedTo_AndBillType = (db: Db) => db.prepare(`
      SELECT 
        p.product_id,
        COALESCE(inv_summary.gst_qty, 0) as gst_qty,
        COALESCE(inv_summary.estimate_qty, 0) as estimate_qty,
        COALESCE(pb_summary.gst_purchased_qty, 0) as gst_purchased_qty
      FROM products p
      LEFT JOIN (
        SELECT 
          ii.product_id,
          SUM(CASE WHEN i.invoice_type = 'GST' THEN ii.quantity ELSE 0 END) as gst_qty,
          SUM(CASE WHEN i.invoice_type = 'BILL_OF_SUPPLY' AND i.converted_to_invoice_id IS NULL THEN ii.quantity ELSE 0 END) as estimate_qty
        FROM invoice_items ii
        JOIN invoices i ON ii.invoice_id = i.invoice_id
        WHERE ii.tenant_id = ? AND (i.is_deleted IS NULL OR i.is_deleted = 0)
        GROUP BY ii.product_id
      ) inv_summary ON p.product_id = inv_summary.product_id
      LEFT JOIN (
        SELECT 
          pbi.product_id,
          SUM(pbi.quantity) as gst_purchased_qty
        FROM purchase_bill_items pbi
        JOIN purchase_bills pb ON pbi.purchase_bill_id = pb.purchase_bill_id
        WHERE pb.tenant_id = ? AND pb.bill_type = 'GST'
        GROUP BY pbi.product_id
      ) pb_summary ON p.product_id = pb_summary.product_id
      WHERE p.tenant_id = ? AND p.is_deleted = 0
    `);

export const findOnePurchaseBillItemByProductIdAndBillType = (db: Db) => db.prepare(`
      SELECT 1 FROM purchase_bill_items pbi
      JOIN purchase_bills pb ON pb.purchase_bill_id = pbi.purchase_bill_id
      WHERE pbi.product_id = ? AND pbi.tenant_id = ? AND pb.bill_type = 'ESTIMATE'
      LIMIT 1
    `);

export const findProductsSkuBarcode = (db: Db) => db.prepare(`SELECT sku_barcode FROM products WHERE tenant_id = ? AND sku_barcode LIKE ?`);

export const findProductsSkuBarcode2 = (db: Db) => db.prepare(`SELECT sku_barcode FROM products WHERE tenant_id = ? AND sku_barcode GLOB '[0-9]*'`);

/** Dynamic SQL: `placeholders` must be built from trusted values (placeholders/column lists), never user input. */
export const findProductsWithGradeByIds = (db: Db, placeholders: string | number) => db.prepare(`SELECT p.*, pg.rate as grade_rate, pg.purchase_price as grade_purchase_price FROM products p LEFT JOIN product_grades pg ON p.grade_id = pg.grade_id WHERE (p.tenant_id = ? OR p.tenant_id = 'global' OR p.tenant_id = 'unset' OR p.tenant_id IS NULL) AND p.product_id IN (${placeholders})`);

/** Dynamic SQL: `placeholders` must be built from trusted values (placeholders/column lists), never user input. */
export const softDeleteProductsByIds = (db: Db, placeholders: string | number) => db.prepare(`UPDATE products SET is_deleted = 1, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE product_id IN (${placeholders})`);

/** Dynamic SQL: `dateClause` must be built from trusted values (placeholders/column lists), never user input. */
export const listProductSalesQuantities = (db: Db, dateClause: string | number) => db.prepare(`
      SELECT ii.product_id,
             ii.name,
             COALESCE(SUM(CASE WHEN i.invoice_type = 'GST' THEN ii.quantity ELSE 0 END), 0) as gst_qty,
             COALESCE(SUM(CASE WHEN i.invoice_type = 'BILL_OF_SUPPLY' AND i.converted_to_invoice_id IS NULL THEN ii.quantity ELSE 0 END), 0) as bos_qty,
             COALESCE(SUM(CASE WHEN ${counterSalePredicate('i')} THEN ii.quantity ELSE 0 END), 0) as total_qty,
             COALESCE(SUM(CASE WHEN ${counterSalePredicate('i')} THEN ii.total ELSE 0 END), 0) as total_revenue
      FROM invoice_items ii
      JOIN invoices i ON ii.invoice_id = i.invoice_id
      WHERE ii.tenant_id = ? AND i.invoice_type IN ('GST', 'BILL_OF_SUPPLY') AND (i.is_deleted IS NULL OR i.is_deleted = 0)
        ${dateClause}
      GROUP BY ii.product_id, ii.name
      ORDER BY total_revenue DESC, total_qty DESC
    `);

/** Builds and prepares the dynamic query of `getPendingPrintProducts` (filters appended in code; user values are bound). */
export function getPendingPrintProductsStatement(db: Db, args: { tenant_id: string; only_pending: boolean; date: string | undefined; dateEnd: string | undefined; limit: number }) {
  const { tenant_id, only_pending, date, dateEnd, limit } = args;
  let query = "SELECT * FROM products WHERE tenant_id = ? AND is_deleted = 0 AND current_stock > 0";
  const params: unknown[] = [tenant_id];
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
  return { statement: db.prepare(query), params };
}

/** Filters of the product list query (`getProductsStatement`). */
export interface ProductListQuery {
  tenantId: string;
  limit?: number;
  offset?: number;
  search?: string;
  sortBy?: string;
  barcode?: string;
  isGst?: unknown;
  dateField?: string;
  stockStatus?: string;
  dateRange: { startUtc: string; endUtc: string } | null;
}

/** Filters of the product count query (`getProductsCountStatement`). */
export interface ProductCountFilters {
  search?: string;
  dateField?: string;
  stockStatus?: string;
  isGst?: unknown;
}

/** Product list query (inventory / search). `dateRange` is the store-day range in UTC, already resolved. */
export function getProductsStatement(db: Db, args: ProductListQuery) {
    const { tenantId, limit, offset, search, sortBy, barcode, isGst, dateField, stockStatus, dateRange } = args;
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
    const params: unknown[] = [tenantId, tenantId, tenantId, tenantId];

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

     if (dateRange) {
        const dateCol = dateField === 'updated_at' ? 'COALESCE(p.updated_at, p.created_at)' : 'p.created_at';
        const { startUtc, endUtc } = dateRange;
        query += ` AND (${dateCol} >= ? AND ${dateCol} <= ?)`;
        params.push(startUtc, endUtc);
     }

     if (sortBy === 'created_at') query += ' ORDER BY p.created_at DESC, p.product_id ASC';
     else if (sortBy === 'updated_at') query += ' ORDER BY p.updated_at DESC, p.product_id ASC';
     // Removed duplicate date-sort branches; the first matches above retain precedence.
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

    return { statement: db.prepare(query), params };
}

/** Product count with the same filters as the list. `dateRange` is the store-day range in UTC, already resolved. */
export function getProductsCountStatement(db: Db, tenantId: string, arg: ProductCountFilters, dateRange: { startUtc: string; endUtc: string } | null) {
    let query = 'SELECT COUNT(*) as count FROM products WHERE tenant_id = ? AND is_deleted = 0';
    const params: unknown[] = [tenantId];
    
    if (arg?.search) {
       const cond = buildProductSearchConditions(arg.search as string, '');
       query += ` AND ${cond.sql}`;
       params.push(...cond.params);
    }

    if (dateRange) {
       const dateCol = arg?.dateField === 'updated_at' ? 'COALESCE(updated_at, created_at)' : 'created_at';
       const { startUtc, endUtc } = dateRange;
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

    return { statement: db.prepare(query), params };
}
