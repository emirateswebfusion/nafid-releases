import type { Db } from '../types.js';

/** SQL used by electron/sync/entities/salesDocsSync.ts. Each factory prepares its statement on the given connection. */

export const selectInvoices = (db: Db) => db.prepare(`SELECT * FROM invoices WHERE sync_status = 'PENDING' AND (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL) AND invoice_type NOT IN ('HOLD', 'EXPIRED_HOLD')`);
export const selectInvoiceItems = (db: Db) => db.prepare(`SELECT * FROM invoice_items WHERE invoice_id = ? AND (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL) ORDER BY rowid ASC`);
export const updateInvoices = (db: Db) => db.prepare(`UPDATE invoices SET sync_status = 'SYNCED' WHERE invoice_id = ? AND (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL)`);
export const insertInvoices = (db: Db) => db.prepare(`
    INSERT INTO invoices (
      invoice_id, tenant_id, invoice_number, invoice_type,
      customer_name, customer_phone, customer_gstin, customer_state, customer_address,
      subtotal, tax_total,
      discount_total, discount_type, discount_value, grand_total, payment_method, split_details,
      received_amount, actual_refund_paid, balance_amount, user_id, sync_status, created_at,
      scrap_deduction, scrap_invoice_number,
      return_deduction, return_invoice_number,
      customer_id, points_earned, points_redeemed, points_redeemed_discount,
      previous_points_balance, remaining_points_balance,
      converted_from_invoice_id, converted_from_invoice_number,
      converted_to_invoice_id, converted_to_invoice_number,
      is_deleted,
      cgst_total, sgst_total, igst_total, supply_type,
      notes, description, counts_in_revenue, bill_purpose, stock_applied
    ) VALUES (
      @invoice_id, @tenant_id, @invoice_number, @invoice_type,
      @customer_name, @customer_phone, @customer_gstin, @customer_state, @customer_address,
      @subtotal, @tax_total,
      @discount_total, @discount_type, @discount_value, @grand_total, @payment_method, @split_details,
      @received_amount, @actual_refund_paid, @balance_amount, @user_id, 'SYNCED', @created_at,
      @scrap_deduction, @scrap_invoice_number,
      @return_deduction, @return_invoice_number,
      @customer_id, @points_earned, @points_redeemed, @points_redeemed_discount,
      @previous_points_balance, @remaining_points_balance,
      @converted_from_invoice_id, @converted_from_invoice_number,
      @converted_to_invoice_id, @converted_to_invoice_number,
      @is_deleted,
      @cgst_total, @sgst_total, @igst_total, @supply_type,
      @notes, @description, @counts_in_revenue, @bill_purpose, @stock_applied
    )
    ON CONFLICT(invoice_id) DO UPDATE SET
      customer_name = EXCLUDED.customer_name,
      customer_phone = EXCLUDED.customer_phone,
      customer_gstin = EXCLUDED.customer_gstin,
      customer_state = EXCLUDED.customer_state,
      customer_address = EXCLUDED.customer_address,
      subtotal = EXCLUDED.subtotal,
      tax_total = EXCLUDED.tax_total,
      discount_total = EXCLUDED.discount_total,
      discount_type = EXCLUDED.discount_type,
      discount_value = EXCLUDED.discount_value,
      grand_total = EXCLUDED.grand_total,
      payment_method = EXCLUDED.payment_method,
      split_details = EXCLUDED.split_details,
      received_amount = EXCLUDED.received_amount,
      actual_refund_paid = EXCLUDED.actual_refund_paid,
      balance_amount = EXCLUDED.balance_amount,
      invoice_type = EXCLUDED.invoice_type,
      user_id = EXCLUDED.user_id,
      scrap_deduction = EXCLUDED.scrap_deduction,
      scrap_invoice_number = EXCLUDED.scrap_invoice_number,
      return_deduction = EXCLUDED.return_deduction,
      return_invoice_number = EXCLUDED.return_invoice_number,
      customer_id = EXCLUDED.customer_id,
      points_earned = EXCLUDED.points_earned,
      points_redeemed = EXCLUDED.points_redeemed,
      points_redeemed_discount = EXCLUDED.points_redeemed_discount,
      previous_points_balance = EXCLUDED.previous_points_balance,
      remaining_points_balance = EXCLUDED.remaining_points_balance,
      converted_from_invoice_id = EXCLUDED.converted_from_invoice_id,
      converted_from_invoice_number = EXCLUDED.converted_from_invoice_number,
      converted_to_invoice_id = EXCLUDED.converted_to_invoice_id,
      converted_to_invoice_number = EXCLUDED.converted_to_invoice_number,
      is_deleted = EXCLUDED.is_deleted,
      cgst_total = EXCLUDED.cgst_total,
      sgst_total = EXCLUDED.sgst_total,
      igst_total = EXCLUDED.igst_total,
      supply_type = EXCLUDED.supply_type,
      notes = EXCLUDED.notes,
      description = EXCLUDED.description,
      counts_in_revenue = EXCLUDED.counts_in_revenue,
      bill_purpose = EXCLUDED.bill_purpose,
      stock_applied = EXCLUDED.stock_applied,
      created_at = EXCLUDED.created_at,
      updated_at = EXCLUDED.updated_at,
      sync_status = 'SYNCED'
  `);
