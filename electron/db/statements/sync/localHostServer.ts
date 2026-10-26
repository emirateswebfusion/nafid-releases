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

/** LAN delta pull (`POST /api/sync/delta-pull`) for one table: rows changed after `sinceUtc`, newest first. */
export function deltaRowsQuery(db: Db, tName: string, tsCol: string, customWhere: string, sinceUtc: string | null) {
  let q = `SELECT * FROM ${tName}`;
  const whereParts: string[] = [];
  const qParams: unknown[] = [];

  if (customWhere) {
    whereParts.push(customWhere);
  }

  if (sinceUtc) {
    whereParts.push(`replace(substr(${tsCol}, 1, 19), 'T', ' ') > ?`);
    qParams.push(sinceUtc);
  }

  if (whereParts.length > 0) {
    q += ` WHERE ${whereParts.join(' AND ')}`;
  }

  q += ` ORDER BY ${tsCol} DESC LIMIT 2000`;
  return { statement: db.prepare(q), params: qParams };
}

/** Pending bills for cash settlement on a secondary (`GET /api/sync/pending-bills-lightweight`), oldest first. */
export function pendingBillsQuery(db: Db, sinceUtc: string | null, lastId: string | null) {
  let q = `
    SELECT invoice_id, tenant_id, invoice_number, customer_name, grand_total, payment_method, user_id, created_at, updated_at
    FROM invoices
    WHERE payment_method = 'PENDING'
      AND (is_deleted IS NULL OR is_deleted = 0)
  `;
  const qParams: unknown[] = [];
  if (sinceUtc) {
    if (lastId) {
      q += ` AND (replace(substr(created_at, 1, 19), 'T', ' ') > ? OR (replace(substr(created_at, 1, 19), 'T', ' ') = ? AND invoice_id > ?))`;
      qParams.push(sinceUtc, sinceUtc, lastId);
    } else {
      q += ` AND (replace(substr(created_at, 1, 19), 'T', ' ') > ?)`;
      qParams.push(sinceUtc);
    }
  }
  q += ` ORDER BY created_at ASC, invoice_id ASC LIMIT 50`;
  return { statement: db.prepare(q), params: qParams };
}

/** LAN table pull (`GET /api/sync/<table>`): rows changed after `sinceUtc` (normalised UTC), newest first, paged. */
export function tableRowsQuery(db: Db, tableName: string, allCols: string[] | undefined, sinceUtc: string | null, limit: number, offset: number) {
  let query = `SELECT * FROM ${tableName}`;
  const params: unknown[] = [];
  const whereClauses: string[] = [];

  if (tableName === 'invoices') {
    whereClauses.push(`invoice_type NOT IN ('HOLD', 'EXPIRED_HOLD')`);
  } else if (tableName === 'settings') {
    const excludedKeys = [
      'terminal_code', 'invoice_counter_config', 'gst_b2b_invoice_counter_config', 'gst_b2c_invoice_counter_config',
      'gst_invoice_counter_config', 'return_counter', 'scrap_invoice_counter', 'quotation_counter',
      'barcode_printer_config', 'receipt_printer_config', 'a4_printer_config', 'scale_config', 'printer_config', 'network_sync_config',
      'auto_print_barcode', 'print_format', 'label_code_type', 'label_show_shop_name'
    ];
    const placeholders = excludedKeys.map(() => '?').join(',');
    whereClauses.push(`key NOT IN (${placeholders})`);
    params.push(...excludedKeys);
  }

  if (sinceUtc && allCols) {
    const hasUpdated = allCols.includes('updated_at');
    const hasCreated = allCols.includes('created_at');
    if (hasUpdated && hasCreated) {
      whereClauses.push(`(replace(substr(updated_at, 1, 19), 'T', ' ') > ? OR replace(substr(created_at, 1, 19), 'T', ' ') > ?)`);
      params.push(sinceUtc, sinceUtc);
    } else if (hasUpdated) {
      whereClauses.push(`replace(substr(updated_at, 1, 19), 'T', ' ') > ?`);
      params.push(sinceUtc);
    } else if (hasCreated) {
      whereClauses.push(`replace(substr(created_at, 1, 19), 'T', ' ') > ?`);
      params.push(sinceUtc);
    }
  }

  if (whereClauses.length > 0) {
    query += ` WHERE ${whereClauses.join(' AND ')}`;
  }

  const orderCol = allCols?.includes('created_at') ? 'created_at' : (allCols?.includes('updated_at') ? 'updated_at' : null);
  if (orderCol) {
    query += ` ORDER BY ${orderCol} DESC`;
  }
  query += ` LIMIT ${limit} OFFSET ${offset}`;
  return { statement: db.prepare(query), params };
}
