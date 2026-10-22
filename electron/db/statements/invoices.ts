import type { Db } from './types.js';

/** SQL statements used by services/invoicesService.ts. Each factory prepares its statement on the given connection. */

export const findInvoicesByInvoiceId = (db: Db) => db.prepare('SELECT invoice_id, invoice_number FROM invoices WHERE invoice_id = ?');

export const findSettingsByKey = (db: Db) => db.prepare('SELECT value FROM settings WHERE tenant_id = ? AND key = ?');

export const findOneInvoiceByInvoiceNumber = (db: Db) => db.prepare('SELECT invoice_id FROM invoices WHERE tenant_id = ? AND invoice_number = ? LIMIT 1');

export const findOnePartyByPhone = (db: Db) => db.prepare(`
            SELECT * FROM parties 
            WHERE tenant_id = ? AND (is_deleted IS NULL OR is_deleted = 0)
              AND (phone = ? OR REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '+', '') LIKE ?)
            LIMIT 1
          `);

export const findPartiesByPhone = (db: Db) => db.prepare('SELECT * FROM parties WHERE tenant_id = ? AND phone = ? AND (is_deleted IS NULL OR is_deleted = 0)');

export const findPartiesByName = (db: Db) => db.prepare('SELECT * FROM parties WHERE tenant_id = ? AND name = ? COLLATE NOCASE AND (is_deleted IS NULL OR is_deleted = 0)');

export const findCustomersByCustomerId = (db: Db) => db.prepare('SELECT customer_id, total_points_earned, total_points_redeemed, current_points_balance FROM customers WHERE customer_id = ?');

export const findSettingsByKeyLoyaltyConfig = (db: Db) => db.prepare("SELECT value FROM settings WHERE tenant_id = ? AND key = 'loyalty_config'");

export const findSettingsByKeyLoyaltyConfig2 = (db: Db) => db.prepare("SELECT value FROM settings WHERE tenant_id = 'global' AND key = 'loyalty_config'");

export const findSettingsByKeyFeatureFlags = (db: Db) => db.prepare("SELECT value FROM settings WHERE tenant_id = ? AND key = 'feature_flags'");

export const findSettingsByKeyFeatureFlags2 = (db: Db) => db.prepare("SELECT value FROM settings WHERE tenant_id = 'global' AND key = 'feature_flags'");

