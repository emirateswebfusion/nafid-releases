const Database = require('better-sqlite3');
const db = new Database('C:/Users/suhai/AppData/Roaming/nafid/vendora_v2.db', { readonly: true });
const tid = '487b001a-8e5d-447f-97c4-9460ce51b1e7';

const sep = db.prepare(`
  SELECT count(*) as count, sum(grand_total) as total
  FROM invoices
  WHERE tenant_id = ?
    AND created_at >= '2026-09-01' AND created_at <= '2026-09-30 23:59:59'
    AND (is_deleted IS NULL OR is_deleted = 0)
    AND (invoice_type NOT IN ('HOLD', 'EXPIRED_HOLD', 'RECALLED_HOLD'))
`).get(tid);

console.log('September (Last Month) strictly for tenant:', sep);
