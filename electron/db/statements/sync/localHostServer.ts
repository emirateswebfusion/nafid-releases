import type { Db } from '../types.js';

/** SQL used by electron/sync/localHostServer.ts. Each factory prepares its statement on the given connection. */

export const selectUsers = (db: Db) => db.prepare(`SELECT * FROM users`);
export const selectSettings = (db: Db) => db.prepare('SELECT value FROM settings WHERE key = ? LIMIT 1');
export const selectInvoices = (db: Db) => db.prepare('SELECT 1 FROM invoices WHERE invoice_number = ? LIMIT 1');
export const insertSettings = (db: Db) => db.prepare(`
          INSERT INTO settings (tenant_id, key, value, sync_status, updated_at)
          VALUES ('global', ?, ?, 'LOCAL', CURRENT_TIMESTAMP)
          ON CONFLICT(tenant_id, key) DO UPDATE SET
            value = EXCLUDED.value,
            sync_status = 'LOCAL',
            updated_at = CURRENT_TIMESTAMP
        `);
export const selectReturns = (db: Db) => db.prepare('SELECT 1 FROM returns WHERE return_number = ? LIMIT 1');
export const insertSettings2 = (db: Db) => db.prepare(`
          INSERT INTO settings (tenant_id, key, value, sync_status, updated_at)
          VALUES ('global', 'return_counter', ?, 'LOCAL', CURRENT_TIMESTAMP)
          ON CONFLICT(tenant_id, key) DO UPDATE SET
            value = EXCLUDED.value,
            sync_status = 'LOCAL',
            updated_at = CURRENT_TIMESTAMP
        `);
export const selectMaxTimestamp = (db: Db, tsCol: string, t: string) => db.prepare(`SELECT MAX(${tsCol}) as max_ts FROM ${t}`);
export const selectInvoiceItems = (db: Db) => db.prepare(`SELECT * FROM invoice_items WHERE invoice_id = ?`);
export const selectPurchaseBillItems = (db: Db) => db.prepare(`SELECT * FROM purchase_bill_items WHERE purchase_bill_id = ?`);
export const selectReturnItems = (db: Db) => db.prepare(`SELECT * FROM return_items WHERE return_id = ?`);
export const selectQuotationItems = (db: Db) => db.prepare(`SELECT * FROM quotation_items WHERE quotation_id = ?`);
