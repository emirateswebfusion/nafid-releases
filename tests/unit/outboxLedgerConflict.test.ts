import { DatabaseSync } from 'node:sqlite';
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ db: null as unknown as Database.Database,
  request: null as unknown as (url: string, body?: string) => Promise<unknown>, meta: new Map<string, string>() }));
vi.mock('../../electron/db/localDb', () => ({ getDb: () => state.db }));
vi.mock('../../electron/sync/syncAuth', () => ({ cloudTokenUnusable: () => false }));
vi.mock('../../electron/sync/syncProgress', () => ({ notifyPercent: vi.fn() }));
vi.mock('../../electron/sync/entities/settingsSync', () => ({ LOCAL_DEVICE_SETTING_KEYS: [] }));
vi.mock('../../electron/sync/syncTransport', () => ({
  getMeta: (key: string) => state.meta.get(key), setMeta: (key: string, value: string) => state.meta.set(key, value),
  fetchWithFallback: async (url: string, init?: RequestInit) => ({ response: { ok: true, json: () => state.request(url, init?.body as string | undefined) } }),
}));
vi.mock('../../electron/db/statements/outbox', async original => {
  const actual = await original<typeof import('../../electron/db/statements/outbox')>();
  // This fixture contains one sync entity; use the real backfill and queue operations for it.
  return { ...actual, enqueueLegacyPendingRows: (db: Database.Database) => actual.enqueueLegacyPendingRows(db, ['party_ledger']) };
});
import { runOutboxSync } from '../../electron/sync/outboxSync';
import { retryTransportOperation } from '../../electron/db/statements/sync/manualSync';
let raw: DatabaseSync;
const server = { ledger_id: 'entry', tenant_id: 'shop', party_id: 'chitty', credit_amount: 500,
  is_deleted: true, row_version: 6, origin: 'b', updated_at: '2026-11-19T10:00:00Z' };
