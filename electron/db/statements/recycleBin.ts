import { stockTimestampSql } from './stockTimestamp.js';
import type { Db } from './types.js';

/** SQL statements used by services/recycleBinService.ts. Each factory prepares its statement on the given connection. */

export const pragmaTableInfo = (db: Db) => db.prepare('PRAGMA table_info(invoices)');

export const findInvoicesByInvoiceId = (db: Db) => db.prepare('SELECT * FROM invoices WHERE invoice_id = ?');

export const findInvoiceItemsByInvoiceId = (db: Db) => db.prepare('SELECT product_id, quantity FROM invoice_items WHERE invoice_id = ?');

export const updateProductCurrentStock = (db: Db) => db.prepare(`UPDATE products SET current_stock = current_stock - ?, sync_status = 'PENDING', updated_at = ${stockTimestampSql} WHERE product_id = ? AND tenant_id = ?`);

export const updateInvoiceItemIsDeleted = (db: Db) => db.prepare("UPDATE invoice_items SET is_deleted = 0, sync_status = 'PENDING' WHERE invoice_id = ?");

export const updateInvoiceIsDeletedAndDeletedAt = (db: Db) => db.prepare("UPDATE invoices SET is_deleted = 0, deleted_at = NULL, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE invoice_id = ?");

export const updateInvoiceIsDeleted = (db: Db) => db.prepare("UPDATE invoices SET is_deleted = 0, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE invoice_id = ?");

export const updateInvoiceConvertedToInvoiceIdAndConvertedToInvoiceNumber = (db: Db) => db.prepare(`
          UPDATE invoices SET
            converted_to_invoice_id = ?,
            converted_to_invoice_number = ?,
            sync_status = 'PENDING',
            updated_at = CURRENT_TIMESTAMP
          WHERE invoice_id = ?
        `);

export const findProducts = (db: Db) => db.prepare(`
      SELECT product_id, name, COALESCE(sku_barcode, '') AS barcode, category, current_stock, base_price, updated_at
      FROM products
      WHERE (tenant_id = ? OR tenant_id = 'global') AND is_deleted = 1
      ORDER BY updated_at DESC
      LIMIT 500
    `);

export const updateProductIsDeleted = (db: Db) => db.prepare("UPDATE products SET is_deleted = 0, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE product_id = ?");

export const findCustomers = (db: Db) => db.prepare(`
      SELECT customer_id, name, phone, '' AS email, current_points_balance, updated_at
      FROM customers
      WHERE (tenant_id = ? OR tenant_id = 'global') AND is_deleted = 1
      ORDER BY updated_at DESC
      LIMIT 500
    `);

export const updateCustomerIsDeleted = (db: Db) => db.prepare("UPDATE customers SET is_deleted = 0, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE customer_id = ? AND (tenant_id = ? OR tenant_id = 'global')");

export const updatePartyIsDeleted = (db: Db) => db.prepare("UPDATE parties SET is_deleted = 0, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE party_id = ? AND (tenant_id = ? OR tenant_id = 'global')");

export const findParties = (db: Db) => db.prepare(`
      SELECT party_id, name, phone, address, balance, balance_type, party_type, updated_at
      FROM parties
      WHERE (tenant_id = ? OR tenant_id = 'global') AND is_deleted = 1
        AND (party_type IS NULL OR party_type != 'CUSTOMER')
      ORDER BY updated_at DESC
      LIMIT 500
    `);

export const deleteInvoiceItemByInvoiceId = (db: Db) => db.prepare('DELETE FROM invoice_items WHERE invoice_id = ?');

export const deleteInvoiceByInvoiceId = (db: Db) => db.prepare('DELETE FROM invoices WHERE invoice_id = ? AND is_deleted = 1');

export const deleteProductByProductId = (db: Db) => db.prepare('DELETE FROM products WHERE product_id = ? AND is_deleted = 1');

export const deleteProductPricingByProductId = (db: Db) => db.prepare('DELETE FROM product_pricing WHERE product_id = ?');

export const deleteComboItemsByProductId = (db: Db) => db.prepare('DELETE FROM combo_items WHERE product_id = ?');

export const deletePurchaseBillItemsByProductId = (db: Db) => db.prepare('DELETE FROM purchase_bill_items WHERE product_id = ?');

export const deleteProductPricingForDeletedProducts = (db: Db) => db.prepare(`
  DELETE FROM product_pricing WHERE product_id IN (
    SELECT product_id FROM products WHERE (tenant_id = ? OR tenant_id = 'global') AND is_deleted = 1
  )
`);

