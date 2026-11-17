import type { Db } from '../types.js';

/** SQL used by electron/sync/entities/stockDocsSync.ts. Each factory prepares its statement on the given connection. */

export const selectScrapCategories = (db: Db) => db.prepare(`SELECT * FROM scrap_categories WHERE sync_status = 'PENDING' AND tenant_id = ?`);
export const updateScrapCategories = (db: Db) => db.prepare(`UPDATE scrap_categories SET sync_status = 'SYNCED' WHERE scrap_category_id = ? AND tenant_id = ?`);
export const selectScrapTransactions = (db: Db) => db.prepare(`SELECT * FROM scrap_transactions WHERE sync_status = 'PENDING' AND tenant_id = ?`);
export const updateScrapTransactions = (db: Db) => db.prepare(`UPDATE scrap_transactions SET sync_status = 'SYNCED' WHERE transaction_id = ? AND tenant_id = ?`);
export const insertScrapCategories = (db: Db) => db.prepare(`
    INSERT INTO scrap_categories (
      scrap_category_id, tenant_id, name, purchase_price, selling_price, current_stock, unit, is_deleted,
      sync_status, created_at, updated_at
    ) VALUES (
      @scrap_category_id, @tenant_id, @name, @purchase_price, @selling_price, @current_stock, @unit, @is_deleted,
      'SYNCED', @created_at, @updated_at
    )
    ON CONFLICT(scrap_category_id) DO UPDATE SET
      name = excluded.name,
      purchase_price = excluded.purchase_price,
      selling_price = excluded.selling_price,
      current_stock = excluded.current_stock,
      unit = excluded.unit,
      is_deleted = excluded.is_deleted,
      created_at = COALESCE(scrap_categories.created_at, excluded.created_at),
      updated_at = excluded.updated_at,
      sync_status = 'SYNCED'
    WHERE scrap_categories.sync_status != 'PENDING'
  `);
export const insertScrapTransactions = (db: Db) => db.prepare(`
    INSERT INTO scrap_transactions (
      transaction_id, tenant_id, type, scrap_category_id, quantity, rate, total_amount, party_name, customer_phone, customer_address, notes, scrap_invoice_number, payment_status, transaction_date, created_at,
      is_deleted, sync_status, updated_at
    ) VALUES (
      @transaction_id, @tenant_id, @type, @scrap_category_id, @quantity, @rate, @total_amount, @party_name, @customer_phone, @customer_address, @notes, @scrap_invoice_number, @payment_status, @transaction_date, @created_at,
      COALESCE(@is_deleted, 0), 'SYNCED', @updated_at
    )
    ON CONFLICT(transaction_id) DO UPDATE SET
      type = excluded.type,
      scrap_category_id = excluded.scrap_category_id,
      quantity = excluded.quantity,
      rate = excluded.rate,
      total_amount = excluded.total_amount,
      party_name = excluded.party_name,
      customer_phone = excluded.customer_phone,
      customer_address = excluded.customer_address,
      notes = excluded.notes,
      scrap_invoice_number = excluded.scrap_invoice_number,
      payment_status = excluded.payment_status,
      is_deleted = COALESCE(excluded.is_deleted, 0),
      updated_at = excluded.updated_at,
      sync_status = 'SYNCED'
    WHERE scrap_transactions.sync_status != 'PENDING'
  `);
export const selectPurchaseBills = (db: Db) => db.prepare(`SELECT * FROM purchase_bills WHERE sync_status = 'PENDING' AND tenant_id = ?`);
export const updatePurchaseBills = (db: Db) => db.prepare(`UPDATE purchase_bills SET sync_status = 'SYNCED' WHERE purchase_bill_id = ? AND tenant_id = ?`);
export const updatePurchaseBillItems = (db: Db) => db.prepare(`UPDATE purchase_bill_items SET sync_status = 'SYNCED' WHERE purchase_bill_id = ? AND tenant_id = ?`);
export const selectPurchaseBillItems = (db: Db) => db.prepare(`SELECT * FROM purchase_bill_items WHERE purchase_bill_id = ? AND tenant_id = ?`);
export const insertPurchaseBills = (db: Db) => db.prepare(`
    INSERT INTO purchase_bills (
      purchase_bill_id, tenant_id, bill_number, supplier_id, supplier_name, bill_date, invoice_number, notes, total_amount,
      bill_type, payment_type, is_interstate, sync_status, created_at, updated_at
    ) VALUES (
      @purchase_bill_id, @tenant_id, @bill_number, @supplier_id, @supplier_name, @bill_date, @invoice_number, @notes, @total_amount,
      @bill_type, @payment_type, @is_interstate, 'SYNCED', @created_at, @updated_at
    )
    ON CONFLICT(purchase_bill_id) DO UPDATE SET
      bill_number = excluded.bill_number,
      supplier_id = excluded.supplier_id,
      supplier_name = excluded.supplier_name,
      bill_date = excluded.bill_date,
      invoice_number = excluded.invoice_number,
      notes = excluded.notes,
      total_amount = excluded.total_amount,
      bill_type = excluded.bill_type,
      payment_type = excluded.payment_type,
      is_interstate = excluded.is_interstate,
      created_at = COALESCE(purchase_bills.created_at, excluded.created_at),
      updated_at = excluded.updated_at,
      sync_status = 'SYNCED'
    WHERE purchase_bills.sync_status != 'PENDING'
  `);