function queue(id: string, version: number, amount: number) {
  raw.prepare("INSERT INTO sync_outbox(op_id,tenant_id,entity,entity_id,op,row_version,payload,origin,created_at) VALUES(?,'shop','party_ledger','entry','UPSERT',?,?,'a','2026-11-19T11:00:00Z')")
    .run(id, version, JSON.stringify({ ...server, credit_amount: amount, is_deleted: false, row_version: version, origin: 'a' }));
}
beforeEach(() => {
  raw = new DatabaseSync(':memory:'); state.meta.clear();
  state.db = Object.assign(raw, { transaction: (fn: () => unknown) => () => {
    raw.exec('SAVEPOINT conflict'); try { const r = fn(); raw.exec('RELEASE conflict'); return r; }
    catch (e) { raw.exec('ROLLBACK TO conflict; RELEASE conflict'); throw e; }
  } }) as unknown as Database.Database;
  raw.exec(`CREATE TABLE settings(tenant_id TEXT,key TEXT,value TEXT); INSERT INTO settings VALUES('shop','sync_engine','outbox');
    CREATE TABLE parties(party_id TEXT PRIMARY KEY,tenant_id TEXT,sync_status TEXT);
    CREATE TABLE sync_meta(key TEXT PRIMARY KEY,value TEXT); CREATE TABLE sync_apply_guard(id INTEGER PRIMARY KEY);
    CREATE TABLE sync_outbox(op_id TEXT PRIMARY KEY,tenant_id TEXT,entity TEXT,entity_id TEXT,op TEXT,row_version INTEGER,payload TEXT,origin TEXT,created_at TEXT,attempts INTEGER DEFAULT 0,last_error TEXT,sent_at TEXT);
    CREATE TABLE party_ledger(ledger_id TEXT PRIMARY KEY,tenant_id TEXT,party_id TEXT,credit_amount REAL,is_deleted INTEGER,row_version INTEGER,origin TEXT,sync_status TEXT,updated_at TEXT);
    INSERT INTO party_ledger VALUES('entry','shop','chitty',500,0,5,'a','PENDING','2026-11-19T09:00:00Z');`);
  queue('old', 5, 500);
});
afterEach(() => raw.close());
it.each(['duplicate', 'conflict'])('a bounded manual financial probe retains original data unless the server supplies a valid %s receipt', async status => {
  raw.exec("UPDATE sync_outbox SET attempts=10,last_error='Sync conflict: missing base'; INSERT INTO sync_meta VALUES('account_conflict:shop:party_ledger:entry','Sync conflict: missing base')");
  const original = raw.prepare("SELECT op_id,payload,row_version,origin FROM sync_outbox WHERE op_id='old'").get();
  expect(retryTransportOperation(state.db).run('shop', 'old', 'Sync conflict: missing base').changes).toBe(1);
  state.request = async (url, body) => {
    if (!url.includes('/ops')) return { changes: [], next_since: '0', has_more: false };
    const request = JSON.parse(body!) as { ops: { op_id: string; payload: { credit_amount: number } }[] };
    expect(request.ops[0].op_id).toBe('old'); expect(request.ops[0].payload.credit_amount).toBe(500);
    return { results: [{ op_id: 'old', status, ...(status === 'duplicate' ? { receipt: { id: 'entry', base: '6:a', row_version: 6, origin: 'a', server_seq: '42' } } : { current: server }) }] };
  };
  await runOutboxSync('dummy', 'shop');
  expect(raw.prepare("SELECT op_id,payload,row_version,origin FROM sync_outbox WHERE op_id='old'").get()).toEqual(original);
  expect(raw.prepare('SELECT credit_amount,is_deleted FROM party_ledger').get()).toEqual({ credit_amount: 500, is_deleted: 0 });
  expect(raw.prepare("SELECT sync_status FROM party_ledger").get()?.sync_status).toBe(status === 'duplicate' ? 'SYNCED' : 'PENDING');
  expect(raw.prepare("SELECT sent_at FROM sync_outbox WHERE op_id='old'").get()?.sent_at).toEqual(status === 'duplicate' ? expect.any(String) : null);
});
it('acknowledges a rebased duplicate after an upload response was lost', async () => {
  raw.exec("UPDATE party_ledger SET updated_at='2026-11-19T10:00:00Z'");
  let attempts = 0;
  state.request = async url => {
    if (!url.includes('/ops')) return { changes: [], next_since: '0', has_more: false };
    if (++attempts === 1) throw new Error('Response lost after commit');
    return { results: [{ op_id: 'old', status: 'duplicate', receipt: {
      id: 'entry', base: '6:a', row_version: 6, origin: 'a', server_seq: '42',
    } }] };
  };
  await expect(runOutboxSync('dummy', 'shop')).rejects.toThrow('Response lost after commit');
  expect(raw.prepare("SELECT sent_at FROM sync_outbox WHERE op_id='old'").get()?.sent_at).toBeNull();
  await runOutboxSync('dummy', 'shop');
  expect(raw.prepare('SELECT credit_amount,row_version,sync_status FROM party_ledger').get())
    .toMatchObject({ credit_amount: 500, row_version: 6, sync_status: 'SYNCED' });
  expect(raw.prepare("SELECT value FROM sync_meta WHERE key='account_base:shop:party_ledger:entry'").get()?.value).toBe('6:a');
  expect(raw.prepare("SELECT sent_at FROM sync_outbox WHERE op_id='old'").get()?.sent_at).toBeTruthy();
});
it.each([false, true])('derives downloaded account balances from the retained local ledger (pending=%s)', async pending => {
  balanceFixture();
  if (pending) raw.exec('UPDATE party_ledger SET credit_amount=900');
  else raw.exec("UPDATE sync_outbox SET sent_at='done'; UPDATE party_ledger SET sync_status='SYNCED'");
  state.request = async url => {
    if (url.includes('/ops')) return { results: [{ op_id: 'old', status: 'conflict', current: server }] };
    return { changes: pending
      ? [{ entity: 'parties', row: { party_id: 'chitty', tenant_id: 'shop', balance: 500, gst_balance: 500, estimate_balance: 0 } }]
      : [{ entity: 'party_ledger', row: { ...server, is_deleted: false, credit_amount: 900 } }], next_since: '9', has_more: false };
  };
  await runOutboxSync('dummy', 'shop');
  expect(raw.prepare("SELECT balance,gst_balance,estimate_balance FROM parties WHERE party_id='chitty'").get())
    .toMatchObject({ balance: 900, gst_balance: 900, estimate_balance: 0 });
});
it('does not bypass a failed or exhausted financial predecessor on later cycles', async () => {
  queue('latest', 6, 900);
  const uploaded: string[] = [];
  state.request = async (url, body) => {
    if (!url.includes('/ops')) return { changes: [], next_since: '0', has_more: false };
    const { ops } = JSON.parse(body!) as { ops: { op_id: string }[] };
    uploaded.push(...ops.map(op => op.op_id));
    return { results: ops.map(op => ({ op_id: op.op_id, status: 'error', error: 'Temporary failure' })) };
  };
  for (let cycle = 0; cycle < 11; cycle++) await runOutboxSync('dummy', 'shop');
  expect(uploaded).toEqual(Array(10).fill('old'));
  expect(raw.prepare("SELECT attempts,sent_at FROM sync_outbox WHERE op_id='latest'").get()).toMatchObject({ attempts: 0, sent_at: null });
});
it.each([false, true])('a conflict reply preserves an edit made during upload (newer=%s)', async newer => {
  state.request = async url => {
    if (url.includes('/ops')) {
      if (newer) {
        raw.prepare("UPDATE party_ledger SET credit_amount=1000,is_deleted=0,row_version=7,sync_status='PENDING' WHERE ledger_id='entry'").run();
        queue('new', 7, 1000);
      }
      return { results: [{ op_id: 'old', status: 'conflict', current: server }] };
    }
    return { changes: [{ entity: 'party_ledger', row: server }], next_since: '6', has_more: false };
  };
  await runOutboxSync('dummy', 'shop');
  expect(raw.prepare('SELECT credit_amount,is_deleted,row_version,sync_status FROM party_ledger').get()).toMatchObject(newer
    ? { credit_amount: 1000, is_deleted: 0, row_version: 7, sync_status: 'PENDING' }
    : { credit_amount: 500, is_deleted: 0, row_version: 5, sync_status: 'PENDING' });
  if (newer) expect(raw.prepare("SELECT row_version FROM sync_outbox WHERE op_id='new' AND sent_at IS NULL").get()?.row_version).toBe(7);
});
it('uploads consecutive edits of one account using each preceding receipt', async () => {
  raw.exec("INSERT INTO sync_meta VALUES('account_base:shop:party_ledger:entry','4:b'); UPDATE party_ledger SET row_version=6,credit_amount=900");
  queue('latest', 6, 900);
  let base = '4:b';
  const batches: string[][] = [];
  state.request = async (url, body) => {
    if (!url.includes('/ops')) return { changes: [], next_since: '0', has_more: false };
    const { ops } = JSON.parse(body!) as { ops: { op_id: string; _sync_base: string; row_version: number }[] };
    batches.push(ops.map(op => op.op_id));
    return { results: ops.map(op => {
      if (op._sync_base !== base) return { op_id: op.op_id, status: 'conflict', current: server };
      base = `${op.row_version}:a`;
      return { op_id: op.op_id, status: 'applied', receipt: { id: 'entry', base, row_version: op.row_version, origin: 'a' } };
    }) };
  };
  await runOutboxSync('dummy', 'shop');
  expect(raw.prepare('SELECT COUNT(*) AS n FROM sync_outbox WHERE sent_at IS NULL').get()?.n).toBe(0);
  expect(batches).toEqual([['old'], ['latest']]);
  expect(raw.prepare('SELECT credit_amount,sync_status FROM party_ledger').get()).toMatchObject({ credit_amount: 900, sync_status: 'SYNCED' });
});

