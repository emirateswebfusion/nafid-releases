import { DatabaseSync } from 'node:sqlite';
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createCoreTables } from '../../electron/db/schemaCoreTables';
import { createExtendedTables } from '../../electron/db/schemaExtendedTables';
import { ensureSchemaColumns } from '../../electron/db/schemaColumns';
import { m017UaeEinvoicing } from '../../electron/db/migrations/017-uae-einvoicing';
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

import { pullCustomers, pullLoyaltyTransactions } from '../../electron/sync/entities/partiesSync';

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
  m017UaeEinvoicing.up(state.db); // versioned migrations run before any sync at startup
  raw.exec('PRAGMA foreign_keys = ON;');
  state.remote = [];
});

afterEach(() => {
  raw.close();
});

it('merges duplicate local customer into canonical cloud customer_id and reassigns invoices and loyalty', async () => {
  // 1. Local customer exists with older generated ID and phone
  raw.exec(`
    INSERT INTO customers (customer_id, tenant_id, name, phone, sync_status, created_at, updated_at)
    VALUES ('local-cust-1', 'tenant-1', 'Kottaram Trading', '9744903939', 'SYNCED', '2026-10-27 10:00:00', '2026-10-27 10:00:00')
  `);
  raw.exec(`
    INSERT INTO invoices (invoice_id, tenant_id, invoice_number, grand_total, customer_id, sync_status)
    VALUES ('inv-1', 'tenant-1', 'INV-001', 100, 'local-cust-1', 'SYNCED')
  `);

  // 2. Cloud pull arrives with canonical customer_id for the same phone
  state.remote = [{
    customer_id: 'cloud-cust-canonical',
    tenant_id: 'tenant-1',
    name: 'Kottaram Trading Company',
    phone: '9744903939',
    total_points_earned: 50,
    total_points_redeemed: 0,
    current_points_balance: 50,
    sync_status: 'SYNCED',
    created_at: '2026-10-27T10:00:00.000Z',
    updated_at: '2026-10-27T12:00:00.000Z',
  }];

  await pullCustomers('dummy-token', 'tenant-1');

  // Verify canonical customer exists and local duplicate is soft-deleted
  const canonical = raw.prepare("SELECT customer_id, name, phone, is_deleted FROM customers WHERE customer_id = 'cloud-cust-canonical'").get() as { customer_id: string; name: string; phone: string; is_deleted: number };
  expect(canonical).toBeDefined();
  expect(canonical.phone).toBe('9744903939');
  expect(canonical.is_deleted).toBe(0);

  const localDup = raw.prepare("SELECT customer_id, phone, is_deleted FROM customers WHERE customer_id = 'local-cust-1'").get() as { customer_id: string; phone: string | null; is_deleted: number };
  expect(localDup.phone).toBeNull();
  expect(localDup.is_deleted).toBe(1);

  // Invoices reassigned
  const inv = raw.prepare("SELECT customer_id FROM invoices WHERE invoice_id = 'inv-1'").get() as { customer_id: string };
  expect(inv.customer_id).toBe('cloud-cust-canonical');
});

it('pullLoyaltyTransactions inserts without foreign key error when referencing canonical or stub customer', async () => {
  // Pull loyalty transaction for a customer that does not yet exist locally
  state.remote = [{
    transaction_id: 'lt-1',
    tenant_id: 'tenant-1',
    customer_id: 'customer-new-42',
    invoice_id: null,
    transaction_type: 'EARNED',
    points: 25,
    points_balance_before: 0,
    points_balance_after: 25,
    created_at: '2026-10-28T12:00:00.000Z',
  }];

  const changed = await pullLoyaltyTransactions('dummy-token', 'tenant-1');
  expect(changed).toBe(true);

  const lt = raw.prepare("SELECT transaction_id, customer_id, points FROM loyalty_transactions WHERE transaction_id = 'lt-1'").get() as { transaction_id: string; customer_id: string; points: number };
  expect(lt).toBeDefined();
  expect(lt.points).toBe(25);
  expect(lt.customer_id).toBe('customer-new-42');

  // Foreign keys check should be clean
  const fkCheck = raw.prepare('PRAGMA foreign_key_check').all();
  expect(fkCheck).toEqual([]);
});
