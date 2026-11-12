/**
 * A Bahrain shop on a real local SQLite database and the real checkout / ledger services: fils (three decimals)
 * must survive from the bill to the customer balance and the printed documents, and an India shop next to it must
 * behave exactly as before. Expected amounts are worked out by hand.
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

const setCountry = (country: 'IN' | 'AE' | 'BH') => raw.prepare("INSERT OR REPLACE INTO settings (tenant_id, key, value) VALUES ('t', 'store_country', ?)").run(JSON.stringify(country));
function creditBill(no: string, total: number, received: number) {
  return checkout({
    invoice_id: no, user_id: 'u', tenant_id: 't', invoice_number: no, invoice_type: 'ESTIMATE', subtotal: total, tax_total: 0,
    discount_total: 0, grand_total: total, customer_name: 'Acme', customer_phone: '0501234567',
    items: [{ item_id: `${no}-1`, product_id: 'p', name: 'Cement', quantity: 1, unit_price: total, tax_amount: 0, total }],
    payment_method: 'CREDIT', received_amount: received, balance_amount: total - received, split_details: null,
  } as Parameters<typeof checkout>[0]);
}
const saleText = () => (raw.prepare("SELECT description FROM party_ledger WHERE tenant_id = 't' AND is_deleted = 0 AND description LIKE 'Credit Sale%'").get() as { description: string }).description;

import { setStoreCountry, setStoreVatInclusive } from '../../src/utils/localization/storeProfile';
import { buildCheckoutLines } from '../../src/utils/pricing/checkoutLines';
import { generateInvoiceHtml } from '../../src/utils/print/invoiceHtmlGenerator';
import { generateReceiptText } from '../../src/utils/print/receiptGenerator';
import type { CartItem } from '../../src/store/cartStore';

afterEach(() => { setStoreCountry('IN'); setStoreVatInclusive(false); });

const balance = () => Number((raw.prepare("SELECT balance FROM parties WHERE tenant_id = 't' AND name = 'Acme'").get() as { balance: number }).balance);
const invoiceTotal = (no: string) => Number((raw.prepare("SELECT grand_total FROM invoices WHERE tenant_id = 't' AND invoice_number = ?").get(no) as { grand_total: number }).grand_total);
const ledgerRows = () => raw.prepare("SELECT credit_amount, debit_amount FROM party_ledger WHERE tenant_id = 't' AND is_deleted = 0 ORDER BY rowid").all() as { credit_amount: number; debit_amount: number }[];

describe('Bahrain shop: a bill keeps its fils in the database and the customer account', () => {
  it('stores a BHD 1.255 credit bill exactly and describes it in BHD', () => {
    setCountry('BH');
    expect(creditBill('B1', 1.255, 0).success).toBe(true);
    expect(invoiceTotal('B1')).toBe(1.255);
    expect(saleText()).toContain('Total BHD 1.255');
    expect(saleText()).not.toMatch(/₹|AED/);
    expect(balance()).toBeCloseTo(1.255, 9);
    expect(ledgerRows().reduce((sum, row) => sum + row.credit_amount - row.debit_amount, 0)).toBeCloseTo(1.255, 9);
  });

  it('keeps fils across a part payment: 0.555 billed, 0.250 received, 0.305 owed', () => {
    setCountry('BH');
    expect(creditBill('B1', 0.555, 0.25).success).toBe(true);
    expect(balance()).toBeCloseTo(0.305, 9);
    expect(saleText()).toContain('(Paid BHD 0.250, Credit BHD 0.305)');
  });

  it('adds bills to the fils: 0.185 + 1.070 = 1.255 owed', () => {
    setCountry('BH');
    expect(creditBill('B1', 0.185, 0).success).toBe(true);
    expect(creditBill('B2', 1.07, 0).success).toBe(true);
    expect(balance()).toBeCloseTo(1.255, 9);
    expect(Math.round(balance() * 1000)).toBe(1255);
  });
});

describe('India shop next to it is unchanged', () => {
  it('keeps two decimals in the account and the rupee text', () => {
    setCountry('IN');
    expect(creditBill('B1', 1500.5, 500.25).success).toBe(true);
    expect(saleText()).toContain('Total ₹1500.50');
    expect(balance()).toBe(1000.25);
  });
});

describe('Bahrain shop: printed documents show BHD with three decimals', () => {
  const item = { product_id: 'p', name: 'Khubz', quantity: 3, base_price: 0.185, tax_rate_percent: 10 } as CartItem;

  it('prices 3 x 0.185 at 10% VAT as 0.555 + 0.056 = 0.611', () => {
    setStoreCountry('BH'); setStoreVatInclusive(false);
    const [line] = buildCheckoutLines([item], { invoiceType: 'GST', supplyType: 'INTRA', bosTaxRatePercent: 0, bosTaxInclusive: false, pcsSnapshot: {}, newId: () => 'id' });
    expect(line.total).toBeCloseTo(0.555, 9);
    expect(line.tax_amount).toBe(0.056);
    expect(line).toMatchObject({ cgst_amount: 0, sgst_amount: 0, igst_amount: 0 });
  });

  it('prints the invoice and the thermal receipt in BHD without rupee, dirham or Indian tax words', () => {
    setStoreCountry('BH');
    const data = { shopName: 'Manama Mart', shopGstin: '200000000000002', shopAddress: 'Manama', invoiceType: 'GST', invoiceNumber: 'VAT-1', date: '2026-11-11T09:30:00Z',
      items: [{ name: 'Khubz', quantity: 3, unit_price: 0.185, total: 0.555, tax_rate_percent: 10 }], subtotal: 0.555, tax: 0.056, discount: 0, grandTotal: 0.611 };
    const html = generateInvoiceHtml(data);
    expect(html).toContain('BHD 0.611');
    expect(html).toContain('BHD 0.056');
    expect(html).toContain('200000000000002');
    expect(html).not.toMatch(/₹|AED|CGST|SGST|IGST|GSTIN/);
    for (const [width, chars] of [[5.8, 32], [8, 42]] as const) {
      const receipt = generateReceiptText(data, width);
      expect(receipt).toContain('BHD 0.611');
      expect(receipt).not.toMatch(/₹|AED|CGST|SGST|IGST/);
      expect(Math.max(...receipt.trimEnd().split('\n').map(line => line.length))).toBeLessThanOrEqual(chars);
    }
  });
});
