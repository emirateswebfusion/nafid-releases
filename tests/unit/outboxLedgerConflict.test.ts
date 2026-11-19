import { DatabaseSync } from 'node:sqlite';
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ db: null as unknown as Database.Database,
  request: null as unknown as (url: string) => Promise<unknown>, meta: new Map<string, string>() }));
vi.mock('../../electron/db/localDb', () => ({ getDb: () => state.db }));
vi.mock('../../electron/sync/syncAuth', () => ({ cloudTokenUnusable: () => false }));
vi.mock('../../electron/sync/syncProgress', () => ({ notifyPercent: vi.fn() }));
vi.mock('../../electron/sync/entities/settingsSync', () => ({ LOCAL_DEVICE_SETTING_KEYS: [] }));
vi.mock('../../electron/sync/syncTransport', () => ({
  getMeta: (key: string) => state.meta.get(key), setMeta: (key: string, value: string) => state.meta.set(key, value),
  fetchWithFallback: async (url: string) => ({ response: { ok: true, json: () => state.request(url) } }),
}));
vi.mock('../../electron/db/statements/outbox', async original => {
  const actual = await original<typeof import('../../electron/db/statements/outbox')>();
  // This fixture contains one sync entity; use the real backfill and queue operations for it.
  return { ...actual, enqueueLegacyPendingRows: (db: Database.Database) => actual.enqueueLegacyPendingRows(db, ['party_ledger']) };
});
import { runOutboxSync } from '../../electron/sync/outboxSync';
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
    CREATE TABLE sync_meta(key TEXT PRIMARY KEY,value TEXT); CREATE TABLE sync_apply_guard(id INTEGER PRIMARY KEY);
    CREATE TABLE sync_outbox(op_id TEXT PRIMARY KEY,tenant_id TEXT,entity TEXT,entity_id TEXT,op TEXT,row_version INTEGER,payload TEXT,origin TEXT,created_at TEXT,attempts INTEGER DEFAULT 0,last_error TEXT,sent_at TEXT);
    CREATE TABLE party_ledger(ledger_id TEXT PRIMARY KEY,tenant_id TEXT,party_id TEXT,credit_amount REAL,is_deleted INTEGER,row_version INTEGER,origin TEXT,sync_status TEXT,updated_at TEXT);
    INSERT INTO party_ledger VALUES('entry','shop','chitty',500,0,5,'a','PENDING','2026-11-19T09:00:00Z');`);
  queue('old', 5, 500);
});
afterEach(() => raw.close());
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
    : { credit_amount: 500, is_deleted: 1, row_version: 6, sync_status: 'SYNCED' });
  if (newer) expect(raw.prepare("SELECT row_version FROM sync_outbox WHERE sent_at IS NULL").get()?.row_version).toBe(7);
});
