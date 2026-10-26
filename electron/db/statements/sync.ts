import type { Db } from './types.js';

/** SQL statements used by services/syncService.ts. Each factory prepares its statement on the given connection. */

export const findSyncMeta = (db: Db) => db.prepare(`SELECT key, value FROM sync_meta WHERE key LIKE ?`);

export const findSyncMetaByKey = (db: Db) => db.prepare(`SELECT value FROM sync_meta WHERE key = ?`);

/** Dynamic SQL: `t` must be built from trusted values (placeholders/column lists), never user input. */
export const countSyncStatusForTable = (db: Db, t: string | number) => db.prepare(`SELECT COUNT(*) as total, SUM(CASE WHEN sync_status='SYNCED' THEN 1 ELSE 0 END) as synced, SUM(CASE WHEN sync_status='PENDING' THEN 1 ELSE 0 END) as pending FROM ${t} WHERE tenant_id = ?`);

/** Dynamic SQL: `placeholders` must be built from trusted values (placeholders/column lists), never user input. */
export const markInvoicesSyncedByIds = (db: Db, placeholders: string | number) => db.prepare(`UPDATE invoices SET sync_status = 'SYNCED' WHERE invoice_id IN (${placeholders}) AND tenant_id = ?`);

/** Dynamic SQL: `placeholders` must be built from trusted values (placeholders/column lists), never user input. */
export const markProductsSyncedByIds = (db: Db, placeholders: string | number) => db.prepare(`UPDATE products SET sync_status = 'SYNCED' WHERE product_id IN (${placeholders}) AND tenant_id = ?`);

export const findInvoices = (db: Db) => db.prepare(`SELECT invoice_id, invoice_number, invoice_type, balance_amount, received_amount, 
              grand_total, subtotal, sync_status, created_at 
       FROM invoices WHERE sync_status = 'PENDING' AND tenant_id = ?`);

export const findProducts = (db: Db) => db.prepare(`SELECT product_id, name, print_status, sync_status, created_at 
       FROM products WHERE sync_status = 'PENDING' AND tenant_id = ?`);

export const findNetworkSyncConfig = (db: Db) => db.prepare(`SELECT value FROM settings WHERE key = 'network_sync_config' LIMIT 1`);

export const findTerminalCode = (db: Db) => db.prepare(`SELECT value FROM settings WHERE key = 'terminal_code' LIMIT 1`);