function balanceFixture() {
  raw.exec(`ALTER TABLE parties ADD COLUMN balance REAL; ALTER TABLE parties ADD COLUMN gst_balance REAL;
    ALTER TABLE parties ADD COLUMN estimate_balance REAL; ALTER TABLE parties ADD COLUMN last_transaction_date TEXT;
    ALTER TABLE party_ledger ADD COLUMN debit_amount REAL DEFAULT 0;
    ALTER TABLE party_ledger ADD COLUMN balance_type TEXT DEFAULT 'GST';
    ALTER TABLE party_ledger ADD COLUMN transaction_date TEXT DEFAULT '2026-11-19T09:00:00Z';
    INSERT INTO parties VALUES('chitty','shop','SYNCED',500,500,0,NULL);`);
}

it.each(['delete', 'move', 'estimate'])('updates both affected balances for a downloaded %s', async action => {
  balanceFixture();
  raw.exec("UPDATE sync_outbox SET sent_at='done'; UPDATE party_ledger SET sync_status='SYNCED'; INSERT INTO parties VALUES('other','shop','SYNCED',0,0,0,NULL)");
  state.request = async () => ({ changes: [{ entity: 'party_ledger', row: { ...server,
    is_deleted: action === 'delete', party_id: action === 'move' ? 'other' : 'chitty',
    balance_type: action === 'estimate' ? 'ESTIMATE' : 'GST', credit_amount: 900 } }], next_since: '9', has_more: false });
  await runOutboxSync('dummy', 'shop');
  const original = raw.prepare("SELECT balance,gst_balance,estimate_balance,last_transaction_date FROM parties WHERE party_id='chitty'").get();
  expect(original).toMatchObject(action === 'estimate'
    ? { balance: 900, gst_balance: 0, estimate_balance: 900 }
    : { balance: 0, gst_balance: 0, estimate_balance: 0, last_transaction_date: null });
  if (action === 'move') expect(raw.prepare("SELECT balance FROM parties WHERE party_id='other'").get()?.balance).toBe(900);
});
