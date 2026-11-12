/**
 * "Adjust Bill" return credit used on a later bill, on a real SQLite database with the real checkout and ledger
 * services. A return refunded another way, or already used, must never reduce another bill.
 */
import { DatabaseSync } from 'node:sqlite';
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCoreTables } from '../../electron/db/schemaCoreTables';
import { createExtendedTables } from '../../electron/db/schemaExtendedTables';
import { ensureSchemaColumns } from '../../electron/db/schemaColumns';
import { runColumnMigrations } from '../../electron/db/migrationsColumns';
const state = vi.hoisted(() => ({ db: null as unknown as Database.Database, tick: 0 }));
vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => [] } }));
vi.mock('../../electron/whatsapp/shopClosingReportService', () => ({ sendShopClosingReport: vi.fn() }));
vi.mock('../../electron/db/localDb', () => ({ getDb: () => state.db }));
vi.mock('../../electron/services/cashDrawerService', () => ({ getCashAmountFromInvoice: () => 0, adjustPaymentSourcesForInvoice: vi.fn(), syncPaymentSourcesForInvoice: vi.fn(), adjustCashDrawerForInvoice: vi.fn(), getOpenCashDrawer: () => null, reconcileCashDrawer: vi.fn(), autoCloseOverdueDrawers: vi.fn(), deduplicateAndGetOpenDrawer: () => null }));
vi.mock('../../electron/services/cashRegisterLedgerService', () => ({ recordLedgerCashEntry: vi.fn() }));
vi.mock('../../electron/services/invoiceNumberService', () => ({ rollbackUnsavedInvoiceNumber: vi.fn(), getOrInitTerminalCode: () => 'POS1', getGuaranteedNextInvoiceNumber: () => ({ invoiceNumber: `AUTO-${++state.tick}` }) }));
vi.mock('../../electron/services/storeTime', () => {
  const stamp = () => new Date(Date.UTC(2026, 10, 1, 4, 0, 0) + (++state.tick) * 60_000).toISOString();
  return { localTimestamp: stamp, localDate: () => '2026-11-01', getStoreTimezoneSetting: () => 'Asia/Kolkata', parseCleanDate: (d: string) => d };
});
vi.mock('../../electron/sync/syncWorker', () => ({ runInitialSync: async () => {}, triggerUrgentInvoiceSync: async () => {}, triggerUrgentCashSync: async () => {} }));
import { checkout, recentCheckoutsCache } from '../../electron/services/invoiceCheckoutService';
import { resetBackfillThrottle } from '../../electron/services/partyLedgerService';

let raw: DatabaseSync;
beforeEach(() => {
  raw = new DatabaseSync(':memory:');
  state.db = Object.assign(raw, { transaction: (fn: (...a: unknown[]) => unknown) => (...a: unknown[]) => { raw.exec('SAVEPOINT test_tx'); try { const result = fn(...a); raw.exec('RELEASE test_tx'); return result; } catch (e) { raw.exec('ROLLBACK TO test_tx; RELEASE test_tx'); throw e; } } }) as unknown as Database.Database;
  createCoreTables(state.db); createExtendedTables(state.db); ensureSchemaColumns(state.db); runColumnMigrations(state.db);
  state.db.exec("ALTER TABLE invoices ADD COLUMN counts_in_revenue INTEGER NOT NULL DEFAULT 1; ALTER TABLE invoices ADD COLUMN bill_purpose TEXT NOT NULL DEFAULT 'SALE'; ALTER TABLE invoices ADD COLUMN stock_applied INTEGER NOT NULL DEFAULT 1;");
  raw.prepare("INSERT INTO products (product_id, tenant_id, name, base_price, current_stock) VALUES ('p', 't', 'Cement', 100, 100000)").run();
  recentCheckoutsCache.clear();
  resetBackfillThrottle();
});
afterEach(() => raw.close());



