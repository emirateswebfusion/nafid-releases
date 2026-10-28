import { DatabaseSync } from 'node:sqlite';
import type Database from 'better-sqlite3';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createCoreTables } from '../../electron/db/schemaCoreTables';
import { createExtendedTables } from '../../electron/db/schemaExtendedTables';
import { ensureSchemaColumns } from '../../electron/db/schemaColumns';
import { runColumnMigrations } from '../../electron/db/migrationsColumns';
const state = vi.hoisted(() => ({ db: null as unknown as Database.Database }));
vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => [] } }));
vi.mock('../../electron/whatsapp/shopClosingReportService', () => ({ sendShopClosingReport: vi.fn() }));
vi.mock('../../electron/db/localDb', () => ({ getDb: () => state.db }));
vi.mock('../../electron/services/cashDrawerService', () => ({ getCashAmountFromInvoice: () => 0, adjustPaymentSourcesForInvoice: vi.fn(), syncPaymentSourcesForInvoice: vi.fn(), adjustCashDrawerForInvoice: vi.fn(), getOpenCashDrawer: () => null }));
vi.mock('../../electron/services/partyLedgerService', async importOriginal => ({ ...await importOriginal<typeof import('../../electron/services/partyLedgerService')>(), syncInvoiceCreditLedger: vi.fn(), syncReturnLedger: vi.fn(), removeReturnLedger: vi.fn(), setInvoiceReturnCreditUse: vi.fn(), recalcPartyBalances: vi.fn(), resetBackfillThrottle: vi.fn() }));
vi.mock('../../electron/services/invoiceNumberService', () => ({ getOrInitTerminalCode: () => 'POS1', getGuaranteedNextInvoiceNumber: () => ({ invoiceNumber: 'POS1-1' }) }));
vi.mock('../../electron/services/storeTime', () => ({ localTimestamp: () => '2026-10-27T10:00:00Z', localDate: () => '2026-10-27' }));
vi.mock('../../electron/sync/syncWorker', () => ({ runInitialSync: async () => {}, triggerUrgentInvoiceSync: async () => {}, triggerUrgentCashSync: async () => {} }));
import { restoreInvoice } from '../../electron/services/recycleBinService';
import { checkout, recentCheckoutsCache } from '../../electron/services/invoiceCheckoutService';
import { deleteInvoice, updateInvoice } from '../../electron/services/invoiceEditService';
import { createReturn, deleteReturn } from '../../electron/services/returnsService';
let raw: DatabaseSync;
beforeEach(() => {
  raw = new DatabaseSync(':memory:');
  state.db = Object.assign(raw, { transaction: (fn: () => unknown) => () => { raw.exec('SAVEPOINT test_tx'); try { const result = fn(); raw.exec('RELEASE test_tx'); return result; } catch (e) { raw.exec('ROLLBACK TO test_tx; RELEASE test_tx'); throw e; } } }) as unknown as Database.Database;
  createCoreTables(state.db); createExtendedTables(state.db); ensureSchemaColumns(state.db); runColumnMigrations(state.db);
  state.db.exec("ALTER TABLE invoices ADD COLUMN counts_in_revenue INTEGER NOT NULL DEFAULT 1; ALTER TABLE invoices ADD COLUMN bill_purpose TEXT NOT NULL DEFAULT 'SALE'; ALTER TABLE invoices ADD COLUMN stock_applied INTEGER NOT NULL DEFAULT 1;");
  raw.prepare("INSERT INTO customers (customer_id, tenant_id, name, current_points_balance, total_points_earned) VALUES ('c', 't', 'Customer', 10, 10)").run();
  raw.prepare("INSERT INTO products (product_id, tenant_id, name, base_price, current_stock) VALUES ('p', 't', 'Product', 100, 10)").run();
  recentCheckoutsCache.clear();
});
afterEach(() => raw.close());

