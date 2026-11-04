import { DatabaseSync } from 'node:sqlite';
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createCoreTables } from '../../electron/db/schemaCoreTables';
import { createExtendedTables } from '../../electron/db/schemaExtendedTables';
import { ensureSchemaColumns } from '../../electron/db/schemaColumns';
import { runColumnMigrations } from '../../electron/db/migrationsColumns';

const state = vi.hoisted(() => ({
  db: null as unknown as Database.Database,
  remote: [] as Record<string, unknown>[],
}));

vi.mock('../../electron/db/localDb', () => ({ getDb: () => state.db }));
vi.mock('../../electron/sync/syncProgress', () => ({ notifyPullProgress: vi.fn() }));
vi.mock('../../electron/sync/syncTransport', () => ({
  pushBatch: vi.fn(),
  reconcilePending: vi.fn(),
  pullPaginated: async (args: { processPage: (rows: Record<string, unknown>[]) => void }) => {
    args.processPage(state.remote);
    return { hasChanged: true, count: state.remote.length, reconciled: 0, failed: false };
  },
}));

import { updateParty } from '../../electron/services/partiesService';
import { pullParties } from '../../electron/sync/entities/partiesSync';

let raw: DatabaseSync;

beforeEach(() => {
  raw = new DatabaseSync(':memory:');
  state.db = Object.assign(raw, {
    transaction: (fn: (...args: unknown[]) => unknown) => (...args: unknown[]) => {
      raw.exec('SAVEPOINT test_sync');
      try {
        const result = fn(...args);
        raw.exec('RELEASE test_sync');
        return result;
      } catch (error) {
        raw.exec('ROLLBACK TO test_sync; RELEASE test_sync');
        throw error;
      }
    },
    pragma: (sql: string) => raw.exec(`PRAGMA ${sql}`),
  }) as unknown as Database.Database;

  createCoreTables(state.db);
  createExtendedTables(state.db);
  ensureSchemaColumns(state.db);
  runColumnMigrations(state.db);
  state.remote = [];
});

afterEach(() => {
  raw.close();
});

it('a deleted copy in the cloud never hides a live customer on a fresh download', async () => {
  // A new terminal downloads the live account and an old deleted copy with the same name and phone (Paradise had
  // 106 such pairs after its reset; 70 live customers disappeared). Ledger rows arrive later, so nothing guards it.
  const row = (id: string, deleted: boolean) => ({ party_id: id, tenant_id: 'tenant-1', name: 'Manu Gagan', phone: '9000000001', party_type: 'CUSTOMER', balance: deleted ? 0 : 9728, is_deleted: deleted, updated_at: '2026-11-02T03:51:00Z', created_at: '2026-11-02T03:51:00Z' });
  state.remote = [row('live', false), row('old-copy', true)];
  await pullParties('token', 'tenant-1');

  const live = raw.prepare("SELECT is_deleted FROM parties WHERE party_id = 'live'").get() as { is_deleted: number };
  expect(live.is_deleted).toBe(0);
  const copy = raw.prepare("SELECT is_deleted FROM parties WHERE party_id = 'old-copy'").get() as { is_deleted: number };
  expect(copy.is_deleted).toBe(1);
});

it('preserves local pending phone number update from being overwritten by older cloud pull', async () => {
  // 1. Initial party exists with old phone and is SYNCED
  raw.exec(`
    INSERT INTO parties (party_id, tenant_id, name, phone, sync_status, created_at, updated_at)
    VALUES ('party-1', 'tenant-1', 'Rahul Traders', '9876543210', 'SYNCED', '2026-10-27 10:00:00', '2026-10-27 10:00:00')
  `);

  // 2. User updates phone number locally in POS
  const newPhone = '9998887776';
  const res = updateParty({
    party_id: 'party-1',
    name: 'Rahul Traders',
    phone: `  ${newPhone}  `,
    tenant_id: 'tenant-1',
  });
  expect(res.success).toBe(true);

  // Verify DB row has new phone and sync_status = PENDING
  const afterUpdate = raw.prepare("SELECT phone, sync_status FROM parties WHERE party_id = 'party-1'").get() as { phone: string; sync_status: string };
  expect(afterUpdate.phone).toBe(newPhone);
  expect(afterUpdate.sync_status).toBe('PENDING');

  // 3. Cloud pull runs before push (cloud still has the old phone or null)
  state.remote = [{
    party_id: 'party-1',
    tenant_id: 'tenant-1',
    name: 'Rahul Traders',
    phone: '9876543210', // old phone on cloud
    party_type: 'CUSTOMER',
    sync_status: 'SYNCED',
    created_at: '2026-10-27T10:00:00.000Z',
    updated_at: '2026-10-27T12:00:00.000Z', // ISO string
  }];

  await pullParties('dummy-token', 'tenant-1');

  // 4. Verify local party phone was NOT clobbered by cloud pull
  const afterPull = raw.prepare("SELECT phone, sync_status FROM parties WHERE party_id = 'party-1'").get() as { phone: string; sync_status: string };
  expect(afterPull.phone).toBe(newPhone);
  expect(afterPull.sync_status).toBe('PENDING');
});

it('preserves newly added phone on previously blank party from being overwritten to blank', async () => {
  // 1. Initial party exists with NULL phone (blank) and is SYNCED
  raw.exec(`
    INSERT INTO parties (party_id, tenant_id, name, phone, sync_status, created_at, updated_at)
    VALUES ('party-2', 'tenant-1', 'Vinod', NULL, 'SYNCED', '2026-10-27 10:00:00', '2026-10-27 10:00:00')
  `);

  // 2. User adds phone number locally in POS
  const newPhone = '9123456789';
  const res = updateParty({
    party_id: 'party-2',
    name: 'Vinod',
    phone: newPhone,
    tenant_id: 'tenant-1',
  });
  expect(res.success).toBe(true);

  // 3. Cloud pull runs where phone is null
  state.remote = [{
    party_id: 'party-2',
    tenant_id: 'tenant-1',
    name: 'Vinod',
    phone: null,
    party_type: 'CUSTOMER',
    sync_status: 'SYNCED',
    created_at: '2026-10-27T10:00:00.000Z',
    updated_at: '2026-10-27T12:00:00.000Z',
  }];

  await pullParties('dummy-token', 'tenant-1');

  // 4. Local newly added phone number must remain intact
  const row = raw.prepare("SELECT phone, sync_status FROM parties WHERE party_id = 'party-2'").get() as { phone: string; sync_status: string };
  expect(row.phone).toBe(newPhone);
  expect(row.sync_status).toBe('PENDING');
});

it('refuses an update without a name instead of erasing the party name', () => {
  raw.exec(`
    INSERT INTO parties (party_id, tenant_id, name, phone, sync_status, created_at, updated_at)
    VALUES ('party-3', 'tenant-1', 'Anu Stores', '9000000000', 'SYNCED', '2026-10-27 10:00:00', '2026-10-27 10:00:00')
  `);
  expect(updateParty({ party_id: 'party-3', tenant_id: 'tenant-1' })).toMatchObject({ success: false });
  expect(updateParty({ party_id: 'party-3', tenant_id: 'tenant-1', name: '   ' })).toMatchObject({ success: false });
  const row = raw.prepare("SELECT name, sync_status FROM parties WHERE party_id = 'party-3'").get() as { name: string; sync_status: string };
  expect(row).toEqual({ name: 'Anu Stores', sync_status: 'SYNCED' });
});
