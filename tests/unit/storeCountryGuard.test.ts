import { DatabaseSync } from 'node:sqlite';
import type { Database } from 'better-sqlite3';
type Db = Pick<Database, 'prepare' | 'transaction'>;
import { expect, it } from 'vitest';
import { createCoreTables } from '../../electron/db/schemaCoreTables';
import { saveStoreCountry, saveVatPriceBasis } from '../../electron/services/storeCountryService';

it('allows a new UAE shop, scopes the guard to its tenant and blocks relabeling existing money', () => {
  const raw = new DatabaseSync(':memory:');
  const db = Object.assign(raw, { transaction: (fn: () => unknown) => fn }) as unknown as Db;
  createCoreTables(db);
  expect(saveStoreCountry(db, 'uae', 'AE')).toEqual({ success: true });
  expect(saveVatPriceBasis(db, 'uae', true)).toEqual({ success: true });
  raw.exec("INSERT INTO products(product_id,tenant_id,name,base_price) VALUES ('p','uae','Product',100)");
  expect(saveStoreCountry(db, 'uae', 'IN').success).toBe(false);
  expect(saveVatPriceBasis(db, 'uae', false).success).toBe(false);
  expect(saveVatPriceBasis(db, 'uae', true)).toEqual({ success: true });
  expect(saveStoreCountry(db, 'uae', 'AE')).toEqual({ success: true });
  expect(saveStoreCountry(db, 'another', 'AE')).toEqual({ success: true });
  expect(saveStoreCountry(db, 'another', 'GB').success).toBe(false);
  expect(raw.prepare("SELECT value FROM settings WHERE tenant_id='uae' AND key='store_country'").get()?.value).toBe('AE');
  raw.close();
});
