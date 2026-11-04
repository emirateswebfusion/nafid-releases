/** A customer pays more than the bill: real SQLite and the real checkout / edit / delete services. */
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
vi.mock('../../electron/services/cashRegisterLedgerService', () => ({ recordLedgerCashEntry: vi.fn() }));
vi.mock('../../electron/services/invoiceNumberService', () => ({ getOrInitTerminalCode: () => 'POS1', getGuaranteedNextInvoiceNumber: () => ({ invoiceNumber: `AUTO-${++state.tick}` }) }));
vi.mock('../../electron/services/storeTime', () => {
  const stamp = () => new Date(Date.UTC(2026, 10, 1, 4, 0, 0) + (++state.tick) * 60_000).toISOString();
  return { localTimestamp: stamp, localDate: () => '2026-11-01', getStoreTimezoneSetting: () => 'Asia/Kolkata', parseCleanDate: (d: string) => d, storeWallClockToUtc: (d: string) => d };
});
vi.mock('../../electron/sync/syncWorker', () => ({ runInitialSync: async () => {}, triggerUrgentInvoiceSync: async () => {}, triggerUrgentCashSync: async () => {} }));
import { checkout, recentCheckoutsCache } from '../../electron/services/invoiceCheckoutService';
import { deleteInvoice, updateInvoice } from '../../electron/services/invoiceEditService';
import { addPartyLedgerEntry, getParties, getPartyLedger } from '../../electron/services/partiesService';
import { computeCustomerCreditStatusSync } from '../../electron/services/customerCreditService';
import { getCashAmountFromInvoice } from '../../electron/services/cashDrawerService';
import { sumCashSalesInWindow } from '../../electron/db/statements/cashDrawer';
import { cashShortOnAccount, onAccountExcess } from '../../src/components/billing/checkout/overpayment';

const SHOP = 't';
const CHOTUS = { name: 'Chotus', phone: '9000000001' };
let raw: DatabaseSync;
beforeEach(() => {
  raw = new DatabaseSync(':memory:');
  state.db = Object.assign(raw, { transaction: (fn: () => unknown) => () => { raw.exec('SAVEPOINT test_tx'); try { const result = fn(); raw.exec('RELEASE test_tx'); return result; } catch (e) { raw.exec('ROLLBACK TO test_tx; RELEASE test_tx'); throw e; } } }) as unknown as Database.Database;
  createCoreTables(state.db); createExtendedTables(state.db); ensureSchemaColumns(state.db); runColumnMigrations(state.db);
  state.db.exec("ALTER TABLE invoices ADD COLUMN counts_in_revenue INTEGER NOT NULL DEFAULT 1; ALTER TABLE invoices ADD COLUMN bill_purpose TEXT NOT NULL DEFAULT 'SALE'; ALTER TABLE invoices ADD COLUMN stock_applied INTEGER NOT NULL DEFAULT 1;");
  raw.prepare("INSERT INTO products (product_id, tenant_id, name, base_price, current_stock) VALUES ('p', 't', 'Chain', 100, 100000)").run();
  recentCheckoutsCache.clear();
});
afterEach(() => raw.close());

const lines = (total: number) => [{ item_id: crypto.randomUUID(), product_id: 'p', name: 'Chain', quantity: 1, unit_price: total, tax_amount: 0, total }];
function bill(no: string, total: number, received: number, onAccount = 0) {
  const res = checkout({
    invoice_id: no, user_id: 'u', tenant_id: SHOP, invoice_number: no, invoice_type: 'ESTIMATE', subtotal: total, tax_total: 0, discount_total: 0, grand_total: total,
    customer_name: CHOTUS.name, customer_phone: CHOTUS.phone, items: lines(total), payment_method: 'CREDIT', received_amount: received, balance_amount: 0,
    split_details: onAccount ? { on_account: onAccount } : null,
  } as Parameters<typeof checkout>[0]);
  expect(res.success, JSON.stringify(res)).toBe(true);
  recentCheckoutsCache.clear();
}
const party = () => (getParties(SHOP) as Array<{ party_id: string; name: string; balance: number }>).find(p => p.name === CHOTUS.name)!;
const ledger = () => (getPartyLedger(party().party_id) as Array<{ reference_number: string; credit_amount: number; debit_amount: number }>);
function opening(amount: number) {
  bill('SEED', 1, 0);
  const res = addPartyLedgerEntry({ ledger_id: crypto.randomUUID(), party_id: party().party_id, tenant_id: SHOP, transaction_type: 'CREDIT', amount: amount - 1, description: 'Old debt', transaction_date: '2026-10-31T10:00:00.000Z', reference_number: null, payment_method: 'CASH' } as Parameters<typeof addPartyLedgerEntry>[0]);
  expect(res.success).toBe(true);
}

