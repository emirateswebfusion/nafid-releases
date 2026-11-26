import { DatabaseSync } from 'node:sqlite';
import type Database from 'better-sqlite3';
import { afterEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ db: null as unknown as Database.Database, remote: [] as Record<string, unknown>[] }));
vi.mock('../../electron/db/localDb', () => ({ getDb: () => state.db }));
vi.mock('../../electron/sync/syncProgress', () => ({ notifyPullProgress: vi.fn() }));
vi.mock('../../electron/sync/syncTransport', () => ({
  getSyncTargetLabel: () => 'test', pushBatch: vi.fn(),
  pullPaginated: async (args: { processPage: (rows: Record<string, unknown>[]) => number }) => ({ hasChanged: args.processPage(state.remote) > 0, count: state.remote.length }),
}));
import { pushBatch } from '../../electron/sync/syncTransport';
import { acknowledgeFeatureFlags } from '../../electron/db/statements/sync/settingsSync';
import { syncSettings, pullSettings } from '../../electron/sync/entities/settingsSync';
let raw: DatabaseSync;
afterEach(() => raw?.close());
function setup() {
  raw = new DatabaseSync(':memory:');
  raw.exec(`CREATE TABLE settings (tenant_id TEXT, key TEXT, value TEXT, updated_at TEXT, sync_status TEXT, PRIMARY KEY(tenant_id,key))`);
  state.db = Object.assign(raw, { transaction: (fn: (...args: unknown[]) => unknown) => fn }) as unknown as Database.Database;
}
it('preserves a pending local disable when an older cloud record uses a different date format', async () => {
  setup();
  raw.prepare('INSERT INTO settings VALUES (?, ?, ?, ?, ?)').run('shop', 'feature_flags', '{"scrap":false}', '2026-11-05 09:00:01', 'PENDING');
  state.remote = [{ tenant_id: 'shop', key: 'feature_flags', value: { scrap: true }, updated_at: '2026-11-05T09:00:00Z' }];
  await pullSettings('token', 'shop');
  expect(raw.prepare('SELECT value, sync_status FROM settings').get()).toEqual({ value: '{"scrap":false}', sync_status: 'PENDING' });
});

it('accepts a remote module change after local settings have synced', async () => {
  setup();
  raw.prepare('INSERT INTO settings VALUES (?, ?, ?, ?, ?)').run('shop', 'feature_flags', '{"scrap":true}', '2026-11-05 09:00:00', 'SYNCED');
  state.remote = [{ tenant_id: 'shop', key: 'feature_flags', value: { scrap: false }, updated_at: '2026-11-05T09:00:01Z' }];
  await pullSettings('token', 'shop');
  expect(raw.prepare('SELECT value FROM settings').get()).toEqual({ value: '{"scrap":false}' });
});

it.each(['PENDING','FAILED'])('keeps an unacknowledged ordinary setting even when the cloud clock is ahead: %s',async status=>{
  setup();
  raw.prepare('INSERT INTO settings VALUES (?, ?, ?, ?, ?)').run('shop','shop_name','Correct local name','2026-11-05 09:00:00',status);
  state.remote=[{tenant_id:'shop',key:'shop_name',value:'Different cloud name',updated_at:'2099-01-01T00:00:00Z'}];
  await pullSettings('token','shop');
  expect(raw.prepare('SELECT value,sync_status FROM settings').get()).toEqual({value:'Correct local name',sync_status:status});
});

it('does not acknowledge a feature selection edited during a push', async () => {
  setup();
  raw.prepare('INSERT INTO settings VALUES (?, ?, ?, ?, ?)').run('shop', 'feature_flags', '{"scrap":true}', '2026-11-05 09:00:00', 'PENDING');
  vi.mocked(pushBatch).mockImplementationOnce(async () => {
    raw.prepare('UPDATE settings SET value = ?, updated_at = ?').run('{"scrap":false}', '2026-11-05 09:00:01');
    return ['feature_flags'];
  });
  await syncSettings('token', 'shop');
  expect(raw.prepare('SELECT value, sync_status FROM settings').get()).toEqual({ value: '{"scrap":false}', sync_status: 'PENDING' });
  acknowledgeFeatureFlags(state.db).run('shop', '{"scrap":false}', '2026-11-05 09:00:01');
  expect(raw.prepare('SELECT sync_status FROM settings').get()).toEqual({ sync_status: 'SYNCED' });
});

it('LAN rejects an older module snapshot and accepts a newer one across date formats', async () => {
  setup();
  const { upsertRows } = await import('../../electron/db/statements/sync/lanUpsert');
  const cols = ['tenant_id', 'key', 'value', 'updated_at', 'sync_status'];
  const stmt = upsertRows(state.db, 'settings', cols, ['tenant_id', 'key'], ['value', 'updated_at', 'sync_status']);
  stmt.run({ tenant_id: 'shop', key: 'feature_flags', value: '{"scrap":false}', updated_at: '2026-11-05 09:00:01', sync_status: 'PENDING' });
  stmt.run({ tenant_id: 'shop', key: 'feature_flags', value: '{"scrap":true}', updated_at: '2026-11-05T09:00:00Z', sync_status: 'PENDING' });
  expect(raw.prepare('SELECT value FROM settings').get()?.value).toBe('{"scrap":false}');
  stmt.run({ tenant_id: 'shop', key: 'feature_flags', value: '{"scrap":true}', updated_at: '2026-11-05T09:00:02Z', sync_status: 'PENDING' });
  expect(raw.prepare('SELECT value FROM settings').get()?.value).toBe('{"scrap":true}');
}, 15000);
