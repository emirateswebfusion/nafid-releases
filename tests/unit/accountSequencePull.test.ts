import { DatabaseSync } from 'node:sqlite';
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ db: null as unknown as Database.Database, rows: [] as Record<string, unknown>[], failAt: '' }));
vi.mock('../../electron/db/localDb', () => ({ getDb: () => state.db }));
vi.mock('../../electron/sync/syncTransport', () => ({
  getMeta: (key: string) => (state.db.prepare('SELECT value FROM sync_meta WHERE key=?').get(key) as { value: string } | undefined)?.value,
  pullPaginated: vi.fn(async () => ({ count: 0, reconciled: 0, failed: false, hasChanged: false })),
  fetchWithFallback: async (url: string) => {
    const params = new URL(url, 'https://cloud.test').searchParams;
    return { response: new Response(JSON.stringify(state.rows.filter(row => BigInt(String(row.server_seq)) > BigInt(params.get('after_seq')!))
      .slice(0, Number(params.get('limit')))), { headers: { 'X-Nafid-Account-Sequence': '1' } }) };
  },
}));
import { pullAccountPages } from '../../electron/sync/accountPull';
import { syncState } from '../../electron/sync/syncState';
let raw: DatabaseSync;
beforeEach(() => {
  raw = new DatabaseSync(':memory:');
  state.db = Object.assign(raw, { transaction: (fn: () => unknown) => () => {
    raw.exec('SAVEPOINT page'); try { const result = fn(); raw.exec('RELEASE page'); return result; }
    catch (error) { raw.exec('ROLLBACK TO page; RELEASE page'); throw error; }
  } }) as unknown as Database.Database;
  raw.exec('CREATE TABLE sync_meta(key TEXT PRIMARY KEY,value TEXT); CREATE TABLE sync_apply_guard(id INTEGER PRIMARY KEY); CREATE TABLE downloaded(id TEXT PRIMARY KEY);');
  state.rows = Array.from({ length: 5 }, (_, i) => ({ server_seq: String(9007199254740993n + BigInt(i)), updated_at: '2026-11-19T10:00:00Z' }));
  state.failAt = ''; syncState.isSyncActive = true; syncState.currentActiveRoute = 'CLOUD';
});
afterEach(() => { raw.close(); syncState.isSyncActive = false; syncState.currentActiveRoute = 'NONE'; });
const pull = () => pullAccountPages({ token: 'token', tenantId: 'shop', table: 'party_ledger', urlPath: '/api/sync/party-ledger', label: 'ledger', pageSize: 2,
  processPage: rows => {
    for (const row of rows) {
      raw.prepare('INSERT OR REPLACE INTO downloaded VALUES(?)').run(String(row.server_seq));
      if (row.server_seq === state.failAt) throw new Error('test disk write failure');
    }
    return 0;
  } }, 2);
it('resumes beyond the cycle page budget without skipping old rows or equal timestamps', async () => {
  expect((await pull()).failed).toBe(false);
  expect(raw.prepare('SELECT count(*) n FROM downloaded').get()?.n).toBe(4);
  expect(raw.prepare("SELECT value FROM sync_meta WHERE key='account_pull_pending:shop:party_ledger'").get()?.value).toBe('1');
  await pull();
  expect(raw.prepare('SELECT count(*) n FROM downloaded').get()?.n).toBe(5);
  expect(raw.prepare("SELECT value FROM sync_meta WHERE key='account_pull_seq:shop:party_ledger'").get()?.value).toBe('9007199254740997');
  expect(raw.prepare("SELECT value FROM sync_meta WHERE key='account_pull_pending:shop:party_ledger'").get()).toBeUndefined();
});
it('rolls back a failed page and its cursor, then retries every row', async () => {
  state.failAt = String(state.rows[1].server_seq);
  expect((await pull()).failed).toBe(true);
  expect(raw.prepare('SELECT count(*) n FROM downloaded').get()?.n).toBe(0);
  expect(raw.prepare("SELECT value FROM sync_meta WHERE key='account_pull_seq:shop:party_ledger'").get()).toBeUndefined();
  state.failAt = ''; await pull(); await pull();
  expect(raw.prepare('SELECT count(*) n FROM downloaded').get()?.n).toBe(5);
});
