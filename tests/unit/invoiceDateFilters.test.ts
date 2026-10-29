import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../../electron/db/statements/types';
import { findInvoicesByConvertedFrom_, getInvoicesStatement, getInvoicesSummaryStatement } from '../../electron/db/statements/invoices';

let sqlite: DatabaseSync;
let db: Db;
const dateRange = { startUtc: '2026-10-27T18:30:00.000Z', endUtc: '2026-10-28T18:29:59.999Z' };
beforeEach(() => {
  sqlite = new DatabaseSync(':memory:'); db = sqlite as unknown as Db;
  sqlite.exec(`CREATE TABLE invoices (
    invoice_id TEXT, invoice_number TEXT, tenant_id TEXT, user_id TEXT, biller_staff_id TEXT, sales_staff_id TEXT,
    invoice_type TEXT DEFAULT 'BILL_OF_SUPPLY', payment_method TEXT DEFAULT 'CASH', split_details TEXT,
    grand_total REAL DEFAULT 100, subtotal REAL DEFAULT 100, tax_total REAL DEFAULT 0, discount_total REAL DEFAULT 0,
    points_redeemed_discount REAL DEFAULT 0, scrap_deduction REAL DEFAULT 0, return_deduction REAL DEFAULT 0,
    is_held INTEGER DEFAULT 0, is_deleted INTEGER DEFAULT 0, counts_in_revenue INTEGER DEFAULT 1,
    converted_from_invoice_id TEXT, created_at TEXT, settled_at TEXT);
    CREATE TABLE users (user_id TEXT, name TEXT);
    CREATE TABLE staff (staff_id TEXT, name TEXT);
    CREATE TABLE invoice_items (invoice_id TEXT);`);
});
afterEach(() => sqlite.close());
function bill(id: string, created: string, settled = created, tenant = 'shop') {
  sqlite.prepare('INSERT INTO invoices (invoice_id,invoice_number,tenant_id,created_at,settled_at) VALUES (?,?,?,?,?)').run(id,id,tenant,created,settled);
}
function read() {
  const filters = { activeTenantId: 'shop', accounting_view: 'REAL_SALES' as const, dateRange };
  const list = getInvoicesStatement(db, filters);
  const summary = getInvoicesSummaryStatement(db, filters);
  return { ids: list.statement.all(...list.params).map(row => (row as { invoice_id: string }).invoice_id),
    summary: summary.statement.get(...summary.params),
    dashboard: findInvoicesByConvertedFrom_(db).get('shop',dateRange.startUtc,dateRange.endUtc) };
}
describe('invoice date filters compare instants consistently', () => {
  it('includes the prior UTC evening in the next store day for both legacy and ISO formats', () => {
    bill('legacy','2026-10-27 19:38:59.679');
    bill('iso','2026-10-27T19:39:00.000Z');
    bill('today','2026-10-28 06:18:28.326');
    expect(read()).toMatchObject({ ids: ['today','iso','legacy'], summary: {totalSales:300,totalInvoices:3}, dashboard:{totalSales:300,invoiceCount:3} });
  });
  it('uses creation date for sales even when payment is collected on another day', () => {
    bill('old','2026-10-27T10:00:00Z','2026-10-28T06:00:00Z');
    bill('sale','2026-10-28T06:00:00Z','2026-10-29T06:00:00Z');
    expect(read()).toMatchObject({ids:['sale'],summary:{totalInvoices:1},dashboard:{invoiceCount:1}});
  });
  it('excludes neighbouring days and another tenant while preserving day boundaries', () => {
    bill('before','2026-10-27 18:29:59.999');
    bill('start','2026-10-27 18:30:00.000');
    bill('end','2026-10-28T18:29:59.999Z');
    bill('after','2026-10-28 18:30:00.000');
    bill('other','2026-10-28T05:00:00Z',undefined,'other');
    expect(read()).toMatchObject({ids:['end','start'],summary:{totalInvoices:2},dashboard:{invoiceCount:2}});
  });
});