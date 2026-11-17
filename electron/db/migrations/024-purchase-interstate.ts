import type { Migration } from './runner.js';
import type Database from 'better-sqlite3';

export const m024PurchaseInterstate: Migration = {
  version: 24,
  name: 'purchase-interstate',
  up: (db: Database.Database) => {
    const tableInfo = db.prepare("PRAGMA table_info(purchase_bills)").all() as { name: string }[];
    if (!tableInfo.find(c => c.name === 'is_interstate')) {
      db.exec("ALTER TABLE purchase_bills ADD COLUMN is_interstate INTEGER DEFAULT 0");
    }
  },
};
