import { DatabaseSync } from 'node:sqlite';
import { expect, it } from 'vitest';
import type { Db } from '../../electron/db/statements/types';
import { findCashTransactions, findCashTransactions2 } from '../../electron/db/statements/cashier';
import { findInvoicesByConvertedFrom_ } from '../../electron/db/statements/shopClosingReport';
import { findPurchasesForVatReport } from '../../electron/db/statements/vatReports';

it('cash and closing queries include precisely the Dubai shop day in legacy and ISO formats', () => {
  const sql = new DatabaseSync(':memory:'); const db = sql as unknown as Db;
  try {
    sql.exec(`CREATE TABLE cash_transactions (transaction_id TEXT, tenant_id TEXT, transaction_date TEXT);
      CREATE TABLE users (user_id TEXT, name TEXT);
      CREATE TABLE invoices (invoice_id TEXT, tenant_id TEXT, user_id TEXT, payment_method TEXT DEFAULT 'CASH', invoice_type TEXT DEFAULT 'BILL_OF_SUPPLY', is_held INTEGER DEFAULT 0, is_deleted INTEGER DEFAULT 0, counts_in_revenue INTEGER DEFAULT 1, converted_from_invoice_id TEXT, settled_at TEXT, created_at TEXT);`);
    for (const [id, time] of [['before','2026-11-04T19:59:59.999Z'],['start','2026-11-04 20:00:00'],['end','2026-11-05T19:59:59.999Z'],['after','2026-11-05 20:00:00']]) {
      sql.prepare('INSERT INTO cash_transactions VALUES (?,?,?)').run(id,'shop',time);
      sql.prepare('INSERT INTO invoices (invoice_id,tenant_id,created_at) VALUES (?,?,?)').run(id,'shop',time);
    }
    const bounds = ['shop','2026-11-04T20:00:00.000Z','2026-11-05T19:59:59.999Z'];
    for (const query of [findCashTransactions(db),findCashTransactions2(db)]) expect(query.all(...bounds).map(r=>(r as {transaction_id:string}).transaction_id).sort()).toEqual(['end','start']);
    expect(findInvoicesByConvertedFrom_(db).all(...bounds).map(r=>(r as {invoice_id:string}).invoice_id).sort()).toEqual(['end','start']);
  } finally { sql.close(); }
});

it('purchase calendar dates stay unchanged while timestamp purchases use shop boundaries', () => {
  const sql = new DatabaseSync(':memory:'); const db = sql as unknown as Db;
  try {
    sql.exec(`CREATE TABLE parties (party_id TEXT, gstin TEXT, address TEXT);
      CREATE TABLE purchase_bills (purchase_bill_id TEXT,tenant_id TEXT,bill_number TEXT,supplier_id TEXT,supplier_name TEXT,bill_date TEXT,invoice_number TEXT,total_amount REAL,bill_type TEXT,created_at TEXT);`);
    for (const [id,date] of [['calendar','2026-11-05'],['instant','2026-11-04 20:00:00'],['before','2026-11-04 19:59:59']]) sql.prepare('INSERT INTO purchase_bills (purchase_bill_id,tenant_id,bill_date,created_at) VALUES (?,?,?,?)').run(id,'shop',date,'2026-11-05T12:00:00Z');
    const result = findPurchasesForVatReport(db).all({tenant_id:'shop',from_date:'2026-11-05',to_date:'2026-11-05',startUtc:'2026-11-04T20:00:00Z',endUtc:'2026-11-05T19:59:59.999Z'});
    expect(result.map(r=>(r as {purchase_bill_id:string}).purchase_bill_id).sort()).toEqual(['calendar','instant']);
  } finally { sql.close(); }
});
