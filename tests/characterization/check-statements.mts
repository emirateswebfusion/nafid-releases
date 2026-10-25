/**
 * Prepares every statement factory in electron/db/statements against a freshly initialised schema, so a typo
 * or a column that does not exist fails here instead of at runtime. Dynamic factories get representative
 * fragments. Usage: EQ_USERDATA=<empty dir> npx tsx check-statements.mts <treeRoot>
 */
import fs from 'node:fs';
import path from 'node:path';

const tree = path.resolve(process.argv[2]);
console.log = () => {}; console.warn = () => {};
const { initDb, getDb } = await import(path.join(tree, 'electron/db/localDb.ts'));
initDb();
const db = getDb();
const dir = path.join(tree, 'electron/db/statements');
const fragment = (p: string) => /placeholder/i.test(p) ? '?' : /col$/i.test(p) ? (/deleted/i.test(p) ? ', deleted_at' : 'gst_balance')
  : /select|fields/i.test(p) ? '*' : /^t$|table/i.test(p) ? 'products' : '';
const special: Record<string, unknown[]> = { recalcAllPartyBalances: ['WHERE tenant_id = ? AND'], listDeletedInvoices: ['', 'ORDER BY created_at DESC'], sumPurchaseBillsForDate: ['total_amount'] };
let ok = 0; const bad: string[] = [];
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.ts') && f !== 'types.ts')) {
  const src = fs.readFileSync(path.join(dir, f), 'utf8');
  const mod = await import(path.join(dir, f));
  for (const [name, fn] of Object.entries(mod)) {
    if (typeof fn !== 'function') continue;
    const params = (src.match(new RegExp(`export (?:const ${name} = \\(|function ${name}\\()db: Db, ([^)]*?)\\)(?: =>| \\{|:)`))?.[1] ?? '').split(',').map((s) => s.trim().split(':')[0]).filter(Boolean);
    const args = special[name] ?? params.map((p) => p === 'includeDeleted' ? false : p === 'args' ? new Proxy({}, { get: (_t, k) => (k === 'params' || k === 'arg' || k === 'filters' ? {} : undefined) }) : fragment(p));
    try { (fn as (...a: unknown[]) => unknown)(db, ...args); ok++; } catch (e: any) { bad.push(`${f}:${name}: ${e.message}`); }
  }
}
console.error(`${ok} statements prepared, ${bad.length} failed`);
for (const b of bad) console.error(`  - ${b}`);
process.exit(bad.length ? 1 : 0);
