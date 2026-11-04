import type { Db } from '../types.js';
import type { SyncOutboxRow } from '../outbox.js';
import { ALL_SYNCED_TABLES } from '../../migrations/syncedTables.js';

const quote = (name: string) => `"${name.replace(/"/g, '""')}"`;
type Row = Record<string, unknown>;
interface Column { name: string; pk: number }
function metadata(db: Db, entity: string) {
  if (!ALL_SYNCED_TABLES.includes(entity)) throw new Error('Unknown sync entity');
  const columns = db.prepare(`PRAGMA table_info(${quote(entity)})`).all() as Column[];
  const primary = columns.filter(c => c.pk).sort((a, b) => a.pk - b.pk).map(c => c.name);
  const keys = primary.length ? primary : [columns.find(c => c.name.endsWith('_id'))!.name];
  return { columns: columns.map(c => c.name), keys };
}
export function setting(db: Db, tenant: string, key: string): unknown {
  const row = db.prepare(`SELECT value FROM settings WHERE key = ? AND tenant_id IN ('global', ?)
    ORDER BY CASE WHEN tenant_id = 'global' THEN 0 ELSE 1 END LIMIT 1`).get(key, tenant) as { value: string } | undefined;
  if (!row) return null;
  try { return JSON.parse(row.value) as unknown; } catch { return row.value; }
}
export function finishOp(db: Db, opId: string, error: string | null) {
  db.prepare('UPDATE sync_outbox SET sent_at = ?, last_error = ? WHERE op_id = ?').run(new Date().toISOString(), error, opId);
}
export function failOp(db: Db, opId: string, error: string) {
  db.prepare('UPDATE sync_outbox SET attempts = attempts + 1, last_error = ? WHERE op_id = ? AND sent_at IS NULL').run(error, opId);
}
export function queueBoundary(db: Db): number {
  return (db.prepare('SELECT COALESCE(MAX(rowid), 0) AS n FROM sync_outbox').get() as { n: number }).n;
}
export function exhaustedCount(db: Db, tenant: string): number {
  return (db.prepare(`SELECT COUNT(*) AS n FROM sync_outbox WHERE tenant_id = ? AND sent_at IS NULL AND attempts >= 10`).get(tenant) as { n: number }).n;
}
export function pendingIdentity(db: Db, entity: string, row: Row, tenant: string): boolean {
  const { keys } = metadata(db, entity);
  const id = keys.map(key => String(row[key] ?? (key === 'tenant_id' ? tenant : ''))).join(':');
  return !!db.prepare('SELECT 1 FROM sync_outbox WHERE entity = ? AND entity_id = ? AND tenant_id = ? AND sent_at IS NULL LIMIT 1').get(entity, id, tenant);
}
/** Postgres timestamps arrive as `…T…+hh:mm`; stored like the legacy pull (`toSqliteDate`): UTC `toISOString()`, so
 * string comparisons and `substr(created_at, 1, 10)` keep working. */
const PG_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}(:?\d{2})?)?$/;
/** `timestamp` columns (no zone) hold UTC on the server, as the legacy pull assumes. */
const asUtc = (v: string) => (/(Z|[+-]\d{2}(:?\d{2})?)$/.test(v) ? v : `${v}Z`);
const bind = (v: unknown): string | number | null => v == null ? null : typeof v === 'boolean' ? Number(v)
  : typeof v === 'object' ? JSON.stringify(v) : typeof v === 'number' ? v
  : typeof v === 'string' && PG_TIMESTAMP.test(v) ? new Date(asUtc(v)).toISOString() : String(v);
/** Column-filtered UPDATE/INSERT preserves omitted local columns and SQLite defaults. */
export function applyRow(db: Db, entity: string, row: Row, tenant: string): void {
  const { columns, keys } = metadata(db, entity);
  if (row.tenant_id != null && row.tenant_id !== tenant) throw new Error('Foreign tenant row');
  const values: Row = { ...row };
  if (columns.includes('tenant_id')) values.tenant_id = tenant;
  if (columns.includes('sync_status')) values.sync_status = 'SYNCED';
  if (keys.some(key => values[key] == null)) throw new Error('Missing sync identity');
  const predicate = keys.map(key => `${quote(key)} = ?`).join(' AND ');
  const keyValues = keys.map(key => bind(values[key]));
  const names = columns.filter(name => Object.prototype.hasOwnProperty.call(values, name));
  const exists = db.prepare(`SELECT 1 FROM ${quote(entity)} WHERE ${predicate}`).get(...keyValues);
  if (exists) {
    const updates = names.filter(name => !keys.includes(name));
    if (updates.length) db.prepare(`UPDATE ${quote(entity)} SET ${updates.map(name => `${quote(name)} = ?`).join(', ')} WHERE ${predicate}`)
      .run(...updates.map(name => bind(values[name])), ...keyValues);
  } else {
    db.prepare(`INSERT INTO ${quote(entity)} (${names.map(quote).join(', ')}) VALUES (${names.map(() => '?').join(', ')})`)
      .run(...names.map(name => bind(values[name])));
  }
}
export function markLegacySynced(db: Db, op: SyncOutboxRow) {
  const { columns, keys } = metadata(db, op.entity);
  if (!columns.includes('sync_status')) return;
  const payload: Row = op.payload ? JSON.parse(op.payload) as Row : {};
  const values = keys.map(key => key === 'tenant_id' ? op.tenant_id : payload[key] ?? op.entity_id);
  db.prepare(`UPDATE ${quote(op.entity)} SET sync_status = 'SYNCED' WHERE ${keys.map(key => `${quote(key)} = ?`).join(' AND ')}
    AND row_version = ? AND NOT EXISTS (SELECT 1 FROM sync_outbox WHERE entity = ? AND entity_id = ? AND tenant_id = ? AND sent_at IS NULL)`)
    .run(...values.map(bind), op.row_version, op.entity, op.entity_id, op.tenant_id);
}
