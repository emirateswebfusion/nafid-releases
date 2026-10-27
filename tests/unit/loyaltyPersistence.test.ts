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
vi.mock('../../electron/services/cashDrawerService', () => ({ getCashAmountFromInvoice: () => 0, adjustPaymentSourcesForInvoice: vi.fn(), adjustCashDrawerForInvoice: vi.fn(), getOpenCashDrawer: () => null }));
vi.mock('../../electron/services/partyLedgerService', () => ({ syncInvoiceCreditLedger: vi.fn(), syncReturnLedger: vi.fn(), recalcPartyBalances: vi.fn(), resetBackfillThrottle: vi.fn() }));
vi.mock('../../electron/services/invoiceNumberService', () => ({ getOrInitTerminalCode: () => 'POS1', getGuaranteedNextInvoiceNumber: () => ({ invoiceNumber: 'POS1-1' }) }));
vi.mock('../../electron/services/storeTime', () => ({ localTimestamp: () => '2026-10-27T10:00:00Z', localDate: () => '2026-10-27' }));
vi.mock('../../electron/sync/syncWorker', () => ({ runInitialSync: async () => {}, triggerUrgentInvoiceSync: async () => {}, triggerUrgentCashSync: async () => {} }));
import { settlePayment } from '../../electron/services/cashierService';
import { checkout, recentCheckoutsCache } from '../../electron/services/invoiceCheckoutService';
import { applyInvoiceDiscount, deleteInvoice, updateInvoice, updateInvoicePayment } from '../../electron/services/invoiceEditService';
import { adjustCustomerLoyaltyPoints, recalculateCustomerLoyaltyPoints } from '../../electron/services/customersService';
import { createReturn, deleteReturn } from '../../electron/services/returnsService';
let raw: DatabaseSync;
beforeEach(() => {
  raw = new DatabaseSync(':memory:');
  state.db = Object.assign(raw, { transaction: (fn: () => unknown) => () => { raw.exec('SAVEPOINT test_tx'); try { const result = fn(); raw.exec('RELEASE test_tx'); return result; } catch (e) { raw.exec('ROLLBACK TO test_tx; RELEASE test_tx'); throw e; } } }) as unknown as Database.Database;
  createCoreTables(state.db); createExtendedTables(state.db); ensureSchemaColumns(state.db); runColumnMigrations(state.db);
  state.db.exec("ALTER TABLE invoices ADD COLUMN counts_in_revenue INTEGER NOT NULL DEFAULT 1; ALTER TABLE invoices ADD COLUMN bill_purpose TEXT NOT NULL DEFAULT 'SALE'; ALTER TABLE invoices ADD COLUMN stock_applied INTEGER NOT NULL DEFAULT 1;");
  raw.prepare("INSERT INTO customers (customer_id, tenant_id, name, current_points_balance, total_points_earned) VALUES ('c', 't', 'Customer', 10, 10)").run();
  setConfig(true);
  recentCheckoutsCache.clear();
});
afterEach(() => raw.close());
function setConfig(enabled: boolean) {
  raw.prepare("INSERT OR REPLACE INTO settings (tenant_id, key, value) VALUES ('t', 'loyalty_config', ?)").run(JSON.stringify({ enabled, earningRate: 100 }));
  raw.prepare("INSERT OR REPLACE INTO settings (tenant_id, key, value) VALUES ('t', 'feature_flags', ?)").run(JSON.stringify({ loyalty: true }));
}
function sale(points = 10, redeemed = 0) {
  raw.prepare("INSERT INTO invoices (invoice_id, tenant_id, invoice_number, invoice_type, subtotal, tax_total, discount_total, grand_total, payment_method, customer_id, points_earned, points_redeemed) VALUES ('i', 't', 'POS1-1', 'ESTIMATE', 1000, 0, 0, 1000, 'CASH', 'c', ?, ?)").run(points, redeemed);
}
function balance() { return (raw.prepare("SELECT current_points_balance AS balance FROM customers WHERE customer_id = 'c'").get() as { balance: number }).balance; }
function returnSale() { return createReturn({ return_id: 'r', invoice_id: 'i', tenant_id: 't', return_number: 'RET1', subtotal: 500, tax_total: 0, grand_total: 500, items: [{ return_item_id: 'ri', product_id: 'p', name: 'Item', quantity: 1, unit_price: 500, tax_amount: 0, total: 500 }] }); }
describe('loyalty persistence regressions', () => {
  it('characterizes enabled checkout earning without supplied points', () => {
    expect(checkout({ invoice_id: 'new', user_id: 'u', tenant_id: 't', invoice_number: 'POS1-2', invoice_type: 'ESTIMATE', subtotal: 500, tax_total: 0, discount_total: 0, grand_total: 500, payment_method: 'CASH', customer_id: 'c', items: [] }).success).toBe(true);
    expect(balance()).toBe(15);
  });
  it('off overrides a stale enabled feature flag and supplied points', () => {
    setConfig(false);
    expect(checkout({ invoice_id: 'new', user_id: 'u', tenant_id: 't', invoice_number: 'POS1-2', invoice_type: 'ESTIMATE', subtotal: 500, tax_total: 0, discount_total: 0, grand_total: 500, payment_method: 'CASH', customer_id: 'c', points_earned: 5, items: [] }).success).toBe(true);
    expect(balance()).toBe(10);
  });
  it('return reverses the proportional earned points and deleting the return restores them', () => {
    sale(); expect(returnSale().success).toBe(true); expect(balance()).toBe(5);
    expect(deleteReturn('r').success).toBe(true); expect(balance()).toBe(10);
  });
  it('cancellation reverses earnings and restores redeemed points exactly once', () => {
    sale(10, 4); expect(deleteInvoice('i').success).toBe(true); expect(balance()).toBe(4);
    expect(deleteInvoice('i').success).toBe(true); expect(balance()).toBe(4);
  });
});

