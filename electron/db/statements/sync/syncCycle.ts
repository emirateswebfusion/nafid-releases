import type { Db } from '../types.js';

/** SQL used by electron/sync/syncCycle.ts. Each factory prepares its statement on the given connection. */

export const insertInvoices = (db: Db) => db.prepare(`
      INSERT INTO invoices (
        invoice_id, tenant_id, invoice_number, customer_name, grand_total, payment_method, user_id, sync_status, created_at, updated_at
      ) VALUES (
        @invoice_id, @tenant_id, @invoice_number, @customer_name, @grand_total, @payment_method, @user_id, 'SYNCED', @created_at, @updated_at
      )
      ON CONFLICT(invoice_id) DO UPDATE SET
        customer_name = EXCLUDED.customer_name,
        grand_total = EXCLUDED.grand_total,
        payment_method = EXCLUDED.payment_method,
        updated_at = EXCLUDED.updated_at
      WHERE invoices.sync_status != 'PENDING'
    `);
export const deleteSyncMeta = (db: Db) => db.prepare(`DELETE FROM sync_meta WHERE key LIKE ?`);
export const deleteSyncMeta2 = (db: Db) => db.prepare(`DELETE FROM sync_meta WHERE key = ?`);
