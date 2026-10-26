#!/usr/bin/env node
/**
 * Architecture guard for nafid-pos. Run via `npm run check:arch` (part of `npm run verify`).
 *
 * Enforced rules (fail the build):
 *   R1. Only src/data/** may reference the Electron bridge (`window.electronAPI.*`,
 *       `window.electronAPI!.*`, `window.electronAPI?.*`, `(window as any).electronAPI.*`).
 *       Legacy offenders are grandfathered in arch-baseline.json with per-file counts:
 *       counts may shrink (delete the entry at zero), never grow, and no new file may appear.
 *   R2. The renderer must never import the `electron` package.
 *   R3. src/data/** must not use `any`.
 *   R4. src/data/** (except client.ts) must not read `window` directly.
 *   R5. src/store/** must not import UI components.
 *   R6. electron/services|db|sync/** must not import electron/ipc/** (dependency direction).
 *   R7. Files in src/components/** and electron/** over the 800-line budget are capped at their
 *       baseline size. New files may not exceed the budget.
 *   R8. electron/ipc/** contains no SQL (`.prepare(`) and does not import electron/db/statements:
 *       handlers only register channels (`handle(channel, service.fn)`); SQL lives in electron/db.
 *   R9. electron/services/** may only call `.prepare(` for dynamic filter builders grandfathered in
 *       arch-baseline.json (`servicePrepareCounts`, shrink-only); new SQL goes to electron/db/statements.
 *  R10. The startup baseline (schema + inline repairs that run on every start) is frozen: its files may
 *       shrink, never grow (`startupBaselineLines`). Schema / data changes go into a numbered migration in
 *       electron/db/migrations/, listed in migrations/index.ts.
 *
 * Advisories (never fail): SQL still inside electron/sync/** and electron/main.ts (sync is changed only
 * behind characterization tests).
 *
 * Usage:
 *   node scripts/check-architecture.mjs            # enforce
 *   node scripts/check-architecture.mjs --update   # deliberately re-record the baseline
 */
import { readdirSync, readFileSync, statSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baselinePath = path.join(root, 'arch-baseline.json');
const update = process.argv.includes('--update');
const SIZE_BUDGET = 800;
const BRIDGE_REF = /electronAPI\s*[!?]?\s*\.\s*[A-Za-z_$][\w$]*/g;

function walk(dir, filter) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return walk(full, filter);
    return filter(name) ? [full] : [];
  });
}
const rel = (full) => path.relative(root, full).split(path.sep).join('/');
const read = (full) => readFileSync(full, 'utf8');

