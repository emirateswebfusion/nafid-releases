/** Node-only outbox characterization using the same IPC seed as sync-run.mts. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const tree = path.resolve(process.argv[2]);
const userData = process.env.EQ_USERDATA!;
assert.ok(userData, 'fresh EQ_USERDATA required');
fs.mkdirSync(userData, { recursive: true });
const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');
fs.writeFileSync(path.join(userData, 'config.json'), JSON.stringify({ tenant_id: 't1',
  jwt_token: `${b64({ alg: 'HS256' })}.${b64({ tenant_id: 't1', exp: 4102444800 })}.sig` }));
process.env.VENDORA_CLOUD_API = 'http://cloud.test';
type Row = Record<string, unknown>;
const productId = '11111111-1111-4111-8111-111111111111';
let conflictRow: Row;
let remoteProduct: Row;
let batches = 0, pushes = 0, pulls = 0, duplicates = 0, conflicts = 0;
const quiet = console.log;
console.log = () => {}; console.warn = () => {}; console.error = () => {};
const { initDb, getDb } = await import(pathToFileURL(path.join(tree, 'electron/db/localDb.ts')).href);
initDb();
const db = getDb();
const { syncState } = await import(pathToFileURL(path.join(tree, 'electron/sync/syncState.ts')).href);
syncState.syncInProgress = true;
const ipc = await import(pathToFileURL(path.join(tree, 'electron/ipc/index.ts')).href);
ipc.registerAllIpcHandlers();
const handlers = (globalThis as unknown as { __handlers: Map<string, (...args: unknown[]) => unknown> }).__handlers;
const event = { sender: { send() {}, isDestroyed: () => false } };
const call = async (ch: string, ...args: unknown[]) => handlers.get(ch)?.(event, ...args);
await call('settings:set', { tenant_id: 't1', key: 'sync_engine', value: 'outbox' });
await call('settings:set', { tenant_id: 't1', key: 'network_sync_config', value: { syncMode: 'CLOUD' } });
const here = path.dirname(fileURLToPath(import.meta.url));
const scenario = await import(pathToFileURL(path.join(here, 'scenario.mts')).href);
await scenario.default(call, []);
syncState.syncInProgress = false;
const original = db.prepare('SELECT * FROM products WHERE product_id = ?').get(productId) as Row;
conflictRow = { ...original, name: 'Server conflict winner', base_price: 999, row_version: 100, origin: 'server' };
remoteProduct = { ...original, product_id: 'remote-only', name: 'Remote only', sku_barcode: 'REMOTE-ONLY', item_code: null, row_version: 8, origin: 'server', server_seq: '101' };
const losing = db.prepare(`SELECT op_id FROM sync_outbox WHERE entity = 'products' AND entity_id = ? ORDER BY rowid DESC LIMIT 1`).get(productId) as { op_id: string };
const requests: string[] = [];
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input));
  requests.push(url.pathname);
  const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
  if (url.pathname === '/api/sync/ops') {
    batches++;
    const body = JSON.parse(String(init.body)) as { ops: Row[] };
    assert.ok(body.ops.length <= 200);
    pushes += body.ops.length;
    return json({ results: body.ops.map((op, index) => {
      if (op.op_id === losing.op_id) { conflicts++; return { op_id: op.op_id, status: 'conflict', current: conflictRow }; }
      if (!duplicates && index === 0) { duplicates++; return { op_id: op.op_id, status: 'duplicate' }; }
      return { op_id: op.op_id, status: 'applied' };
    }) });
  }
  if (url.pathname === '/api/sync/changes') {
    pulls++;
    const since = url.searchParams.get('since');
    if (since === '0') return json({ changes: [{ entity: 'products', row: remoteProduct }], next_since: '101', has_more: true });
    if (since === '101') return json({ changes: [{ entity: 'products', row: { ...remoteProduct, is_deleted: true, server_seq: '102' } }], next_since: '102', has_more: false });
    assert.equal(since, '102');
    return json({ changes: [], next_since: '102', has_more: false });
  }
  if (url.pathname === '/api/sync/emergency-commands') return json({ commands: [] });
  if (url.pathname === '/health') return json({ status: 'ok' });
  throw new Error(`Unexpected legacy request ${url.pathname}`);
};
const { runSyncCycle } = await import(pathToFileURL(path.join(tree, 'electron/sync/syncCycle.ts')).href);
await runSyncCycle();
assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM sync_outbox WHERE tenant_id = 't1' AND sent_at IS NULL`).get().n, 0);
assert.equal(db.prepare('SELECT name FROM products WHERE product_id = ?').get(productId).name, conflictRow.name);
const retained = db.prepare('SELECT sent_at, last_error FROM sync_outbox WHERE op_id = ?').get(losing.op_id);
assert.ok(retained.sent_at); assert.equal(retained.last_error, 'conflict');
assert.equal(db.prepare(`SELECT is_deleted FROM products WHERE product_id = 'remote-only'`).get().is_deleted, 1);
assert.equal(db.prepare(`SELECT value FROM sync_meta WHERE key = 'server_seq_cursor'`).get().value, '102');
assert.equal(conflicts, 1); assert.equal(duplicates, 1); assert.equal(pulls, 2);
const sent = pushes;
await runSyncCycle();
assert.equal(pushes, sent); assert.equal(pulls, 3);
// Exercise batch bounds, DELETE payloads, pending-edit protection and the retry ceiling.
const retryIds = ['retry-error', 'retry-forbidden', 'retry-unknown_entity'];
const insert = db.prepare(`INSERT INTO products (product_id, tenant_id, name, base_price, purchase_price, is_gst_applicable, tax_rate_percent, uom)
  VALUES (?, 't1', ?, 1, 1, 0, 0, 'Pcs')`);
for (let index = 0; index < 205; index++) insert.run(`batch-${index}`, `Batch ${index}`);
for (const id of retryIds) insert.run(id, 'Pending local edit');
insert.run('deleted-local', 'Delete locally');
db.prepare("DELETE FROM products WHERE product_id = 'deleted-local'").run();
db.prepare("UPDATE sync_outbox SET attempts = 9 WHERE entity_id LIKE 'retry-%' AND sent_at IS NULL").run();
// Product initialization may legitimately create both an insert and a stock-bootstrap operation.
const expectedBatches = Math.ceil(db.prepare("SELECT COUNT(*) n FROM sync_outbox WHERE tenant_id='t1' AND sent_at IS NULL AND attempts < 10").get().n / 200);
assert.ok(expectedBatches >= 2);
const expectedRetryOps = db.prepare("SELECT COUNT(*) n FROM sync_outbox WHERE entity_id LIKE 'retry-%' AND sent_at IS NULL").get().n;
let extraBatches = 0, outgoingDelete = false, retrySends = 0;
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input));
  const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
  if (url.pathname === '/api/sync/ops') {
    extraBatches++;
    const { ops } = JSON.parse(String(init.body)) as { ops: Row[] };
    assert.ok(ops.length <= 200);
    return json({ results: ops.map(op => {
      if (op.op === 'DELETE') { outgoingDelete = true; assert.equal(op.payload, null); }
      if (retryIds.includes(String(op.entity_id))) {
        retrySends++;
        return { op_id: op.op_id, status: String(op.entity_id).replace('retry-', '') };
      }
      return { op_id: op.op_id, status: 'applied' };
    }) });
  }
  if (url.pathname === '/api/sync/changes') return json({ changes: retryIds.map(product_id => ({ entity: 'products',
    row: { ...original, product_id, name: 'Must not overwrite pending', server_seq: '103' } })), next_since: '103', has_more: false });
  return json({ commands: [] });
};
await runSyncCycle(event.sender);
assert.equal(extraBatches, expectedBatches); assert.ok(outgoingDelete); assert.equal(retrySends, expectedRetryOps);
for (const id of retryIds) {
  const op = db.prepare('SELECT attempts, sent_at, last_error FROM sync_outbox WHERE entity_id = ?').get(id);
  assert.equal(op.attempts, 10); assert.equal(op.sent_at, null); assert.equal(op.last_error, id.replace('retry-', ''));
  assert.equal(db.prepare('SELECT name FROM products WHERE product_id = ?').get(id).name, 'Pending local edit');
}
assert.match(syncState.currentSyncProgress.label, new RegExp(`${expectedRetryOps} operations stopped`));
await runSyncCycle(event.sender);
assert.equal(extraBatches, expectedBatches); assert.equal(retrySends, expectedRetryOps);
assert.equal(db.prepare("SELECT value FROM sync_meta WHERE key = 'server_seq_cursor'").get().value, '103');
// Remote applies leave no guard row behind.
assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sync_apply_guard').get().n, 0);
console.log = quiet;
const summary = { result: 'outbox: ok', batches, pushes, conflicts, duplicates, pulls, cursor: '102', secondCyclePushes: 0, extraBatches, outgoingDelete, exhaustedOps: expectedRetryOps, pendingEditsPreserved: true };
if (process.argv[3]) fs.writeFileSync(process.argv[3], JSON.stringify(summary, null, 2));
quiet(JSON.stringify(summary));
process.exit(0);