export const insertPurchaseBillItems = (db: Db) => db.prepare(`
    INSERT INTO purchase_bill_items (
      item_id, purchase_bill_id, tenant_id, product_id, name, quantity, purchase_price, total_amount, selling_price, offer_price,
      is_gst_applicable, tax_rate_percent, hsn_sac_code, skip_stock_update, sync_status, created_at, updated_at
    ) VALUES (
      @item_id, @purchase_bill_id, @tenant_id, @product_id, @name, @quantity, @purchase_price, @total_amount, @selling_price, @offer_price,
      @is_gst_applicable, @tax_rate_percent, @hsn_sac_code, @skip_stock_update, 'SYNCED', @created_at, @updated_at
    )
    ON CONFLICT(item_id) DO UPDATE SET
      product_id = excluded.product_id,
      name = excluded.name,
      quantity = excluded.quantity,
      purchase_price = excluded.purchase_price,
      total_amount = excluded.total_amount,
      selling_price = excluded.selling_price,
      offer_price = excluded.offer_price,
      is_gst_applicable = excluded.is_gst_applicable,
      tax_rate_percent = excluded.tax_rate_percent,
      hsn_sac_code = excluded.hsn_sac_code,
      skip_stock_update = excluded.skip_stock_update,
      created_at = COALESCE(purchase_bill_items.created_at, excluded.created_at),
      updated_at = excluded.updated_at,
      sync_status = 'SYNCED'
    WHERE purchase_bill_items.sync_status != 'PENDING'
  `);
export const deletePurchaseBillItems = (db: Db) => db.prepare('DELETE FROM purchase_bill_items WHERE purchase_bill_id = ? AND tenant_id = ?');
export const selectPurchaseBills2 = (db: Db) => db.prepare('SELECT sync_status, updated_at FROM purchase_bills WHERE purchase_bill_id = ? AND tenant_id = ?');
export const selectReturns = (db: Db) => db.prepare(`SELECT * FROM returns WHERE sync_status = 'PENDING' AND tenant_id = ?`);
export const updateReturns = (db: Db) => db.prepare(`UPDATE returns SET sync_status = 'SYNCED' WHERE return_id = ? AND tenant_id = ?`);
export const updateReturnItems = (db: Db) => db.prepare(`UPDATE return_items SET sync_status = 'SYNCED' WHERE return_id = ? AND tenant_id = ?`);
export const selectReturnItems = (db: Db) => db.prepare(`SELECT * FROM return_items WHERE return_id = ? AND tenant_id = ?`);
export const insertReturns = (db: Db) => db.prepare(`
    INSERT INTO returns (return_id, invoice_id, tenant_id, user_id, return_number, customer_name, customer_phone, customer_address, subtotal, tax_total, grand_total, reason, return_date, refund_method, adjusted_invoice_number, adjusted_amount, sync_status, created_at, updated_at)
    VALUES (@return_id, @invoice_id, @tenant_id, @user_id, @return_number, @customer_name, @customer_phone, @customer_address, @subtotal, @tax_total, @grand_total, @reason, @return_date, @refund_method, @adjusted_invoice_number, @adjusted_amount, 'SYNCED', @created_at, @updated_at)
    ON CONFLICT(return_id) DO UPDATE SET
      customer_name = excluded.customer_name, customer_phone = excluded.customer_phone,
      customer_address = excluded.customer_address,
      subtotal = excluded.subtotal, tax_total = excluded.tax_total, grand_total = excluded.grand_total,
      reason = excluded.reason, return_date = excluded.return_date,
      refund_method = excluded.refund_method, adjusted_invoice_number = excluded.adjusted_invoice_number,
      adjusted_amount = excluded.adjusted_amount, updated_at = excluded.updated_at,
      sync_status = 'SYNCED'
    WHERE returns.sync_status != 'PENDING'
  `);
export const insertReturnItems = (db: Db) => db.prepare(`
    INSERT INTO return_items (return_item_id, return_id, tenant_id, invoice_item_id, product_id, name, quantity, unit_price, tax_amount, total, sync_status, created_at)
    VALUES (@return_item_id, @return_id, @tenant_id, @invoice_item_id, @product_id, @name, @quantity, @unit_price, @tax_amount, @total, 'SYNCED', @created_at)
    ON CONFLICT(return_item_id) DO UPDATE SET
      name = excluded.name, quantity = excluded.quantity, unit_price = excluded.unit_price,
      tax_amount = excluded.tax_amount, total = excluded.total, sync_status = 'SYNCED'
    WHERE return_items.sync_status != 'PENDING'
  `);