describe('paying more than the bill', () => {
  it('bill 7455: the bill stays 7,390, the ledger shows 7,500 received, and the balance falls by 110', () => {
    opening(342221);
    bill('7455', 7390, 7500, 110);
    const rows = ledger().filter(r => r.reference_number?.startsWith('7455'));
    expect(rows.find(r => r.reference_number === '7455')?.credit_amount).toBe(7390);
    expect(rows.find(r => r.reference_number === '7455-PAY')?.debit_amount).toBe(7500);
    expect(rows).toHaveLength(2);
    expect(party().balance).toBe(342111);
    const saved = raw.prepare("SELECT * FROM invoices WHERE invoice_number = '7455'").get() as { grand_total: number; received_amount: number; split_details: string; created_at: string };
    expect(saved.grand_total).toBe(7390);
    expect(saved.received_amount).toBe(7500);
    expect(JSON.parse(saved.split_details)).toMatchObject({ cash: 7390, credit: 0, on_account: 110 });
  });

  it('all the money is in the cash drawer', () => {
    bill('7455', 7390, 7500, 110);
    const saved = raw.prepare("SELECT * FROM invoices WHERE invoice_number = '7455'").get() as Parameters<typeof getCashAmountFromInvoice>[0];
    expect(getCashAmountFromInvoice(saved)).toBe(7500);
    const drawer = sumCashSalesInWindow(state.db).get(SHOP, '2000-01-01', null, null) as { total_cash_sales: number };
    expect(drawer.total_cash_sales).toBe(7500);
  });

  it('a customer with nothing owing gets an advance, and the next bill uses it', () => {
    bill('A', 7390, 7500, 110);
    expect(party().balance).toBe(-110);
    bill('B', 1000, 0);
    expect(party().balance).toBe(890);
    const customer = raw.prepare('SELECT customer_id FROM customers WHERE name = ?').get(CHOTUS.name) as { customer_id: string };
    const invoices = raw.prepare("SELECT * FROM invoices WHERE tenant_id = 't' ORDER BY created_at").all() as Parameters<typeof computeCustomerCreditStatusSync>[3];
    const rows = computeCustomerCreditStatusSync(state.db as unknown as Parameters<typeof computeCustomerCreditStatusSync>[0], SHOP, customer.customer_id, invoices);
    expect(rows.map(r => r.outstanding_amount)).toEqual([0, 890]);
  });

  it('editing the bill re-posts it once, and deleting it removes the advance', async () => {
    bill('A', 7390, 7500, 110);
    const res = await updateInvoice({ invoice_id: 'A', tenant_id: SHOP, role: 'ADMIN', subtotal: 7000, tax_total: 0, discount_total: 0, discount_type: 'FIXED', discount_value: 0, grand_total: 7000, customer_name: CHOTUS.name, customer_phone: CHOTUS.phone, items: lines(7000), payment_method: 'CREDIT', received_amount: 7500, balance_amount: 0, split_details: { on_account: 500 } } as Parameters<typeof updateInvoice>[0]);
    expect(res.success, JSON.stringify(res)).toBe(true);
    expect(party().balance).toBe(-500);
    expect(ledger().filter(r => (r.reference_number || '').startsWith('A'))).toHaveLength(2);
    expect((await deleteInvoice('A', SHOP, 'ADMIN')).success).toBe(true);
    expect(party().balance).toBe(0);
  });

  it('old bills without the marker are unchanged: the excess was change', () => {
    bill('OLD', 7390, 7500);
    expect(party().balance).toBe(0);
    expect(ledger().find(r => r.reference_number === 'OLD-PAY')?.debit_amount).toBe(7390);
    const saved = raw.prepare("SELECT * FROM invoices WHERE invoice_number = 'OLD'").get() as Parameters<typeof getCashAmountFromInvoice>[0];
    expect(getCashAmountFromInvoice(saved)).toBe(7390);
  });

  it('a customer over the credit limit can still pay more than a bill (bill 7469)', () => {
    opening(16130);
    raw.prepare('UPDATE parties SET credit_limit = 16000 WHERE name = ?').run(CHOTUS.name);
    bill('7469', 3960, 4000, 40);
    expect(party().balance).toBe(16090);
    // A bill that adds credit is still refused.
    const res = checkout({
      invoice_id: 'MORE', user_id: 'u', tenant_id: SHOP, invoice_number: 'MORE', invoice_type: 'ESTIMATE', subtotal: 500, tax_total: 0, discount_total: 0, grand_total: 500,
      customer_name: CHOTUS.name, customer_phone: CHOTUS.phone, items: lines(500), payment_method: 'CREDIT', received_amount: 0, balance_amount: 500, split_details: null,
    } as Parameters<typeof checkout>[0]);
    expect(res.success).toBe(false);
    expect(party().balance).toBe(16090);
  });

  it('a marker can never exceed the money actually received', () => {
    bill('X', 1000, 1050, 500);
    expect(party().balance).toBe(-50);
  });
});

