const Database = require('better-sqlite3');
const db = new Database('C:/Users/suhai/AppData/Roaming/nafid/vendora_v2.db', { readonly: true });
const tenantId = '487b001a-8e5d-447f-97c4-9460ce51b1e7';

console.log('Invoices MTD details:');
const invs = db.prepare(`
  SELECT invoice_id, invoice_number, grand_total, payment_method, split_details, created_at
  FROM invoices
  WHERE tenant_id = ?
    AND (is_deleted IS NULL OR is_deleted = 0 OR is_deleted = '0')
    AND invoice_type NOT IN ('HOLD', 'EXPIRED_HOLD', 'RECALLED_HOLD')
    AND (is_held IS NULL OR is_held = 0)
    AND date(created_at) >= '2026-10-01' AND date(created_at) <= '2026-10-31'
`).all(tenantId);
console.log(invs);

console.log('\nCash Transactions columns:');
console.log(db.prepare("PRAGMA table_info(cash_transactions)").all().map(c => c.name));

const txs = db.prepare("SELECT * FROM cash_transactions WHERE (tenant_id = ? OR tenant_id IS NULL) LIMIT 5").all(tenantId);
console.log('\nSample cash transactions:', txs);