function sale(no: string, total: number) {
  return checkout({
    invoice_id: no, user_id: 'u', tenant_id: 't', invoice_number: no, invoice_type: 'ESTIMATE', subtotal: total, tax_total: 0,
    discount_total: 0, grand_total: total, customer_name: 'Acme', customer_phone: '0501234567',
    items: [{ item_id: `${no}-1`, product_id: 'p', name: 'Cement', quantity: 1, unit_price: total, tax_amount: 0, total }],
    payment_method: 'CASH', received_amount: total, balance_amount: 0, split_details: null,
  } as Parameters<typeof checkout>[0]);
}
function returnRow(no: string, total: number, method: string, adjusted = 0) {
  raw.prepare("INSERT INTO returns (return_id, invoice_id, tenant_id, user_id, return_number, customer_name, customer_phone, subtotal, tax_total, grand_total, refund_method, adjusted_amount) VALUES (?, 'B0', 't', 'u', ?, 'Acme', '0501234567', ?, 0, ?, ?, ?)")
    .run(`r-${no}`, no, total, total, method, adjusted);
}
/** A cash bill of `total` that uses `deduction` of return `ret` (customer pays the rest). */
function billUsingReturn(no: string, total: number, ret: string, deduction: number) {
  return checkout({
    invoice_id: no, user_id: 'u', tenant_id: 't', invoice_number: no, invoice_type: 'ESTIMATE', subtotal: total, tax_total: 0,
    discount_total: 0, grand_total: total, customer_name: 'Acme', customer_phone: '0501234567',
    items: [{ item_id: `${no}-1`, product_id: 'p', name: 'Cement', quantity: 1, unit_price: total, tax_amount: 0, total }],
    payment_method: 'CASH', received_amount: Math.max(0, total - deduction), balance_amount: 0, split_details: null,
    return_deduction: deduction, return_invoice_number: ret, return_consumed: Math.min(deduction, total),
  } as Parameters<typeof checkout>[0]);
}
const adjusted = (ret: string) => raw.prepare('SELECT adjusted_amount, adjusted_invoice_number FROM returns WHERE return_number = ?').get(ret) as { adjusted_amount: number; adjusted_invoice_number: string | null };
const billSaved = (no: string) => Boolean(raw.prepare('SELECT 1 FROM invoices WHERE invoice_number = ?').get(no));

beforeEach(() => {
  raw.prepare("INSERT INTO invoices (invoice_id, tenant_id, invoice_number, invoice_type, subtotal, tax_total, grand_total, payment_method) VALUES ('B0', 't', 'B0', 'ESTIMATE', 500, 0, 500, 'CASH')").run();
});

describe('Adjust Bill return credit on the next bill', () => {
  it('uses the credit inside the bill save and records where it was used', () => {
    returnRow('RTN-1', 200, 'ADJUST_BILL');
    expect(billUsingReturn('B1', 1000, 'RTN-1', 200).success).toBe(true);
    expect(adjusted('RTN-1')).toEqual({ adjusted_amount: 200, adjusted_invoice_number: 'B1' });
    expect(raw.prepare("SELECT return_deduction, return_invoice_number FROM invoices WHERE invoice_number = 'B1'").get()).toEqual({ return_deduction: 200, return_invoice_number: 'RTN-1' });
    const adj = raw.prepare("SELECT credit_amount FROM party_ledger WHERE reference_number = 'RTN-1-ADJ-B1' AND is_deleted = 0").get() as { credit_amount: number } | undefined;
    expect(adj?.credit_amount).toBe(200);
  });

  it('keeps the unused part for a later bill when the credit is bigger than the bill', () => {
    returnRow('RTN-2', 500, 'ADJUST_BILL');
    expect(billUsingReturn('B2', 300, 'RTN-2', 500).success).toBe(true);
    expect(adjusted('RTN-2').adjusted_amount).toBe(300);
    expect(billUsingReturn('B3', 1000, 'RTN-2', 200).success).toBe(true);
    expect(adjusted('RTN-2').adjusted_amount).toBe(500);
  });

  it('refuses a return that was already used up, and saves nothing for that bill', () => {
    returnRow('RTN-3', 200, 'ADJUST_BILL');
    expect(billUsingReturn('B4', 1000, 'RTN-3', 200).success).toBe(true);
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const again = billUsingReturn('B5', 1100, 'RTN-3', 200);
    logged.mockRestore();
    expect(again.success).toBe(false);
    expect(String(again.error)).toMatch(/already fully adjusted/);
    expect(billSaved('B5')).toBe(false);
    expect(adjusted('RTN-3').adjusted_amount).toBe(200);
  });

  it('refuses a return that was refunded in cash: the customer cannot be paid twice', () => {
    returnRow('RTN-4', 150, 'CASH');
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = billUsingReturn('B6', 1000, 'RTN-4', 150);
    logged.mockRestore();
    expect(res.success).toBe(false);
    expect(String(res.error)).toMatch(/refunded by CASH/);
    expect(billSaved('B6')).toBe(false);
    expect(adjusted('RTN-4').adjusted_amount).toBe(0);
  });

  it('never records more than the return is worth', () => {
    returnRow('RTN-5', 100, 'ADJUST_BILL', 60);
    expect(billUsingReturn('B7', 1000, 'RTN-5', 100).success).toBe(true);
    expect(adjusted('RTN-5').adjusted_amount).toBe(100);
  });

  it('a normal sale without a return is unchanged', () => {
    expect(sale('B8', 400).success).toBe(true);
    expect(raw.prepare("SELECT return_deduction FROM invoices WHERE invoice_number = 'B8'").get()).toEqual({ return_deduction: 0 });
  });
});
