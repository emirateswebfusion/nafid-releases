import { DatabaseSync } from 'node:sqlite';
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { upsertTableRows } from '../../electron/sync/lanUpsert';

let raw: DatabaseSync;
let db: Database.Database;
beforeEach(() => {
  raw = new DatabaseSync(':memory:');
  raw.exec(`
    CREATE TABLE purchase_bills(purchase_bill_id TEXT PRIMARY KEY, tenant_id TEXT);
    CREATE TABLE purchase_bill_items(item_id TEXT PRIMARY KEY, purchase_bill_id TEXT, tenant_id TEXT, product_id TEXT, quantity REAL CHECK(quantity > 0));
    CREATE TABLE returns(return_id TEXT PRIMARY KEY, invoice_id TEXT, tenant_id TEXT);
    CREATE TABLE return_items(return_item_id TEXT PRIMARY KEY, return_id TEXT, tenant_id TEXT, product_id TEXT, quantity REAL CHECK(quantity > 0));
    CREATE TABLE sync_apply_guard(id INTEGER PRIMARY KEY);
    CREATE TABLE sync_meta(key TEXT PRIMARY KEY, value TEXT);
    INSERT INTO sync_meta VALUES('stock_origin', 'test-origin');
    CREATE TABLE stock_effects(
      effect_id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL,
      document_type TEXT NOT NULL,
      product_id TEXT NOT NULL,
      quantity REAL NOT NULL,
      direction TEXT NOT NULL,
      origin TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 0,
      sync_status TEXT NOT NULL DEFAULT 'PENDING',
      created_at TEXT NOT NULL
    );
    CREATE TABLE products(product_id TEXT PRIMARY KEY, tenant_id TEXT, current_stock REAL,
      is_service_item INTEGER, sync_status TEXT, updated_at TEXT);
    CREATE TABLE invoices(invoice_id TEXT PRIMARY KEY, tenant_id TEXT, is_deleted INTEGER,
      stock_applied INTEGER, updated_at TEXT, sync_status TEXT);
    CREATE TABLE invoice_items(item_id TEXT PRIMARY KEY, invoice_id TEXT, tenant_id TEXT,
      product_id TEXT, quantity REAL CHECK(quantity > 0));
    INSERT INTO products VALUES ('p', 't', 10, 0, 'SYNCED', '2026-01-01');
  `);
  let transactionId = 0;
  db = {
    prepare: (s: string) => raw.prepare(s),
    pragma: (s: string) => raw.prepare(`PRAGMA ${s}`).all(),
    transaction: (fn: (...args: unknown[]) => unknown) => (...args: unknown[]) => {
      const savepoint = `stock_${++transactionId}`;
      raw.exec(`SAVEPOINT ${savepoint}`);
      try { const result = fn(...args); raw.exec(`RELEASE ${savepoint}`); return result; }
      catch (error) { raw.exec(`ROLLBACK TO ${savepoint}; RELEASE ${savepoint}`); throw error; }
    },
  } as unknown as Database.Database;
});
afterEach(() => raw.close());
const stock = () => raw.prepare('SELECT current_stock FROM products').get()?.current_stock;
const invoice = (extra: Record<string, unknown> = {}) => ({ invoice_id: 'inv', tenant_id: 't',
  is_deleted: 0, stock_applied: 1,
  items: [{ item_id: 'line', product_id: 'p', quantity: 2 }], ...extra });

