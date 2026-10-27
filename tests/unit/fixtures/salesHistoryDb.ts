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
  return { db, memory };
}
