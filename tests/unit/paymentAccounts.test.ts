/**
 * Payment-method side of a bill: UPI / card / bank account balances follow the bill through edits, payment changes,
 * deletes and restores (never twice), the stored payment breakdown matches the method, and the cash drawer counts
 * the cash taken on credit bills.
 */
import { DatabaseSync } from 'node:sqlite';
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCoreTables } from '../../electron/db/schemaCoreTables';
import { createExtendedTables } from '../../electron/db/schemaExtendedTables';
import { ensureSchemaColumns } from '../../electron/db/schemaColumns';
import { runColumnMigrations } from '../../electron/db/migrationsColumns';
vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => [] } }));
import { syncPaymentSourcesForInvoice } from '../../electron/services/cashDrawerService';
import { normalizePaymentSplit } from '../../electron/services/partyLedgerService';
import { sumCashSalesInWindow } from '../../electron/db/statements/cashDrawer';

let raw: DatabaseSync;
let db: Database.Database;
beforeEach(() => {
  raw = new DatabaseSync(':memory:');
  db = raw as unknown as Database.Database;
  createCoreTables(db); createExtendedTables(db); ensureSchemaColumns(db); runColumnMigrations(db);
  db.exec("ALTER TABLE invoices ADD COLUMN counts_in_revenue INTEGER NOT NULL DEFAULT 1; ALTER TABLE invoices ADD COLUMN bill_purpose TEXT NOT NULL DEFAULT 'SALE'; ALTER TABLE invoices ADD COLUMN stock_applied INTEGER NOT NULL DEFAULT 1;");
  raw.prepare("INSERT INTO payment_sources (source_id, tenant_id, name, type, opening_balance, current_balance, is_enabled, is_deleted) VALUES ('upi', 't', 'Shop UPI', 'UPI', 0, 0, 1, 0)").run();
  raw.prepare("INSERT INTO payment_sources (source_id, tenant_id, name, type, opening_balance, current_balance, is_enabled, is_deleted) VALUES ('bank', 't', 'Shop Bank', 'BANK', 0, 0, 1, 0)").run();
});
afterEach(() => raw.close());

const balance = (id: string) => (raw.prepare('SELECT current_balance AS b FROM payment_sources WHERE source_id = ?').get(id) as { b: number }).b;
const bill = (payment_method: string, split: Record<string, number> | null = null, received = 1000) =>
  ({ invoice_number: 'B-1', grand_total: 1000, payment_method, received_amount: received, split_details: split ? JSON.stringify(split) : null });

describe('payment accounts follow the bill', () => {
  it('method changes, repeats, delete and restore never count money twice', () => {
    const steps: Array<[ReturnType<typeof bill> & { is_deleted?: number }, number, number]> = [
      [bill('UPI'), 1000, 0],
      [bill('UPI'), 1000, 0],
      [bill('CREDIT', null, 0), 0, 0],
      [bill('SPLIT', { upi: 300, bank_transfer: 200, credit: 500 }, 500), 300, 200],
      [bill('SPLIT', { upi: 300, bank_transfer: 200, credit: 500 }, 500), 300, 200],
      [bill('BANK_TRANSFER'), 0, 1000],
      [{ ...bill('BANK_TRANSFER'), is_deleted: 1 }, 0, 0],
      [bill('BANK_TRANSFER'), 0, 1000],
      [bill('CASH'), 0, 0],
    ];
    for (const [inv, upi, bank] of steps) {
      syncPaymentSourcesForInvoice(db, 't', inv);
      expect([balance('upi'), balance('bank')], JSON.stringify(inv)).toEqual([upi, bank]);
    }
  });
});

describe('stored payment breakdown matches the method', () => {
  const zero = { cash: 0, upi: 0, card: 0, bank_transfer: 0, cheque: 0, credit: 0 };
  it.each([
    ['CASH', null, 1000, { cash: 1000 }],
    ['UPI', { cash: 300, credit: 700, upi_id: 'x@ybl' }, 1000, { upi: 1000, upi_id: 'x@ybl' }],
    ['CREDIT', { cash: 300, upi: 200, credit: 500 }, 400, { cash: 400, credit: 600 }],
    ['CREDIT', null, 0, { credit: 1000 }],
    ['SPLIT', { cash: 300, upi: 200, credit: 500 }, 500, { cash: 300, upi: 200, credit: 500 }],
    ['SPLIT', { cash: 900, credit: 500 }, 900, { cash: 500, credit: 500 }],
    ['PENDING', { cash: 1000 }, 0, {}],
  ] as const)('%s %j received %d', (method, split, received, expected) => {
    expect(normalizePaymentSplit({ grand_total: 1000, payment_method: method, received_amount: received, split_details: split ? JSON.stringify(split) : null }))
      .toEqual({ ...zero, ...expected });
  });
});

describe('cash drawer counts the cash taken on credit bills', () => {
  it('uses the amount received when the split shows no cash part', () => {
    const add = (id: string, method: string, received: number, split: Record<string, number>) => raw.prepare(`INSERT INTO invoices
      (invoice_id, tenant_id, invoice_number, invoice_type, subtotal, tax_total, grand_total, payment_method, received_amount, split_details, created_at)
      VALUES (?, 't', ?, 'BILL_OF_SUPPLY', 1000, 0, 1000, ?, ?, ?, '2026-10-28 10:00:00')`).run(id, id, method, received, JSON.stringify(split));
    add('a', 'CREDIT', 400, { cash: 0, upi: 0, credit: 600 });
    add('b', 'SPLIT', 500, { cash: 300, upi: 200, credit: 500 });
    add('c', 'SPLIT', 500, { cash: 0, upi: 500, credit: 500 });
    const row = sumCashSalesInWindow(db).get('t', '2026-10-28 00:00:00', null, null) as Record<string, number>;
    expect(Object.values(row)[0]).toBe(700);
  });
});