describe('onAccountExcess follows the billing screen', () => {
  const base = { grandTotal: 7390, received: 7500, hasParty: true, isStaff: false, partyOldBalance: 342221 };
  it('keeps the excess for a customer with a balance, on Cash or Credit', () => {
    expect(onAccountExcess({ ...base, paymentMethod: 'CASH' })).toBe(110);
    expect(onAccountExcess({ ...base, paymentMethod: 'CREDIT' })).toBe(110);
  });
  it('keeps it on a Credit bill for a customer with nothing owing', () => {
    expect(onAccountExcess({ ...base, partyOldBalance: 0, paymentMethod: 'CREDIT' })).toBe(110);
  });
  it('is change on a Cash bill for a customer with nothing owing, a walk-in, or staff', () => {
    expect(onAccountExcess({ ...base, partyOldBalance: 0, paymentMethod: 'CASH' })).toBe(0);
    expect(onAccountExcess({ ...base, hasParty: false, paymentMethod: 'CASH' })).toBe(0);
    expect(onAccountExcess({ ...base, isStaff: true, paymentMethod: 'CREDIT' })).toBe(0);
  });
  it('is nothing when the money does not exceed the bill or is not cash', () => {
    expect(onAccountExcess({ ...base, received: 7390, paymentMethod: 'CASH' })).toBe(0);
    expect(onAccountExcess({ ...base, paymentMethod: 'UPI' })).toBe(0);
  });
});

describe('cashShortOnAccount: cash below the bill on the Cash button', () => {
  const base = { paymentMethod: 'CASH', grandTotal: 600, received: 100, hasParty: true, isStaff: false, partyOldBalance: 500 };
  it('puts the unpaid part on account for a customer whose balance the screen shows (owing or advance)', () => {
    expect(cashShortOnAccount(base)).toBe(500);
    expect(cashShortOnAccount({ ...base, partyOldBalance: -500 })).toBe(500);
  });
  it('does nothing when paid in full, the Received box is empty, or for walk-ins, staff and other methods', () => {
    expect(cashShortOnAccount({ ...base, received: 600 })).toBe(0);
    expect(cashShortOnAccount({ ...base, received: 0 })).toBe(0);
    expect(cashShortOnAccount({ ...base, hasParty: false })).toBe(0);
    expect(cashShortOnAccount({ ...base, isStaff: true })).toBe(0);
    expect(cashShortOnAccount({ ...base, partyOldBalance: 0 })).toBe(0);
    expect(cashShortOnAccount({ ...base, paymentMethod: 'CREDIT' })).toBe(0);
  });
  it('saved as Credit with 100 paid, the ledger ends where the screen said: 500 + 600 - 100 = 1,000', () => {
    opening(500);
    bill('S1', 600, 100);
    expect(party().balance).toBe(1000);
  });
});