describe('loyalty input and lifecycle rules', () => {
  const payload = { invoice_id: 'new', user_id: 'u', tenant_id: 't', invoice_number: 'POS1-2', invoice_type: 'ESTIMATE', subtotal: 500, tax_total: 0, discount_total: 0, grand_total: 500, payment_method: 'CASH', customer_id: 'c', items: [] };
  it('rejects stale redemption rather than saving an unbacked discount', () => {
    expect(checkout({ ...payload, points_redeemed: 20, points_redeemed_discount: 20 }).success).toBe(false);
    expect(balance()).toBe(10);
  });
  it('held bills neither award nor redeem', () => {
    expect(checkout({ ...payload, payment_method: 'HOLD', points_redeemed: 5, points_redeemed_discount: 5 }).success).toBe(false);
    expect(balance()).toBe(10);
  });
  it('off rejects redemption and preserves the balance', () => {
    setConfig(false);
    expect(checkout({ ...payload, points_redeemed: 5, points_redeemed_discount: 5 }).success).toBe(false);
    expect(balance()).toBe(10);
  });
  it('pending checkout awards only after payment, once', () => {
    expect(checkout({ ...payload, payment_method: 'PENDING', points_earned: 999 }).success).toBe(true);
    expect(balance()).toBe(10);
    const payment = { invoice_id: 'new', tenant_id: 't', payment_method: 'CASH', received_amount: 500, balance_amount: 0 };
    expect(updateInvoicePayment(payment).success).toBe(true); expect(balance()).toBe(15);
    expect(updateInvoicePayment(payment).success).toBe(true); expect(balance()).toBe(15);
  });
  it('editing bill value recalculates earnings even when client sends stale points', async () => {
    sale();
    expect((await updateInvoice({ ...payload, invoice_id: 'i', role: 'ADMIN', points_earned: 10 })).success).toBe(true);
    expect(balance()).toBe(5);
  });
  it('return after spending points preserves the debt instead of creating free points', () => {
    sale(); raw.prepare("UPDATE customers SET current_points_balance = 0 WHERE customer_id = 'c'").run();
    expect(returnSale().success).toBe(true); expect(balance()).toBe(-5);
    expect(deleteReturn('r').success).toBe(true); expect(balance()).toBe(0);
  });
});

describe('loyalty administration', () => {
  it('off blocks manual adjustments and recalculation', () => {
    setConfig(false);
    expect(adjustCustomerLoyaltyPoints({ customer_id: 'c', tenant_id: 't', points: 5 }).success).toBe(false);
    expect(recalculateCustomerLoyaltyPoints({ tenant_id: 't' }).success).toBe(false);
    expect(balance()).toBe(10);
  });
  it('recalculation preserves a manual adjustment instead of replacing it with invoice totals', () => {
    sale();
    expect(adjustCustomerLoyaltyPoints({ customer_id: 'c', tenant_id: 't', points: 5 }).success).toBe(true);
    expect(recalculateCustomerLoyaltyPoints({ tenant_id: 't' }).success).toBe(true);
    expect(balance()).toBe(15);
  });
});

