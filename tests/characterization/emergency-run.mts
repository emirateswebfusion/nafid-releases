/**
 * Emergency wipe guard: a local wipe needs administrator credentials and is audited; a remote wipe arrives
 * only as a server command, is acknowledged, audited and executed; a synced "emergency_wipe_command"
 * setting is ignored. Usage: EQ_USERDATA=<empty dir> npx tsx emergency-run.mts <treeRoot> <out.json>
 */
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { createRequire } from 'node:module';

const tree = path.resolve(process.argv[2]);
const bcrypt = createRequire(path.join(tree, 'electron', 'main.ts'))('bcryptjs');
const out = process.argv[3];
const userData = process.env.EQ_USERDATA!;
process.env.VENDORA_CLOUD_API = 'http://cloud.test';
fs.mkdirSync(userData, { recursive: true });
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
fs.writeFileSync(path.join(userData, 'config.json'), JSON.stringify({ jwt_token: `${b64({ alg: 'HS256' })}.${b64({ tenant_id: 't1', exp: 4102444800 })}.sig`, tenant_id: 't1' }));

let serveCommand = false;
const requests: string[] = [];
(globalThis as any).fetch = async (url: string, init: any = {}) => {
  const u = new URL(String(url));
  requests.push(`${init.method || 'GET'} ${u.pathname}${u.search}`);
  const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
  if (u.pathname === '/api/sync/emergency-commands') {
    return json({ commands: serveCommand ? [{ command_id: '55555555-5555-4555-8555-555555555555', target_terminal: 'ALL', wipe_mode: 'ALL_DATA', issued_by_name: 'Owner' }] : [] });
  }
  if (u.pathname.endsWith('/ack')) return json({ success: true });
  if (u.pathname === '/api/sync/settings' && (init.method || 'GET') === 'GET') {
    // An old-style wipe command arriving as a synced setting must be ignored.
    const cmd = { tenant_id: 't1', key: 'emergency_wipe_command', value: JSON.stringify({ action: 'PURGE_LOCAL_DB', command_id: 'legacy', target_terminal: 'ALL', triggered_at: Date.now() }), updated_at: '2030-01-01T00:00:00Z' };
    return json({ success: true, settings: [cmd], data: [cmd] });
  }
  if ((init.method || 'GET') === 'POST') return json({ success: true, synced: [], failed: [] });
  return json({ success: true, data: [] });
};

const handlers: Map<string, Function> = ((globalThis as any).__handlers ||= new Map());
const realErr = console.error;
console.log = () => {}; console.warn = () => {}; console.error = () => {};
const { initDb, getDb } = await import(pathToFileURL(path.join(tree, 'electron/db/localDb.ts')).href);
initDb();
(await import(pathToFileURL(path.join(tree, 'electron/ipc/index.ts')).href)).registerAllIpcHandlers();
const call = async (ch: string, ...args: unknown[]) => handlers.get(ch)!({ sender: { send() {}, isDestroyed: () => false } }, ...args);
const { localSaveUser } = await import(pathToFileURL(path.join(tree, 'electron/services/localAuthService.ts')).href);
localSaveUser({ user_id: 'admin1', tenant_id: 't1', name: 'Owner', email: 'owner@shop.in', password_hash: bcrypt.hashSync('owner-pass', 4), role: 'ADMIN' });
localSaveUser({ user_id: 'staff1', tenant_id: 't1', name: 'Biller', email: 'biller@shop.in', password_hash: bcrypt.hashSync('staff-pass', 4), role: 'STAFF' });
await call('db:addProduct', { product_id: 'p1', tenant_id: 't1', name: 'Rod', base_price: 100, purchase_price: 70, is_gst_applicable: 1, tax_rate_percent: 18, uom: 'Pcs', current_stock: 10, reorder_level: 1, hsn_sac_code: '7308', category: 'G', domain_attributes: {} });
const products = () => (getDb().prepare('SELECT COUNT(*) AS n FROM products').get() as { n: number }).n;
const audit = () => { try { return fs.readFileSync(path.join(userData, 'emergency-purge-audit.jsonl'), 'utf-8').trim().split('\n').filter(Boolean).map((l) => { const e = JSON.parse(l); delete e.at; return e; }); } catch { return []; } };

const result: Record<string, unknown> = {};
result.noCredentials = await call('emergency:purgeLocal', { wipe_mode: 'ALL_DATA', reason: 'TEST' });
result.wrongPassword = await call('emergency:purgeLocal', { wipe_mode: 'ALL_DATA', reason: 'TEST', email: 'owner@shop.in', password: 'nope' });
result.staffCredentials = await call('emergency:purgeLocal', { wipe_mode: 'ALL_DATA', reason: 'TEST', email: 'biller@shop.in', password: 'staff-pass' });
result.productsAfterRejected = products();
result.auditAfterRejected = audit();
const adminWipe = await call('emergency:purgeLocal', { wipe_mode: 'SALES_AND_CASH_ONLY', reason: 'TEST', email: 'owner@shop.in', password: 'owner-pass' });
result.adminLocalWipe = { success: adminWipe.success, error: adminWipe.error };
result.auditAfterAdminWipe = audit();
fs.writeFileSync(path.join(userData, 'config.json'), JSON.stringify({ jwt_token: `${b64({ alg: 'HS256' })}.${b64({ tenant_id: 't1', exp: 4102444800 })}.sig`, tenant_id: 't1' })); // the wipe signed this terminal out

// Sync cycle with a legacy synced-setting command and no server command: nothing happens.
await call('sync:runInitial');
await new Promise((r) => setTimeout(r, 1500));
result.productsAfterLegacySettingCommand = products();
// Server-issued command: acknowledged, audited, executed.
serveCommand = true;
await call('sync:runInitial');
await new Promise((r) => setTimeout(r, 1500));
result.remoteRequests = requests.filter((r) => r.includes('emergency'));
result.productsAfterRemoteWipe = products();
result.auditAfterRemote = audit();
result.auditFinal = audit();
fs.writeFileSync(out, JSON.stringify(result, null, 1));
realErr(JSON.stringify(result, null, 1));
process.exit(0);
