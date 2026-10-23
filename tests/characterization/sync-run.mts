/**
 * Sync characterization: seeds a terminal through IPC (scenario.mts seed only), then runs one full sync cycle
 * (`sync:runInitial`) against a recording fake cloud and writes every HTTP request plus the final sync_status
 * counts per table. Compare two checkouts with compare.mjs, or keep the output as a golden file.
 * Usage: EQ_USERDATA=<empty dir> npx tsx sync-run.mts <treeRoot> <out.json>
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const tree = path.resolve(process.argv[2]);
const out = process.argv[3];
const userData = process.env.EQ_USERDATA!;
process.env.VENDORA_CLOUD_API = 'http://cloud.test';
fs.mkdirSync(userData, { recursive: true });
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
// EQ_NO_LOGIN=1: no cloud login on disk (offline login / signed out). Cloud sync must not run at all.
if (!process.env.EQ_NO_LOGIN) fs.writeFileSync(path.join(userData, 'config.json'), JSON.stringify({ jwt_token: `${b64({ alg: 'HS256' })}.${b64({ tenant_id: 't1', exp: 4102444800 })}.sig`, tenant_id: 't1' }));

const requests: unknown[] = [];
/** Remote rows served by the fake cloud in phase 2 (pull). */
const server: Record<string, Record<string, unknown>[]> = {};
/** Tables whose pushes the fake cloud rejects in phase 2 (rows must stay PENDING and survive the pull). */
const rejectPush = new Set<string>();
const idsOf = (body: any): string[] => {
  const ids = new Set<string>();
  const visit = (v: any) => { if (Array.isArray(v)) v.forEach(visit); else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { if (/(^|_)id$/.test(k) && typeof x === 'string') ids.add(x); if (Array.isArray(x)) visit(x); } };
  visit(body); return [...ids];
};
(globalThis as any).fetch = async (url: string, init: any = {}) => {
  const u = new URL(String(url));
  let body: unknown = null;
  try { body = init.body ? JSON.parse(String(init.body)) : null; } catch { body = String(init.body).slice(0, 200); }
  requests.push({ method: init.method || 'GET', path: u.pathname, query: u.search, body });
  const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
  if (u.pathname.endsWith('/health')) return json({ status: 'ok' });
  const table = (u.pathname.split('/api/sync/')[1] || '').replace(/-/g, '_');
  if ((init.method || 'GET') === 'POST' && table === 'delta_pull') return json({ success: true, data: server });
  if ((init.method || 'GET') === 'POST' && body && typeof body === 'object' && !/pull|status|check/i.test(u.pathname)) {
    const ids = idsOf(body);
    if (rejectPush.has(table)) return json({ success: true, synced: [], synced_count: 0, failed: ids.map((id) => ({ id, error: 'rejected by test' })), failed_count: ids.length });
    return json({ success: true, synced: ids, synced_count: ids.length, failed: [], failed_count: 0 });
  }
  const rows = new URLSearchParams(u.search).get('offset') && new URLSearchParams(u.search).get('offset') !== '0' ? [] : (server[table] || []);
  return json({ success: true, [table]: rows, data: rows, rows, items: rows, records: [], hasMore: false, has_more: false, changes: {}, hasChanges: false });
};

const handlers: Map<string, Function> = ((globalThis as any).__handlers ||= new Map());
const realErr = console.error;
console.log = () => {}; console.warn = () => {}; console.error = () => {};
const { initDb, getDb } = await import(path.join(tree, 'electron/db/localDb.ts'));
initDb();
const ipc = await import(path.join(tree, 'electron/ipc/index.ts'));
ipc.registerAllIpcHandlers();
const event = { sender: { send() {}, isDestroyed: () => false } };
const call = async (ch: string, ...args: unknown[]) => { const fn = handlers.get(ch); return fn ? fn(event, ...args) : undefined; };
const scenario = await import(path.join(here, 'scenario.mts'));
await scenario.default(call, []);