it('characterizes legacy first delivery and retry: deducts only on first invoice', () => {
  upsertTableRows(db, 'invoices', [invoice()]);
  expect(stock()).toBe(8);
  upsertTableRows(db, 'invoices', [invoice()]);
  expect(stock()).toBe(8);
});
it('snapshot delivery never deducts the sale a second time', () => {
  upsertTableRows(db, 'products', [{ product_id: 'p', tenant_id: 't', current_stock: 8 }]);
  upsertTableRows(db, 'invoices', [invoice({ stock_sync_mode: 'PRODUCT_SNAPSHOT' })]);
  expect(stock()).toBe(8);
  upsertTableRows(db, 'invoices', [invoice({ stock_sync_mode: 'PRODUCT_SNAPSHOT' })]);
  expect(stock()).toBe(8);
});
it('legacy delete and restore move stock only on a state transition', () => {
  upsertTableRows(db, 'invoices', [invoice()]);
  for (let n = 0; n < 2; n++) {
    upsertTableRows(db, 'invoices', [invoice({ is_deleted: 1 })]);
    expect(stock()).toBe(10);
  }
  for (let n = 0; n < 2; n++) {
    upsertTableRows(db, 'invoices', [invoice()]);
    expect(stock()).toBe(8);
  }
});
it('stock-off legacy invoices never move physical stock', () => {
  upsertTableRows(db, 'invoices', [invoice({ stock_applied: 0 })]);
  expect(stock()).toBe(10);
  upsertTableRows(db, 'invoices', [invoice({ stock_applied: 0, is_deleted: 1 })]);
  expect(stock()).toBe(10);
});
it('snapshot delete and restore retain the separately received balance', () => {
  const row = invoice({ stock_sync_mode: 'PRODUCT_SNAPSHOT' });
  upsertTableRows(db, 'invoices', [row]);
  for (const is_deleted of [1, 1, 0, 0]) {
    upsertTableRows(db, 'invoices', [{ ...row, is_deleted }]);
    expect(stock()).toBe(10);
  }
});


it.each(['purchase_bills', 'returns'])('%s snapshot documents do not add stock twice', table => {
  const row = table === 'purchase_bills'
    ? { purchase_bill_id: 'purchase', tenant_id: 't', items: [{ item_id: 'pi', product_id: 'p', quantity: 2 }] }
    : { return_id: 'return', tenant_id: 't', items: [{ return_item_id: 'ri', product_id: 'p', quantity: 2 }] };
  upsertTableRows(db, table, [{ ...row, stock_sync_mode: 'PRODUCT_SNAPSHOT' }]);
  upsertTableRows(db, table, [{ ...row, stock_sync_mode: 'PRODUCT_SNAPSHOT' }]);
  expect(stock()).toBe(10);
});


it('acknowledges a return by its return id even when it carries an invoice id', () => {
  const row = { return_id: 'ret', invoice_id: 'inv', tenant_id: 't',
    items: [{ return_item_id: 'ri', product_id: 'p', quantity: 2 }] };
  expect(upsertTableRows(db, 'returns', [row])).toEqual(['ret']);
  expect(stock()).toBe(12);
  expect(upsertTableRows(db, 'returns', [row])).toEqual(['ret']);
  expect(stock()).toBe(12);
});
it('a delayed product retry cannot overwrite a newer balance or rewind its timestamp', () => {
  const row = { product_id: 'p', tenant_id: 't', current_stock: 8, updated_at: '2026-10-30T10:00:02Z' };
  upsertTableRows(db, 'products', [row]);
  upsertTableRows(db, 'products', [{ ...row, current_stock: 9, updated_at: '2026-10-30T10:00:00Z' }]);
  upsertTableRows(db, 'products', [{ ...row, current_stock: 7, updated_at: '2026-10-30T10:00:01Z' }]);
  expect(stock()).toBe(8);
  expect(raw.prepare('SELECT updated_at FROM products').get()?.updated_at).toBe('2026-10-30T10:00:02.000Z');
});


it('a failed child item rolls back its parent instead of acknowledging an incomplete sale', () => {
  const row = invoice({ stock_sync_mode: 'PRODUCT_SNAPSHOT',
    items: [{ item_id: 'bad', product_id: 'p', quantity: -1 }] });
  expect(() => upsertTableRows(db, 'invoices', [row])).toThrow();
  expect(raw.prepare('SELECT COUNT(*) AS n FROM invoices').get()?.n).toBe(0);
  expect(stock()).toBe(10);
});
it('legacy service-item deletion never creates physical stock', () => {
  raw.exec('UPDATE products SET is_service_item=1');
  upsertTableRows(db, 'invoices', [invoice()]);
  upsertTableRows(db, 'invoices', [invoice({ is_deleted: 1 })]);
  expect(stock()).toBe(10);
});
