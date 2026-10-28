/**
 * Prepares every statement factory in electron/db/statements against a freshly initialised schema, so a typo
 * or a column that does not exist fails here instead of at runtime. Dynamic factories get representative
 * fragments. Usage: EQ_USERDATA=<empty dir> npx tsx check-statements.mts <treeRoot>
 */
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const tree = path.resolve(process.argv[2]);
console.log = () => {}; console.warn = () => {};
const { initDb, getDb } = await import(pathToFileURL(path.join(tree, 'electron/db/localDb.ts')).href);
initDb();
const db = getDb();
const dir = path.join(tree, 'electron/db/statements');
const fragment = (p: string) => /placeholder/i.test(p) ? '?' : /col$/i.test(p) ? (/deleted/i.test(p) ? ', deleted_at' : 'gst_balance')
  : /select|fields/i.test(p) ? '*' : /^t$|table/i.test(p) ? 'products' : '';
const special: Record<string, unknown[]> = { findInvoiceItemsByInvoiceIdAndIsGstApplicable: [['statement-check']], recalcAllPartyBalances: ['WHERE tenant_id = ? AND'], listDeletedInvoices: ['', 'ORDER BY created_at DESC'], sumPurchaseBillsForDate: ['total_amount'],
  markSyncedIfUnchanged: ['products', 'product_id', 'updated_at'], markSynced: ['products', 'product_id'], selectMaxTimestamp: ['updated_at', 'products'],
  deltaRowsQuery: ['products', 'updated_at', '', '2026-01-01 00:00:00'], pendingBillsQuery: ['2026-01-01 00:00:00', 'x'],
  tableRowsQuery: ['invoices', ['updated_at', 'created_at'], '2026-01-01 00:00:00', 10, 0],
  upsertRows: ['settings', ['tenant_id', 'key', 'value'], ['tenant_id', 'key'], ['value']], countPendingRows: [['products', 'invoices']],
  updateCustomerProfile: [['gstin', 'notes', 'credit_limit', 'credit_period_enabled', 'credit_period_days', 'credit_period_basis', 'restrict_on_credit_expiry']],
  applyRow: ['products', { product_id: 'statement-check', tenant_id: 't1', name: 'Check', base_price: 0, purchase_price: 0, is_gst_applicable: 0, tax_rate_percent: 0, uom: 'Pcs' }, 't1'],
  pendingIdentity: ['products', { product_id: 'statement-check' }, 't1'],
  markLegacySynced: [{ entity: 'products', entity_id: 'statement-check', tenant_id: 't1', payload: null, row_version: 0 }],
  withSyncApplyGuard: [() => undefined], buildOutboxTriggerStatements: [['products']], listPendingOps: [10], enqueueLegacyPendingRows: [['products', 'returns']],
  updatePartyProfile: [['pricing_tier_id', 'credit_limit', 'credit_period_enabled', 'credit_period_days', 'credit_period_basis', 'restrict_on_credit_expiry', 'party_type', 'custom_category', 'whatsapp_alerts_enabled']] };
let ok = 0; const bad: string[] = [];
const files = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? files(path.join(d, e.name)).map((x) => path.join(e.name, x)) : [e.name]);
for (const f of files(dir).filter((f) => f.endsWith('.ts') && f !== 'types.ts')) {
  const src = fs.readFileSync(path.join(dir, f), 'utf8');
  const mod = await import(pathToFileURL(path.join(dir, f)).href);
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
