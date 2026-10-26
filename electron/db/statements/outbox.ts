import type { Db } from './types.js';

interface TableColumn {
  name: string;
  pk: number;
}

interface ParentTenantSource {
  table: string;
  foreignKey: string;
  parentKey: string;
}

export interface SyncOutboxRow {
  op_id: string;
  tenant_id: string;
  entity: string;
  entity_id: string;
  op: 'UPSERT' | 'DELETE';
  row_version: number;
  payload: string | null;
  origin: string;
  created_at: string;
  attempts: number;
  last_error: string | null;
  sent_at: string | null;
}

const ignoredUpdateColumns = new Set(['sync_status', 'updated_at', 'row_version', 'origin']);

// Used only when a synced table has no tenant_id column. If its parent cannot
// supply a tenant_id (or the parent row is missing), the trigger uses 'global'.
const parentTenantSources: Record<string, ParentTenantSource> = {
  invoice_items: { table: 'invoices', foreignKey: 'invoice_id', parentKey: 'invoice_id' },
  purchase_bill_items: { table: 'purchase_bills', foreignKey: 'purchase_bill_id', parentKey: 'purchase_bill_id' },
  quotation_items: { table: 'quotations', foreignKey: 'quotation_id', parentKey: 'quotation_id' },
  return_items: { table: 'returns', foreignKey: 'return_id', parentKey: 'return_id' },
  combo_items: { table: 'combo_offers', foreignKey: 'combo_id', parentKey: 'combo_id' },
};

const guardDepth = new WeakMap<object, number>();

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function quoteLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function tableColumns(db: Db, table: string): TableColumn[] {
  const columns = db.prepare(`PRAGMA table_info(${quoteIdentifier(table)})`).all() as TableColumn[];
  if (columns.length === 0) throw new Error(`Cannot create outbox triggers: table ${table} does not exist`);
  return columns;
}

function primaryKeyColumns(table: string, columns: TableColumn[]): string[] {
  const primaryKey = columns.filter((column) => column.pk > 0).sort((a, b) => a.pk - b.pk);
  if (primaryKey.length > 0) return primaryKey.map((column) => column.name);

  const fallback = columns.find((column) => column.name.endsWith('_id'));
  if (fallback) return [fallback.name];
  throw new Error(`Cannot create outbox triggers: ${table} has no primary key or *_id column`);
}

function rowKeyExpression(row: 'NEW' | 'OLD', primaryKeys: string[]): string {
  return primaryKeys
    .map((column) => `COALESCE(CAST(${row}.${quoteIdentifier(column)} AS TEXT), '')`)
    .join(" || ':' || ");
}

function rowKeyPredicate(row: 'NEW' | 'OLD', primaryKeys: string[]): string {
  return primaryKeys
    .map((column) => `${quoteIdentifier(column)} = ${row}.${quoteIdentifier(column)}`)
    .join(' AND ');
}

function tenantExpression(db: Db, table: string, columns: TableColumn[], row: 'NEW' | 'OLD'): string {
  if (columns.some((column) => column.name === 'tenant_id')) {
    return `COALESCE(${row}."tenant_id", 'global')`;
  }

  const source = parentTenantSources[table];
  if (source && columns.some((column) => column.name === source.foreignKey)) {
    const parentColumns = tableColumns(db, source.table);
    if (parentColumns.some((column) => column.name === 'tenant_id')) {
      return `COALESCE((SELECT parent_row."tenant_id" FROM ${quoteIdentifier(source.table)} AS parent_row WHERE parent_row.${quoteIdentifier(source.parentKey)} = ${row}.${quoteIdentifier(source.foreignKey)} LIMIT 1), 'global')`;
    }
  }

  return "'global'";
}

function jsonPayloadExpression(columns: TableColumn[], row: 'NEW' | 'OLD', updated: boolean): string {
  const origin = "COALESCE((SELECT \"value\" FROM \"sync_meta\" WHERE \"key\" = 'origin'), '00000000')";
  const args = columns.flatMap((column) => {
    const value = updated && column.name === 'row_version'
      ? 'OLD."row_version" + 1'
      : column.name === 'origin'
        ? origin
        : `${row}.${quoteIdentifier(column.name)}`;
    return [quoteLiteral(column.name), value];
  });
  return `json_object(${args.join(', ')})`;
}

