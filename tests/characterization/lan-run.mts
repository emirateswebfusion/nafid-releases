/**
 * LAN sync end-to-end check with the pairing key: one process runs a PRIMARY terminal (LAN server),
 * another runs a SECONDARY terminal that syncs from it.
 *   EQ_USERDATA=<dirA> npx tsx lan-run.mts primary <tree> <port> <keyFile>      (keeps serving)
 *   EQ_USERDATA=<dirB> npx tsx lan-run.mts secondary <tree> <port> <key> <out.json>
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const [mode, treeArg, portArg, keyArg, outArg] = process.argv.slice(2);
const tree = path.resolve(treeArg);
const port = Number(portArg);
const handlers: Map<string, Function> = ((globalThis as any).__handlers ||= new Map());
const realLog = console.error;
console.log = () => {}; console.warn = () => {}; console.error = () => {};
const { initDb, getDb } = await import(path.join(tree, 'electron/db/localDb.ts'));
initDb();
(await import(path.join(tree, 'electron/ipc/index.ts'))).registerAllIpcHandlers();
const event = { sender: { send() {}, isDestroyed: () => false } };
const call = async (ch: string, ...args: unknown[]) => handlers.get(ch)!(event, ...args);

if (mode === 'primary') {
  const scenario = await import(path.join(here, 'scenario.mts'));
  await scenario.default(call, []);
  await call('settings:set', { tenant_id: 'global', key: 'network_sync_config', value: { syncMode: 'LAN', lanRole: 'PRIMARY', lanHostIp: '127.0.0.1', lanPort: port, syncFrequency: 'NORMAL' } });
  const cfg = JSON.parse((getDb().prepare(`SELECT value FROM settings WHERE key = 'network_sync_config' AND tenant_id = 'global'`).get() as { value: string }).value);
  fs.writeFileSync(keyArg, cfg.lanPairingKey || 'NONE');
  realLog(`primary serving on ${port} with key ${cfg.lanPairingKey}`);
  setInterval(() => {}, 1 << 30);
} else {
  const key = keyArg;
  const base = `http://127.0.0.1:${port}`;
  const probe = async (p: string, headers: Record<string, string> = {}) => (await fetch(base + p, { headers })).status;
  const probes = {
    health: await probe('/health'),
    productsWithoutKey: await probe('/api/sync/products'),
    usersWithoutKey: await probe('/api/sync/users'),
    productsWrongKey: await probe('/api/sync/products', { 'x-nafid-lan-key': 'AAAA-BBBB-CCCC-DDDD' }),
    productsWithKey: await probe('/api/sync/products', { 'x-nafid-lan-key': key }),
    productsWithKeyLowercaseNoDashes: await probe('/api/sync/products', { 'x-nafid-lan-key': key.toLowerCase().replace(/-/g, '') }),
  };
  // Secondary terminal: configure LAN SECONDARY with the key, then run a sync cycle against the primary.
  fs.writeFileSync(path.join(process.env.EQ_USERDATA!, 'offline-auth.enc'), JSON.stringify({ tenant_id: 't1', user_id: 'u2' }));
  await call('settings:set', { tenant_id: 'global', key: 'network_sync_config', value: { syncMode: 'LAN', lanRole: 'SECONDARY', lanHostIp: '127.0.0.1', lanPort: port, syncFrequency: 'NORMAL', lanPairingKey: key } });
  const test = await call('sync:testConnection', { syncMode: 'LAN', lanRole: 'SECONDARY', lanHostIp: '127.0.0.1', lanPort: port });
  const testWrong = await call('sync:testConnection', { syncMode: 'LAN', lanRole: 'SECONDARY', lanHostIp: '127.0.0.1', lanPort: port, lanPairingKey: 'AAAA-BBBB-CCCC-DDDD' });
  const httpLog: string[] = []; const realFetch = globalThis.fetch;
  (globalThis as any).fetch = async (u: any, o: any) => { const r = await realFetch(u, o); httpLog.push(`${o?.method || 'GET'} ${String(u).replace(base, '')} ${r.status}`); return r; };
  const before = (getDb().prepare('SELECT COUNT(*) AS n FROM products').get() as { n: number }).n;
  const sync = await Promise.race([call('sync:runInitial'), new Promise(r => setTimeout(() => r('TIMEOUT'), 60000))]);
  await new Promise(r => setTimeout(r, 2000));
  const after = (getDb().prepare('SELECT COUNT(*) AS n FROM products').get() as { n: number }).n;
  const savedKeyKept = JSON.parse((getDb().prepare(`SELECT value FROM settings WHERE key = 'network_sync_config' AND tenant_id = 'global'`).get() as { value: string }).value).lanPairingKey;
  // A later save from the main settings screen (which does not send the key) must keep it.
  await call('settings:set', { tenant_id: 'global', key: 'network_sync_config', value: { syncMode: 'LAN', lanRole: 'SECONDARY', lanHostIp: '127.0.0.1', lanPort: port, syncFrequency: 'HIGH' } });
  const keyAfterResave = JSON.parse((getDb().prepare(`SELECT value FROM settings WHERE key = 'network_sync_config' AND tenant_id = 'global'`).get() as { value: string }).value).lanPairingKey;
  const result = { httpLog: httpLog.slice(0, 40),probes, test, testWrong, sync, productsBefore: before, productsAfter: after, savedKeyKept, keyAfterResave };
  fs.writeFileSync(outArg, JSON.stringify(result, null, 1));
  realLog(JSON.stringify(result, null, 1));
  process.exit(0);
}