const item = { item_id: 'it', product_id: 'p', name: 'Product', quantity: 2, unit_price: 100, tax_amount: 0, total: 200 };
function config(reduceStock: boolean, countInRevenue = false) {
  raw.prepare("INSERT OR REPLACE INTO settings (tenant_id,key,value) VALUES ('t','filing_only_mode',?)").run(JSON.stringify({ enabled: true, reduceStock, countInRevenue }));
}
function makeBill() {
  return checkout({ invoice_id: 'i', user_id: 'u', tenant_id: 't', invoice_number: 'GST-1', invoice_type: 'GST', bill_purpose: 'FILING_ONLY', subtotal: 200, tax_total: 0, discount_total: 0, grand_total: 200, payment_method: 'CASH', customer_id: 'c', items: [item] });
}
function stock() { return (raw.prepare("SELECT current_stock AS n FROM products WHERE product_id='p'").get() as { n: number }).n; }
function returned() { return createReturn({ return_id: 'r', invoice_id: 'i', tenant_id: 't', return_number: 'R1', subtotal: 100, tax_total: 0, grand_total: 100, items: [{ return_item_id: 'ri', invoice_item_id: 'it', product_id: 'p', name: 'Product', quantity: 1, unit_price: 100, tax_amount: 0, total: 100 }] }); }

describe('filing-only stored invoice lifecycle', () => {
  it.each([true, false])('checkout captures stock and revenue choices (%s)', on => {
    config(on, on); expect(makeBill().success).toBe(true);
    expect(stock()).toBe(on ? 8 : 10);
    expect(raw.prepare("SELECT counts_in_revenue,stock_applied,bill_purpose FROM invoices WHERE invoice_id='i'").get()).toMatchObject({ counts_in_revenue: on ? 1 : 0, stock_applied: on ? 1 : 0, bill_purpose: 'FILING_ONLY' });
  });
  it.each([true, false])('delete and restore honor saved stock after settings change (%s)', on => {
    config(on); expect(makeBill().success).toBe(true); config(!on);
    expect(deleteInvoice('i').success).toBe(true); expect(stock()).toBe(10);
    expect(restoreInvoice('i').success).toBe(true); expect(stock()).toBe(on ? 8 : 10);
  });
  it('a non-revenue filing bill earns no loyalty points even with loyalty on', () => {
    raw.prepare("INSERT OR REPLACE INTO settings (tenant_id,key,value) VALUES ('t','loyalty_config',?)").run(JSON.stringify({ enabled: true, earningRate: 100, redemptionRate: 1 }));
    raw.prepare("INSERT OR REPLACE INTO settings (tenant_id,key,value) VALUES ('t','feature_flags',?)").run(JSON.stringify({ loyalty: true }));
    config(false, false); expect(makeBill().success).toBe(true);
    expect(raw.prepare("SELECT points_earned FROM invoices WHERE invoice_id='i'").get()).toMatchObject({ points_earned: 0 });
    expect(raw.prepare("SELECT current_points_balance AS b FROM customers WHERE customer_id='c'").get()).toMatchObject({ b: 10 });
  });
  it('return and return deletion do not move unapplied stock', () => {
    config(false); expect(makeBill().success).toBe(true); config(true);
    expect(returned().success).toBe(true); expect(stock()).toBe(10);
    expect(deleteReturn('r').success).toBe(true); expect(stock()).toBe(10);
  });
  it('editing preserves saved stock and revenue policy', async () => {
    config(false); expect(makeBill().success).toBe(true); config(true, true);
    const result = await updateInvoice({ invoice_id: 'i', tenant_id: 't', role: 'ADMIN', subtotal: 300, tax_total: 0, discount_total: 0, discount_type: 'FIXED', discount_value: 0, grand_total: 300, items: [{ ...item, quantity: 3, total: 300 }] });
    expect(result.success).toBe(true); expect(stock()).toBe(10);
    expect(raw.prepare("SELECT counts_in_revenue,stock_applied FROM invoices WHERE invoice_id='i'").get()).toMatchObject({ counts_in_revenue: 0, stock_applied: 0 });
  });
});
