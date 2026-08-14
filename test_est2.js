const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const dst = path.join(__dirname, 'vendora_v2_TEST.db');
for (const f of ['vendora_v2.db', 'vendora_v2.db-wal', 'vendora_v2.db-shm']) {
  const s = path.join(process.env.APPDATA, 'vendora', f);
  const d = path.join(__dirname, 'vendora_v2_TEST.db' + (f.endsWith('-wal') ? '-wal' : f.endsWith('-shm') ? '-shm' : ''));
  if (fs.existsSync(s)) fs.copyFileSync(s, d);
}

const db = new DatabaseSync(dst);
const tenant = (db.prepare('SELECT tenant_id FROM settings LIMIT 1').get() || {}).tenant_id || 'global';

console.log('=== purchase_bills: count + distinct bill_type ===');
console.log(db.prepare('SELECT COUNT(*) c FROM purchase_bills WHERE tenant_id = ?').get(tenant));
console.log(db.prepare('SELECT bill_type, COUNT(*) c FROM purchase_bills WHERE tenant_id = ? GROUP BY bill_type').all(tenant));

console.log('\n=== latest purchase bills (any type) ===');
const bills = db.prepare(`
  SELECT bill_number, bill_type, bill_date, total_amount, created_at FROM purchase_bills
  WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 8
`).all(tenant);
for (const b of bills) console.log(`  ${b.bill_number} | ${b.bill_type} | ${b.bill_date} | ${b.total_amount} | ${b.created_at}`);

console.log('\n=== items for latest 3 bills ===');
for (const b of bills.slice(0, 3)) {
  const items = db.prepare(`
    SELECT pbi.name, pbi.quantity, pbi.is_gst_applicable, pbi.purchase_price, p.is_gst_applicable prod_gst
    FROM purchase_bill_items pbi LEFT JOIN products p ON p.product_id = pbi.product_id AND p.tenant_id = pbi.tenant_id
    WHERE pbi.purchase_bill_id = (SELECT purchase_bill_id FROM purchase_bills WHERE bill_number = ? AND tenant_id = ? LIMIT 1)
  `).all(b.bill_number, tenant);
  console.log(`\n  ${b.bill_number}:`);
  for (const i of items) console.log(`    ${i.name} | qty=${i.quantity} | item_gst=${i.is_gst_applicable} | prod_gst=${i.prod_gst}`);
}

console.log('\n=== purchase_bill_items table columns ===');
const cols = db.prepare('PRAGMA table_info(purchase_bill_items)').all();
console.log(cols.map(c => c.name).join(', '));

db.close();
for (const f of ['vendora_v2_TEST.db', 'vendora_v2_TEST.db-wal', 'vendora_v2_TEST.db-shm']) {
  const p = path.join(__dirname, f);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}
console.log('\ncleanup done');