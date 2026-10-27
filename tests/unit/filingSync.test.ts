// In-memory characterization of migrated schema and both invoice sync payloads.
import { DatabaseSync } from 'node:sqlite';
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createCoreTables } from '../../electron/db/schemaCoreTables';
import { createExtendedTables } from '../../electron/db/schemaExtendedTables';
import { ensureSchemaColumns } from '../../electron/db/schemaColumns';
import { runColumnMigrations } from '../../electron/db/migrationsColumns';
import { MIGRATIONS } from '../../electron/db/migrations';
import { runMigrations } from '../../electron/db/migrations/runner';
import { listPendingOps } from '../../electron/db/statements/outbox';
const state = vi.hoisted(() => ({ db: null as unknown as Database.Database, pushed: [] as Record<string, unknown>[], remote: [] as Record<string, unknown>[] }));
vi.mock('../../electron/db/localDb', () => ({ getDb: () => state.db }));
vi.mock('../../electron/sync/syncProgress', () => ({ notifyPullProgress: vi.fn() }));
vi.mock('../../electron/sync/syncTransport', () => ({
  pushBatch: async (_path: string, _token: string, rows: Record<string, unknown>[]) => { state.pushed = rows; return rows.map(row => row.invoice_id); },
  reconcilePending: vi.fn(),
  pullPaginated: async (args: { processPage: (rows: Record<string, unknown>[]) => void }) => { args.processPage(state.remote); return true; },
}));
import { syncInvoices, pullInvoices } from '../../electron/sync/entities/salesDocsSync';
let raw: DatabaseSync;
beforeEach(() => {
  raw = new DatabaseSync(':memory:');
  state.db = Object.assign(raw, {
    transaction: (fn: (...args: unknown[]) => unknown) => (...args: unknown[]) => { raw.exec('SAVEPOINT test_sync'); try { const result = fn(...args); raw.exec('RELEASE test_sync'); return result; } catch (error) { raw.exec('ROLLBACK TO test_sync; RELEASE test_sync'); throw error; } },
    pragma: (sql: string) => raw.exec(`PRAGMA ${sql}`),
  }) as unknown as Database.Database;
  createCoreTables(state.db); createExtendedTables(state.db); ensureSchemaColumns(state.db); runColumnMigrations(state.db);
  runMigrations(state.db, MIGRATIONS);
  state.remote = []; state.pushed = [];
});
afterEach(() => raw.close());
function insert() {
  raw.exec("INSERT INTO invoices (invoice_id,tenant_id,invoice_number,invoice_type,subtotal,tax_total,grand_total,bill_purpose,counts_in_revenue,stock_applied) VALUES ('i','t','GST-1','GST',100,0,100,'FILING_ONLY',0,0)");
}
it('migration keeps legacy defaults and runs only once', () => {
  expect(runMigrations(state.db, MIGRATIONS).applied).toEqual([]);
  raw.exec("INSERT INTO invoices (invoice_id,tenant_id,invoice_number,invoice_type,subtotal,tax_total,grand_total) VALUES ('old','t','OLD','GST',100,0,100)");
  expect(raw.prepare("SELECT counts_in_revenue,bill_purpose,stock_applied FROM invoices WHERE invoice_id='old'").get()).toMatchObject({ counts_in_revenue: 1, bill_purpose: 'SALE', stock_applied: 1 });
});
it('legacy push and outbox ops carry all three stored columns', async () => {
  insert();
  const ops = listPendingOps(state.db, 100) as { entity: string; payload: string }[];
  expect(JSON.parse(ops.find(op => op.entity === 'invoices')!.payload)).toMatchObject({ counts_in_revenue: 0, bill_purpose: 'FILING_ONLY', stock_applied: 0 });
  await syncInvoices('token', 't');
  expect(state.pushed[0]).toMatchObject({ counts_in_revenue: 0, bill_purpose: 'FILING_ONLY', stock_applied: 0 });
});
it.each([true, false])('legacy pull stores metadata and supplies old-server defaults (%s)', hasMetadata => {
  state.remote = [{ invoice_id: 'remote', invoice_number: 'GST-2', invoice_type: 'GST', tenant_id: 't', subtotal: 100, tax_total: 0, grand_total: 100, ...(hasMetadata ? { counts_in_revenue: 0, stock_applied: 0, bill_purpose: 'FILING_ONLY' } : {}), items: [] }];
  return pullInvoices('token', 't').then(() => {
    expect(raw.prepare("SELECT counts_in_revenue,stock_applied,bill_purpose FROM invoices WHERE invoice_id='remote'").get()).toMatchObject({ counts_in_revenue: hasMetadata ? 0 : 1, stock_applied: hasMetadata ? 0 : 1, bill_purpose: hasMetadata ? 'FILING_ONLY' : 'SALE' });
  });
});
