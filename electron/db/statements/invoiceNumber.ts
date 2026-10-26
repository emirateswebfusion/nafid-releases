import type { Db } from './types.js';

/** SQL statements used by services/invoiceNumberService.ts. Each factory prepares its statement on the given connection. */

export const findOneSettingByKey = (db: Db) => db.prepare("SELECT value FROM settings WHERE (tenant_id = 'global' OR tenant_id != '') AND key = ? ORDER BY (CASE WHEN tenant_id = 'global' THEN 1 ELSE 2 END) ASC, updated_at DESC LIMIT 1");

export const upsertSetting = (db: Db) => db.prepare(`INSERT INTO settings (tenant_id, key, value, sync_status, updated_at) VALUES (?, ?, ?, 'LOCAL', CURRENT_TIMESTAMP) ON CONFLICT(tenant_id, key) DO UPDATE SET value = EXCLUDED.value, sync_status = 'LOCAL', updated_at = CURRENT_TIMESTAMP`);

export const findSettingsByKey = (db: Db) => db.prepare('SELECT value FROM settings WHERE tenant_id = ? AND key = ?');

export const upsertSetting2 = (db: Db) => db.prepare(`
            INSERT INTO settings (tenant_id, key, value, sync_status, updated_at)
            VALUES (?, ?, ?, 'PENDING', CURRENT_TIMESTAMP)
            ON CONFLICT(tenant_id, key) DO UPDATE SET
              value = EXCLUDED.value, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
          `);

export const findOneInvoiceByInvoiceNumber = (db: Db) => db.prepare('SELECT 1 FROM invoices WHERE tenant_id = ? AND invoice_number = ? LIMIT 1');

export const upsertSetting3 = (db: Db) => db.prepare(`
    INSERT INTO settings (tenant_id, key, value, sync_status, updated_at)
    VALUES ('global', ?, ?, 'LOCAL', CURRENT_TIMESTAMP)
    ON CONFLICT(tenant_id, key) DO UPDATE SET
      value = EXCLUDED.value,
      sync_status = 'LOCAL',
      updated_at = CURRENT_TIMESTAMP
  `);
