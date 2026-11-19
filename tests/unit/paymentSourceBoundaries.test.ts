import { DatabaseSync } from 'node:sqlite';
import type Database from 'better-sqlite3';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { createCoreTables } from '../../electron/db/schemaCoreTables';
import { createExtendedTables } from '../../electron/db/schemaExtendedTables';
const state = vi.hoisted(() => ({ db: null as unknown as Database.Database }));
vi.mock('../../electron/db/localDb', () => ({ getDb: () => state.db }));
import { addSource, updateSource } from '../../electron/services/paymentSourcesService';
let raw: DatabaseSync;
const source = { source_id: 'bank', tenant_id: 't', type: 'BANK', name: 'Bank', is_default: true };
beforeEach(() => {
  raw = new DatabaseSync(':memory:');
  const prepare = raw.prepare.bind(raw);
  // Match better-sqlite3: omitted optional bindings are SQL NULL.
  Object.defineProperty(raw, 'prepare', { value: (sql: string) => {
    const stmt = prepare(sql);
    const run = stmt.run.bind(stmt);
    Object.defineProperty(stmt, 'run', { value: (...args: Parameters<typeof run>) =>
      run(...args.map(value => value === undefined ? null : value)) });
    return stmt;
  } });
  state.db = Object.assign(raw, { transaction: (fn: () => unknown) => () => {
    raw.exec('SAVEPOINT account'); try { const r = fn(); raw.exec('RELEASE account'); return r; }
    catch (e) { raw.exec('ROLLBACK TO account; RELEASE account'); throw e; }
  } }) as unknown as Database.Database;
  createCoreTables(state.db); createExtendedTables(state.db);
  expect(addSource({ ...source, opening_balance: 0 }).success).toBe(true);
});
afterEach(() => raw.close());
it.each([-1, NaN, Infinity, 'invalid', '1,250'])('rejects invalid opening balance %s without clearing defaults', opening_balance => {
  expect(addSource({ ...source, source_id: 'bad', opening_balance }).success).toBe(false);
  expect(updateSource({ ...source, opening_balance }).success).toBe(false);
  expect(raw.prepare('SELECT COUNT(*) n FROM payment_sources').get()?.n).toBe(1);
  expect(raw.prepare("SELECT opening_balance,current_balance,is_default FROM payment_sources WHERE source_id='bank'").get())
    .toMatchObject({ opening_balance: 0, current_balance: 0, is_default: 1 });
});
it('accepts a finite decimal opening amount', () => {
  expect(updateSource({ ...source, opening_balance: '1250.50' }).success).toBe(true);
  expect(raw.prepare("SELECT current_balance FROM payment_sources WHERE source_id='bank'").get()?.current_balance).toBe(1250.5);
});
it('preserves numeric disabled flags and one numeric default selection', () => {
  expect(addSource({ ...source, source_id: 'second', is_default: false, is_enabled: 0 }).success).toBe(true);
  expect(raw.prepare("SELECT is_enabled FROM payment_sources WHERE source_id='second'").get()?.is_enabled).toBe(0);
  expect(updateSource({ ...source, source_id: 'second', is_default: 1 }).success).toBe(true);
  expect(raw.prepare('SELECT COUNT(*) n FROM payment_sources WHERE is_default=1').get()?.n).toBe(1);
});
