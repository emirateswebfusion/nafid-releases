import { DatabaseSync } from 'node:sqlite';
import type Database from 'better-sqlite3';
import { expect, it } from 'vitest';
import { acknowledgeLegacySnapshot } from '../../electron/db/statements/sync/legacyAcknowledgement';
import { acknowledgeSettingSnapshot } from '../../electron/db/statements/sync/settingsSync';
import { updateProductPricing3 } from '../../electron/db/statements/sync/catalogSync';

it('a pricing receipt cannot acknowledge another tenant sharing the product/tier pair', () => {
  const raw = new DatabaseSync(':memory:');
  try {
    raw.exec(`CREATE TABLE product_pricing(product_pricing_id TEXT,tenant_id TEXT,row_version INTEGER,sync_status TEXT);
      INSERT INTO product_pricing VALUES('mine','shop',1,'PENDING'),('foreign','other',1,'PENDING')`);
    const ack = updateProductPricing3(raw as unknown as Database.Database);
    expect(ack.run('shop', 'mine', 'shop', 0).changes).toBe(0);
    expect(ack.run('shop', 'mine', 'shop', 1).changes).toBe(1);
    expect(raw.prepare("SELECT sync_status FROM product_pricing WHERE product_pricing_id='foreign'").get()).toEqual({ sync_status: 'PENDING' });
  } finally { raw.close(); }
});

it('settings receipts preserve edits made in flight and the separate global owner row', () => {
  const raw = new DatabaseSync(':memory:');
  try {
    raw.exec(`CREATE TABLE settings(tenant_id TEXT,key TEXT,value TEXT,updated_at TEXT,row_version INTEGER,sync_status TEXT);
      INSERT INTO settings VALUES('shop','shop_name','new','same-time',2,'PENDING'),('global','shop_name','old','same-time',1,'PENDING')`);
    const ack = acknowledgeSettingSnapshot(raw as unknown as Database.Database);
    expect(ack.run('shop', 'shop_name', 'old', 'same-time', 1).changes).toBe(0);
    expect(ack.run('shop', 'shop_name', 'new', 'same-time', 2).changes).toBe(1);
    expect(raw.prepare("SELECT sync_status FROM settings WHERE tenant_id='global'").get()).toEqual({ sync_status: 'PENDING' });
  } finally { raw.close(); }
});

it('a delayed cloud receipt cannot clear newer local edits, foreign rows or changed document items', () => {
  const raw = new DatabaseSync(':memory:');
  const db = { prepare: raw.prepare.bind(raw), transaction: (fn: () => unknown) => () => {
    raw.exec('SAVEPOINT ack');
    try { const result = fn(); raw.exec('RELEASE ack'); return result; }
    catch (error) { raw.exec('ROLLBACK TO ack; RELEASE ack'); throw error; }
  } } as unknown as Database.Database;
  try {
    raw.exec(`CREATE TABLE sync_apply_guard(id INTEGER PRIMARY KEY);
      CREATE TABLE purchase_bills(purchase_bill_id TEXT PRIMARY KEY,tenant_id TEXT,row_version INTEGER,sync_status TEXT);
      CREATE TABLE purchase_bill_items(item_id TEXT PRIMARY KEY,purchase_bill_id TEXT,row_version INTEGER);
      INSERT INTO purchase_bills VALUES('bill','shop',1,'PENDING');
      INSERT INTO purchase_bill_items VALUES('item','bill',1)`);
    const sent = { purchase_bill_id: 'bill', tenant_id: 'shop', row_version: 1 };
    const children = { table: 'purchase_bill_items', parentColumn: 'purchase_bill_id', rows: [{ item_id: 'item', row_version: 1 }] };
    const ack = () => raw.prepare("UPDATE purchase_bills SET sync_status='SYNCED' WHERE purchase_bill_id='bill'").run();
    raw.exec('UPDATE purchase_bills SET row_version=2'); // User edits after request was sent.
    expect(acknowledgeLegacySnapshot(db, 'purchase_bills', 'purchase_bill_id', 'shop', sent, ack, children)).toBe(false);
    raw.exec('UPDATE purchase_bills SET row_version=1; UPDATE purchase_bill_items SET row_version=2');
    expect(acknowledgeLegacySnapshot(db, 'purchase_bills', 'purchase_bill_id', 'shop', sent, ack, children)).toBe(false);
    raw.exec('UPDATE purchase_bill_items SET row_version=1');
    expect(acknowledgeLegacySnapshot(db, 'purchase_bills', 'purchase_bill_id', 'other', sent, ack, children)).toBe(false);
    expect(acknowledgeLegacySnapshot(db, 'purchase_bills', 'purchase_bill_id', 'shop', undefined, ack)).toBe(false);
    expect(raw.prepare('SELECT sync_status FROM purchase_bills').get()).toEqual({ sync_status: 'PENDING' });
    expect(acknowledgeLegacySnapshot(db, 'purchase_bills', 'purchase_bill_id', 'shop', sent, ack, children)).toBe(true);
    expect(raw.prepare('SELECT sync_status FROM purchase_bills').get()).toEqual({ sync_status: 'SYNCED' });
    expect(raw.prepare('SELECT * FROM sync_apply_guard').all()).toEqual([]);
  } finally { raw.close(); }
});