export const insertInvoice = (db: Db) => db.prepare(`
      INSERT INTO invoices (
        invoice_id, tenant_id, user_id, invoice_number, invoice_type, 
        subtotal, tax_total, discount_total, discount_type, discount_value, grand_total, 
        payment_method, split_details, received_amount, balance_amount, customer_name, customer_phone, customer_gstin, customer_state, customer_address, sync_status,
        scrap_deduction, scrap_invoice_number, return_deduction, return_invoice_number, customer_id,
        cgst_total, sgst_total, igst_total, supply_type, actual_refund_paid, notes, description, settled_at, due_date,
        points_earned, points_redeemed, points_redeemed_discount, previous_points_balance, remaining_points_balance,
        created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

export const insertLoyaltyTransaction = (db: Db) => db.prepare(`
          INSERT INTO loyalty_transactions (
            transaction_id, tenant_id, customer_id, invoice_id,
            transaction_type, points, points_balance_before, points_balance_after,
            reference_number, description, created_by, sync_status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, 'REDEEMED', ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)
        `);

export const insertLoyaltyTransaction2 = (db: Db) => db.prepare(`
          INSERT INTO loyalty_transactions (
            transaction_id, tenant_id, customer_id, invoice_id,
            transaction_type, points, points_balance_before, points_balance_after,
            reference_number, description, created_by, sync_status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, 'EARNED', ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)
        `);

export const updateCustomerByCustomerId = (db: Db) => db.prepare(`
        UPDATE customers SET
          total_points_earned = COALESCE(total_points_earned, 0) + ?,
          total_points_redeemed = COALESCE(total_points_redeemed, 0) + ?,
          current_points_balance = ?,
          last_purchase_date = ?,
          sync_status = 'PENDING',
          updated_at = CURRENT_TIMESTAMP
        WHERE customer_id = ?
      `);

export const insertInvoiceItem = (db: Db) => db.prepare(`
      INSERT INTO invoice_items (item_id, invoice_id, tenant_id, product_id, name, quantity, unit_price, tax_amount, total, pieces_sold, is_service_item, combo_id, combo_details, billing_type, uom,
        cgst_rate, sgst_rate, igst_rate, cgst_amount, sgst_amount, igst_amount, hsn_sac_code, supply_type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

export const updateProductCurrentStock = (db: Db) => db.prepare('UPDATE products SET current_stock = current_stock - ?, sync_status = \'PENDING\' WHERE product_id = ?');

export const findProductsByProductId = (db: Db) => db.prepare('SELECT domain_attributes FROM products WHERE product_id = ?');

export const updateProductDomainAttributes = (db: Db) => db.prepare('UPDATE products SET domain_attributes = ?, sync_status = \'PENDING\', updated_at = CURRENT_TIMESTAMP WHERE product_id = ?');

export const findOneScrapTransactionByScrapInvoiceNumber = (db: Db) => db.prepare(`
        SELECT payment_status FROM scrap_transactions
        WHERE tenant_id = ? AND scrap_invoice_number = ? AND (is_deleted IS NULL OR is_deleted = 0)
        LIMIT 1
      `);

export const updateScrapTransactionPaymentStatus = (db: Db) => db.prepare(`
        UPDATE scrap_transactions
        SET payment_status = 'SETTLED', sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
        WHERE tenant_id = ? AND scrap_invoice_number = ?
      `);

export const insertScrapTransaction = (db: Db) => db.prepare(`
        INSERT INTO scrap_transactions (transaction_id, tenant_id, type, scrap_category_id, quantity, rate, total_amount, party_name, customer_phone, customer_address, notes, scrap_invoice_number, payment_status, sync_status, updated_at)
        VALUES (?, ?, 'PURCHASE', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', CURRENT_TIMESTAMP)
      `);

export const updateScrapCategoryCurrentStock = (db: Db) => db.prepare(`UPDATE scrap_categories SET current_stock = current_stock + ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE scrap_category_id = ?`);

export const insertCashTransaction = (db: Db) => db.prepare(`
            INSERT INTO cash_transactions (transaction_id, tenant_id, drawer_id, type, amount, category, notes, entered_by, sync_status)
            VALUES (?, ?, ?, 'CASH_OUT', ?, 'CREDIT_REFUND', ?, ?, 'PENDING')
          `);

export const updateCashDrawerByDrawerId = (db: Db) => db.prepare(`
            UPDATE cash_drawer SET cash_out = ?, current_cash = ?, expected_closing = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE drawer_id = ?
          `);

export const insertInvoice2 = (db: Db) => db.prepare(`
      INSERT INTO invoices (
        invoice_id, tenant_id, user_id, invoice_number, invoice_type, 
        subtotal, tax_total, discount_total, discount_type, discount_value, grand_total, 
        payment_method, split_details, received_amount, balance_amount, customer_name, customer_phone, 
        customer_gstin, customer_state, customer_address, sync_status,
        scrap_deduction, scrap_invoice_number, return_deduction, return_invoice_number,
        held_until, is_held, hold_note
      )
      VALUES (?, ?, ?, ?, 'HOLD', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SYNCED', ?, ?, ?, ?, datetime('now', '+24 hours', 'localtime'), 1, ?)
    `);

export const insertInvoiceItem2 = (db: Db) => db.prepare(`
      INSERT INTO invoice_items (item_id, invoice_id, tenant_id, product_id, name, quantity, unit_price, tax_amount, total, pieces_sold, is_service_item, combo_id, combo_details, billing_type, uom)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

export const updateProductCurrentStockAlt = (db: Db) => db.prepare('UPDATE products SET current_stock = current_stock - ?, sync_status = \'PENDING\', updated_at = CURRENT_TIMESTAMP WHERE product_id = ? AND (is_service_item IS NULL OR is_service_item = 0)');

export const findInvoicesByInvoiceTypeAndIsHeld = (db: Db) => db.prepare(`
      SELECT * FROM invoices 
      WHERE tenant_id = ? 
        AND invoice_type = 'HOLD' 
        AND is_held = 1 
        AND held_until > datetime('now', 'localtime')
      ORDER BY created_at DESC
    `);

export const findInvoicesByInvoiceIdAndInvoiceType = (db: Db) => db.prepare(`SELECT * FROM invoices WHERE invoice_id = ? AND (invoice_type = 'HOLD' OR is_held = 1)`);

export const findInvoiceItemsByInvoiceId = (db: Db) => db.prepare(`SELECT ii.*, p.sku_barcode, p.brand_manufacturer, p.grade_id, p.pricing_mode, pg.rate as grade_rate, pg.purchase_price as grade_purchase_price, 
                p.discount_percent, p.discount_flat, p.offer_price, p.purchase_price, p.base_price,
                p.tax_rate_percent as gst_percent, p.uom, p.hsn_sac_code as hsn, p.billing_type
         FROM invoice_items ii
         LEFT JOIN products p ON ii.product_id = p.product_id
         LEFT JOIN product_grades pg ON p.grade_id = pg.grade_id
         WHERE ii.invoice_id = ?`);

export const updateProductCurrentStockCurrentStock2 = (db: Db) => db.prepare('UPDATE products SET current_stock = current_stock + ?, sync_status = \'PENDING\', updated_at = CURRENT_TIMESTAMP WHERE product_id = ? AND (is_service_item IS NULL OR is_service_item = 0)');

export const updateInvoiceByInvoiceId = (db: Db) => db.prepare(`
        UPDATE invoices 
        SET is_held = 0, 
            invoice_type = 'RECALLED_HOLD',
            is_deleted = 1,
            sync_status = 'SYNCED', 
            updated_at = CURRENT_TIMESTAMP 
        WHERE invoice_id = ?
      `);

export const findInvoicesByInvoiceIdAndInvoiceTypeHold = (db: Db) => db.prepare(`SELECT * FROM invoices WHERE invoice_id = ? AND invoice_type = 'HOLD' AND is_held = 1`);

export const findInvoiceItemsByInvoiceIdProductIdAndQuantity = (db: Db) => db.prepare('SELECT product_id, quantity, is_service_item, combo_details FROM invoice_items WHERE invoice_id = ?');

export const updateInvoiceByInvoiceIdExpiredHold = (db: Db) => db.prepare(`
        UPDATE invoices 
        SET is_held = 0, 
            invoice_type = 'EXPIRED_HOLD', 
            is_deleted = 1,
            sync_status = 'SYNCED', 
            updated_at = CURRENT_TIMESTAMP 
        WHERE invoice_id = ?
      `);

export const findInvoicesByInvoiceType = (db: Db) => db.prepare(`
        SELECT invoice_id FROM invoices 
        WHERE tenant_id = ? 
          AND (invoice_type = 'HOLD' OR is_held = 1)
          AND held_until <= datetime('now', 'localtime')
      `);

export const updateInvoiceIsDeletedAndIsHeld = (db: Db) => db.prepare(`UPDATE invoices SET is_deleted = 1, is_held = 0 WHERE tenant_id = ? AND invoice_type IN ('EXPIRED_HOLD', 'RECALLED_HOLD') AND (is_deleted IS NULL OR is_deleted = 0)`);

export const findInvoicesByInvoiceIdSubtotalAndTaxTotal = (db: Db) => db.prepare('SELECT subtotal, tax_total, scrap_deduction, return_deduction FROM invoices WHERE invoice_id = ?');

export const updateInvoiceByInvoiceId2 = (db: Db) => db.prepare(`
      UPDATE invoices 
      SET discount_total = ?, discount_type = ?, discount_value = ?, grand_total = ?, sync_status = 'PENDING'
      WHERE invoice_id = ?
    `);

export const findOneInvoiceItemByInvoiceId = (db: Db) => db.prepare(`
        SELECT i.*, u.name as biller_name,
          st_biller.name as biller_staff_name,
          st_sales.name as sales_staff_name,
          COALESCE((SELECT COUNT(*) FROM invoice_items ii WHERE ii.invoice_id = i.invoice_id), 0) as item_count
        FROM invoices i 
        LEFT JOIN users u ON i.user_id = u.user_id 
        LEFT JOIN staff st_biller ON i.biller_staff_id = st_biller.staff_id
        LEFT JOIN staff st_sales ON i.sales_staff_id = st_sales.staff_id
        WHERE (i.invoice_id = ? OR i.invoice_number = ?)
          AND (i.is_deleted IS NULL OR i.is_deleted = 0 OR i.is_deleted = '0' OR i.is_deleted = '0.0' OR i.is_deleted = 0.0)
        LIMIT 1
      `);

export const findInvoicesByConvertedFrom_ = (db: Db) => db.prepare(`
      SELECT COALESCE(SUM(MAX(0, COALESCE(grand_total, COALESCE(subtotal, 0) + COALESCE(tax_total, 0) - COALESCE(discount_total, 0) - COALESCE(points_redeemed_discount, 0) - COALESCE(scrap_deduction, 0) - COALESCE(return_deduction, 0)))), 0) as totalSales, COUNT(*) as invoiceCount
      FROM invoices
      WHERE (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL) 
        AND (COALESCE(settled_at, created_at) >= ? AND COALESCE(settled_at, created_at) <= ?)
        AND (converted_from_invoice_id IS NULL OR converted_from_invoice_id = '')
        AND (is_deleted IS NULL OR is_deleted = 0 OR is_deleted = '0' OR is_deleted = '0.0' OR is_deleted = 0.0)
        AND (invoice_type NOT IN ('HOLD', 'EXPIRED_HOLD', 'RECALLED_HOLD'))
        AND (is_held IS NULL OR is_held = 0)
    `);

export const findInvoiceItemsByInvoiceId2 = (db: Db) => db.prepare(`
      SELECT ii.*,
             COALESCE(NULLIF(TRIM(ii.hsn_sac_code), ''), p.hsn_sac_code, '') AS hsn_sac_code,
             COALESCE(NULLIF(TRIM(ii.uom), ''), p.uom, 'PCS') AS uom,
             p.tax_rate_percent AS product_tax_rate_percent
      FROM invoice_items ii
      LEFT JOIN products p ON ii.product_id = p.product_id
      WHERE ii.invoice_id = ?
    `);

export const findUsersByUserId = (db: Db) => db.prepare('SELECT role, permissions FROM users WHERE user_id = ?');

export const findInvoicesByInvoiceId2 = (db: Db) => db.prepare(`SELECT * FROM invoices WHERE invoice_id = ?`);

export const findInvoiceItemsByInvoiceIdProductIdAndQuantity2 = (db: Db) => db.prepare('SELECT product_id, quantity FROM invoice_items WHERE invoice_id = ?');

export const updateInvoiceByInvoiceId3 = (db: Db) => db.prepare(`
      UPDATE invoices SET
        subtotal = ?, tax_total = ?, discount_total = ?, discount_type = ?,
        discount_value = ?, grand_total = ?, payment_method = ?,
        received_amount = ?, actual_refund_paid = ?, balance_amount = ?, split_details = ?,
        customer_name = ?, customer_phone = ?, customer_gstin = ?, customer_state = ?, customer_address = ?,
        scrap_deduction = ?, scrap_invoice_number = ?, return_deduction = ?, return_invoice_number = ?,
        customer_id = ?, cgst_total = ?, sgst_total = ?, igst_total = ?, supply_type = ?,
        notes = ?, description = ?,
        points_earned = COALESCE(?, points_earned),
        points_redeemed = COALESCE(?, points_redeemed),
        points_redeemed_discount = COALESCE(?, points_redeemed_discount),
        previous_points_balance = COALESCE(?, previous_points_balance),
        remaining_points_balance = COALESCE(?, remaining_points_balance),
        created_at = COALESCE(?, created_at),
        sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
      WHERE invoice_id = ?
    `);

export const deleteInvoiceItemByInvoiceId = (db: Db) => db.prepare('DELETE FROM invoice_items WHERE invoice_id = ?');

export const insertInvoiceItem3 = (db: Db) => db.prepare(`
      INSERT INTO invoice_items (item_id, invoice_id, tenant_id, product_id, name, quantity, unit_price, tax_amount, total, pieces_sold, is_service_item, billing_type, uom,
        cgst_rate, sgst_rate, igst_rate, cgst_amount, sgst_amount, igst_amount, hsn_sac_code, supply_type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

export const findProductsByProductIdIsServiceItem = (db: Db) => db.prepare('SELECT is_service_item FROM products WHERE product_id = ?');

export const updateProductCurrentStockCurrentStock3 = (db: Db) => db.prepare('UPDATE products SET current_stock = current_stock + ?, sync_status = \'PENDING\', updated_at = CURRENT_TIMESTAMP WHERE product_id = ?');

export const findCustomersByCustomerIdCurrentPointsBalance = (db: Db) => db.prepare('SELECT current_points_balance FROM customers WHERE customer_id = ?');

export const insertLoyaltyTransaction3 = (db: Db) => db.prepare(`
              INSERT INTO loyalty_transactions (
                transaction_id, tenant_id, customer_id, invoice_id,
                transaction_type, points, points_balance_before, points_balance_after,
                reference_number, description, created_by, sync_status, created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)
            `);

export const updateCustomerByCustomerId2 = (db: Db) => db.prepare(`
              UPDATE customers SET
                total_points_earned = COALESCE(total_points_earned, 0) + ?,
                current_points_balance = ?,
                last_purchase_date = COALESCE(last_purchase_date, ?),
                sync_status = 'PENDING',
                updated_at = CURRENT_TIMESTAMP
              WHERE customer_id = ?
            `);

export const updateInvoicePointsEarnedAndRemainingPointsBalance = (db: Db) => db.prepare(`
              UPDATE invoices SET
                points_earned = ?,
                remaining_points_balance = ?
              WHERE invoice_id = ?
            `);

export const updateInvoiceByInvoiceId4 = (db: Db) => db.prepare(`
      UPDATE invoices SET
        payment_method = ?,
        received_amount = ?,
        balance_amount = ?,
        split_details = ?,
        sync_status = 'PENDING',
        updated_at = CURRENT_TIMESTAMP
      WHERE invoice_id = ?
    `);

export const updateInvoiceByInvoiceId5 = (db: Db) => db.prepare(`
                UPDATE invoices SET
                  points_earned = ?,
                  previous_points_balance = COALESCE(previous_points_balance, ?),
                  remaining_points_balance = ?
                WHERE invoice_id = ?
              `);

export const updateCustomerByCustomerId3 = (db: Db) => db.prepare(`
                UPDATE customers SET
                  total_points_earned = COALESCE(total_points_earned, 0) + ?,
                  current_points_balance = ?,
                  last_purchase_date = ?,
                  sync_status = 'PENDING',
                  updated_at = CURRENT_TIMESTAMP
                WHERE customer_id = ?
              `);

export const findInvoiceItemsByInvoiceId3 = (db: Db) => db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ?');

export const findOneProductByProductId = (db: Db) => db.prepare(`
          SELECT * FROM products 
          WHERE tenant_id = ? 
            AND (product_id = ? OR name = ? OR name = ?) 
            AND is_deleted = 0
          ORDER BY (CASE WHEN product_id = ? THEN 1 WHEN name LIKE '%(GST)' THEN 2 ELSE 3 END) ASC
          LIMIT 1
        `);

export const findPurchaseBillItemsByProductIdAndBillType = (db: Db) => db.prepare(`
          SELECT pbi.item_id, pbi.quantity, pbi.purchase_price, pbi.selling_price, pbi.offer_price, pbi.tax_rate_percent
          FROM purchase_bill_items pbi
          JOIN purchase_bills pb ON pbi.purchase_bill_id = pb.purchase_bill_id
          WHERE pbi.product_id = ? 
            AND pb.bill_type = 'GST' 
            AND pb.tenant_id = ?
          ORDER BY pbi.created_at ASC
        `);

export const findInvoiceItemsByProductIdAndInvoiceType = (db: Db) => db.prepare(`
          SELECT COALESCE(SUM(ii.quantity), 0) as total_gst_sold
          FROM invoice_items ii
          JOIN invoices i ON ii.invoice_id = i.invoice_id
          WHERE ii.product_id = ? AND i.invoice_type = 'GST' AND ii.tenant_id = ? AND i.invoice_id != ?
        `);

export const findInvoicesByInvoiceIdInvoiceNumberAndInvoiceType = (db: Db) => db.prepare('SELECT invoice_number, invoice_type FROM invoices WHERE invoice_id = ?');

export const insertInvoice3 = (db: Db) => db.prepare(`
            INSERT INTO invoices (
              invoice_id, tenant_id, user_id, invoice_number, invoice_type,
              subtotal, tax_total, discount_total, discount_type, discount_value, grand_total,
              payment_method, split_details, received_amount, balance_amount,
              customer_id, customer_name, customer_phone, customer_gstin, customer_state, customer_address,
              biller_staff_id, sales_staff_id, notes, description,
              sync_status,
              converted_from_invoice_id, converted_from_invoice_number,
              cgst_total, sgst_total, igst_total, supply_type,
              points_redeemed, points_redeemed_discount,
              scrap_deduction, scrap_invoice_number, return_deduction, return_invoice_number,
              created_at
            )
            VALUES (?, ?, ?, ?, 'GST', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);

export const insertInvoiceItem4 = (db: Db) => db.prepare(`
            INSERT INTO invoice_items (
              item_id, invoice_id, tenant_id, product_id, name, quantity, unit_price, tax_amount, total, is_service_item,
              source_item_id, bos_unit_price, bos_tax_amount, bos_total, qty_from_paper_stock,
              cgst_rate, sgst_rate, igst_rate,
              cgst_amount, sgst_amount, igst_amount, supply_type,
              hsn_sac_code, uom, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);

export const updateInvoiceConvertedToInvoiceIdAndConvertedToInvoiceNumber = (db: Db) => db.prepare(`
            UPDATE invoices SET
              converted_to_invoice_id = ?,
              converted_to_invoice_number = ?,
              sync_status = 'PENDING',
              updated_at = CURRENT_TIMESTAMP
            WHERE invoice_id = ?
          `);

export const findInvoiceItemsByInvoiceIdAndIsGstApplicable = (db: Db) => db.prepare(`
      SELECT i.invoice_id,
             EXISTS(
               SELECT 1 FROM invoice_items ii
               LEFT JOIN products p ON ii.product_id = p.product_id
               WHERE ii.invoice_id = i.invoice_id
                 AND (
                   (p.product_id IS NOT NULL AND p.is_gst_applicable = 1)
                   OR EXISTS(
                     SELECT 1 FROM products pgst
                     WHERE pgst.tenant_id = i.tenant_id
                       AND pgst.is_deleted = 0
                       AND pgst.is_gst_applicable = 1
                       AND (
                         pgst.product_id = ii.product_id
                         OR pgst.name = REPLACE(REPLACE(REPLACE(COALESCE(p.name, ii.name), ' (GST)', ''), ' (EST)', ''), ' (Estimate)', '') || ' (GST)'
                         OR pgst.name = REPLACE(REPLACE(REPLACE(COALESCE(p.name, ii.name), ' (GST)', ''), ' (EST)', ''), ' (Estimate)', '')
                       )
                   )
                   OR EXISTS(
                     SELECT 1 FROM purchase_bill_items pbi
                     JOIN purchase_bills pb ON pbi.purchase_bill_id = pb.purchase_bill_id
                     WHERE (pbi.product_id = ii.product_id OR (p.product_id IS NOT NULL AND pbi.product_id = p.product_id))
                       AND pb.bill_type = 'GST'
                       AND pb.tenant_id = i.tenant_id
                   )
                   OR p.domain_attributes LIKE '%"gst_type":"PAPER"%'
                   OR p.domain_attributes LIKE '%"paper_mrp"%'
                   OR p.domain_attributes LIKE '%"paper_purchase_price"%'
                   OR p.domain_attributes LIKE '%"gst_purchase_price"%'
                   OR p.domain_attributes LIKE '%"paper_stock"%'
                 )
             ) AS convertible
      FROM invoices i
      WHERE (i.tenant_id = ? OR i.tenant_id = 'global' OR ? = 'global') AND i.invoice_type = 'BILL_OF_SUPPLY' AND i.converted_to_invoice_id IS NULL AND (i.is_deleted IS NULL OR i.is_deleted = 0)
    `);

export const findInvoicesByInvoiceId3 = (db: Db) => db.prepare('SELECT tenant_id, converted_from_invoice_id, converted_to_invoice_id FROM invoices WHERE invoice_id = ?');

export const findInvoiceItemsByInvoiceIdProductIdAndQuantity3 = (db: Db) => db.prepare('SELECT product_id, quantity, qty_from_paper_stock FROM invoice_items WHERE invoice_id = ?');

export const updateProductCurrentStockCurrentStock4 = (db: Db) => db.prepare('UPDATE products SET current_stock = current_stock + ?, sync_status = \'PENDING\', updated_at = CURRENT_TIMESTAMP WHERE product_id = ? AND tenant_id = ?');

export const updateProductCurrentStockCurrentStock5 = (db: Db) => db.prepare('UPDATE products SET current_stock = current_stock - ?, sync_status = \'PENDING\', updated_at = CURRENT_TIMESTAMP WHERE product_id = ? AND tenant_id = ?');

export const updateInvoiceItemIsDeleted = (db: Db) => db.prepare("UPDATE invoice_items SET is_deleted = 1, sync_status = 'PENDING' WHERE invoice_id = ?");

export const updateInvoiceConvertedToInvoiceIdAndConvertedToInvoiceNumber2 = (db: Db) => db.prepare(`
          UPDATE invoices SET
            converted_to_invoice_id = NULL,
            converted_to_invoice_number = NULL,
            sync_status = 'PENDING',
            updated_at = CURRENT_TIMESTAMP
          WHERE invoice_id = ?
        `);

export const updateInvoiceConvertedFromInvoiceIdAndConvertedFromInvoiceNumber = (db: Db) => db.prepare(`
          UPDATE invoices SET
            converted_from_invoice_id = NULL,
            converted_from_invoice_number = NULL,
            sync_status = 'PENDING',
            updated_at = CURRENT_TIMESTAMP
          WHERE invoice_id = ?
        `);

export const updateInvoiceIsDeletedAndDeletedAt = (db: Db) => db.prepare("UPDATE invoices SET is_deleted = 1, deleted_at = CURRENT_TIMESTAMP, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE invoice_id = ?");

export const updatePartyLedgerIsDeleted = (db: Db) => db.prepare(`
          UPDATE party_ledger 
          SET is_deleted = 1, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP 
          WHERE (reference_number = ? OR reference_number = ? OR reference_number LIKE ? OR description LIKE ?)
            AND (is_deleted IS NULL OR is_deleted = 0)
        `);
