import { describe, expect, it, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import type { Db } from '../../electron/db/statements/types';
vi.mock('../../electron/db/localDb', () => ({ getDb: () => null }));
import { buildShopClosingSummaryData } from '../../electron/whatsapp/shopClosingSummary';
import { recordLedgerCashEntry } from '../../electron/services/cashRegisterLedgerService';
import { computeDrawerTotals, getRegisterCashEntries } from '../../electron/services/cashDrawerSession';
import { createCoreTables } from '../../electron/db/schemaCoreTables';

function fixture() {
  const sql = new DatabaseSync(':memory:');
  sql.exec(`
    CREATE TABLE settings (tenant_id TEXT, key TEXT, value TEXT);
    INSERT INTO settings VALUES ('t', 'cash_drawer_session_since', '"2026-10-01T00:00:00Z"');
    INSERT INTO settings VALUES ('t', 'store_timezone', '"Asia/Dubai"');
    CREATE TABLE cash_drawer (drawer_id TEXT, tenant_id TEXT, status TEXT, closed_at TEXT, business_date TEXT, sync_status TEXT);
    CREATE TABLE invoices (tenant_id TEXT, converted_from_invoice_id TEXT, payment_method TEXT, grand_total REAL, received_amount REAL, split_details TEXT, invoice_type TEXT, is_held INTEGER, is_deleted INTEGER, settled_at TEXT, created_at TEXT);
    ALTER TABLE invoices ADD COLUMN counts_in_revenue INTEGER NOT NULL DEFAULT 1;
    CREATE TABLE cash_transactions (tenant_id TEXT, drawer_id TEXT, type TEXT, amount REAL, category TEXT, transaction_date TEXT, transaction_id TEXT PRIMARY KEY, notes TEXT, entered_by TEXT, entered_by_name TEXT, sync_status TEXT);
    CREATE TABLE parties (party_id TEXT, tenant_id TEXT, name TEXT);
    CREATE TABLE party_ledger (ledger_id TEXT, party_id TEXT, transaction_date TEXT, credit_amount REAL, debit_amount REAL, payment_method TEXT, is_deleted INTEGER, tenant_id TEXT DEFAULT 't', description TEXT, created_by TEXT, created_by_name TEXT);
    CREATE TABLE returns (tenant_id TEXT, grand_total REAL, refund_method TEXT, created_at TEXT, return_id TEXT DEFAULT 'r', return_number TEXT DEFAULT 'RET-1', user_id TEXT);
    INSERT INTO invoices (tenant_id, converted_from_invoice_id, payment_method, grand_total, received_amount, split_details, invoice_type, is_held, is_deleted, settled_at, created_at) VALUES ('t', NULL, 'CASH', 100, 100, NULL, 'GST', 0, 0, NULL, '2026-10-27T05:00:00Z');
    INSERT INTO cash_transactions (tenant_id, drawer_id, type, amount, category, transaction_date) VALUES ('t', 'd', 'CASH_IN', 30, 'SCRAP_SALE', '2026-10-27T05:00:00Z');
    INSERT INTO cash_transactions (tenant_id, drawer_id, type, amount, category, transaction_date) VALUES ('t', 'd', 'CASH_OUT', 20, 'RETURN_REFUND', '2026-10-27T05:00:00Z');
    INSERT INTO returns (tenant_id, grand_total, refund_method, created_at) VALUES ('t', 20, 'CASH', '2026-10-27T05:00:00Z');
  `);
  const db = sql as unknown as Db;
  const drawer = { drawer_id: 'd', business_date: '2026-10-27', opening_balance: 50, status: 'OPEN' };
  const setting = (key: string, value: unknown) => sql.prepare('INSERT INTO settings VALUES (?, ?, ?)').run('t', key, JSON.stringify(value));
  return { sql, db, drawer, setting };
}

it('records a first repayment with the production NOT NULL drawer constraint', () => {
  const sql = new DatabaseSync(':memory:');
  const db = sql as unknown as Parameters<typeof createCoreTables>[0];
  createCoreTables(db);
  sql.exec("PRAGMA foreign_keys = ON");
  sql.prepare("INSERT INTO parties (party_id,tenant_id,name) VALUES ('p','t','Wholesale customer')").run();
  sql.prepare(`INSERT INTO party_ledger (ledger_id,party_id,tenant_id,description,credit_amount,debit_amount,running_balance,payment_method)
    VALUES ('first','p','t','Part repayment',0,2000,5510,'CASH')`).run();
  recordLedgerCashEntry(db, 't', 'first');
  recordLedgerCashEntry(db, 't', 'first');
  expect(sql.prepare('SELECT COUNT(*) AS n FROM cash_drawer').get()?.n).toBe(1);
  expect(sql.prepare('SELECT amount, drawer_id FROM cash_transactions').get()).toMatchObject({ amount: 2000, drawer_id: expect.any(String) });
  expect(sql.prepare('SELECT COUNT(*) AS n FROM cash_transactions').get()?.n).toBe(1);
  expect(sql.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  sql.close();
});

describe('shared cash register totals', () => {
  it('preserves existing scrap and cash-return inclusion by default', () => {
    const { sql, db, drawer } = fixture();
    expect(computeDrawerTotals(db, 't', drawer)).toEqual({ cash_sales: 100, cash_in: 30, cash_out: 20, expected: 160 });
    sql.close();
  });
  it('excludes scrap sales when the owner switches them off', () => {
    const { sql, db, drawer, setting } = fixture();
    setting('cash_register_include_scrap_sales', false);
    expect(computeDrawerTotals(db, 't', drawer).expected).toBe(130);
    sql.close();
  });
  it('excludes return refunds when the owner switches deductions off', () => {
    const { sql, db, drawer, setting } = fixture();
    setting('cash_register_deduct_returns', false);
    expect(computeDrawerTotals(db, 't', drawer).expected).toBe(180);
    sql.close();
  });
  it('counts a cash return without a drawer transaction exactly once', () => {
    const { sql, db, drawer } = fixture();
    sql.exec("DELETE FROM cash_transactions WHERE category = 'RETURN_REFUND'");
    expect(computeDrawerTotals(db, 't', drawer).cash_out).toBe(20);
    sql.close();
  });
  it.each(['off', 'today', 'all'])('applies ledger mode %s to a backdated entry made in this session', (mode) => {
    const { sql, db, drawer, setting } = fixture();
    setting('cash_register_ledger_mode', mode);
    sql.exec(`INSERT INTO party_ledger (ledger_id, transaction_date, credit_amount, debit_amount, payment_method, is_deleted) VALUES ('l', '2026-10-20T05:00:00Z', 0, 40, 'CASH', 0);
      INSERT INTO cash_transactions (tenant_id, drawer_id, type, amount, category, transaction_date) VALUES ('t', 'd', 'CASH_IN', 40, 'PARTY_LEDGER:l', '2026-10-27T05:00:00Z')`);
    expect(computeDrawerTotals(db, 't', drawer).cash_in).toBe(mode === 'all' ? 70 : 30);
    sql.close();
  });
  it('excludes even same-day party receipts when raw unquoted string setting is off', () => {
    const { sql, db, drawer } = fixture();
    sql.prepare("INSERT INTO settings (tenant_id, key, value) VALUES ('t', 'cash_register_ledger_mode', 'off')").run();
    sql.exec(`INSERT INTO party_ledger (ledger_id, transaction_date, credit_amount, debit_amount, payment_method, is_deleted) VALUES ('l-today', '2026-10-27T05:00:00Z', 0, 10000, 'CASH', 0);
      INSERT INTO cash_transactions (tenant_id, drawer_id, type, amount, category, transaction_date) VALUES ('t', 'd', 'CASH_IN', 10000, 'PARTY_LEDGER:l-today', '2026-10-27T05:00:00Z')`);
    const entries = getRegisterCashEntries(db, 't', drawer);
    expect(entries.some(e => e.category === 'Party Receipt')).toBe(false);
    expect(computeDrawerTotals(db, 't', drawer).cash_in).toBe(30);
    expect(computeDrawerTotals(db, 't', drawer).expected).toBe(160);
    sql.close();
  });
  it('uses the same filtered cash flow in the WhatsApp closing overview', () => {
    const { sql, db, drawer, setting } = fixture();
    setting('cash_register_include_scrap_sales', false);
    setting('cash_register_deduct_returns', false);
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const summary = buildShopClosingSummaryData(sql as unknown as import('better-sqlite3').Database, 't', drawer.business_date, { ...drawer, expected_closing: computeDrawerTotals(db, 't', drawer).expected });
      expect(summary.totalCashIn).toBe(0);
      expect(summary.totalCashOut).toBe(0);
      expect(summary.expectedClosingCash).toBe(150);
    } finally { log.mockRestore(); sql.close(); }
  });
  it('does not create phantom cash entries for empty ledger rows', () => {
    const { sql, db } = fixture();
    sql.exec("INSERT INTO party_ledger (ledger_id, credit_amount, debit_amount, payment_method, is_deleted) VALUES ('empty', 0, 0, 'CASH', 0)");
    recordLedgerCashEntry(db, 't', 'empty');
    expect(sql.prepare("SELECT COUNT(*) AS n FROM cash_transactions WHERE category = 'PARTY_LEDGER:empty'").get()?.n).toBe(0);
    sql.close();
  });
  it('records a direct ledger cash entry once even without an open drawer', () => {
    const { sql, db, drawer } = fixture();
    sql.exec("INSERT INTO party_ledger (ledger_id, transaction_date, credit_amount, debit_amount, payment_method, is_deleted) VALUES ('new', '2026-10-27', 0, 40, 'CASH', 0)");
    recordLedgerCashEntry(db, 't', 'new');
    recordLedgerCashEntry(db, 't', 'new');
    expect(sql.prepare("SELECT COUNT(*) AS n FROM cash_transactions WHERE category = 'PARTY_LEDGER:new'").get()?.n).toBe(1);
    // Set a deterministic entry time, independent of when the test runs.
    sql.exec("UPDATE cash_transactions SET transaction_date = '2026-10-27T06:00:00Z' WHERE category = 'PARTY_LEDGER:new'");
    const opened = sql.prepare('SELECT drawer_id FROM cash_drawer').get() as { drawer_id: string };
    expect(computeDrawerTotals(db, 't', { ...drawer, drawer_id: opened.drawer_id }).cash_in).toBe(70);
    expect(computeDrawerTotals(db, 't', drawer).cash_in).toBe(30);
    sql.close();
  });
  it('uses edited ledger amounts and omits soft-deleted linked entries in both totals and feed', () => {
    const { sql, db, drawer } = fixture();
    sql.exec(`INSERT INTO party_ledger (ledger_id, transaction_date, credit_amount, debit_amount, payment_method, is_deleted) VALUES ('l', '2026-10-27T05:00:00Z', 60, 0, 'CASH', 0);
      INSERT INTO cash_transactions (tenant_id, drawer_id, type, amount, category, transaction_date) VALUES ('t', 'd', 'CASH_IN', 40, 'PARTY_LEDGER:l', '2026-10-27T05:00:00Z')`);
    expect(computeDrawerTotals(db, 't', drawer).cash_out).toBe(80);
    expect(getRegisterCashEntries(db, 't', drawer).find(row => row.source === 'ledger')).toMatchObject({ type: 'CASH_OUT', amount: 60, category: 'Party Payment' });
    sql.exec("UPDATE party_ledger SET is_deleted = 1");
    expect(computeDrawerTotals(db, 't', drawer).cash_out).toBe(20);
    expect(getRegisterCashEntries(db, 't', drawer).some(row => row.source === 'ledger')).toBe(false);
    sql.close();
  });
  it('uses the store date for today-only ledger entries and excludes entries outside a closed session', () => {
    const { sql, db, drawer, setting } = fixture();
    setting('cash_register_ledger_mode', 'today');
    sql.exec(`INSERT INTO party_ledger (ledger_id, transaction_date, credit_amount, debit_amount, payment_method, is_deleted) VALUES ('l', '2026-10-26T21:00:00Z', 0, 40, 'CASH', 0);
      INSERT INTO cash_transactions (tenant_id, drawer_id, type, amount, category, transaction_date) VALUES ('t', 'd', 'CASH_IN', 40, 'PARTY_LEDGER:l', '2026-10-27T05:00:00Z')`);
    expect(computeDrawerTotals(db, 't', drawer).cash_in).toBe(70);
    const closed = { ...drawer, status: 'CLOSED', closed_at: '2026-10-27T04:00:00Z' };
    expect(computeDrawerTotals(db, 't', closed).cash_sales).toBe(0);
    expect(computeDrawerTotals(db, 't', closed).cash_out).toBe(0);
    sql.close();
  });
  it('does not retain a deleted return through its old cash transaction', () => {
    const { sql, db, drawer } = fixture();
    sql.exec('DELETE FROM returns');
    expect(computeDrawerTotals(db, 't', drawer).cash_out).toBe(0);
    sql.close();
  });
  it('includes party name in notes and preserves ledger transaction timestamp in feed', () => {
    const { sql, db, drawer, setting } = fixture();
    setting('cash_register_ledger_mode', 'today');
    sql.exec(`INSERT INTO parties (party_id, tenant_id, name) VALUES ('p1', 't', 'Al Noor Trading');
      INSERT INTO party_ledger (ledger_id, party_id, transaction_date, credit_amount, debit_amount, payment_method, is_deleted, description)
      VALUES ('l1', 'p1', '2026-10-27T10:15:00.000Z', 0, 500, 'CASH', 0, 'Advance payment');
      INSERT INTO cash_transactions (tenant_id, drawer_id, type, amount, category, notes, transaction_date)
      VALUES ('t', 'd', 'CASH_IN', 500, 'PARTY_LEDGER:l1', 'Advance payment', '2026-10-27T06:15:00.000Z');`);
    const entries = getRegisterCashEntries(db, 't', drawer);
    const entry = entries.find(r => r.source === 'ledger');
    expect(entry).toBeDefined();
    expect(entry?.category).toBe('Party Receipt');
    expect(entry?.notes).toBe('Al Noor Trading — Advance payment');
    expect(entry?.party_name).toBe('Al Noor Trading');
    expect(entry?.transaction_date).toBe('2026-10-27T10:15:00.000Z');
    sql.close();
  });
});
