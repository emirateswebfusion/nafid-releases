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
import { settlePayment } from '../../electron/services/cashierService';
import { checkout, recentCheckoutsCache } from '../../electron/services/invoiceCheckoutService';
import { applyInvoiceDiscount, deleteInvoice, updateInvoice, updateInvoicePayment } from '../../electron/services/invoiceEditService';
import { createCustomer, updateCustomer, getCustomers, adjustCustomerLoyaltyPoints, recalculateCustomerLoyaltyPoints } from '../../electron/services/customersService';
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
  it('off allows changing customer or setting pending when loyalty is disabled', async () => {
    sale(10, 0); setConfig(false);
    raw.prepare("INSERT INTO customers (customer_id, tenant_id, name) VALUES ('other', 't', 'Other')").run();
    expect((await updateInvoice({ ...edit, customer_id: 'other', payment_method: 'PENDING' })).success).toBe(true);
  });
  it('allows adding customer to an invoice created without a customer', async () => {
    raw.prepare("INSERT INTO invoices (invoice_id, tenant_id, invoice_number, invoice_type, subtotal, tax_total, discount_total, grand_total, payment_method, customer_id, points_earned, points_redeemed) VALUES ('walkin', 't', 'POS1-99', 'ESTIMATE', 1000, 0, 0, 1000, 'CASH', NULL, 0, 0)").run();
    expect((await updateInvoice({ ...edit, invoice_id: 'walkin', customer_id: 'c', payment_method: 'PENDING' })).success).toBe(true);
  });
  it('preserves existing customer_id on edit when only customer name is typed without phone', async () => {
    sale(10, 0);
    expect((await updateInvoice({ ...edit, customer_name: 'Customer', customer_phone: '', payment_method: 'PENDING' })).success).toBe(true);
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

 it('keeps repeated edit snapshots consistent with the selected tax basis', () => {
  sale();
  raw.prepare("UPDATE invoices SET subtotal = 2500, tax_total = 100, grand_total = 2600 WHERE invoice_id = 'i'").run();
  raw.prepare("UPDATE settings SET value = ? WHERE tenant_id = 't' AND key = 'loyalty_config'").run(JSON.stringify({ enabled: true, earningRate: 100, includeTax: false }));
  for (const discount of [0, 100, 0, 0]) {
    expect(applyInvoiceDiscount({ invoice_id: 'i', discount_type: 'FIXED', discount_value: discount, role: 'ADMIN' }).success).toBe(true);
    const row = raw.prepare("SELECT points_earned, previous_points_balance, remaining_points_balance FROM invoices WHERE invoice_id = 'i'").get() as { points_earned: number; previous_points_balance: number; remaining_points_balance: number };
    expect(row.points_earned).toBe(discount ? 24 : 25);
    expect(row.remaining_points_balance).toBe(balance());
    expect(row.previous_points_balance + row.points_earned).toBe(row.remaining_points_balance);
  }
});

it('never awards a non-revenue document when its payment changes', () => {
  sale(0);
  raw.prepare("UPDATE invoices SET counts_in_revenue = 0 WHERE invoice_id = 'i'").run();
  expect(applyInvoiceDiscount({ invoice_id: 'i', discount_type: 'FIXED', discount_value: 0, role: 'ADMIN' }).success).toBe(true);
  expect(balance()).toBe(10);
  expect((raw.prepare("SELECT points_earned FROM invoices WHERE invoice_id = 'i'").get() as { points_earned: number }).points_earned).toBe(0);
});

it('recovers zero directory counters from recorded earnings without awarding twice', () => {
  expect(checkout({ invoice_id: 'repair', user_id: 'u', tenant_id: 't', invoice_number: 'REPAIR', invoice_type: 'ESTIMATE', subtotal: 2500, tax_total: 0, discount_total: 0, grand_total: 2500, payment_method: 'CASH', customer_id: 'c', items: [] }).success).toBe(true);
  raw.prepare("UPDATE customers SET total_points_earned = 0, total_points_redeemed = 0, current_points_balance = 0 WHERE customer_id = 'c'").run();
  const customer = getCustomers({ tenant_id: 't' }).find(row => row.customer_id === 'c');
  expect(customer?.current_points_balance).toBe(25);
  expect(customer?.total_points_earned).toBe(25);
  getCustomers({ tenant_id: 't' });
  expect(balance()).toBe(25);
});

it('blocks duplicate customer names and formatted phones on create and edit', () => {
  raw.prepare("UPDATE customers SET name = 'Example Shop', phone = '+91 94468 55246' WHERE customer_id = 'c'").run();
  expect(createCustomer({ tenant_id: 't', name: ' Example   Shop ' }).success).toBe(false);
  expect(createCustomer({ tenant_id: 't', name: 'Different label', phone: '9446855246' }).success).toBe(false);
  raw.prepare("INSERT INTO customers (customer_id, tenant_id, name) VALUES ('other', 't', 'Other')").run();
  expect(updateCustomer({ customer_id: 'other', tenant_id: 't', name: 'Other', phone: '(94468) 55246' }).success).toBe(false);
  expect((raw.prepare("SELECT COUNT(*) AS count FROM customers WHERE tenant_id = 't'").get() as { count: number }).count).toBe(2);
});

it('zero-counter recovery preserves nonzero opening balances and stays tenant scoped', () => {
  expect(checkout({ invoice_id: 'scope', user_id: 'u', tenant_id: 't', invoice_number: 'SCOPE', invoice_type: 'ESTIMATE', subtotal: 500, tax_total: 0, discount_total: 0, grand_total: 500, payment_method: 'CASH', customer_id: 'c', items: [] }).success).toBe(true);
  raw.prepare("UPDATE customers SET total_points_earned = 0, total_points_redeemed = 0, current_points_balance = 0 WHERE customer_id = 'c'").run();
  getCustomers({ tenant_id: 'another-shop' });
  expect(balance()).toBe(0);
  raw.prepare("UPDATE customers SET current_points_balance = 7 WHERE customer_id = 'c'").run();
  getCustomers({ tenant_id: 't' });
  expect(balance()).toBe(7);
});
