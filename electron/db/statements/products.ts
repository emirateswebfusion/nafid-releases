import type { Db } from './types.js';

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
             COALESCE(SUM(CASE WHEN (i.converted_from_invoice_id IS NULL OR i.converted_from_invoice_id = '') THEN ii.quantity ELSE 0 END), 0) as total_qty,
             COALESCE(SUM(CASE WHEN (i.converted_from_invoice_id IS NULL OR i.converted_from_invoice_id = '') THEN ii.total ELSE 0 END), 0) as total_revenue
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
  return { statement: db.prepare(query), params };
}
