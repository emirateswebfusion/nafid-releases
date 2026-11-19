import { DatabaseSync } from 'node:sqlite';
import type Database from 'better-sqlite3';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { createCoreTables } from '../../electron/db/schemaCoreTables';
import { createExtendedTables } from '../../electron/db/schemaExtendedTables';
import { ensureSchemaColumns } from '../../electron/db/schemaColumns';
import { runColumnMigrations } from '../../electron/db/migrationsColumns';
const state = vi.hoisted(() => ({ db: null as unknown as Database.Database }));
vi.mock('../../electron/db/localDb', () => ({ getDb: () => state.db }));
vi.mock('../../electron/services/loyaltyService', () => ({ reconcileInvoicePoints: vi.fn() }));
vi.mock('../../electron/services/partyLedgerService', async original => ({
  ...await original<typeof import('../../electron/services/partyLedgerService')>(), syncReturnLedger: vi.fn(), removeReturnLedger: vi.fn(),
}));
vi.mock('../../electron/services/ledgerPaymentAccounts', () => ({ syncReturnPaymentAccount: vi.fn() }));
vi.mock('../../electron/services/cashDrawerService', () => ({ getOpenCashDrawer: () => null }));
vi.mock('../../electron/services/invoiceNumberService', () => ({ getOrInitTerminalCode: () => 'POS1' }));
vi.mock('../../electron/services/storeTime', () => ({ localTimestamp: () => '2026-11-19T10:00:00Z', localDate: () => '2026-11-19' }));
vi.mock('../../electron/sync/syncWorker', () => ({ runInitialSync: async () => {} }));
import { createReturn, deleteReturn, applyReturnCredit, getReturns, getPendingReturnInvoices, getAlreadyReturnedQuantities } from '../../electron/services/returnsService';
let raw: DatabaseSync;
beforeEach(() => {
  raw = new DatabaseSync(':memory:');
  state.db = Object.assign(raw, { transaction: (fn: () => unknown) => () => {
    raw.exec('SAVEPOINT returned'); try { const value = fn(); raw.exec('RELEASE returned'); return value; }
    catch (error) { raw.exec('ROLLBACK TO returned; RELEASE returned'); throw error; }
  } }) as unknown as Database.Database;
  createCoreTables(state.db); createExtendedTables(state.db); ensureSchemaColumns(state.db); runColumnMigrations(state.db);
  raw.exec("ALTER TABLE returns ADD COLUMN is_deleted INTEGER NOT NULL DEFAULT 0");
  raw.exec("ALTER TABLE return_items ADD COLUMN combo_details TEXT");
  raw.exec(`ALTER TABLE invoices ADD COLUMN stock_applied INTEGER DEFAULT 1;
    INSERT INTO products(product_id,tenant_id,name,base_price,current_stock) VALUES('p','t','Product',50,8);
    INSERT INTO invoices(invoice_id,tenant_id,invoice_number,payment_method,grand_total,subtotal,received_amount,balance_amount)
      VALUES('i','t','I-1','CREDIT',100,100,80,20);
    INSERT INTO invoice_items(item_id,invoice_id,tenant_id,product_id,name,quantity,unit_price,total)
      VALUES('line','i','t','p','Product',2,50,100);`);
});
afterEach(() => raw.close());
const returned = (id: string, quantity: number, extra = {}) => createReturn({ return_id: id, invoice_id: 'i', tenant_id: 't',
  return_number: id, subtotal: quantity * 50, tax_total: 0, grand_total: quantity * 50, refund_method: 'CREDIT',
  items: [{ return_item_id: `${id}:line`, invoice_item_id: 'line', product_id: 'p', name: 'Product', quantity,
    unit_price: 50, tax_amount: 0, total: quantity * 50 }], ...extra });
const due = () => raw.prepare("SELECT balance_amount FROM invoices WHERE invoice_id='i'").get()?.balance_amount;
it('rejects a return above the sold quantity without changing stock or money', () => {
  expect(returned('too-many', 3).success).toBe(false);
  expect(raw.prepare('SELECT COUNT(*) n FROM returns').get()?.n).toBe(0);
  expect(raw.prepare('SELECT current_stock FROM products').get()?.current_stock).toBe(8);
  expect(due()).toBe(20);
});
it('rechecks quantities after another return has already committed', () => {
  expect(returned('first', 1.5).success).toBe(true);
  expect(returned('stale-second', 1).success).toBe(false);
});
it('cannot return another shop invoice', () => {
  expect(returned('foreign', 1, { tenant_id: 'other' }).success).toBe(false);
  expect(raw.prepare('SELECT COUNT(*) n FROM returns').get()?.n).toBe(0);
});
it('cancelling a credit return restores only the original unpaid amount', () => {
  expect(returned('credit', 1).success).toBe(true); expect(due()).toBe(0);
  expect(deleteReturn('credit').success).toBe(true); expect(due()).toBe(20);
});
it('a money refund leaves the credit invoice outstanding amount unchanged', () => {
  expect(returned('cash', 1, { refund_method: 'CASH' }).success).toBe(true);
  expect(due()).toBe(20);
});
it('a deleted return cannot be offered or consumed as credit', () => {
  expect(returned('deleted', 1, { refund_method: 'ADJUST_BILL' }).success).toBe(true);
  raw.exec("UPDATE returns SET is_deleted=1 WHERE return_id='deleted'");
  expect(() => applyReturnCredit(state.db, { tenant_id: 't', return_number: 'deleted', adjusted_invoice_number: 'NEXT', amount: 50 })).toThrow();
  expect(getReturns({ tenant_id: 't' })).toEqual([]);
  expect(getPendingReturnInvoices({ tenant_id: 't' })).toEqual([]);
  expect(getAlreadyReturnedQuantities('i')).toEqual([]);
});
it('a combo return restores saved constituents and keeps a recipe snapshot', () => {
  raw.exec(`UPDATE invoice_items SET product_id='combo',combo_id='combo',combo_details='[{"product_id":"p","quantity":2}]';
    UPDATE products SET current_stock=6;`);
  const items = [{ return_item_id: 'combo-return:line', invoice_item_id: 'line', product_id: 'combo', name: 'Combo', quantity: 1, unit_price: 50, tax_amount: 0, total: 50 }];
  expect(returned('combo-return', 1, { items }).success).toBe(true);
  expect(raw.prepare('SELECT current_stock FROM products').get()?.current_stock).toBe(8);
  expect(raw.prepare('SELECT combo_details FROM return_items').get()?.combo_details).toContain('p');
  expect(deleteReturn('combo-return').success).toBe(true);
  expect(raw.prepare('SELECT current_stock FROM products').get()?.current_stock).toBe(6);
});
