import { DatabaseSync } from 'node:sqlite';
import type Database from 'better-sqlite3';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { createCoreTables } from '../../electron/db/schemaCoreTables';
import { createExtendedTables } from '../../electron/db/schemaExtendedTables';
import { ensureSchemaColumns } from '../../electron/db/schemaColumns';
import { runColumnMigrations } from '../../electron/db/migrationsColumns';
const state = vi.hoisted(() => ({ db: null as unknown as Database.Database }));
vi.mock('../../electron/db/localDb', () => ({ getDb: () => state.db }));
vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => [] } }));
vi.mock('../../src/data/products', async () => {
  const products = await import('../../electron/services/productsService');
  const tiers = await import('../../electron/services/pricingTiersService');
  return { listProducts: products.getProducts, createProduct: products.addProduct, updateProduct: products.updateProduct, getProductPricing: tiers.getProductPricing, setProductPricing: tiers.setProductPricing };
});
import { saveProductVariants, loadProductVariants } from '../../src/components/inventory/variantProducts';
import { addProduct, getProducts } from '../../electron/services/productsService';
let sql: DatabaseSync;
beforeEach(() => {
  sql = new DatabaseSync(':memory:');
  state.db = { prepare: (query: string) => {
    const statement = sql.prepare(query);
    const bind = (args: unknown[]) => args.map(value => value === undefined ? null : value) as Parameters<typeof statement.run>;
    return { run: (...args: unknown[]) => statement.run(...bind(args)), get: (...args: unknown[]) => statement.get(...bind(args)), all: (...args: unknown[]) => statement.all(...bind(args)) };
  }, exec: (query: string) => sql.exec(query), transaction: (fn: (...args: unknown[]) => unknown) => (...args: unknown[]) => {
    sql.exec('BEGIN'); try { const result = fn(...args); sql.exec('COMMIT'); return result; } catch (error) { sql.exec('ROLLBACK'); throw error; }
  } } as unknown as Database.Database;
  createCoreTables(state.db); createExtendedTables(state.db); ensureSchemaColumns(state.db); runColumnMigrations(state.db);
});
afterEach(() => sql.close());
it('persists and reloads variants and tiers through the real product services without changing parent stock', async () => {
  const parent = { product_id: 'parent', tenant_id: 'tenant', name: 'Cotton Shirt', category: 'Clothing', purchase_price: 50, base_price: 100, current_stock: 7, reorder_level: 1, tax_rate_percent: 0, is_gst_applicable: 0, uom: 'Pcs', sku_barcode: 'PARENT' };
  expect(addProduct(parent).success).toBe(true);
  sql.prepare('INSERT INTO pricing_tiers(pricing_tier_id,tenant_id,name) VALUES (?,?,?)').run('wholesale','tenant','Wholesale');
  await saveProductVariants(parent, [
    { id: 's', variant_name: 'S', sku_barcode: 'SHIRT-S', purchase_price: 50, base_price: 100, offer_price: '', current_stock: 12, reorder_level: 2, paper_mrp: 110, paper_stock: 3, tierPrices: { wholesale: '80' } },
    { id: 'xl', variant_name: 'XL', sku_barcode: 'SHIRT-XL', purchase_price: 60, base_price: 120, offer_price: 115, current_stock: 5, tierPrices: { wholesale: '90' } },
  ], vi.fn());
  const variants = await loadProductVariants('tenant','parent');
  expect(variants).toHaveLength(2);
  expect(variants.find(row => row.variant_name === 'S')).toMatchObject({ current_stock: 12, paper_stock: 3, paper_mrp: 110, tierPrices: { wholesale: '80' } });
  expect(variants.find(row => row.variant_name === 'XL')).toMatchObject({ current_stock: 5, offer_price: 115, tierPrices: { wholesale: '90' } });
  const edited = variants.map(row => row.variant_name === 'S' ? { ...row, tierPrices: { wholesale: '75' }, base_price: 105 } : row);
  await saveProductVariants(parent, edited, vi.fn());
  const reopened = await loadProductVariants('tenant','parent');
  expect(reopened.find(row => row.variant_name === 'S')).toMatchObject({ current_stock: 12, base_price: 105, tierPrices: { wholesale: '75' } });
  expect(reopened.find(row => row.variant_name === 'XL')).toMatchObject({ current_stock: 5, tierPrices: { wholesale: '90' } });
  expect(sql.prepare('SELECT current_stock FROM products WHERE product_id=?').get('parent')?.current_stock).toBe(7);
  expect(getProducts({ tenant_id: 'tenant', limit: 100 })).toHaveLength(3);
  expect(await loadProductVariants('other-tenant','parent')).toEqual([]);
});
