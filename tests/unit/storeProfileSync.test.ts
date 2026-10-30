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
import { pullSettings } from '../../electron/sync/entities/settingsSync';

let raw: DatabaseSync;
afterEach(() => raw?.close());
it('pulls country and VAT price basis with the existing shared-settings contract', async () => {
  raw = new DatabaseSync(':memory:');
  raw.exec(`CREATE TABLE settings (tenant_id TEXT, key TEXT, value TEXT, updated_at TEXT, sync_status TEXT, PRIMARY KEY(tenant_id,key))`);
  state.db = Object.assign(raw, { transaction: (fn: (...args: unknown[]) => unknown) => fn }) as unknown as Database.Database;
  state.remote = [
    { tenant_id: 't', key: 'store_country', value: 'AE', updated_at: '2026-10-29T00:00:00Z' },
    { tenant_id: 't', key: 'vat_price_inclusive', value: 'true', updated_at: '2026-10-29T00:00:00Z' },
  ];
  await pullSettings('token', 't');
  expect(raw.prepare('SELECT key, value FROM settings ORDER BY key').all()).toEqual([
    { key: 'store_country', value: 'AE' }, { key: 'vat_price_inclusive', value: 'true' },
  ]);
});