const tables = (getDb().prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`).all() as { name: string }[]).map(t => t.name);
const statusCounts = () => {
  const out: Record<string, unknown> = {};
  for (const t of tables) {
    try { const rows = getDb().prepare(`SELECT sync_status, COUNT(*) AS n FROM ${t} GROUP BY sync_status ORDER BY sync_status`).all(); if (rows.length) out[t] = rows; } catch { /* table without sync_status */ }
  }
  return out;
};
const before = statusCounts();
const result = await Promise.race([call('sync:runInitial'), new Promise(r => setTimeout(() => r('TIMEOUT'), 60000))]);
await new Promise(r => setTimeout(r, 3000));
const after = statusCounts();
const phase1Requests = requests.length;

// ── Phase 2: remote changes arrive while a local edit is still unsynced ──
const T = 'ts', remoteTs = '2030-01-01T10:00:00.000Z';
await call('db:updateProduct', { product_id: '11111111-1111-4111-8111-111111111111', tenant_id: 't1', name: 'Steel Rod (local edit)', base_price: 111, purchase_price: 70, is_gst_applicable: 1, tax_rate_percent: 18, uom: 'Pcs', current_stock: 48, reorder_level: 5, hsn_sac_code: '7308', category: 'General' });
rejectPush.add('products');
const product = (id: string, name: string, price: number) => ({ product_id: id, tenant_id: 't1', name, sku_barcode: null, item_code: null, category: 'Remote', hsn_sac_code: '7308', purchase_price: price * 0.7, base_price: price, is_gst_applicable: 1, tax_rate_percent: 18, uom: 'Pcs', brand_manufacturer: null, current_stock: 9, reorder_level: 1, is_deleted: 0, domain_attributes: '{}', billing_type: 'PIECE', pricing_mode: 'FIXED_PRICE', is_service_item: 0, created_at: remoteTs, updated_at: remoteTs });
server.products = [
  product('11111111-1111-4111-8111-111111111111', 'Steel Rod (remote edit)', 150),   // must NOT overwrite the PENDING local edit
  product('22222222-2222-4222-8222-222222222222', 'Cement Bag (remote edit)', 420),  // SYNCED locally -> takes the remote version
  product('99999999-9999-4999-8999-999999999999', 'Remote Only Item', 75),           // new -> inserted
];
server.parties = [{ party_id: 'a0000000-0000-4000-8000-0000000000ff', tenant_id: 't1', name: 'Remote Party', phone: '9000000099', balance: 0, gst_balance: 0, estimate_balance: 0, balance_type: 'GST', party_type: 'CUSTOMER', is_deleted: 0, created_at: remoteTs, updated_at: remoteTs }];
server.settings = [{ tenant_id: 't1', key: 'store_name', value: 'Remote Store Name', updated_at: remoteTs }];
void T;
const result2 = await Promise.race([call('sync:runInitial'), new Promise(r => setTimeout(() => r('TIMEOUT'), 60000))]);
await new Promise(r => setTimeout(r, 3000));
const dump = (sql: string) => getDb().prepare(sql).all();
const pulled = {
  products: dump(`SELECT product_id, name, base_price, category, current_stock, sync_status, is_deleted FROM products ORDER BY product_id`),
  parties: dump(`SELECT party_id, name, phone, sync_status FROM parties ORDER BY party_id`),
  settings: dump(`SELECT tenant_id, key, value, sync_status FROM settings WHERE key = 'store_name' ORDER BY tenant_id`),
};
const after2 = statusCounts();
const norm = (v: unknown) => JSON.parse(JSON.stringify(v, (_k, x) => typeof x === 'string'
  ? x.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<uuid>').replace(/\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d+)?Z?/g, '<ts>').replace(/\d{4}-\d{2}-\d{2}/g, '<date>').replace(/\b1[789]\d{11}\b/g, '<ms>').replace(/\b\d{1,2}:\d{2}( ?[AP]M)?\b/g, '<time>')
  : x));
// Requests from the main cycle and the concurrent "urgent" syncs interleave nondeterministically, so each
// phase is recorded in a canonical order (method + path + body), not in arrival order.
const stable = (v: unknown): string => Array.isArray(v) ? `[${v.map(stable).sort().join(',')}]`
  : v && typeof v === 'object' ? `{${Object.keys(v).sort().map((k) => `${k}:${stable((v as Record<string, unknown>)[k])}`).join(',')}}` : JSON.stringify(v);
const canonical = (rs: unknown[]) => rs.map((r) => norm(r)).sort((x: any, y: any) => { const a = `${x.method} ${x.path} ${stable(x.body)}`, b = `${y.method} ${y.path} ${stable(y.body)}`; return a < b ? -1 : a > b ? 1 : 0; });
const results: [string, string, unknown][] = [
  ['sync:runInitial', '[]', norm(result)],
  ['status:before', '[]', before],
  ...canonical(requests.slice(0, phase1Requests)).map((r: any, i) => [`http:${i}`, `${r.method} ${r.path}`, r] as [string, string, unknown]),
  ['status:after', '[]', after],
  ['phase2:runInitial', '[]', norm(result2)],
  ...canonical(requests.slice(phase1Requests)).map((r: any, i) => [`http2:${i}`, `${r.method} ${r.path}`, r] as [string, string, unknown]),
  ['phase2:pulled', '[]', norm(pulled)],
  ['phase2:status', '[]', after2],
];
fs.writeFileSync(out, JSON.stringify(results, null, 1));
realErr(`${path.basename(tree)}: ${phase1Requests} + ${requests.length - phase1Requests} HTTP requests; results ${JSON.stringify(result)} ${JSON.stringify(result2)}`);
process.exit(0);