/** Build idempotent DROP/CREATE SQL for all three outbox triggers on each synced table. */
export function buildOutboxTriggerStatements(db: Db, tables: readonly string[]): string[] {
  const origin = "COALESCE((SELECT \"value\" FROM \"sync_meta\" WHERE \"key\" = 'origin'), '00000000')";
  const statements: string[] = [];

  for (const table of tables) {
    const columns = tableColumns(db, table);
    const names = new Set(columns.map((column) => column.name));
    if (!names.has('row_version') || !names.has('origin')) {
      throw new Error(`Cannot create outbox triggers: ${table} needs row_version and origin columns`);
    }

    const primaryKeys = primaryKeyColumns(table, columns);
    const quotedTable = quoteIdentifier(table);
    const entity = quoteLiteral(table);
    const insertName = quoteIdentifier(`sync_outbox_${table}_insert`);
    const updateName = quoteIdentifier(`sync_outbox_${table}_update`);
    const deleteName = quoteIdentifier(`sync_outbox_${table}_delete`);
    const insertTenant = tenantExpression(db, table, columns, 'NEW');
    const updateTenant = tenantExpression(db, table, columns, 'NEW');
    const deleteTenant = tenantExpression(db, table, columns, 'OLD');
    const entityIdNew = rowKeyExpression('NEW', primaryKeys);
    const entityIdOld = rowKeyExpression('OLD', primaryKeys);
    const insertPayload = jsonPayloadExpression(columns, 'NEW', false);
    const updatePayload = jsonPayloadExpression(columns, 'NEW', true);
    const updateColumns = columns.filter((column) => !ignoredUpdateColumns.has(column.name));
    const updateOf = updateColumns.length > 0
      ? `UPDATE OF ${updateColumns.map((column) => quoteIdentifier(column.name)).join(', ')}`
      : 'UPDATE';
    const guard = 'NOT EXISTS (SELECT 1 FROM sync_apply_guard)';

    statements.push(`DROP TRIGGER IF EXISTS ${insertName}`);
    statements.push(`CREATE TRIGGER ${insertName}
AFTER INSERT ON ${quotedTable}
WHEN ${guard}
BEGIN
  UPDATE ${quotedTable} SET "origin" = ${origin} WHERE ${rowKeyPredicate('NEW', primaryKeys)};
  INSERT INTO sync_outbox (op_id, tenant_id, entity, entity_id, op, row_version, payload, origin, created_at)
  VALUES (lower(hex(randomblob(16))), ${insertTenant}, ${entity}, ${entityIdNew}, 'UPSERT', COALESCE(NEW."row_version", 0), ${insertPayload}, ${origin}, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
END`);

    statements.push(`DROP TRIGGER IF EXISTS ${updateName}`);
    statements.push(`CREATE TRIGGER ${updateName}
AFTER ${updateOf} ON ${quotedTable}
WHEN ${guard}
BEGIN
  UPDATE ${quotedTable}
  SET "row_version" = OLD."row_version" + 1, "origin" = ${origin}
  WHERE ${rowKeyPredicate('NEW', primaryKeys)};
  INSERT INTO sync_outbox (op_id, tenant_id, entity, entity_id, op, row_version, payload, origin, created_at)
  VALUES (lower(hex(randomblob(16))), ${updateTenant}, ${entity}, ${entityIdNew}, 'UPSERT', OLD."row_version" + 1, ${updatePayload}, ${origin}, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
END`);

    statements.push(`DROP TRIGGER IF EXISTS ${deleteName}`);
    statements.push(`CREATE TRIGGER ${deleteName}
AFTER DELETE ON ${quotedTable}
WHEN ${guard}
BEGIN
  INSERT INTO sync_outbox (op_id, tenant_id, entity, entity_id, op, row_version, payload, origin, created_at)
  VALUES (lower(hex(randomblob(16))), ${deleteTenant}, ${entity}, ${entityIdOld}, 'DELETE', OLD."row_version" + 1, NULL, ${origin}, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
END`);
  }

  return statements;
}

/** Suppress trigger ops while synchronously applying rows received from another terminal or the cloud. */
export function withSyncApplyGuard<T>(db: Db, fn: () => T): T {
  const key = db as object;
  const depth = guardDepth.get(key) ?? 0;
  if (depth === 0) {
    db.prepare('INSERT OR IGNORE INTO sync_apply_guard (id) VALUES (1)').run();
  }
  guardDepth.set(key, depth + 1);

  try {
    return fn();
  } finally {
    const remaining = (guardDepth.get(key) ?? 1) - 1;
    if (remaining === 0) {
      guardDepth.delete(key);
      db.prepare('DELETE FROM sync_apply_guard WHERE id = 1').run();
    } else {
      guardDepth.set(key, remaining);
    }
  }
}

export function countPendingOps(db: Db): number {
  const row = db.prepare('SELECT COUNT(*) AS count FROM sync_outbox WHERE sent_at IS NULL').get() as { count: number };
  return row.count;
}

export function listPendingOps(db: Db, limit: number): SyncOutboxRow[] {
  const safeLimit = Number.isFinite(limit) ? Math.max(0, Math.trunc(limit)) : 0;
  return db.prepare(`SELECT op_id, tenant_id, entity, entity_id, op, row_version, payload, origin, created_at, attempts, last_error, sent_at
    FROM sync_outbox WHERE sent_at IS NULL ORDER BY created_at, op_id LIMIT ?`).all(safeLimit) as SyncOutboxRow[];
}
