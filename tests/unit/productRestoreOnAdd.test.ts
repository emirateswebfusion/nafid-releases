import { DatabaseSync } from 'node:sqlite';
import type Database from 'better-sqlite3';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { createCoreTables } from '../../electron/db/schemaCoreTables';
import { createExtendedTables } from '../../electron/db/schemaExtendedTables';
import { ensureSchemaColumns } from '../../electron/db/schemaColumns';
import { runColumnMigrations } from '../../electron/db/migrationsColumns';
import type { ProductInput } from '../../electron/services/typesA';

const state = vi.hoisted(() => ({ db: null as unknown as Database.Database }));
vi.mock('../../electron/db/localDb', () => ({ getDb: () => state.db }));

import { addProduct } from '../../electron/services/productsService';
import { hardDeleteProduct } from '../../electron/services/recycleBinService';

let raw: DatabaseSync;

beforeEach(() => {
  raw = new DatabaseSync(':memory:');
  state.db = Object.assign(raw, {
    transaction: (fn: (...args: unknown[]) => unknown) => (...args: unknown[]) => {
      raw.exec('BEGIN');
      try {
        const result = fn(...args);
        raw.exec('COMMIT');
        return result;
      } catch (error) {
        raw.exec('ROLLBACK');
        throw error;
      }
    },
  }) as unknown as Database.Database;

  createCoreTables(state.db);
  createExtendedTables(state.db);
  ensureSchemaColumns(state.db);
  runColumnMigrations(state.db);
});

afterEach(() => raw.close());

const makeProduct = (id: string, changes: Partial<ProductInput> = {}): ProductInput => ({
  product_id: id,
  tenant_id: 'tenant-1',
  name: 'Test Product',
  brand_manufacturer: 'BrandA',
  base_price: 100,
  current_stock: 10,
  ...changes,
});

it('rejects adding duplicate product while an active one exists with same name and brand', () => {
  const p1 = makeProduct('p1', { name: 'Hammer', brand_manufacturer: 'Stanley', sku_barcode: 'HAM-01' });
  const res1 = addProduct(p1);
  expect(res1.success).toBe(true);

  // Trying to add exact same name and brand while active
  const p2 = makeProduct('p2', { name: 'Hammer', brand_manufacturer: 'Stanley', sku_barcode: 'HAM-02' });
  const res2 = addProduct(p2);
  expect(res2.success).toBe(false);
  expect(res2.error).toBe('A product with this exact Name and Brand already exists.');
});

it('rejects adding duplicate product while an active one exists with same barcode', () => {
  const p1 = makeProduct('p1', { name: 'Wrench', brand_manufacturer: 'BrandA', sku_barcode: 'BAR-99' });
  expect(addProduct(p1).success).toBe(true);

  const p2 = makeProduct('p2', { name: 'Pliers', brand_manufacturer: 'BrandB', sku_barcode: 'BAR-99' });
  const res2 = addProduct(p2);
  expect(res2.success).toBe(false);
  expect(res2.error).toBe('A product with this barcode already exists.');
});

it('seamlessly restores and updates a soft-deleted product when re-added with same name and brand', () => {
  const p1 = makeProduct('orig-id', { name: 'Drill 500W', brand_manufacturer: 'Bosch', sku_barcode: 'BOSCH-D500', base_price: 150 });
  expect(addProduct(p1).success).toBe(true);

  // Soft-delete the product (as happens in POS inventory delete)
  raw.exec("UPDATE products SET is_deleted = 1, deleted_at = CURRENT_TIMESTAMP WHERE product_id = 'orig-id'");

  // User adds the same product again with a newly generated UUID from form
  const reAdd = makeProduct('new-form-uuid', {
    name: 'Drill 500W',
    brand_manufacturer: 'Bosch',
    sku_barcode: 'BOSCH-D500',
    base_price: 199,
    current_stock: 25,
  });

  const res = addProduct(reAdd);
  expect(res.success).toBe(true);
  expect(res.product_id).toBe('orig-id');
  expect(res.reactivated).toBe(true);

  // Verify DB state: is_deleted is 0, base_price updated, stock updated, original product_id preserved
  const saved = raw.prepare("SELECT product_id, name, base_price, current_stock, is_deleted, sync_status FROM products WHERE product_id = 'orig-id'").get() as Record<string, unknown>;
  expect(saved.is_deleted).toBe(0);
  expect(saved.base_price).toBe(199);
  expect(saved.current_stock).toBe(25);
  expect(saved.sync_status).toBe('PENDING');
});

it('clears barcode from an unrelated soft-deleted product so a new product can claim it', () => {
  const p1 = makeProduct('old-prod', { name: 'Old Discontinued Item', sku_barcode: 'COMMON-BARCODE' });
  expect(addProduct(p1).success).toBe(true);

  raw.exec("UPDATE products SET is_deleted = 1 WHERE product_id = 'old-prod'");

  // Add an entirely new product using the same barcode
  const p2 = makeProduct('fresh-prod', { name: 'Fresh New Item', sku_barcode: 'COMMON-BARCODE' });
  const res = addProduct(p2);
  expect(res.success).toBe(true);
  expect(res.product_id).toBe('fresh-prod');

  // Verify old product's barcode was released so UNIQUE constraint is never violated
  const oldRow = raw.prepare("SELECT sku_barcode, is_deleted FROM products WHERE product_id = 'old-prod'").get() as Record<string, unknown>;
  expect(oldRow.sku_barcode).toBeNull();
  expect(oldRow.is_deleted).toBe(1);

  const freshRow = raw.prepare("SELECT sku_barcode, is_deleted FROM products WHERE product_id = 'fresh-prod'").get() as Record<string, unknown>;
  expect(freshRow.sku_barcode).toBe('COMMON-BARCODE');
  expect(freshRow.is_deleted).toBe(0);
});

it('permanently deletes product along with product_pricing child records in hardDeleteProduct', () => {
  const p1 = makeProduct('del-prod', { name: 'Deletable Item', sku_barcode: 'DEL-1' });
  expect(addProduct(p1).success).toBe(true);

  // Soft-delete it first
  raw.exec("UPDATE products SET is_deleted = 1 WHERE product_id = 'del-prod'");

  // Add a product pricing record
  raw.exec(`
    INSERT INTO pricing_tiers (pricing_tier_id, tenant_id, name, sort_order)
    VALUES ('tier-1', 'tenant-1', 'Wholesale', 1);
    INSERT INTO product_pricing (product_pricing_id, tenant_id, product_id, pricing_tier_id, price)
    VALUES ('pp-1', 'tenant-1', 'del-prod', 'tier-1', 80);
  `);

  // Execute hard delete
  const res = hardDeleteProduct('del-prod');
  expect(res.success).toBe(true);

  // Verify both products and product_pricing rows are gone
  const prodExists = raw.prepare("SELECT COUNT(*) n FROM products WHERE product_id = 'del-prod'").get() as { n: number };
  expect(prodExists.n).toBe(0);

  const pricingExists = raw.prepare("SELECT COUNT(*) n FROM product_pricing WHERE product_id = 'del-prod'").get() as { n: number };
  expect(pricingExists.n).toBe(0);
});
