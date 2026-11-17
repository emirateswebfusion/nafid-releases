import { DatabaseSync } from 'node:sqlite';
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createCoreTables } from '../../electron/db/schemaCoreTables';
import { createExtendedTables } from '../../electron/db/schemaExtendedTables';
import { m024PurchaseInterstate } from '../../electron/db/migrations/024-purchase-interstate';

const state = vi.hoisted(() => ({ db: null as unknown as Database.Database, rows: [] as Record<string, unknown>[] }));
vi.mock('../../electron/db/localDb', () => ({ getDb: () => state.db }));
vi.mock('../../electron/sync/syncProgress', () => ({ notifyPullProgress: vi.fn() }));
vi.mock('../../electron/sync/syncTransport', () => ({
  pushBatch: vi.fn(async () => []), reconcilePending: vi.fn(() => 0),
  pullPaginated: async (args: { processPage: (rows: Record<string, unknown>[]) => number }) => {
    args.processPage(state.rows);
    return { hasChanged: true, count: state.rows.length, reconciled: 0, failed: false };
  },
}));
import { pullPurchaseBills } from '../../electron/sync/entities/stockDocsSync';

let raw: DatabaseSync;
beforeEach(() => {
  raw = new DatabaseSync(':memory:');
  state.db = Object.assign(raw, { transaction: (fn: (...args: unknown[]) => unknown) => (...args: unknown[]) => fn(...args) }) as unknown as Database.Database;
  createCoreTables(state.db);
  createExtendedTables(state.db);
  m024PurchaseInterstate.up(state.db);
  state.rows = [{ purchase_bill_id: 'bill', bill_number: 'P-1', supplier_name: 'Supplier',
    total_amount: 118, bill_type: 'GST', payment_type: 'CASH', is_interstate: true,
    created_at: '2026-11-17T10:00:00Z', updated_at: '2026-11-17T10:00:00Z', items: [] }];
});
afterEach(() => raw.close());

it('characterizes old clients: missing interstate flag downloads as an intrastate purchase', async () => {
  delete state.rows[0].is_interstate;
  await pullPurchaseBills('token', 'shop');
  expect(raw.prepare('SELECT is_interstate FROM purchase_bills').get()?.is_interstate).toBe(0);
});
it('retains interstate tax classification on repeated downloads and protects pending local edits', async () => {
  await pullPurchaseBills('token', 'shop');
  await pullPurchaseBills('token', 'shop');
  expect(raw.prepare('SELECT is_interstate FROM purchase_bills').get()?.is_interstate).toBe(1);
  raw.exec("UPDATE purchase_bills SET is_interstate = 0, sync_status = 'PENDING', updated_at = '2026-11-18T00:00:00Z'");
  await pullPurchaseBills('token', 'shop');
  expect(raw.prepare('SELECT is_interstate, sync_status FROM purchase_bills').get()).toEqual({ is_interstate: 0, sync_status: 'PENDING' });
});