const violations = [];
const ipcCounts = {};
const sizes = {};
const servicePrepares = {};
const PREPARE = /\.prepare\(/g;
const STARTUP_BASELINE = ['electron/db/localDb.ts', 'electron/db/schemaCoreTables.ts', 'electron/db/schemaExtendedTables.ts',
  'electron/db/schemaColumns.ts', 'electron/db/migrationsRepairs.ts', 'electron/db/migrationsColumns.ts'];
const startupLines = {};
const migrationIndex = path.join(root, 'electron/db/migrations/index.ts');

for (const full of walk(path.join(root, 'src'), (n) => /\.(ts|tsx)$/.test(n))) {
  const file = rel(full);
  const source = read(full);

  if (file.startsWith('src/data/')) {
    if (/:\s*any\b|\bas\s+any\b|<any>/.test(source)) violations.push(`${file}: src/data must not use \`any\` (use \`unknown\` and narrow).`);
    if (file !== 'src/data/client.ts' && /\bwindow\./.test(source)) violations.push(`${file}: src/data modules must go through data/client, not window.`);
  } else if (!file.endsWith('.d.ts')) {
    const count = (source.match(BRIDGE_REF) || []).length;
    if (count > 0) ipcCounts[file] = count;
  }

  if (/^\s*import[^;]*from\s+['"]electron['"]/m.test(source)) violations.push(`${file}: renderer must not import the electron package.`);
  if (file.startsWith('src/store/') && /from\s+['"][^'"]*components\//.test(source)) violations.push(`${file}: stores must not import UI components.`);

  const lines = source.split('\n').length;
  if (file.startsWith('src/components/') && lines > SIZE_BUDGET) sizes[file] = lines;
}

const sqlAdvisories = [];
for (const full of walk(path.join(root, 'electron'), (n) => n.endsWith('.ts'))) {
  const file = rel(full);
  const source = read(full);
  const prepares = (source.match(PREPARE) || []).length;
  if (/^electron\/(services|db|sync)\//.test(file) && /from\s+['"]\.\.\/ipc\//.test(source)) {
    violations.push(`${file}: must not import electron/ipc (move the shared helper to electron/utils or services).`);
  }
  if (file.startsWith('electron/ipc/')) {
    if (prepares > 0) violations.push(`${file}: ${prepares} SQL statement(s) in an IPC handler. Move them to a service + electron/db/statements.`);
    if (/from\s+['"]\.\.\/db\/statements\//.test(source)) violations.push(`${file}: IPC handlers call services, not electron/db/statements.`);
  }
  if (file.startsWith('electron/services/') && prepares > 0) servicePrepares[file] = prepares;
  const lines = source.split('\n').length;
  if (STARTUP_BASELINE.includes(file)) startupLines[file] = lines;
  if (/^electron\/db\/migrations\/\d{3}-[\w-]+\.ts$/.test(file)
    && !(existsSync(migrationIndex) && read(migrationIndex).includes(`'./${path.basename(file, '.ts')}.js'`))) {
    violations.push(`${file}: migration is not listed in electron/db/migrations/index.ts.`);
  }
  if (lines > SIZE_BUDGET) sizes[file] = lines;
  if ((file.startsWith('electron/sync/') || file === 'electron/main.ts') && prepares > 0) sqlAdvisories.push({ file, sql: prepares });
}
sqlAdvisories.sort((a, b) => b.sql - a.sql);

const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);

if (update || !existsSync(baselinePath)) {
  const sorted = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(baselinePath, `${JSON.stringify({ ipcCounts: sorted(ipcCounts), servicePrepareCounts: sorted(servicePrepares), sizeCaps: sorted(sizes), startupBaselineLines: sorted(startupLines), updatedAt: new Date().toISOString() }, null, 2)}\n`);
  console.log(`Baseline saved: ${Object.keys(ipcCounts).length} file(s) / ${sum(ipcCounts)} bridge references; ${Object.keys(sizes).length} oversized file(s).`);
  process.exit(0);
}

const baseline = JSON.parse(read(baselinePath));
const ipcCaps = baseline.ipcCounts || {};
const sizeCaps = baseline.sizeCaps || {};
const prepareCaps = baseline.servicePrepareCounts || {};
const startupCaps = baseline.startupBaselineLines || {};
for (const [file, lines] of Object.entries(startupLines)) {
  const cap = startupCaps[file];
  if (cap !== undefined && lines > cap) violations.push(`${file}: startup baseline grew from ${cap} to ${lines} lines. Add a numbered migration in electron/db/migrations/ instead.`);
}

for (const [file, count] of Object.entries(ipcCounts)) {
  const cap = ipcCaps[file];
  if (cap === undefined) violations.push(`${file}: ${count} direct bridge reference(s). Move them behind src/data/.`);
  else if (count > cap) violations.push(`${file}: direct bridge references grew from ${cap} to ${count}. Use src/data/.`);
}
for (const [file, count] of Object.entries(servicePrepares)) {
  const cap = prepareCaps[file];
  if (cap === undefined) violations.push(`${file}: ${count} inline .prepare() call(s). Put SQL in electron/db/statements/<module>.ts.`);
  else if (count > cap) violations.push(`${file}: inline .prepare() calls grew from ${cap} to ${count}. Use electron/db/statements.`);
}
for (const [file, lines] of Object.entries(sizes)) {
  const cap = sizeCaps[file];
  if (cap === undefined) violations.push(`${file}: ${lines} lines exceeds the ${SIZE_BUDGET}-line budget. Extract views/hooks (or a use-case module) first.`);
  else if (lines > cap) violations.push(`${file}: grew from ${cap} to ${lines} lines (over budget). Extract instead of growing.`);
}

const shrunk = Object.keys(ipcCaps).filter((f) => (ipcCounts[f] || 0) < ipcCaps[f]).length
  + Object.keys(sizeCaps).filter((f) => (sizes[f] || 0) < sizeCaps[f]).length
  + Object.keys(prepareCaps).filter((f) => (servicePrepares[f] || 0) < prepareCaps[f]).length;

console.log(`SQL advisory: ${sum(Object.fromEntries(sqlAdvisories.map((e) => [e.file, e.sql])))} .prepare() calls in electron/sync + main.ts (move behind tests).`);
for (const e of sqlAdvisories.slice(0, 5)) console.log(`  - ${e.file}: ${e.sql}`);

if (violations.length > 0) {
  console.error(`\nArchitecture check failed with ${violations.length} violation(s):`);
  for (const line of violations) console.error(`  - ${line}`);
  process.exit(1);
}
console.log(`\nArchitecture check passed. Legacy debt: ${sum(ipcCounts)} bridge references; ${sum(servicePrepares)} dynamic .prepare() calls in ${Object.keys(servicePrepares).length} service(s); ${Object.keys(sizes).length} oversized file(s).`);
if (shrunk > 0) console.log(`${shrunk} baseline entr${shrunk === 1 ? 'y' : 'ies'} improved — run with --update in a maintenance change to lock in the gain.`);
