import { DatabaseSync } from 'node:sqlite';
import type Database from 'better-sqlite3';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { createCoreTables } from '../../electron/db/schemaCoreTables';
import { createExtendedTables } from '../../electron/db/schemaExtendedTables';
import { ensureSchemaColumns } from '../../electron/db/schemaColumns';
import { runColumnMigrations } from '../../electron/db/migrationsColumns';
import { m002SyncOutbox } from '../../electron/db/migrations/002-sync-outbox';
import { m003SyncOutboxTriggers } from '../../electron/db/migrations/003-sync-outbox-triggers';
import { m009StockCountersReturnTombstones } from '../../electron/db/migrations/009-stock-counters-return-tombstones';
import { m011StockOperationStream } from '../../electron/db/migrations/011-stock-operation-stream';
import type { ProductInput } from '../../electron/services/typesA';
const state = vi.hoisted(() => ({ db: null as unknown as Database.Database }));
vi.mock('../../electron/db/localDb', () => ({ getDb: () => state.db }));
import { bulkImportProducts } from '../../electron/services/productsService';
let raw: DatabaseSync;
beforeEach(() => {
  raw = new DatabaseSync(':memory:');
  state.db = Object.assign(raw, { transaction: (fn: (...args: unknown[]) => unknown) => (...args: unknown[]) => {
    raw.exec('BEGIN'); try { const result = fn(...args); raw.exec('COMMIT'); return result; }
    catch (error) { raw.exec('ROLLBACK'); throw error; }
  } }) as unknown as Database.Database;
  createCoreTables(state.db); createExtendedTables(state.db); ensureSchemaColumns(state.db); runColumnMigrations(state.db);
});
afterEach(() => raw.close());
const product = (id: string, changes: Partial<ProductInput> = {}): ProductInput => ({ product_id: id,
  tenant_id: 't', name: `Product ${id}`, base_price: 100, current_stock: 10, ...changes });
it('imports, updates, restores deleted rows and preserves the original product ID', () => {
  expect(bulkImportProducts([product('p', { sku_barcode: '001', tier_prices: { Dealer: 90 } })]).success).toBe(true);
  raw.exec("UPDATE products SET is_deleted=1 WHERE product_id='p'");
  expect(bulkImportProducts([product('new', { name: 'New Drill', sku_barcode: '001', base_price: 150, tier_prices: { Dealer: 120 } })]).success).toBe(true);
  expect(raw.prepare('SELECT product_id,name,base_price,is_deleted,sync_status FROM products').all()).toEqual([
    { product_id: 'p', name: 'New Drill', base_price: 150, is_deleted: 0, sync_status: 'PENDING' }]);
  expect(raw.prepare('SELECT price FROM product_pricing').get()?.price).toBe(120);
});
it('rejects a barcode/item-code collision and rolls the entire file back', () => {
  expect(bulkImportProducts([product('a', { sku_barcode: 'A' }), product('b', { item_code: 'B' })]).success).toBe(true);
  const result = bulkImportProducts([product('first'), product('conflict', { sku_barcode: 'A', item_code: 'B' })]);
  expect(result.success).toBe(false);
  expect(raw.prepare('SELECT COUNT(*) n FROM products').get()?.n).toBe(2);
  expect(raw.prepare("SELECT name FROM products WHERE product_id='a'").get()?.name).toBe('Product a');
});
it.each([{ base_price: Infinity }, { purchase_price: -1 }, { discount_percent: 101 }, { tenant_id: 'other' }])('rejects invalid batches before any writes: %j', changes => {
  expect(bulkImportProducts([product('a'), product('b', changes)]).success).toBe(false);
  expect(raw.prepare('SELECT COUNT(*) n FROM products').get()?.n).toBe(0);
});
it('does not merge distinct tier names that contain each other', () => {
  expect(bulkImportProducts([product('a', { tier_prices: { Retail: 90, 'Retail Special': 80 } })]).success).toBe(true);
  expect(raw.prepare('SELECT COUNT(*) n FROM pricing_tiers').get()?.n).toBe(2);
});
it('queues imported products and tier prices for sync and preserves stock counter changes', () => {
  for (const migration of [m002SyncOutbox, m003SyncOutboxTriggers, m009StockCountersReturnTombstones, m011StockOperationStream]) migration.up(state.db);
  expect(bulkImportProducts([product('p', { current_stock: 10, tier_prices: { Dealer: 90 } })]).success).toBe(true);
  expect(bulkImportProducts([product('p', { current_stock: 17, tier_prices: { Dealer: 80 } })]).success).toBe(true);
  const saved = raw.prepare('SELECT stock_opening,current_stock,stock_counters FROM products').get();
  expect(saved?.current_stock).toBe(17);
  expect(saved?.stock_opening).toBe(10);
  expect(Object.values(JSON.parse(String(saved?.stock_counters)))).toContain(7);
  const queued = raw.prepare('SELECT DISTINCT entity FROM sync_outbox WHERE sent_at IS NULL').all().map(r => r.entity);
  expect(queued).toEqual(expect.arrayContaining(['products', 'pricing_tiers', 'product_pricing']));
});
it('imports and reimports an 11,032-product catalog without creating duplicates', () => {
  const rows = Array.from({ length: 11032 }, (_, i) => product(`p${i}`, { sku_barcode: `00${i}` }));
  expect(bulkImportProducts(rows).success).toBe(true);
  expect(bulkImportProducts(rows).success).toBe(true);
  expect(raw.prepare('SELECT COUNT(*) n FROM products WHERE is_deleted=0').get()?.n).toBe(11032);
}, 60000);
