import { DatabaseSync } from 'node:sqlite';
import type Database from 'better-sqlite3';
import { createCoreTables } from '../../../electron/db/schemaCoreTables';
import { createExtendedTables } from '../../../electron/db/schemaExtendedTables';
import { ensureSchemaColumns } from '../../../electron/db/schemaColumns';

/** Disposable fixture only: never opens a shop database or starts Electron. */
export function salesHistoryDb() {
  const memory = new DatabaseSync(':memory:');
  const db = memory as unknown as Database.Database;
  createCoreTables(db);
  createExtendedTables(db);
  ensureSchemaColumns(db);
  db.exec("ALTER TABLE invoices ADD COLUMN counts_in_revenue INTEGER NOT NULL DEFAULT 1; ALTER TABLE invoices ADD COLUMN bill_purpose TEXT NOT NULL DEFAULT 'SALE'; ALTER TABLE invoices ADD COLUMN stock_applied INTEGER NOT NULL DEFAULT 1;");
  return { db, memory };
}