export const insertInvoiceItems = (db: Db) => db.prepare(`
    INSERT INTO invoice_items (
      item_id, invoice_id, tenant_id, product_id,
      name, quantity, unit_price, tax_amount, total, qty_from_paper_stock, pieces_sold, billing_type, uom,
      cgst_rate, sgst_rate, igst_rate, cgst_amount, sgst_amount, igst_amount, hsn_sac_code, supply_type,
      combo_id, combo_details, is_service_item
    ) VALUES (
      @item_id, @invoice_id, @tenant_id, @product_id,
      @name, @quantity, @unit_price, @tax_amount, @total, @qty_from_paper_stock, @pieces_sold, @billing_type, @uom,
      @cgst_rate, @sgst_rate, @igst_rate, @cgst_amount, @sgst_amount, @igst_amount, @hsn_sac_code, @supply_type,
      @combo_id, @combo_details, @is_service_item
    )
    ON CONFLICT(item_id) DO UPDATE SET
      name = excluded.name,
      quantity = excluded.quantity,
      unit_price = excluded.unit_price,
      tax_amount = excluded.tax_amount,
      total = excluded.total,
      qty_from_paper_stock = excluded.qty_from_paper_stock,
      pieces_sold = COALESCE(excluded.pieces_sold, invoice_items.pieces_sold),
      billing_type = COALESCE(excluded.billing_type, invoice_items.billing_type),
      uom = COALESCE(excluded.uom, invoice_items.uom),
      cgst_rate = excluded.cgst_rate,
      sgst_rate = excluded.sgst_rate,
      igst_rate = excluded.igst_rate,
      cgst_amount = excluded.cgst_amount,
      sgst_amount = excluded.sgst_amount,
      igst_amount = excluded.igst_amount,
      hsn_sac_code = excluded.hsn_sac_code,
      supply_type = excluded.supply_type,
      combo_id = COALESCE(excluded.combo_id, invoice_items.combo_id),
      combo_details = COALESCE(excluded.combo_details, invoice_items.combo_details),
      is_service_item = COALESCE(excluded.is_service_item, invoice_items.is_service_item)
  `);
export const deleteInvoiceItems = (db: Db) => db.prepare('DELETE FROM invoice_items WHERE invoice_id = ? AND tenant_id = ?');
export const selectInvoices2 = (db: Db) => db.prepare('SELECT sync_status, updated_at, is_deleted FROM invoices WHERE invoice_id = ? AND tenant_id = ?');
export const selectCustomers = (db: Db) => db.prepare(`
                SELECT customer_id FROM customers 
                WHERE tenant_id = ? AND (is_deleted IS NULL OR is_deleted = 0)
                  AND (phone = ? OR REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '+', '') LIKE ?)
                LIMIT 1
              `);
export const selectCustomers2 = (db: Db) => db.prepare(`
                SELECT customer_id FROM customers 
                WHERE tenant_id = ? AND (is_deleted IS NULL OR is_deleted = 0)
                  AND LOWER(REPLACE(TRIM(name), '  ', ' ')) = LOWER(REPLACE(TRIM(?), '  ', ' '))
                LIMIT 1
              `);
export const updateProducts = (db: Db) => db.prepare('UPDATE products SET current_stock = current_stock + ?, sync_status = \'PENDING\', updated_at = CURRENT_TIMESTAMP WHERE product_id = ? AND tenant_id = ?');
export const updateProducts2 = (db: Db) => db.prepare('UPDATE products SET current_stock = current_stock - ?, sync_status = \'PENDING\', updated_at = CURRENT_TIMESTAMP WHERE product_id = ? AND tenant_id = ?');


