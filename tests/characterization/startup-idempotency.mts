// Startup repairs must be idempotent: once they have run, another initDb() on the same database changes no rows.
// Seeds the shapes that used to be rewritten on every start (customer backfill re-stamping last_purchase_date, the
// return-total recalibration compounding the invoice discount, the paper-price self-heal vs the REAL-product cleanup),
// runs initDb() three times and fails when the third start writes anything (the second may still normalise rows the
// first one created, e.g. ISO timestamps of backfilled parties; a repair that rewrites rows every start shows up in both).
// Usage: EQ_USERDATA=<fresh dir> npx tsx startup-idempotency.mts <tree>
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { createRequire } from 'node:module';

const [tree] = process.argv.slice(2);
const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');

let counting = false;
const writes: Record<string, number> = {};
const note = (sql: string, n: number) => {
  if (!counting || n <= 0) return;
  const k = sql.replace(/\s+/g, ' ').trim().slice(0, 140);
  writes[k] = (writes[k] || 0) + n;
};
const origPrepare = Database.prototype.prepare;
Database.prototype.prepare = function (sql: string) {
  const st = origPrepare.call(this, sql);
  if (/^\s*(UPDATE|INSERT|DELETE|REPLACE)/i.test(sql)) {
    const run = st.run.bind(st);
    st.run = (...args: unknown[]) => { const r = run(...args); note(sql, r.changes); return r; };
  }
  return st;
};
const origExec = Database.prototype.exec;
Database.prototype.exec = function (sql: string) {
  const before = origPrepare.call(this, 'SELECT total_changes() AS c').get().c;
  const r = origExec.call(this, sql);
  note('EXEC ' + sql, origPrepare.call(this, 'SELECT total_changes() AS c').get().c - before);
  return r;
};

const { initDb, getDb } = await import(pathToFileURL(path.join(tree, 'electron/db/localDb.ts')).href);
initDb();
const db = getDb();
const T = 'tenant-1';
db.prepare("INSERT INTO parties(party_id,tenant_id,name,phone,party_type,sync_status) VALUES('identity-a',?,'Same Customer','9000000000','CUSTOMER','SYNCED'),('identity-b',?,'Same Customer','9000000000','CUSTOMER','SYNCED')").run(T, T);
db.prepare(`INSERT INTO invoices (invoice_id, tenant_id, invoice_number, invoice_type, payment_method, customer_name, customer_phone,
  subtotal, discount_total, grand_total, created_at) VALUES (?, ?, ?, 'SALE', 'CASH', ?, ?, ?, ?, ?, ?)`)
  .run('inv-1', T, 'INV-1', 'Asha', '9876543210', 1000, 100, 900, '2026-09-01 05:00:00.000');
db.prepare(`INSERT INTO invoices (invoice_id, tenant_id, invoice_number, invoice_type, payment_method, customer_name, customer_phone,
  subtotal, discount_total, grand_total, created_at) VALUES (?, ?, ?, 'SALE', 'CASH', ?, ?, ?, ?, ?, ?)`)
  .run('inv-2', T, 'INV-2', 'Asha', null, 200, 0, 200, '2026-09-03 05:00:00.000');
db.prepare(`INSERT INTO invoice_items (item_id, invoice_id, tenant_id, product_id, name, quantity, unit_price, total)
  VALUES ('ii-1', 'inv-1', ?, 'p-1', 'Pipe', 1, 1000, 1000)`).run(T);
// A return already discounted several times by the old recalibration: 1000 * 0.9^3.
db.prepare(`INSERT INTO returns (return_id, tenant_id, invoice_id, return_number, subtotal, grand_total, refund_method, created_at)
  VALUES ('r-1', ?, 'inv-1', 'RTN-1', 729, 729, 'CASH', '2026-09-02 05:00:00.000')`).run(T);
db.prepare(`INSERT INTO return_items (return_item_id, return_id, tenant_id, invoice_item_id, product_id, name, quantity, unit_price, total)
  VALUES ('ri-1', 'r-1', ?, 'ii-1', 'p-1', 'Pipe', 1, 729, 729)`).run(T);
db.prepare(`INSERT INTO products (product_id, tenant_id, name, base_price, domain_attributes) VALUES ('p-1', ?, 'Pipe', 1000, ?)`)
  .run(T, JSON.stringify({ gst_type: 'REAL' }));
db.prepare(`INSERT INTO purchase_bills (purchase_bill_id, tenant_id, bill_number, supplier_name, bill_type) VALUES ('pb-1', ?, 'PB-1', 'Supplier', 'GST')`).run(T);
db.prepare(`INSERT INTO purchase_bill_items (purchase_bill_id, tenant_id, product_id, name, purchase_price, selling_price)
  VALUES ('pb-1', ?, 'p-1', 'Pipe', 700, 1000)`).run(T);
db.close();

initDb(); // start 1: repairs run
const ret = getDb().prepare('SELECT grand_total FROM returns WHERE return_id = ?').get('r-1') as { grand_total: number };
const cust = getDb().prepare('SELECT last_purchase_date FROM customers WHERE name = ?').all('Asha') as { last_purchase_date: string }[];
getDb().close();

initDb(); // start 2: finishes one-time normalisation of rows start 1 created
getDb().close();

counting = true;
initDb(); // start 3: must change nothing
const identities = getDb().prepare("SELECT COUNT(*) n FROM parties WHERE party_id IN ('identity-a','identity-b') AND COALESCE(is_deleted,0)=0").get() as { n: number };
getDb().close();

const failures: string[] = [];
if (identities.n !== 2) failures.push('restart merged independent same-name CUSTOMER identities');
if (ret.grand_total !== 900) failures.push(`return total ${ret.grand_total}, expected 900 (invoice line 1000 less 10%)`);
if (cust.length !== 1 || !String(cust[0].last_purchase_date).startsWith('2026-09-03T05:00:00')) {
  failures.push(`customer last_purchase_date ${JSON.stringify(cust)}, expected the latest invoice 2026-09-03T05:00:00`);
}
for (const [k, n] of Object.entries(writes)) failures.push(`third start changed ${n} row(s): ${k}`);
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('startup idempotency: ok (a repeated initDb changed no rows)');