describe('conversion ownership', () => {
  it('a GST conversion copy does not earn twice; its return reverses the original award', () => {
    sale();
    raw.prepare("INSERT INTO invoices (invoice_id, tenant_id, invoice_number, invoice_type, subtotal, grand_total, customer_id, points_earned, converted_from_invoice_id) VALUES ('gst', 't', 'GST1', 'GST', 1000, 1000, 'c', 0, 'i')").run();
    raw.prepare("UPDATE invoices SET converted_to_invoice_id = 'gst' WHERE invoice_id = 'i'").run();
    const result = createReturn({ return_id: 'rg', invoice_id: 'gst', tenant_id: 't', return_number: 'RG', subtotal: 500, tax_total: 0, grand_total: 500, items: [{ return_item_id: 'rig', product_id: 'p', name: 'Item', quantity: 1, unit_price: 500, tax_amount: 0, total: 500 }] });
    expect(result.success).toBe(true); expect(balance()).toBe(5);
    expect(recalculateCustomerLoyaltyPoints({ tenant_id: 't' }).success).toBe(true); expect(balance()).toBe(5);
  });
});

describe('additional earning entry points', () => {
  it('applying a saved-bill discount reduces the original award', () => {
    sale();
    expect(applyInvoiceDiscount({ invoice_id: 'i', discount_type: 'FIXED', discount_value: 500, role: 'ADMIN' }).success).toBe(true);
    expect(balance()).toBe(5);
  });
  it.each([false, true])('cashier settlement enforces enabled=%s', (enabled) => {
    sale(0); raw.prepare("UPDATE invoices SET payment_method = 'PENDING' WHERE invoice_id = 'i'").run();
    setConfig(enabled);
    expect(settlePayment({ tenant_id: 't', invoice_id: 'i', received_amount: 1000, payment_method: 'CASH', user_id: 'u' }).success).toBe(true);
    expect(balance()).toBe(enabled ? 20 : 10);
  });
});

describe('invoice edit redemption guards', () => {
  const edit = { invoice_id: 'i', user_id: 'u', tenant_id: 't', role: 'ADMIN', invoice_number: 'POS1-1', invoice_type: 'ESTIMATE', subtotal: 1000, tax_total: 0, discount_total: 0, grand_total: 1000, payment_method: 'CASH', customer_id: 'c', items: [] };
  it('rejects an edit redeeming more than the available balance', async () => {
    sale();
    expect((await updateInvoice({ ...edit, points_redeemed: 50, points_redeemed_discount: 50 })).success).toBe(false);
    expect(balance()).toBe(10);
  });
  it('does not move an existing award to a different customer silently', async () => {
    sale(); raw.prepare("INSERT INTO customers (customer_id, tenant_id, name) VALUES ('other', 't', 'Other')").run();
    expect((await updateInvoice({ ...edit, customer_id: 'other' })).success).toBe(false);
    expect(balance()).toBe(10);
  });
  it('off rejects an edit that changes historical redemption', async () => {
    sale(10, 4); setConfig(false);
    expect((await updateInvoice({ ...edit, points_redeemed: 0, points_redeemed_discount: 0 })).success).toBe(false);
    expect(balance()).toBe(10);
  });
});

it('invoice balance snapshots preserve debt after a spent award is reversed', () => {
  raw.prepare("UPDATE customers SET current_points_balance = -10 WHERE customer_id = 'c'").run();
  expect(checkout({ invoice_id: 'debt', user_id: 'u', tenant_id: 't', invoice_number: 'DEBT', invoice_type: 'ESTIMATE', subtotal: 500, tax_total: 0, discount_total: 0, grand_total: 500, payment_method: 'CASH', customer_id: 'c', items: [] }).success).toBe(true);
  expect(balance()).toBe(-5);
  expect((raw.prepare("SELECT remaining_points_balance AS balance FROM invoices WHERE invoice_id = 'debt'").get() as { balance: number }).balance).toBe(-5);
});

it('refuses ambiguous legacy opening points instead of erasing them on recalculation', () => {
  expect(adjustCustomerLoyaltyPoints({ customer_id: 'c', tenant_id: 't', points: 5 }).success).toBe(true);
  expect(recalculateCustomerLoyaltyPoints({ tenant_id: 't' }).success).toBe(false);
  expect(balance()).toBe(15);
});
