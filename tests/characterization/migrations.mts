// Versioned migrations (electron/db/migrations): each runs once, is recorded in schema_migrations and user_version,
// a failing one rolls back and is retried, versions are unique. Also checks every released migration applies on top
// of the startup baseline of a fresh database.
// Usage: EQ_USERDATA=<fresh dir> npx tsx migrations.mts <tree>
import path from 'node:path';

const [tree] = process.argv.slice(2);
const load = (p: string) => import(path.join(tree, p));
const { initDb, getDb } = await load('electron/db/localDb.ts');
const { runMigrations } = await load('electron/db/migrations/runner.ts');
const { MIGRATIONS } = await load('electron/db/migrations/index.ts');
const { SYNCED_TABLES } = await load('electron/db/migrations/002-sync-outbox.ts');

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
}

const versionsBeforeSecondRun = recorded();
const again = runMigrations(db, MIGRATIONS);
check('second run applies nothing', again.applied.length, 0);
check('second run stays at the latest version', again.current, latest);
check('second run leaves migration records unchanged', recorded(), versionsBeforeSecondRun);

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
