import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../../electron/db/statements/types';
import { sumCashSalesInWindow } from '../../electron/db/statements/cashDrawer';
import { findInvoices, findInvoices2, getPendingInvoicesStatement } from '../../electron/db/statements/cashier';
import { getInvoicesSummaryStatement } from '../../electron/db/statements/invoices';

let sqlite: DatabaseSync;
let db: Db;
const day = '2026-10-27';
beforeEach(() => {
  sqlite = new DatabaseSync(':memory:');
  db = sqlite as unknown as Db;
  sqlite.exec(`
    CREATE TABLE invoices (
      invoice_id TEXT PRIMARY KEY, tenant_id TEXT, user_id TEXT, invoice_number TEXT,
      invoice_type TEXT, payment_method TEXT, split_details TEXT, grand_total REAL,
      received_amount REAL, balance_amount REAL, subtotal REAL, tax_total REAL DEFAULT 0,
      discount_total REAL DEFAULT 0, points_redeemed_discount REAL DEFAULT 0,
      scrap_deduction REAL DEFAULT 0, return_deduction REAL DEFAULT 0,
      is_held INTEGER DEFAULT 0, is_deleted INTEGER DEFAULT 0,
      converted_from_invoice_id TEXT, settled_at TEXT, created_at TEXT, updated_at TEXT
    );
    ALTER TABLE invoices ADD COLUMN counts_in_revenue INTEGER NOT NULL DEFAULT 1;
    CREATE TABLE users (user_id TEXT, name TEXT);
    CREATE TABLE cash_drawer (drawer_id TEXT, tenant_id TEXT, business_date TEXT,
      opened_by TEXT, closed_by TEXT);
    INSERT INTO cash_drawer VALUES ('drawer', 'shop', '${day}', NULL, NULL);
  `);
});
afterEach(() => sqlite.close());
function bill(id: string, type: string, method: string, amount: number, source: string | null = null) {
  sqlite.prepare(`INSERT INTO invoices (invoice_id, tenant_id, invoice_number, invoice_type,
    payment_method, grand_total, subtotal, received_amount, balance_amount, split_details,
    converted_from_invoice_id, created_at, updated_at)
    VALUES (?, 'shop', ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`).run(
    id, id, type, method, amount, amount, amount,
    method === 'SPLIT' ? JSON.stringify({ cash: amount / 2, upi: amount / 2 }) : null,
    source, `${day} 10:00:00`, `${day} 10:00:00`);
}
function cashTotal() {
  return sumCashSalesInWindow(db).get('shop', `${day} 00:00:00`, null, null);
}
describe('BOS conversion copies never collect a second payment', () => {
  it.each(['CASH', 'SPLIT', 'CREDIT'])('counts the original %s collection once', method => {
    bill('bos', 'BILL_OF_SUPPLY', method, 100);
    const before = cashTotal();
    bill('gst', 'GST', method, 118, 'bos');
    expect(cashTotal()).toEqual(before);
  });
  it('keeps direct B2C GST sales in drawer revenue', () => {
    bill('direct', 'GST', 'CASH', 118, '');
    expect(cashTotal()).toMatchObject({ total_cash_sales: 118 });
  });
  it('lists only the original collection in the cash register', () => {
    bill('bos', 'BILL_OF_SUPPLY', 'CASH', 100);
    bill('gst', 'GST', 'CASH', 118, 'bos');
    const rows = findInvoices2(db).all('shop', day, `${day}%`, day);
    expect(rows.map(row => (row as { invoice_id: string }).invoice_id)).toEqual(['bos']);
  });
  it('does not offer an unpaid GST copy for a second settlement', () => {
    bill('bos', 'BILL_OF_SUPPLY', 'PENDING', 100);
    bill('gst', 'GST', 'PENDING', 118, 'bos');
    const { statement, params } = getPendingInvoicesStatement(db, { tenant_id: 'shop', search: undefined });
    expect(statement.all(...params).map(row => (row as { invoice_id: string }).invoice_id)).toEqual(['bos']);
  });
  it('drawer history count and collection exclude the GST copy', () => {
    bill('bos', 'BILL_OF_SUPPLY', 'CASH', 100);
    bill('gst', 'GST', 'CASH', 118, 'bos');
    expect(findInvoices(db).get('shop', 10, 0)).toMatchObject({ settled_count: 1, total_collected: 100 });
  });
  it('sales summary keeps the original revenue while tax filing shows the GST copy', () => {
    bill('bos', 'BILL_OF_SUPPLY', 'CASH', 100);
    bill('gst', 'GST', 'CASH', 118, 'bos');
    for (const [accounting_view, amount] of [['ALL', 100], ['REAL_SALES', 100], ['TAX_FILING', 118]] as const) {
      const { statement, params } = getInvoicesSummaryStatement(db, {
        activeTenantId: 'shop', accounting_view, dateRange: null,
      });
      expect(statement.get(...params)).toMatchObject({ totalSales: amount, totalInvoices: 1 });
    }
  });
});
