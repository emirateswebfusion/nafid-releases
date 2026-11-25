import { DatabaseSync } from 'node:sqlite';
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createCoreTables } from '../../electron/db/schemaCoreTables';
import { createExtendedTables } from '../../electron/db/schemaExtendedTables';
import { ensureSchemaColumns } from '../../electron/db/schemaColumns';
import { runColumnMigrations } from '../../electron/db/migrationsColumns';

const state = vi.hoisted(() => ({ db: null as unknown as Database.Database, remote: [] as Record<string, unknown>[] }));
vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => [] } }));
vi.mock('../../electron/db/localDb', () => ({ getDb: () => state.db }));
vi.mock('../../electron/sync/syncProgress', () => ({ notifyPullProgress: vi.fn(), notifyRenderer: vi.fn() }));
vi.mock('../../electron/services/cashDrawerService', () => ({
  computeDrawerTotals: (_db: unknown, _tenant: string, drawer: Record<string, unknown>) => ({
    cash_sales: drawer.cash_sales, cash_in: drawer.cash_in, cash_out: drawer.cash_out, expected: drawer.current_cash,
  }),
}));
vi.mock('../../electron/sync/syncTransport', async importOriginal => ({
  ...await importOriginal<typeof import('../../electron/sync/syncTransport')>(),
  pushBatch: vi.fn(),
  pullPaginated: async (args: { processPage: (rows: Record<string, unknown>[]) => unknown }) => {
    args.processPage(state.remote);
    return { hasChanged: true, count: state.remote.length, reconciled: 0, failed: false };
  },
}));
import { pullCashDrawer, pullCashTransactions } from '../../electron/sync/entities/cashSync';

let raw: DatabaseSync;
beforeEach(() => {
  raw = new DatabaseSync(':memory:');
  const prepare = raw.prepare.bind(raw);
  state.db = Object.assign(raw, {
    prepare: (sql: string) => {
      const statement = prepare(sql);
      statement.setAllowUnknownNamedParameters(true);
      return statement;
    },
    transaction: (fn: (...args: unknown[]) => unknown) => (...args: unknown[]) => {
      raw.exec('SAVEPOINT cash_pull');
      try { const result=fn(...args);raw.exec('RELEASE cash_pull');return result; }
      catch(error){raw.exec('ROLLBACK TO cash_pull; RELEASE cash_pull');throw error;}
    },
    pragma: (sql: string) => raw.exec(`PRAGMA ${sql}`),
  }) as unknown as Database.Database;
  createCoreTables(state.db);
  createExtendedTables(state.db);
  ensureSchemaColumns(state.db);
  runColumnMigrations(state.db);
  raw.exec(`INSERT INTO cash_drawer
    (drawer_id, tenant_id, business_date, status, opening_balance, cash_sales, current_cash, sync_status)
    VALUES ('local', 'shop', '2026-11-06', 'OPEN', 14700, 9990, 21240, 'SYNCED')`);
  state.remote = [{
    drawer_id: 'local', tenant_id: 'shop', business_date: '2026-11-06', status: 'CLOSED',
    opening_balance: 14700, cash_sales: 9000, cash_in: 0, cash_out: 3450,
    current_cash: 20250, expected_closing: 20250, actual_cash: 20200, cash_short: 50,
    cash_excess: 0, closing_remarks: 'Counted on primary', closed_by: 'cashier',
    opened_at: '2026-11-06T03:24:00Z', closed_at: '2026-11-06T16:00:00Z',
    created_at: '2026-11-06T03:24:00Z', updated_at: '2026-11-06T16:00:00Z',
  }];
});
afterEach(() => raw.close());
it('a rejected cash row rolls back its whole download page instead of silently skipping the row',async()=>{
  const row={transaction_id:'good',drawer_id:'local',type:'CASH_OUT',amount:10,transaction_date:'2026-11-06T03:24:00Z',created_at:'2026-11-06T03:24:00Z',updated_at:'2026-11-06T03:24:00Z'};
  state.remote=[row,{...row,transaction_id:'bad',amount:{invalid:true}}];
  await expect(pullCashTransactions('token','shop')).rejects.toThrow();
  expect(raw.prepare('SELECT transaction_id FROM cash_transactions').all()).toEqual([]);
});

it.each(['PENDING','FAILED'])('two cloud downloads cannot acknowledge and replace an unsent cash entry: %s',async status=>{
  raw.prepare(`INSERT INTO cash_transactions(transaction_id,tenant_id,drawer_id,type,amount,sync_status,transaction_date,updated_at)
    VALUES('entry','shop','local','CASH_OUT',500,?,'2026-11-06 03:24:00','2026-11-06T03:24:00.000Z')`).run(status);
  state.remote=[{transaction_id:'entry',drawer_id:'local',type:'CASH_OUT',amount:10,transaction_date:'2026-11-06T03:24:00Z',created_at:'2026-11-06T03:24:00Z',updated_at:'2026-11-06T03:24:00Z'}];
  await pullCashTransactions('token','shop');await pullCashTransactions('token','shop');
  expect(raw.prepare("SELECT amount,sync_status FROM cash_transactions WHERE transaction_id='entry'").get()).toEqual({amount:500,sync_status:status});
});

it('accepts another terminal closing an open drawer without reopening or changing its frozen totals', async () => {
  await pullCashDrawer('token', 'shop');
  expect(raw.prepare('SELECT status, current_cash, cash_sales, actual_cash, cash_short, closed_by, closing_remarks FROM cash_drawer').get()).toEqual({
    status: 'CLOSED', current_cash: 20250, cash_sales: 9000, actual_cash: 20200,
    cash_short: 50, closed_by: 'cashier', closing_remarks: 'Counted on primary',
  });
  expect(raw.prepare('SELECT closed_at FROM cash_drawer').get()?.closed_at).toBeTruthy();
});

it('accepts a same-business-day close when terminals originally used different drawer IDs', async () => {
  state.remote[0].drawer_id = 'primary';
  await pullCashDrawer('token', 'shop');
  expect(raw.prepare('SELECT drawer_id, status, current_cash FROM cash_drawer').all()).toEqual([
    { drawer_id: 'primary', status: 'CLOSED', current_cash: 20250 },
  ]);
});

it('keeps the existing local balance protection for a still-open remote drawer', async () => {
  state.remote[0].status = 'OPEN';
  state.remote[0].closed_at = null;
  await pullCashDrawer('token', 'shop');
  expect(raw.prepare('SELECT status, cash_sales, current_cash FROM cash_drawer').get()).toEqual({
    status: 'OPEN', cash_sales: 9990, current_cash: 21240,
  });
});
