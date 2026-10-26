import type { Db } from '../types.js';

/** SQL used by electron/sync/syncConfig.ts. Each factory prepares its statement on the given connection. */

export const selectUsers = (db: Db) => db.prepare(`SELECT tenant_id FROM users WHERE tenant_id IS NOT NULL AND tenant_id != '' AND tenant_id != 'global' LIMIT 1`);
export const selectInvoices = (db: Db) => db.prepare(`SELECT tenant_id FROM invoices WHERE tenant_id IS NOT NULL AND tenant_id != '' AND tenant_id != 'global' LIMIT 1`);
export const selectSettings = (db: Db) => db.prepare(`SELECT tenant_id FROM settings WHERE tenant_id IS NOT NULL AND tenant_id != '' AND tenant_id != 'global' LIMIT 1`);
export const selectSettings2 = (db: Db) => db.prepare(`SELECT value FROM settings WHERE key = 'network_sync_config' AND (tenant_id = ? OR tenant_id = 'global') LIMIT 1`);
