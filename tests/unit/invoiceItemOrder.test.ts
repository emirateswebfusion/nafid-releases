import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, expect, it } from 'vitest';
import type { Db } from '../../electron/db/statements/types';
import { findInvoiceItemsByInvoiceId2 } from '../../electron/db/statements/invoices';

let sqlite: DatabaseSync;
let db: Db;
beforeEach(() => {
  sqlite = new DatabaseSync(':memory:');
  db = sqlite as unknown as Db;
  sqlite.exec(`
    CREATE TABLE invoice_items (item_id TEXT PRIMARY KEY, invoice_id TEXT, product_id TEXT, name TEXT, hsn_sac_code TEXT, uom TEXT);
    CREATE TABLE products (product_id TEXT PRIMARY KEY, hsn_sac_code TEXT, uom TEXT, tax_rate_percent REAL);
    CREATE INDEX invoice_item_lookup ON invoice_items(invoice_id, item_id);
  `);
});
afterEach(() => sqlite.close());

function save(ids: string[]) {
  const insert = sqlite.prepare('INSERT INTO invoice_items (item_id, invoice_id, product_id, name) VALUES (?, ?, ?, ?)');
  for (const id of ids) insert.run(id, 'bill', id, id);
}
function read() {
  return (findInvoiceItemsByInvoiceId2(db).all('bill') as { item_id: string }[]).map(item => item.item_id);
}
it('opens a saved bill in checkout order rather than random item-id index order', () => {
  save(['z-last-id', 'a-first-id', 'm-middle-id']);
  expect(read()).toEqual(['z-last-id', 'a-first-id', 'm-middle-id']);
});
it('keeps the submitted order after editing and saving the same bill again', () => {
  save(['z-last-id', 'a-first-id', 'm-middle-id']);
  sqlite.prepare('DELETE FROM invoice_items WHERE invoice_id = ?').run('bill');
  save(['m-middle-id', 'z-last-id', 'a-first-id']);
  expect(read()).toEqual(['m-middle-id', 'z-last-id', 'a-first-id']);
});
