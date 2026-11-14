import type { Db } from './types.js';

export const settings = (db: Db) => db.prepare("SELECT value FROM settings WHERE tenant_id IN (?, 'global') AND key = ? ORDER BY CASE WHEN tenant_id = ? THEN 0 ELSE 1 END LIMIT 1");
export const invoice = (db: Db) => db.prepare('SELECT * FROM invoices WHERE invoice_id = ?');
export const returnsTotal = (db: Db) => db.prepare('SELECT COALESCE(SUM(grand_total), 0) AS total FROM returns WHERE (invoice_id = ? OR invoice_id IN (SELECT invoice_id FROM invoices WHERE converted_from_invoice_id = ?)) AND tenant_id = ?');
export const customer = (db: Db) => db.prepare('SELECT * FROM customers WHERE customer_id = ? AND tenant_id = ?');
export const applied = (db: Db) => db.prepare(`SELECT COUNT(*) AS count,
  COALESCE(SUM(CASE WHEN transaction_type != 'REDEEMED' THEN points_balance_after - points_balance_before ELSE 0 END), 0) AS earned,
  COALESCE(SUM(CASE WHEN transaction_type = 'REDEEMED' THEN points_balance_before - points_balance_after ELSE 0 END), 0) AS redeemed
  FROM loyalty_transactions WHERE invoice_id = ? AND customer_id = ? AND tenant_id = ?`);
export const insertAdjustment = (db: Db) => db.prepare(`INSERT INTO loyalty_transactions
  (transaction_id, tenant_id, customer_id, invoice_id, transaction_type, points, points_balance_before, points_balance_after, reference_number, description, created_by, created_at, updated_at, sync_status)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'system', ?, ?, 'PENDING')`);
export const updateCustomer = (db: Db) => db.prepare(`UPDATE customers SET total_points_earned = total_points_earned + ?, total_points_redeemed = total_points_redeemed + ?, current_points_balance = ?, updated_at = ?, sync_status = 'PENDING' WHERE customer_id = ? AND tenant_id = ?`);
export const updateBalance = (db: Db) => db.prepare("UPDATE invoices SET previous_points_balance = ? - points_earned + points_redeemed, remaining_points_balance = ?, updated_at = ?, sync_status = 'PENDING' WHERE invoice_id = ?");

export const updateEarned = (db: Db) => db.prepare("UPDATE invoices SET points_earned = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE invoice_id = ?");

export const tenantInvoices = (db: Db) => db.prepare("SELECT invoice_id FROM invoices WHERE tenant_id = ? AND customer_id IS NOT NULL AND converted_from_invoice_id IS NULL");
export const customerInvoices = (db: Db) => db.prepare("SELECT invoice_id FROM invoices WHERE tenant_id = ? AND customer_id = ? AND converted_from_invoice_id IS NULL");
export const ledgerTotals = (db: Db) => db.prepare(`SELECT customer_id, SUM(points_balance_after - points_balance_before) AS balance,
 SUM(CASE WHEN transaction_type != 'REDEEMED' THEN points_balance_after - points_balance_before ELSE 0 END) AS earned,
 SUM(CASE WHEN transaction_type = 'REDEEMED' THEN points_balance_before - points_balance_after ELSE 0 END) AS redeemed
 FROM loyalty_transactions WHERE tenant_id = ? GROUP BY customer_id`);
export const replaceTotals = (db: Db) => db.prepare("UPDATE customers SET total_points_earned = ?, total_points_redeemed = ?, current_points_balance = ?, updated_at = ?, sync_status = 'PENDING' WHERE customer_id = ? AND tenant_id = ?");