export const selectInvoiceItems2 = (db: Db) => db.prepare('SELECT item_id, pieces_sold, billing_type, uom FROM invoice_items WHERE invoice_id = ? AND tenant_id = ? ORDER BY rowid ASC');
export const selectQuotations = (db: Db) => db.prepare(`SELECT * FROM quotations WHERE sync_status = 'PENDING' AND (tenant_id = ? OR tenant_id = 'global' OR tenant_id = '' OR tenant_id IS NULL)`);
export const selectQuotationItems = (db: Db) => db.prepare(`SELECT * FROM quotation_items WHERE quotation_id = ?`);
export const updateQuotations = (db: Db) => db.prepare(`UPDATE quotations SET sync_status = 'SYNCED', tenant_id = ? WHERE quotation_id = ?`);
export const updateQuotationItems = (db: Db) => db.prepare(`UPDATE quotation_items SET sync_status = 'SYNCED', tenant_id = ? WHERE quotation_id = ?`);
export const insertQuotations = (db: Db) => db.prepare(`
    INSERT INTO quotations (
      quotation_id, tenant_id, quotation_number, customer_name, customer_phone, customer_address,
      terms_conditions, subtotal, tax_total, grand_total, status, converted_to_invoice, invoice_id,
      sync_status, created_at, updated_at
    ) VALUES (
      @quotation_id, @tenant_id, @quotation_number, @customer_name, @customer_phone, @customer_address,
      @terms_conditions, @subtotal, @tax_total, @grand_total, @status, @converted_to_invoice, @invoice_id,
      'SYNCED', @created_at, @updated_at
    )
    ON CONFLICT(quotation_id) DO UPDATE SET
      customer_name = EXCLUDED.customer_name,
      customer_phone = EXCLUDED.customer_phone,
      customer_address = EXCLUDED.customer_address,
      terms_conditions = EXCLUDED.terms_conditions,
      subtotal = EXCLUDED.subtotal,
      tax_total = EXCLUDED.tax_total,
      grand_total = EXCLUDED.grand_total,
      status = EXCLUDED.status,
      converted_to_invoice = EXCLUDED.converted_to_invoice,
      invoice_id = EXCLUDED.invoice_id,
      updated_at = EXCLUDED.updated_at,
      sync_status = 'SYNCED'
    WHERE quotations.sync_status NOT IN ('PENDING', 'FAILED')
  `);
export const insertQuotationItems = (db: Db) => db.prepare(`
    INSERT INTO quotation_items (
      item_id, quotation_id, tenant_id, product_id, name, quantity, weight, rate, amount, sync_status, created_at
    ) VALUES (
      @item_id, @quotation_id, @tenant_id, @product_id, @name, @quantity, @weight, @rate, @amount, 'SYNCED', @created_at
    )
    ON CONFLICT(item_id) DO UPDATE SET
      name = EXCLUDED.name,
      quantity = EXCLUDED.quantity,
      weight = EXCLUDED.weight,
      rate = EXCLUDED.rate,
      amount = EXCLUDED.amount,
      sync_status = 'SYNCED'
  `);
export const deleteQuotationItems = (db: Db) => db.prepare('DELETE FROM quotation_items WHERE quotation_id = ?');
export const updateQuotations2 = (db: Db) => db.prepare("UPDATE quotations SET status = 'DELETED', sync_status = 'SYNCED' WHERE quotation_id = ?");
export const selectWarranties = (db: Db) => db.prepare(`SELECT * FROM warranties WHERE sync_status = 'PENDING' AND (tenant_id = ? OR tenant_id = 'global' OR tenant_id = '' OR tenant_id IS NULL)`);
export const updateWarranties = (db: Db) => db.prepare(`UPDATE warranties SET sync_status = 'SYNCED', tenant_id = ? WHERE warranty_id = ?`);
export const insertWarranties = (db: Db) => db.prepare(`
    INSERT INTO warranties (
      warranty_id, tenant_id, invoice_id, invoice_item_id, bill_number, brand,
      customer_name, customer_phone, product_name, product_details, purchase_date,
      warranty_period_days, expiry_date, notes, sync_status, created_at, updated_at
    ) VALUES (
      @warranty_id, @tenant_id, @invoice_id, @invoice_item_id, @bill_number, @brand,
      @customer_name, @customer_phone, @product_name, @product_details, @purchase_date,
      @warranty_period_days, @expiry_date, @notes, 'SYNCED', @created_at, @updated_at
    )
    ON CONFLICT(warranty_id) DO UPDATE SET
      bill_number = EXCLUDED.bill_number,
      brand = EXCLUDED.brand,
      customer_name = EXCLUDED.customer_name,
      customer_phone = EXCLUDED.customer_phone,
      product_name = EXCLUDED.product_name,
      product_details = EXCLUDED.product_details,
      purchase_date = EXCLUDED.purchase_date,
      warranty_period_days = EXCLUDED.warranty_period_days,
      expiry_date = EXCLUDED.expiry_date,
      notes = EXCLUDED.notes,
      updated_at = EXCLUDED.updated_at,
      sync_status = 'SYNCED'
    WHERE warranties.sync_status NOT IN ('PENDING', 'FAILED')
  `);
