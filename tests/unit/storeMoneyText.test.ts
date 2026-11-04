/**
 * Opening balances and the bills on top of them: real SQLite schema and real services. Every expectation is worked out
 * by hand from the customer's account, not read from the code.
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
vi.mock('../../electron/services/invoiceNumberService', () => ({ getOrInitTerminalCode: () => 'POS1', getGuaranteedNextInvoiceNumber: () => ({ invoiceNumber: `AUTO-${++state.tick}` }) }));
vi.mock('../../electron/services/storeTime', () => {
  const stamp = () => new Date(Date.UTC(2026, 10, 1, 4, 0, 0) + (++state.tick) * 60_000).toISOString();
  return { localTimestamp: stamp, localDate: () => '2026-11-01', getStoreTimezoneSetting: () => 'Asia/Kolkata', parseCleanDate: (d: string) => d };
});
vi.mock('../../electron/sync/syncWorker', () => ({ runInitialSync: async () => {}, triggerUrgentInvoiceSync: async () => {}, triggerUrgentCashSync: async () => {} }));
import { checkout, recentCheckoutsCache } from '../../electron/services/invoiceCheckoutService';
import { addParty } from '../../electron/services/partiesService';
import { resetBackfillThrottle } from '../../electron/services/partyLedgerService';
import { formatStoreMoney, storeMoneyProfile } from '../../electron/services/storeCountryService';

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

const setCountry = (country: 'IN' | 'AE') => raw.prepare("INSERT OR REPLACE INTO settings (tenant_id, key, value) VALUES ('t', 'store_country', ?)").run(JSON.stringify(country));
function creditBill(no: string, total: number, received: number) {
  return checkout({
    invoice_id: no, user_id: 'u', tenant_id: 't', invoice_number: no, invoice_type: 'ESTIMATE', subtotal: total, tax_total: 0,
    discount_total: 0, grand_total: total, customer_name: 'Acme', customer_phone: '0501234567',
    items: [{ item_id: `${no}-1`, product_id: 'p', name: 'Cement', quantity: 1, unit_price: total, tax_amount: 0, total }],
    payment_method: 'CREDIT', received_amount: received, balance_amount: total - received, split_details: null,
  } as Parameters<typeof checkout>[0]);
}
const saleText = () => (raw.prepare("SELECT description FROM party_ledger WHERE tenant_id = 't' AND is_deleted = 0 AND description LIKE 'Credit Sale%'").get() as { description: string }).description;

describe('formatStoreMoney', () => {
  it('keeps the India format and uses AED with en-AE grouping in a UAE shop', () => {
    expect(formatStoreMoney(1234567.5, 'IN')).toBe('₹12,34,567.50');
    expect(formatStoreMoney(1234567.5, 'AE')).toBe('AED 1,234,567.50');
    expect(formatStoreMoney(-50, 'AE')).toBe('-AED 50.00');
    expect(formatStoreMoney(null, 'AE')).toBe('AED 0.00');
    expect(storeMoneyProfile('IN')).toEqual({ prefix: '₹', locale: 'en-IN' });
  });
});

describe('ledger and checkout text', () => {
  it('India: the credit sale description is unchanged', () => {
    setCountry('IN');
    expect(creditBill('B1', 1500, 0).success).toBe(true);
    expect(saleText()).toBe('Credit Sale B1 - Total ₹1500.00 (Credit ₹1500) - Acme');
  });

  it('UAE: the credit sale description uses AED', () => {
    setCountry('AE');
    expect(creditBill('B1', 1500, 0).success).toBe(true);
    expect(saleText()).toBe('Credit Sale B1 - Total AED 1500.00 (Credit AED 1500) - Acme');
  });

  it('UAE: the credit-limit error uses AED and en-AE grouping', () => {
    setCountry('AE');
    expect(addParty({ party_id: 'c', tenant_id: 't', name: 'Acme', phone: '0501234567', balance: 0, balance_type: 'RECEIVABLE', party_type: 'CUSTOMER' } as Parameters<typeof addParty>[0]).success).toBe(true);
    raw.prepare("UPDATE parties SET credit_limit = 1000000 WHERE party_id = 'c'").run();
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(creditBill('B2', 1500000, 0).success).toBe(false);
    const text = logged.mock.calls.flat().map(String).join(' ');
    logged.mockRestore();
    expect(text).toContain('Credit limit of AED 1,000,000 exceeded');
    expect(text).not.toContain('₹');
  });
});
