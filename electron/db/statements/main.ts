import type { Db } from './types.js';

/** SQL used by electron/main.ts. Each factory prepares its statement on the given connection. */

export const updateInvoices = (db: Db) => db.prepare("UPDATE invoices SET sync_status = 'SYNCED' WHERE invoice_type = 'HOLD' AND sync_status = 'PENDING'");
export const updateInvoices2 = (db: Db) => db.prepare("UPDATE invoices SET sync_status = 'SYNCED' WHERE invoice_type = 'EXPIRED_HOLD' AND sync_status = 'PENDING'");
export const updateInvoices3 = (db: Db) => db.prepare("UPDATE invoices SET balance_amount = 0 WHERE sync_status = 'PENDING' AND (balance_amount < 0 OR balance_amount IS NULL)");
export const updateInvoices4 = (db: Db) => db.prepare("UPDATE invoices SET grand_total = 0 WHERE sync_status = 'PENDING' AND (grand_total IS NULL OR grand_total < 0)");
export const updateInvoices5 = (db: Db) => db.prepare("UPDATE invoices SET subtotal = 0 WHERE sync_status = 'PENDING' AND (subtotal IS NULL OR subtotal < 0)");
export const updateInvoices6 = (db: Db) => db.prepare("UPDATE invoices SET received_amount = 0 WHERE sync_status = 'PENDING' AND (received_amount IS NULL OR received_amount < 0)");
export const updateInvoices7 = (db: Db) => db.prepare("UPDATE invoices SET split_details = NULL WHERE split_details = 'null' OR split_details = 'undefined' OR split_details = ''");
export const selectInvoices = (db: Db) => db.prepare("SELECT invoice_id, tenant_id FROM invoices WHERE invoice_type = 'HOLD' AND is_held = 1 AND held_until <= datetime('now', 'localtime')");
export const updateProducts = (db: Db) => db.prepare('UPDATE products SET current_stock = current_stock + ?, sync_status = \'PENDING\', updated_at = CURRENT_TIMESTAMP WHERE product_id = ? AND (is_service_item IS NULL OR is_service_item = 0)');
export const updateInvoices8 = (db: Db) => db.prepare('UPDATE invoices SET is_held = 0, invoice_type = \'EXPIRED_HOLD\', sync_status = \'SYNCED\', updated_at = CURRENT_TIMESTAMP WHERE invoice_id = ?');
export const selectInvoiceItems = (db: Db) => db.prepare('SELECT product_id, quantity, is_service_item FROM invoice_items WHERE invoice_id = ?');
export const selectParties = (db: Db) => db.prepare(`SELECT party_id FROM parties WHERE (is_deleted IS NULL OR is_deleted = 0)`);
