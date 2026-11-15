import { DatabaseSync } from 'node:sqlite';
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ db: null as unknown as Database.Database, rows: [] as Record<string, unknown>[] }));
vi.mock('../../electron/db/localDb', () => ({ getDb: () => state.db }));
vi.mock('../../electron/sync/syncProgress', () => ({ notifyPullProgress: vi.fn() }));
vi.mock('../../electron/sync/syncTransport', () => ({
  pushBatch: vi.fn(),
  reconcilePending: vi.fn(() => 0),
  pullPaginated: async (args: { processPage: (rows: Record<string, unknown>[]) => number }) => {
    args.processPage(state.rows);
    return { hasChanged: true, count: state.rows.length, reconciled: 0, failed: false };
  },
}));
import { pullPartyLedger, syncPartyLedger } from '../../electron/sync/entities/partiesSync';
import { pushBatch } from '../../electron/sync/syncTransport';

let raw: DatabaseSync;
beforeEach(() => {
  raw = new DatabaseSync(':memory:');
  state.db = Object.assign(raw, {
    transaction: (fn: (...args: unknown[]) => unknown) => (...args: unknown[]) => {
      raw.exec('SAVEPOINT ledger_pull');
      try { const result = fn(...args); raw.exec('RELEASE ledger_pull'); return result; }
      catch (error) { raw.exec('ROLLBACK TO ledger_pull; RELEASE ledger_pull'); throw error; }
    },
  }) as unknown as Database.Database;
  raw.exec(`
    CREATE TABLE settings (tenant_id TEXT, key TEXT, value TEXT);
    CREATE TABLE parties (party_id TEXT PRIMARY KEY, tenant_id TEXT, balance REAL, gst_balance REAL,
      estimate_balance REAL, last_transaction_date TEXT);
    CREATE TABLE party_ledger (ledger_id TEXT PRIMARY KEY, party_id TEXT, tenant_id TEXT,
      transaction_date TEXT, description TEXT, credit_amount REAL, debit_amount REAL, running_balance REAL,
      balance_type TEXT, payment_method TEXT, reference_number TEXT, created_by TEXT, created_by_name TEXT,
      is_deleted INTEGER, sync_status TEXT, created_at TEXT, updated_at TEXT);
    INSERT INTO parties VALUES ('old', 'shop', 100, 100, 0, '2026-11-01');
    INSERT INTO parties VALUES ('new', 'shop', 0, 0, 0, NULL);
    INSERT INTO parties VALUES ('opening-only', 'shop', 75, 75, 0, NULL);
    INSERT INTO parties VALUES ('other-shop', 'other', 300, 300, 0, NULL);
    INSERT INTO party_ledger VALUES ('entry', 'old', 'shop', '2026-11-01', 'Bill', 100, 0, 100, 'GST',
      NULL, NULL, NULL, NULL, 0, 'SYNCED', '2026-11-01', '2026-11-01');
    ALTER TABLE party_ledger ADD COLUMN row_version INTEGER DEFAULT 0;
  `);
  state.rows = [{ ledger_id: 'entry', party_id: 'old', transaction_date: '2026-11-01', description: 'Bill',
    credit_amount: 100, debit_amount: 0, balance_type: 'GST', is_deleted: false,
    created_at: '2026-11-01T00:00:00Z', updated_at: '2026-11-15T10:00:00Z' }];
});
afterEach(() => raw.close());

it('keeps an edit made during upload pending until its own version is acknowledged', async () => {
  raw.exec("UPDATE party_ledger SET sync_status = 'PENDING'");
  vi.mocked(pushBatch).mockImplementationOnce(async () => {
    // Outbox triggers increment row_version even when two edits share updated_at's second.
    raw.exec('UPDATE party_ledger SET credit_amount = 150, row_version = row_version + 1');
    return ['entry'];
  });
  await syncPartyLedger('token', 'shop');
  expect(raw.prepare('SELECT sync_status FROM party_ledger').get()?.sync_status).toBe('PENDING');
  vi.mocked(pushBatch).mockResolvedValueOnce(['entry']);
  await syncPartyLedger('token', 'shop');
  expect(raw.prepare('SELECT sync_status FROM party_ledger').get()?.sync_status).toBe('SYNCED');
});

it('characterizes a repeated download: balances remain stable and unrelated opening balances survive', async () => {
  await pullPartyLedger('token', 'shop');
  await pullPartyLedger('token', 'shop');
  expect(raw.prepare("SELECT balance FROM parties WHERE party_id = 'old'").get()?.balance).toBe(100);
  expect(raw.prepare("SELECT balance FROM parties WHERE party_id = 'opening-only'").get()?.balance).toBe(75);
  expect(raw.prepare("SELECT balance FROM parties WHERE party_id = 'other-shop'").get()?.balance).toBe(300);
});

it('zeros all balances and clears the transaction date when the last entry is deleted remotely', async () => {
  state.rows[0].is_deleted = true;
  await pullPartyLedger('token', 'shop');
  expect(raw.prepare("SELECT balance, gst_balance, estimate_balance, last_transaction_date FROM parties WHERE party_id = 'old'").get())
    .toEqual({ balance: 0, gst_balance: 0, estimate_balance: 0, last_transaction_date: null });
});

it('moves a synced entry to its cloud party and recalculates both old and new accounts', async () => {
  state.rows[0].party_id = 'new';
  await pullPartyLedger('token', 'shop');
  expect(raw.prepare('SELECT party_id FROM party_ledger').get()?.party_id).toBe('new');
  expect(raw.prepare("SELECT balance FROM parties WHERE party_id = 'old'").get()?.balance).toBe(0);
  expect(raw.prepare("SELECT balance FROM parties WHERE party_id = 'new'").get()?.balance).toBe(100);
});

it('keeps a local pending edit and its balance while a stale cloud row is downloaded', async () => {
  raw.exec("UPDATE party_ledger SET credit_amount = 150, sync_status = 'PENDING'");
  raw.exec("UPDATE parties SET balance = 150, gst_balance = 150 WHERE party_id = 'old'");
  state.rows[0].is_deleted = true;
  await pullPartyLedger('token', 'shop');
  expect(raw.prepare('SELECT credit_amount, is_deleted, sync_status FROM party_ledger').get())
    .toEqual({ credit_amount: 150, is_deleted: 0, sync_status: 'PENDING' });
  expect(raw.prepare("SELECT balance FROM parties WHERE party_id = 'old'").get()?.balance).toBe(150);
});

it('rolls back a page and refuses to acknowledge it if any ledger write fails', async () => {
  state.rows[0].credit_amount = 200;
  state.rows.push({ ...state.rows[0], ledger_id: 'bad' });
  raw.exec("CREATE TRIGGER reject_bad BEFORE INSERT ON party_ledger WHEN NEW.ledger_id = 'bad' BEGIN SELECT RAISE(ABORT, 'test write failure'); END");
  await expect(pullPartyLedger('token', 'shop')).rejects.toThrow('test write failure');
  expect(raw.prepare('SELECT credit_amount FROM party_ledger').get()?.credit_amount).toBe(100);
});