export const deleteComboItemsForDeletedProducts = (db: Db) => db.prepare(`
  DELETE FROM combo_items WHERE product_id IN (
    SELECT product_id FROM products WHERE (tenant_id = ? OR tenant_id = 'global') AND is_deleted = 1
  )
`);

export const deletePurchaseBillItemsForDeletedProducts = (db: Db) => db.prepare(`
  DELETE FROM purchase_bill_items WHERE product_id IN (
    SELECT product_id FROM products WHERE (tenant_id = ? OR tenant_id = 'global') AND is_deleted = 1
  )
`);

export const deleteCustomerByCustomerId = (db: Db) => db.prepare("DELETE FROM customers WHERE customer_id = ? AND (tenant_id = ? OR tenant_id = 'global') AND is_deleted = 1");

export const deletePartyByPartyId = (db: Db) => db.prepare("DELETE FROM parties WHERE party_id = ? AND (tenant_id = ? OR tenant_id = 'global') AND is_deleted = 1");

export const deletePartyLedgerByPartyId = (db: Db) => db.prepare('DELETE FROM party_ledger WHERE party_id = ? AND is_deleted = 1');

export const deletePartyByPartyId2 = (db: Db) => db.prepare('DELETE FROM parties WHERE party_id = ? AND is_deleted = 1');

export const countInvoices = (db: Db) => db.prepare(`
      SELECT COUNT(*) AS count, COALESCE(SUM(grand_total), 0) AS total
      FROM invoices
      WHERE (tenant_id = ? OR tenant_id = 'global') AND is_deleted = 1
        AND invoice_type NOT IN ('HOLD', 'EXPIRED_HOLD', 'RECALLED_HOLD')
    `);

export const countProducts = (db: Db) => db.prepare(`
      SELECT COUNT(*) AS count
      FROM products
      WHERE (tenant_id = ? OR tenant_id = 'global') AND is_deleted = 1
    `);

export const countCustomers = (db: Db) => db.prepare(`
      SELECT COUNT(*) AS count
      FROM customers
      WHERE (tenant_id = ? OR tenant_id = 'global') AND is_deleted = 1
    `);

export const countParties = (db: Db) => db.prepare(`
      SELECT COUNT(*) AS count
      FROM parties
      WHERE (tenant_id = ? OR tenant_id = 'global') AND is_deleted = 1
        AND (party_type IS NULL OR party_type != 'CUSTOMER')
    `);

export const findInvoices = (db: Db) => db.prepare(`
          SELECT invoice_id FROM invoices 
          WHERE (tenant_id = ? OR tenant_id = 'global') AND is_deleted = 1
        `);

export const deleteInvoiceByInvoiceId2 = (db: Db) => db.prepare('DELETE FROM invoices WHERE invoice_id = ?');

export const deleteProduct = (db: Db) => db.prepare(`DELETE FROM products WHERE (tenant_id = ? OR tenant_id = 'global') AND is_deleted = 1`);

export const deleteCustomer = (db: Db) => db.prepare(`DELETE FROM customers WHERE (tenant_id = ? OR tenant_id = 'global') AND is_deleted = 1`);

export const deletePartyByPartyType = (db: Db) => db.prepare(`DELETE FROM parties WHERE (tenant_id = ? OR tenant_id = 'global') AND is_deleted = 1 AND party_type = 'CUSTOMER'`);

export const deleteParty = (db: Db) => db.prepare(`DELETE FROM parties WHERE (tenant_id = ? OR tenant_id = 'global') AND is_deleted = 1 AND (party_type IS NULL OR party_type != 'CUSTOMER')`);

/** Dynamic SQL: `deletedAtCol`, `orderClause` must be built from trusted values (placeholders/column lists), never user input. */
export const listDeletedInvoices = (db: Db, deletedAtCol: string | number, orderClause: string | number) => db.prepare(`
      SELECT invoice_id, invoice_number, customer_name, customer_phone, grand_total,
             payment_method, invoice_type, created_at, updated_at${deletedAtCol}
      FROM invoices
      WHERE (tenant_id = ? OR tenant_id = 'global') AND is_deleted = 1
        AND invoice_type NOT IN ('HOLD', 'EXPIRED_HOLD', 'RECALLED_HOLD')
      ${orderClause}
      LIMIT 500
    `);
