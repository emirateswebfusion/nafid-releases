// Versioned migrations (electron/db/migrations): each runs once, is recorded in schema_migrations and user_version,
// a failing one rolls back and is retried, versions are unique. Also checks every released migration applies on top
// of the startup baseline of a fresh database.
// Usage: EQ_USERDATA=<fresh dir> npx tsx migrations.mts <tree>
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const [tree] = process.argv.slice(2);
const load = (p: string) => import(pathToFileURL(path.join(tree, p)).href);
const { initDb, getDb } = await load('electron/db/localDb.ts');
const { runMigrations } = await load('electron/db/migrations/runner.ts');
const { MIGRATIONS } = await load('electron/db/migrations/index.ts');
const { SYNCED_TABLES } = await load('electron/db/migrations/002-sync-outbox.ts');
const { withSyncApplyGuard, countPendingOps, listPendingOps, clearSyncApplyGuard } = await load('electron/db/statements/outbox.ts');
const { m003SyncOutboxTriggers } = await load('electron/db/migrations/003-sync-outbox-triggers.ts');

const failures: string[] = [];
const check = (label: string, actual: unknown, expected: unknown) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) failures.push(`${label}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
};
const latest = Math.max(...MIGRATIONS.map((m: { version: number }) => m.version));

initDb();
const db = getDb();
const recorded = () => (db.prepare('SELECT version FROM schema_migrations ORDER BY version').all() as { version: number }[]).map((r) => r.version);
check('all released migrations applied on a fresh database', recorded(), MIGRATIONS.map((m: { version: number }) => m.version));
check('user_version = latest', db.pragma('user_version', { simple: true }), latest);
check('returns indexes exist', (db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_return%' ORDER BY name").all() as { name: string }[]).map((r) => r.name),
  ['idx_return_items_invoice_item_id', 'idx_return_items_return_id', 'idx_returns_invoice_id']);
check('sync_outbox table exists', (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sync_outbox'").get() as { name: string } | undefined)?.name, 'sync_outbox');
check('sync_outbox pending index exists', (db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_sync_outbox_pending'").get() as { name: string } | undefined)?.name, 'idx_sync_outbox_pending');
for (const table of SYNCED_TABLES as readonly string[]) {
  const columns = db.prepare('PRAGMA table_info(' + table + ')').all() as { name: string }[];
  const names = new Set(columns.map((column) => column.name));
  check(table + ' has row_version', names.has('row_version'), true);
  check(table + ' has origin', names.has('origin'), true);
  const triggerNames = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' AND name LIKE ? ORDER BY name").all(`sync_outbox_${table}_%`) as { name: string }[]).map((row) => row.name);
  check(table + ' has insert, update and delete outbox triggers', triggerNames, [
    `sync_outbox_${table}_delete`,
    `sync_outbox_${table}_insert`,
    `sync_outbox_${table}_update`,
  ]);
}

const origin = (db.prepare("SELECT value FROM sync_meta WHERE key = 'origin'").get() as { value: string } | undefined)?.value;
check('origin is a lowercase eight-character hex terminal id', /^[0-9a-f]{8}$/.test(origin || ''), true);

const productId = 'migration-outbox-product';
db.prepare('INSERT INTO products (product_id, tenant_id, name, base_price) VALUES (?, ?, ?, ?)')
  .run(productId, 'outbox-test-tenant', 'Outbox test', 1);
const productOps = () => db.prepare(`SELECT op, entity, entity_id, row_version, payload, origin
  FROM sync_outbox WHERE entity = 'products' AND entity_id = ? ORDER BY row_version`).all(productId) as {
  op: string; entity: string; entity_id: string; row_version: number; payload: string | null; origin: string;
}[];
check('product insert records one op', productOps().length, 1);
check('product insert op identity and version', productOps()[0] && [productOps()[0].op, productOps()[0].entity, productOps()[0].entity_id, productOps()[0].row_version],
  ['UPSERT', 'products', productId, 0]);
check('product insert op origin and payload', productOps()[0] && [productOps()[0].origin, JSON.parse(productOps()[0].payload || '{}').origin], [origin, origin]);
check('product insert stores terminal origin on row', (db.prepare('SELECT origin FROM products WHERE product_id = ?').get(productId) as { origin: string }).origin, origin);

db.prepare('UPDATE products SET name = ? WHERE product_id = ?').run('Updated outbox test', productId);
check('product business update records one op and increments version', productOps().map((row) => [row.op, row.row_version]), [['UPSERT', 0], ['UPSERT', 1]]);
check('business update stores terminal origin on row', (db.prepare('SELECT origin FROM products WHERE product_id = ?').get(productId) as { origin: string }).origin, origin);

db.prepare("UPDATE products SET sync_status = 'PENDING' WHERE product_id = ?").run(productId);
check('sync_status-only update records no op', productOps().length, 2);
db.prepare('UPDATE products SET name = ?, base_price = base_price WHERE product_id = ?').run('Updated outbox test', productId);
check('same-value business update records no op (balance recalculations)', productOps().length, 2);
db.prepare("UPDATE products SET updated_at = '2026-10-26T00:00:00.000Z' WHERE product_id = ?").run(productId);
check('updated_at-only update records no op', productOps().length, 2);

db.prepare('DELETE FROM products WHERE product_id = ?').run(productId);
check('product delete records a versioned tombstone', productOps().map((row) => [row.op, row.entity_id, row.row_version, row.payload]), [
  ['UPSERT', productId, 0, productOps()[0].payload],
  ['UPSERT', productId, 1, productOps()[1].payload],
  ['DELETE', productId, 2, null],
]);
check('pending outbox helpers count and limit rows', [countPendingOps(db), listPendingOps(db, 2).length], [3, 2]);

const beforeGuardedWrite = countPendingOps(db);
const guardedProductId = 'migration-outbox-guarded-product';
withSyncApplyGuard(db, () => {
  db.prepare('INSERT INTO products (product_id, tenant_id, name, base_price) VALUES (?, ?, ?, ?)')
    .run(guardedProductId, 'outbox-test-tenant', 'Guarded outbox test', 1);
  withSyncApplyGuard(db, () => {
    check('nested guard keeps the guard row', (db.prepare('SELECT COUNT(*) AS count FROM sync_apply_guard').get() as { count: number }).count, 1);
    db.prepare('UPDATE products SET name = ? WHERE product_id = ?').run('Guarded update', guardedProductId);
  });
  db.prepare('DELETE FROM products WHERE product_id = ?').run(guardedProductId);
});
check('writes inside nested sync apply guards record no ops', countPendingOps(db), beforeGuardedWrite);

let guardError = '';
try {
  withSyncApplyGuard(db, () => {
    db.transaction(() => {
      db.prepare('INSERT INTO products (product_id, tenant_id, name, base_price) VALUES (?, ?, ?, ?)')
        .run('migration-outbox-throwing-product', 'outbox-test-tenant', 'Throwing outbox test', 1);
      throw new Error('guarded failure');
    })();
  });
} catch (error) {
  guardError = (error as Error).message;
}
check('guard callback error propagates', guardError, 'guarded failure');
check('throwing guard callback leaves no guard row', (db.prepare('SELECT COUNT(*) AS count FROM sync_apply_guard').get() as { count: number }).count, 0);
check('throwing guarded write records no ops', countPendingOps(db), beforeGuardedWrite);
db.prepare('INSERT INTO sync_apply_guard (id) VALUES (1)').run(); // as if the app crashed mid-pull
clearSyncApplyGuard(db);
check('startup clears a guard row left by a crash', (db.prepare('SELECT COUNT(*) AS count FROM sync_apply_guard').get() as { count: number }).count, 0);

const pendingBeforeTriggerRecreation = countPendingOps(db);
m003SyncOutboxTriggers.up(db);
check('trigger migration is idempotent and does not enqueue existing rows', countPendingOps(db), pendingBeforeTriggerRecreation);

const versionsBeforeSecondRun = recorded();
const again = runMigrations(db, MIGRATIONS);
check('second run applies nothing', again.applied.length, 0);
check('second run stays at the latest version', again.current, latest);
check('second run leaves migration records unchanged', recorded(), versionsBeforeSecondRun);

// 004: returns of discounted invoices are re-pushed once; other returns and already pending ones are untouched.
{
  const { m004ResyncRecalibratedReturns } = await load('electron/db/migrations/004-resync-recalibrated-returns.ts');
  db.prepare("INSERT INTO invoices (invoice_id, tenant_id, invoice_number, subtotal, tax_total, grand_total, discount_total) VALUES ('m4-disc', 't', 'M4-1', 100, 0, 90, 10), ('m4-plain', 't', 'M4-2', 100, 0, 100, 0)").run();
  db.prepare("INSERT INTO returns (return_id, invoice_id, tenant_id, return_number, subtotal, grand_total, sync_status) VALUES ('r-disc', 'm4-disc', 't', 'R1', 45, 45, 'SYNCED'), ('r-plain', 'm4-plain', 't', 'R2', 50, 50, 'SYNCED')").run();
  m004ResyncRecalibratedReturns.up(db);
  const st = (id: string) => (db.prepare('SELECT sync_status FROM returns WHERE return_id = ?').get(id) as { sync_status: string }).sync_status;
  check('004 re-pushes returns of discounted invoices', [st('r-disc'), st('r-plain')], ['PENDING', 'SYNCED']);
}

let ran = 0;
const extra = [
  ...MIGRATIONS,
  { version: latest + 1, name: 'test-create', up: (d: { exec: (sql: string) => void }) => { ran++; d.exec('CREATE TABLE mig_test (id INTEGER)'); } },
  { version: latest + 2, name: 'test-fails', up: (d: { exec: (sql: string) => void }) => { d.exec('INSERT INTO mig_test VALUES (1)'); throw new Error('boom'); } },
];
let error = '';
try { runMigrations(db, extra); } catch (e) { error = (e as Error).message; }
check('failing migration throws', error, 'boom');
check('earlier one kept, failing one not recorded', recorded().slice(-1)[0], latest + 1);
check('failing migration rolled back', (db.prepare('SELECT COUNT(*) AS n FROM mig_test').get() as { n: number }).n, 0);
check('user_version unchanged by the failure', db.pragma('user_version', { simple: true }), latest);
try { runMigrations(db, extra.slice(0, -1)); } catch (e) { failures.push('re-run after failure threw ' + (e as Error).message); }
check('applied migration not run again', ran, 1);

let dup = '';
try { runMigrations(db, [...MIGRATIONS, { ...MIGRATIONS[0] }]); } catch (e) { dup = (e as Error).message; }
check('duplicate version rejected', dup.startsWith('Duplicate migration version'), true);

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(`migrations: ok (latest ${latest})`);
process.exit(0);
