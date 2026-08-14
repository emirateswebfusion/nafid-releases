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

console.log('=== Latest ESTIMATE purchase bills ===');
const estBills = db.prepare(`
  SELECT pb.purchase_bill_id, pb.bill_number, pb.bill_date, pb.total_amount
  FROM purchase_bills pb WHERE pb.tenant_id = ? AND pb.bill_type = 'ESTIMATE'
  ORDER BY pb.created_at DESC LIMIT 5
`).all(tenant);
for (const b of estBills) {
  console.log(`\nBill ${b.bill_number} (${b.bill_date}) total=${b.total_amount}`);
  const items = db.prepare(`
    SELECT pbi.product_id, pbi.name, pbi.quantity, pbi.purchase_price, pbi.is_gst_applicable,
      p.name as product_name, p.is_gst_applicable as product_gst_flag, p.tax_rate_percent, p.current_stock
    FROM purchase_bill_items pbi
    LEFT JOIN products p ON p.product_id = pbi.product_id AND p.tenant_id = pbi.tenant_id
    WHERE pbi.purchase_bill_id = ?
  `).all(b.purchase_bill_id);
  for (const i of items) console.log(`  - ${i.name} | qty=${i.quantity} | bill_item_gst=${i.is_gst_applicable} | PRODUCT.is_gst_applicable=${i.product_gst_flag} | tax=${i.tax_rate_percent} | stock=${i.current_stock}`);
}

console.log('\n=== Recent products (created last 3 days) ===');
const prods = db.prepare(`
  SELECT name, is_gst_applicable, tax_rate_percent, current_stock, created_at, updated_at
  FROM products WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 10
`).all(tenant);
for (const p of prods) console.log(`  ${p.name} | gst=${p.is_gst_applicable} | tax=${p.tax_rate_percent} | stock=${p.current_stock} | created=${p.created_at}`);

console.log('\n=== Products NOT visible in GST view (is_gst_applicable=0) with stock ===');
const nonGst = db.prepare(`
  SELECT name, is_gst_applicable, current_stock, created_at FROM products
  WHERE tenant_id = ? AND is_gst_applicable = 0 AND current_stock > 0
  ORDER BY created_at DESC LIMIT 10
`).all(tenant);
for (const p of nonGst) console.log(`  ${p.name} | stock=${p.current_stock} | created=${p.created_at}`);

db.close();
for (const f of ['vendora_v2_TEST.db', 'vendora_v2_TEST.db-wal', 'vendora_v2_TEST.db-shm']) {
  const p = path.join(__dirname, f);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}
console.log('\ncleanup done');