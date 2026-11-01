import { m011StockOperationStream } from '../../electron/db/migrations/011-stock-operation-stream';
import { DatabaseSync } from 'node:sqlite';
import type Database from 'better-sqlite3';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { createCoreTables } from '../../electron/db/schemaCoreTables';
import { createExtendedTables } from '../../electron/db/schemaExtendedTables';
import { ensureSchemaColumns } from '../../electron/db/schemaColumns';
import { runColumnMigrations } from '../../electron/db/migrationsColumns';
const state = vi.hoisted(() => ({ db: null as unknown as Database.Database, rows: [] as Record<string, unknown>[] }));
vi.mock('../../electron/db/localDb', () => ({ getDb: () => state.db }));
vi.mock('../../electron/sync/syncConfig', () => ({ BATCH_SIZE: 100,
  toSqliteDate: (v: unknown) => v || null, parseIsDeleted: (v: unknown) => v ? 1 : 0 }));
vi.mock('../../electron/sync/syncProgress', () => ({ notifyPullProgress: vi.fn() }));
vi.mock('../../electron/sync/syncTransport', () => ({
  pushBatch: vi.fn(async () => []), reconcilePending: () => 0,
  pullPaginated: async (opts: { processPage: (rows: Record<string, unknown>[]) => unknown }) => {
    opts.processPage(state.rows);
    return { count: state.rows.length, hasChanged: true, reconciled: 0 };
  },
}));
import { pullInvoices, syncInvoices } from '../../electron/sync/entities/salesDocsSync';
import { syncPurchaseBills, syncReturns } from '../../electron/sync/entities/stockDocsSync';
import { updateProducts } from '../../electron/db/statements/sync/catalogSync';
import { pushBatch } from '../../electron/sync/syncTransport';
let raw: DatabaseSync;
beforeEach(() => {
  raw = new DatabaseSync(':memory:');
  state.db = Object.assign(raw, { transaction: (fn: (...args: unknown[]) => unknown) => (...args: unknown[]) => fn(...args) }) as unknown as Database.Database;
  createCoreTables(state.db); createExtendedTables(state.db); ensureSchemaColumns(state.db); runColumnMigrations(state.db);
  raw.exec('ALTER TABLE return_items ADD COLUMN combo_details TEXT; ALTER TABLE returns ADD COLUMN is_deleted INTEGER DEFAULT 0; ALTER TABLE products ADD COLUMN stock_counters TEXT DEFAULT \'{}\'');
  m011StockOperationStream.up(state.db);
  raw.exec(`ALTER TABLE invoices ADD COLUMN counts_in_revenue INTEGER DEFAULT 1;
    ALTER TABLE invoices ADD COLUMN bill_purpose TEXT DEFAULT 'SALE';
    ALTER TABLE invoices ADD COLUMN stock_applied INTEGER DEFAULT 1;
    INSERT INTO products(product_id,tenant_id,name,base_price,current_stock) VALUES ('p','t','Product',10,8);
    INSERT INTO invoices(invoice_id,tenant_id,invoice_number,invoice_type,subtotal,tax_total,grand_total,is_deleted,sync_status)
      VALUES ('inv','t','INV','GST',20,0,20,1,'SYNCED');
    INSERT INTO invoice_items(item_id,invoice_id,tenant_id,product_id,name,quantity,unit_price,tax_amount,total)
      VALUES ('line','inv','t','p','Product',2,10,0,20);`);
  vi.mocked(pushBatch).mockClear();
});
afterEach(() => raw.close());
it.each([0, 1])('invoice pull deleted=%s does not replay the already received product balance', async is_deleted => {
  raw.prepare('UPDATE invoices SET is_deleted=?').run(is_deleted ? 0 : 1);
  state.rows = [{ invoice_id: 'inv', tenant_id: 't', invoice_number: 'INV', invoice_type: 'GST',
    subtotal: 20, tax_total: 0, grand_total: 20, is_deleted, stock_applied: 1,
    updated_at: '2026-10-30T10:00:00Z', items: [{ item_id: 'line', product_id: 'p', quantity: 2,
      name: 'Product', unit_price: 10, tax_amount: 0, total: 20 }] }];
  await pullInvoices('token', 't');
  expect(raw.prepare('SELECT is_deleted FROM invoices').get()?.is_deleted).toBe(is_deleted);
  expect(raw.prepare('SELECT current_stock FROM products').get()?.current_stock).toBe(8);
});
it('all physical stock documents declare that product sync owns the stock movement', async () => {
  raw.exec(`UPDATE invoices SET sync_status='PENDING';
    INSERT INTO purchase_bills(purchase_bill_id,tenant_id,bill_number,supplier_name,total_amount,sync_status)
      VALUES ('purchase','t','PUR','Supplier',20,'PENDING');
    INSERT INTO returns(return_id,invoice_id,tenant_id,return_number,subtotal,tax_total,grand_total,sync_status)
      VALUES ('return','inv','t','RET',20,0,20,'PENDING');`);
  await syncInvoices('token', 't');
  await syncPurchaseBills('token', 't');
  await syncReturns('token', 't');
  expect(pushBatch).toHaveBeenCalledTimes(3);
  for (const call of vi.mocked(pushBatch).mock.calls) {
    expect(call[2]).toEqual([expect.objectContaining({ stock_sync_mode: 'PRODUCT_SNAPSHOT' })]);
  }
});


it('a product acknowledgement cannot mark a newer checkout balance synced', () => {
  raw.exec("UPDATE products SET sync_status='PENDING', updated_at='2026-10-30T10:00:00.000Z'");
  const acknowledge = updateProducts(state.db);
  // A sale committed while the old balance of eight was in flight.
  raw.exec("UPDATE products SET current_stock=7, updated_at='2026-10-30T10:00:00.001Z'");
  acknowledge.run('p', 't', '2026-10-30T10:00:00.000Z', 8);
  expect(raw.prepare('SELECT sync_status FROM products').get()?.sync_status).toBe('PENDING');
  acknowledge.run('p', 't', '2026-10-30T10:00:00.001Z', 7);
  expect(raw.prepare('SELECT sync_status FROM products').get()?.sync_status).toBe('SYNCED');
});


it('invoice pull retains the combo recipe and service classification', async () => {
  const combo_details = '[{"product_id":"p","quantity":2}]';
  state.rows = [{ invoice_id: 'inv', tenant_id: 't', invoice_number: 'INV', invoice_type: 'GST',
    subtotal: 20, tax_total: 0, grand_total: 20, is_deleted: 0, stock_applied: 1,
    updated_at: '2026-10-30T10:00:00Z', items: [{ item_id: 'line', product_id: 'p', quantity: 2,
      name: 'Product', unit_price: 10, tax_amount: 0, total: 20, is_service_item: 1, combo_id: 'combo', combo_details }] }];
  await pullInvoices('token', 't');
  expect(raw.prepare('SELECT combo_id,combo_details,is_service_item FROM invoice_items').get())
    .toMatchObject({ combo_id: 'combo', combo_details, is_service_item: 1 });
});
