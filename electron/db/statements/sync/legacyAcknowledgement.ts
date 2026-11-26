import type { Db } from '../types.js';
import type Database from 'better-sqlite3';
import { ALL_SYNCED_TABLES } from '../../migrations/syncedTables.js';
import { withSyncApplyGuard } from '../outbox.js';

/** A receipt for an old upload must not clear an edit made while HTTP was in flight. */
export function acknowledgeLegacySnapshot(db: Db & Pick<Database.Database, 'transaction'>, table: string, idColumn: string, tenant: string,
  snapshot: Record<string, unknown> | undefined, acknowledge: () => unknown,
  children?: { table: string; parentColumn: string; rows: Record<string, unknown>[] }): boolean {
  if (!ALL_SYNCED_TABLES.includes(table) || !/^[a-z_]+$/.test(idColumn)) throw new Error('Invalid acknowledgement table');
  if (!snapshot || !Number.isSafeInteger(snapshot.row_version) || snapshot[idColumn] == null) return false;
  const owner = snapshot.tenant_id ?? null;
  if (owner !== tenant && owner !== null && owner !== 'global' && owner !== 'unset') return false;
  return db.transaction(() => {
    const row = db.prepare(`SELECT 1 FROM "${table}" WHERE "${idColumn}"=? AND tenant_id IS ? AND row_version IS ?`).get(snapshot[idColumn], owner, snapshot.row_version);
    if (!row) return false;
    if (children) {
      if (!ALL_SYNCED_TABLES.includes(children.table) || !/^[a-z_]+$/.test(children.parentColumn)) throw new Error('Invalid acknowledgement children');
      const keys = (db.prepare(`PRAGMA table_info("${children.table}")`).all() as { name: string; pk: number }[]).filter(column => column.pk).map(column => column.name);
      if (!keys.length) return false;
      const current = db.prepare(`SELECT * FROM "${children.table}" WHERE "${children.parentColumn}"=?`).all(snapshot[idColumn]) as Record<string, unknown>[];
      if (current.length !== children.rows.length || current.some(item => !children.rows.some(sent =>
        keys.every(key => sent[key] === item[key]) && Number.isSafeInteger(sent.row_version) && sent.row_version === item.row_version))) return false;
    }
    withSyncApplyGuard(db, acknowledge);
    return true;
  })();
}
