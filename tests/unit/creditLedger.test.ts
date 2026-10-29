/**
 * Customer credit balances end to end: real SQLite schema and the real checkout / edit / payment / return / delete
 * services. Every expectation is the amount the customer owes, to the paisa, after the operation.
 */
import { DatabaseSync } from 'node:sqlite';
import type Database from 'better-sqlite3';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
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
  const stamp = () => new Date(Date.UTC(2026, 9, 27, 4, 0, 0) + (++state.tick) * 60_000).toISOString();
  return { localTimestamp: stamp, localDate: () => '2026-10-27', getStoreTimezoneSetting: () => 'Asia/Kolkata', parseCleanDate: (d: string) => d };
});
vi.mock('../../electron/sync/syncWorker', () => ({ runInitialSync: async () => {}, triggerUrgentInvoiceSync: async () => {}, triggerUrgentCashSync: async () => {} }));
import { checkout, recentCheckoutsCache } from '../../electron/services/invoiceCheckoutService';
import { deleteInvoice, updateInvoice, updateInvoicePayment } from '../../electron/services/invoiceEditService';
import { restoreInvoice } from '../../electron/services/recycleBinService';
import { createReturn, deleteReturn, settleReturnInvoice } from '../../electron/services/returnsService';
import { addPartyLedgerEntry, getParties, getPartyLedger } from '../../electron/services/partiesService';
import { computeCustomerCreditStatusSync } from '../../electron/services/customerCreditService';
import { resetBackfillThrottle } from '../../electron/services/partyLedgerService';

let raw: DatabaseSync;
beforeEach(() => {
  raw = new DatabaseSync(':memory:');
  state.db = Object.assign(raw, { transaction: (fn: () => unknown) => () => { raw.exec('SAVEPOINT test_tx'); try { const result = fn(); raw.exec('RELEASE test_tx'); return result; } catch (e) { raw.exec('ROLLBACK TO test_tx; RELEASE test_tx'); throw e; } } }) as unknown as Database.Database;
  createCoreTables(state.db); createExtendedTables(state.db); ensureSchemaColumns(state.db); runColumnMigrations(state.db);
  state.db.exec("ALTER TABLE invoices ADD COLUMN counts_in_revenue INTEGER NOT NULL DEFAULT 1; ALTER TABLE invoices ADD COLUMN bill_purpose TEXT NOT NULL DEFAULT 'SALE'; ALTER TABLE invoices ADD COLUMN stock_applied INTEGER NOT NULL DEFAULT 1;");
  raw.prepare("INSERT INTO products (product_id, tenant_id, name, base_price, current_stock) VALUES ('p', 't', 'Cement bag', 100, 100000)").run();
  recentCheckoutsCache.clear();
  resetBackfillThrottle();
});
afterEach(() => raw.close());

type Pay = { method: string; received?: number; split?: Record<string, number> };
type Customer = { name: string; phone?: string };
const SHOP = 't';
const id = (no: string, tenant = SHOP) => `${tenant}:${no}`;

/** Bill `total` rupees of cement (1 bag = ₹100, so `total` need not be a multiple: the line total is what counts). */
function lines(total: number) {
  return [{ item_id: crypto.randomUUID(), product_id: 'p', name: 'Cement bag', quantity: 1, unit_price: total, tax_amount: 0, total }];
}
function payFields(total: number, pay: Pay) {
  const m = pay.method;
  const received = m === 'SPLIT'
    ? Object.entries(pay.split || {}).filter(([k]) => k !== 'credit').reduce((s, [, v]) => s + v, 0)
    : pay.received ?? (m === 'CREDIT' || m === 'PENDING' ? 0 : total);
  return {
    payment_method: m, received_amount: received,
    balance_amount: m === 'CREDIT' ? total - received : 0,
    split_details: m === 'SPLIT' ? pay.split : null,
  };
}
function bill(no: string, who: Customer, total: number, pay: Pay, extra: Record<string, unknown> = {}, tenant = SHOP) {
  const res = checkout({
    invoice_id: id(no, tenant), user_id: 'u', tenant_id: tenant, invoice_number: no, invoice_type: 'ESTIMATE',
    subtotal: total, tax_total: 0, discount_total: 0, grand_total: total,
    customer_name: who.name, customer_phone: who.phone ?? null, items: lines(total),
    ...payFields(total, pay), ...extra,
  } as Parameters<typeof checkout>[0]);
  expect(res.success, JSON.stringify(res)).toBe(true);
  recentCheckoutsCache.clear();
  return res;
}
async function edit(no: string, who: Customer, total: number, pay: Pay, tenant = SHOP) {
  const res = await updateInvoice({
    invoice_id: id(no, tenant), tenant_id: tenant, role: 'ADMIN', subtotal: total, tax_total: 0, discount_total: 0,
    discount_type: 'FIXED', discount_value: 0, grand_total: total, customer_name: who.name, customer_phone: who.phone,
    items: lines(total), ...payFields(total, pay),
  } as Parameters<typeof updateInvoice>[0]);
  expect(res.success, JSON.stringify(res)).toBe(true);
  recentCheckoutsCache.clear();
}
function changePayment(no: string, total: number, pay: Pay) {
  const res = updateInvoicePayment({ invoice_id: id(no), tenant_id: SHOP, ...payFields(total, pay) } as Parameters<typeof updateInvoicePayment>[0]);
  expect(res.success).toBe(true);
  recentCheckoutsCache.clear();
}
function partyOf(who: Customer, tenant = SHOP) {
  return raw.prepare('SELECT party_id FROM parties WHERE tenant_id = ? AND LOWER(name) = LOWER(?) AND is_deleted = 0').get(tenant, who.name) as { party_id: string } | undefined;
}
/** What the Parties page shows for the customer (and the stored balance must agree with it). */
function owed(who: Customer, tenant = SHOP): number {
  const list = getParties(tenant) as Array<{ party_id: string; name: string; balance: number }>;
  const row = list.find(p => p.name.toLowerCase() === who.name.toLowerCase());
  if (!row) return 0;
  const stored = raw.prepare('SELECT balance FROM parties WHERE party_id = ?').get(row.party_id) as { balance: number };
  expect(stored.balance, `stored balance of ${who.name}`).toBeCloseTo(row.balance, 2);
  const ledger = getPartyLedger(row.party_id) as Array<{ credit_amount: number; debit_amount: number; running_balance: number }>;
  const sum = ledger.reduce((s, e) => s + e.credit_amount - e.debit_amount, 0);
  expect(sum, `ledger total of ${who.name}`).toBeCloseTo(row.balance, 2);
  if (ledger.length) expect(ledger[ledger.length - 1].running_balance, `running balance of ${who.name}`).toBeCloseTo(row.balance, 2);
  return Math.round(row.balance * 100) / 100;
}
function pay(who: Customer, amount: number, description = 'Payment received', date = '2026-10-27T10:30:00.000Z', reference: string | null = null) {
  const party = partyOf(who);
  expect(party, `party for ${who.name}`).toBeTruthy();
  const res = addPartyLedgerEntry({ ledger_id: crypto.randomUUID(), party_id: party!.party_id, tenant_id: SHOP, transaction_type: 'DEBIT', amount, description, transaction_date: date, reference_number: reference, payment_method: 'CASH' } as Parameters<typeof addPartyLedgerEntry>[0]);
  expect(res.success).toBe(true);
}
function returnGoods(no: string, invoiceNo: string, amount: number, refund: string, who?: Customer) {
  const res = createReturn({ return_id: `r:${no}`, invoice_id: id(invoiceNo), tenant_id: SHOP, return_number: no, subtotal: amount, tax_total: 0, grand_total: amount, refund_method: refund, customer_name: who?.name, customer_phone: who?.phone, items: [{ return_item_id: crypto.randomUUID(), product_id: 'p', name: 'Cement bag', quantity: 1, unit_price: amount, tax_amount: 0, total: amount }] } as Parameters<typeof createReturn>[0]);
  expect(res.success, JSON.stringify(res)).toBe(true);
}

const ravi = { name: 'Ravi Traders', phone: '9800000001' };
const anil = { name: 'Anil Hardware', phone: '9800000002' };
const sara = { name: 'Sara Builders', phone: '9800000003' };

describe('credit balance after billing operations', () => {
  it('a receipt explicitly allocated to opening debt does not also settle a new invoice', () => {
    bill('NEW-531', ravi, 531, { method: 'CREDIT' });
    const party = partyOf(ravi)!;
    expect(addPartyLedgerEntry({ ledger_id: crypto.randomUUID(), party_id: party.party_id, tenant_id: SHOP,
      transaction_type: 'CREDIT', amount: 75, reference_number: 'OPENING-BALANCE', payment_method: 'OTHER',
      description: 'Opening receivable', transaction_date: '2026-10-26T10:00:00.000Z' }).success).toBe(true);
    pay(ravi, 50, 'Collect opening debt', '2026-10-27T10:30:00.000Z', 'OPENING-BALANCE');
    expect(owed(ravi)).toBe(556);
    const customer = raw.prepare("SELECT customer_id FROM customers WHERE tenant_id = 't' AND name = ?").get(ravi.name) as { customer_id: string };
    const invoices = raw.prepare("SELECT * FROM invoices WHERE tenant_id = 't'").all() as Parameters<typeof computeCustomerCreditStatusSync>[3];
    const rows = computeCustomerCreditStatusSync(state.db, SHOP, customer.customer_id, invoices);
    expect(rows[0].outstanding_amount).toBe(531);
    pay(ravi, 31, 'Payment toward new invoice', '2026-10-27T11:00:00.000Z', 'NEW-531');
    expect(computeCustomerCreditStatusSync(state.db, SHOP, customer.customer_id, invoices)[0].outstanding_amount).toBe(500);
  });

  it('full credit, partial credit and full payment bills', () => {
    bill('B-1', ravi, 1000, { method: 'CREDIT' });
    bill('B-2', ravi, 2500, { method: 'CREDIT', received: 1000 });
    bill('B-3', ravi, 700, { method: 'CASH' });
    bill('B-4', ravi, 300, { method: 'UPI' });
    bill('B-5', ravi, 1200, { method: 'SPLIT', split: { cash: 200, upi: 300, credit: 700 } });
    expect(owed(ravi)).toBe(1000 + 1500 + 700);
  });

  it('editing one bill never touches bills whose number starts with the same digits', async () => {
    bill('B-1', ravi, 1000, { method: 'CREDIT' });
    for (let n = 10; n <= 12; n++) bill(`B-${n}`, ravi, 100, { method: 'CREDIT' });
    bill('B-13', anil, 400, { method: 'CREDIT' });
    await edit('B-1', ravi, 1200, { method: 'CREDIT' });
    expect(owed(ravi)).toBe(1200 + 300);
    expect(owed(anil)).toBe(400);
  });

  it('deleting a bill removes only that bill and refreshes the balance', () => {
    bill('B-1', ravi, 1000, { method: 'CREDIT' });
    bill('B-10', ravi, 250, { method: 'CREDIT' });
    bill('B-2', anil, 900, { method: 'CREDIT' });
    expect(deleteInvoice(id('B-2')).success).toBe(true);
    expect(owed(anil)).toBe(0);
    expect(deleteInvoice(id('B-1')).success).toBe(true);
    expect(owed(ravi)).toBe(250);
    expect(restoreInvoice(id('B-1')).success).toBe(true);
    expect(owed(ravi)).toBe(1250);
  });

  it('a payment recorded against a bill survives later edits of that bill', async () => {
    bill('B-7', sara, 5000, { method: 'CREDIT' });
    pay(sara, 2000, 'Payment received for B-7', '2026-10-27T11:00:00.000Z', 'B-7');
    expect(owed(sara)).toBe(3000);
    await edit('B-7', sara, 5500, { method: 'CREDIT' });
    await edit('B-7', sara, 5500, { method: 'CREDIT', received: 500 });
    expect(owed(sara)).toBe(3000);
  });

  it('two equal payments on the same day both count', () => {
    bill('B-1', ravi, 3000, { method: 'CREDIT' });
    pay(ravi, 500, '', '2026-10-27T10:30:00.000Z');
    pay(ravi, 500, '', '2026-10-27T10:30:00.000Z');
    pay(ravi, 500, 'Cheque', '2026-10-27T12:00:00.000Z', 'CHQ-1');
    pay(ravi, 500, 'Cheque', '2026-10-28T12:00:00.000Z', 'CHQ-1');
    expect(owed(ravi)).toBe(1000);
  });

  it('switching the payment method back and forth never duplicates or loses an adjustment', () => {
    bill('B-1', ravi, 1000, { method: 'CREDIT' });
    const steps: Array<[Pay, number]> = [
      [{ method: 'CREDIT', received: 400 }, 600],
      [{ method: 'SPLIT', split: { cash: 300, upi: 200, credit: 500 } }, 500],
      [{ method: 'UPI' }, 0],
      [{ method: 'CASH' }, 0],
      [{ method: 'BANK_TRANSFER' }, 0],
      [{ method: 'CREDIT' }, 1000],
      [{ method: 'SPLIT', split: { card: 250, bank_transfer: 250, credit: 500 } }, 500],
      [{ method: 'CREDIT' }, 1000],
      [{ method: 'CREDIT' }, 1000],
    ];
    for (const [p, expected] of steps) {
      changePayment('B-1', 1000, p);
      expect(owed(ravi), JSON.stringify(p)).toBe(expected);
    }
  });

  it('editing amounts and payment together, many times, keeps one adjustment', async () => {
    bill('B-1', ravi, 1000, { method: 'CREDIT' });
    pay(ravi, 100);
    const steps: Array<[number, Pay, number]> = [
      [1500, { method: 'CREDIT' }, 1400],
      [800, { method: 'CREDIT', received: 300 }, 400],
      [800, { method: 'CASH' }, -100],
      [2000, { method: 'SPLIT', split: { cash: 500, credit: 1500 } }, 1400],
      [2000, { method: 'SPLIT', split: { cash: 500, credit: 1500 } }, 1400],
      [999.5, { method: 'CREDIT' }, 899.5],
    ];
    for (const [total, p, expected] of steps) {
      await edit('B-1', ravi, total, p);
      expect(owed(ravi), `${total} ${JSON.stringify(p)}`).toBe(expected);
    }
  });

  it('changing the customer of a bill moves the credit to the new customer', async () => {
    bill('B-1', ravi, 1000, { method: 'CREDIT' });
    bill('B-2', anil, 300, { method: 'CREDIT' });
    await edit('B-1', anil, 1000, { method: 'CREDIT' });
    expect(owed(ravi)).toBe(0);
    expect(owed(anil)).toBe(1300);
    await edit('B-1', ravi, 1100, { method: 'CREDIT', received: 100 });
    expect(owed(ravi)).toBe(1000);
    expect(owed(anil)).toBe(300);
  });

  it('a bill of another shop with the same number is never touched', async () => {
    bill('B-1', ravi, 1000, { method: 'CREDIT' });
    bill('B-1', ravi, 800, { method: 'CREDIT' }, {}, 'other');
    await edit('B-1', ravi, 1200, { method: 'CREDIT' });
    expect(deleteInvoice(id('B-1')).success).toBe(true);
    expect(owed(ravi, 'other')).toBe(800);
  });

  it('returns: credit refund reduces the due, money refunds leave it unchanged, edits keep them', async () => {
    bill('B-1', ravi, 2000, { method: 'CREDIT' });
    returnGoods('R-1', 'B-1', 300, 'CREDIT');
    expect(owed(ravi)).toBe(1700);
    await edit('B-1', ravi, 2000, { method: 'CREDIT', received: 200 });
    expect(owed(ravi)).toBe(1500);
    bill('B-2', anil, 1000, { method: 'CASH' });
    returnGoods('R-2', 'B-2', 400, 'CASH');
    expect(owed(anil)).toBe(0);
    returnGoods('R-3', 'B-1', 100, 'UPI');
    expect(owed(ravi)).toBe(1500);
    expect(deleteReturn('r:R-1').success).toBe(true);
    expect(owed(ravi)).toBe(1800);
  });

  it('a return credit used on the next bill is counted once', () => {
    bill('B-1', sara, 1000, { method: 'CASH' });
    returnGoods('R-1', 'B-1', 200, 'ADJUST_BILL');
    expect(owed(sara)).toBe(-200);
    bill('B-2', sara, 800, { method: 'CREDIT' }, { subtotal: 1000, return_deduction: 200, return_invoice_number: 'R-1' });
    expect(settleReturnInvoice({ tenant_id: SHOP, return_number: 'R-1', adjusted_invoice_number: 'B-2', amount: 200 }).success).toBe(true);
    expect(owed(sara)).toBe(800);
  });

  it('deleting a bill that used a return credit gives the credit back; restoring uses it again', () => {
    bill('B-1', sara, 1000, { method: 'CASH' });
    returnGoods('R-1', 'B-1', 200, 'ADJUST_BILL');
    bill('B-2', sara, 800, { method: 'CREDIT' }, { subtotal: 1000, return_deduction: 200, return_invoice_number: 'R-1' });
    settleReturnInvoice({ tenant_id: SHOP, return_number: 'R-1', adjusted_invoice_number: 'B-2', amount: 200 });
    expect(deleteInvoice(id('B-2')).success).toBe(true);
    expect(owed(sara)).toBe(-200);
    expect(raw.prepare("SELECT adjusted_amount FROM returns WHERE return_number = 'R-1'").get()).toMatchObject({ adjusted_amount: 0 });
    expect(restoreInvoice(id('B-2')).success).toBe(true);
    expect(owed(sara)).toBe(800);
    expect(raw.prepare("SELECT adjusted_amount FROM returns WHERE return_number = 'R-1'").get()).toMatchObject({ adjusted_amount: 200 });
  });

  it('removing the customer from a credit bill takes the credit off their account', async () => {
    bill('B-1', ravi, 1000, { method: 'CREDIT' });
    await edit('B-1', { name: '' }, 1000, { method: 'CASH' });
    expect(owed(ravi)).toBe(0);
    expect(raw.prepare("SELECT customer_id FROM invoices WHERE invoice_id = 't:B-1'").get()).toMatchObject({ customer_id: null });
  });

  it('the same goods billed to two customers within seconds are two bills', () => {
    const one = checkout({ invoice_id: 'x1', user_id: 'u', tenant_id: SHOP, invoice_number: 'B-1', invoice_type: 'ESTIMATE', subtotal: 500, tax_total: 0, discount_total: 0, grand_total: 500, customer_name: ravi.name, customer_phone: ravi.phone, items: lines(500), ...payFields(500, { method: 'CREDIT' }) } as Parameters<typeof checkout>[0]);
    const two = checkout({ invoice_id: 'x2', user_id: 'u', tenant_id: SHOP, invoice_number: 'B-2', invoice_type: 'ESTIMATE', subtotal: 500, tax_total: 0, discount_total: 0, grand_total: 500, customer_name: anil.name, customer_phone: anil.phone, items: lines(500).map(l => ({ ...l, item_id: 'same' })), ...payFields(500, { method: 'CREDIT' }) } as Parameters<typeof checkout>[0]);
    expect(one.invoice_number).toBe('B-1');
    expect(two.invoice_number).toBe('B-2');
    expect(owed(ravi)).toBe(500);
    expect(owed(anil)).toBe(500);
  });

  it('per-bill outstanding agrees with the balance for partial credit and split bills', () => {
    bill('B-1', ravi, 1000, { method: 'CREDIT', received: 400 });
    bill('B-2', ravi, 1000, { method: 'SPLIT', split: { cash: 300, credit: 700 } });
    pay(ravi, 100);
    const invoices = raw.prepare("SELECT * FROM invoices WHERE tenant_id = 't' ORDER BY created_at").all() as Parameters<typeof computeCustomerCreditStatusSync>[3];
    const customer = raw.prepare("SELECT customer_id FROM customers WHERE name = 'Ravi Traders'").get() as { customer_id: string };
    const rows = computeCustomerCreditStatusSync(state.db as unknown as Parameters<typeof computeCustomerCreditStatusSync>[0], SHOP, customer.customer_id, invoices);
    expect(rows.map(r => r.outstanding_amount)).toEqual([500, 700]);
    expect(owed(ravi)).toBe(1200);
    // A later payment that references a bill pays that bill first; its overpayment pays the other open bills.
    pay(ravi, 800, 'Payment for B-2', '2026-10-28T10:00:00.000Z', 'B-2');
    const after = computeCustomerCreditStatusSync(state.db as unknown as Parameters<typeof computeCustomerCreditStatusSync>[0], SHOP, customer.customer_id, invoices);
    expect(after.map(r => r.outstanding_amount)).toEqual([400, 0]);
    expect(owed(ravi)).toBe(400);
  });
});

describe('randomised wholesale day: 40 customers, 600 operations', () => {
  /** Independent model of what each customer owes: bill credit portions minus payments. */
  const creditOf = (total: number, p: Pay) => p.method === 'CREDIT' ? total - Math.min(total, p.received ?? 0)
    : p.method === 'SPLIT' ? Math.min(total, p.split?.credit ?? 0) : 0;

  it('every balance matches the model after every operation', async () => {
    let seed = 20261027;
    const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
    const customers: Customer[] = Array.from({ length: 40 }, (_, i) => ({ name: `Wholesale Customer ${i + 1}`, phone: `98${String(10000000 + i * 7919).slice(-8)}` }));
    const amount = () => Math.round((50 + rnd() * 20000) * 100) / 100;
    const payment = (total: number): Pay => {
      const r = rnd();
      if (r < 0.3) return { method: 'CREDIT' };
      if (r < 0.45) return { method: 'CREDIT', received: Math.round(total * rnd() * 100) / 100 };
      if (r < 0.6) {
        const credit = Math.round(total * rnd() * 100) / 100;
        const cash = Math.round((total - credit) * rnd() * 100) / 100;
        return { method: 'SPLIT', split: { cash, upi: Math.round((total - credit - cash) * 100) / 100, credit } };
      }
      return { method: pick(['CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'CHEQUE']) };
    };
    const bills = new Map<string, { who: Customer; total: number; pay: Pay; live: boolean }>();
    const paid = new Map<string, number>();
    const expected = (who: Customer) => Math.round(([...bills.values()]
      .filter(b => b.live && b.who === who).reduce((s, b) => s + creditOf(b.total, b.pay), 0) - (paid.get(who.name) || 0)) * 100) / 100;

    let next = 1;
    for (let op = 0; op < 600; op++) {
      const r = rnd();
      const existing = [...bills.entries()];
      const touched = new Set<Customer>();
      if (r < 0.35 || existing.length < 5) {
        const no = `B-${next++}`; const who = pick(customers); const total = amount(); const p = payment(total);
        bill(no, who, total, p); bills.set(no, { who, total, pay: p, live: true }); touched.add(who);
      } else if (r < 0.55) {
        const [no, b] = pick(existing.filter(([, x]) => x.live));
        const who = rnd() < 0.2 ? pick(customers) : b.who; const total = rnd() < 0.5 ? amount() : b.total; const p = payment(total);
        await edit(no, who, total, p); touched.add(b.who); touched.add(who); Object.assign(b, { who, total, pay: p });
      } else if (r < 0.72) {
        const [no, b] = pick(existing.filter(([, x]) => x.live));
        const p = payment(b.total);
        changePayment(no, b.total, p); b.pay = p; touched.add(b.who);
      } else if (r < 0.8) {
        const [no, b] = pick(existing);
        if (b.live) expect(deleteInvoice(id(no)).success).toBe(true); else expect(restoreInvoice(id(no)).success).toBe(true);
        b.live = !b.live; touched.add(b.who);
      } else {
        const who = pick([...new Set([...bills.values()].filter(b => b.live && creditOf(b.total, b.pay) > 0).map(b => b.who))]);
        if (!who) continue;
        const amt = Math.round(rnd() * 5000 * 100) / 100;
        pay(who, amt, rnd() < 0.5 ? '' : 'Payment received', '2026-10-27T10:30:00.000Z');
        paid.set(who.name, (paid.get(who.name) || 0) + amt); touched.add(who);
      }
      resetBackfillThrottle();
      const check = op % 50 === 49 ? customers : [...touched];
      for (const who of check) {
        if (!partyOf(who) && expected(who) === 0) continue;
        expect(owed(who), `op ${op}: ${who.name}`).toBeCloseTo(expected(who), 2);
        // The per-bill outstanding (customer screens, overdue checks) adds up to what the customer owes.
        const customer = raw.prepare('SELECT customer_id FROM customers WHERE name = ?').get(who.name) as { customer_id: string } | undefined;
        if (customer) {
          const invoices = raw.prepare("SELECT * FROM invoices WHERE tenant_id = 't' AND customer_name = ? AND is_deleted = 0").all(who.name) as Parameters<typeof computeCustomerCreditStatusSync>[3];
          const rows = computeCustomerCreditStatusSync(state.db as unknown as Parameters<typeof computeCustomerCreditStatusSync>[0], SHOP, customer.customer_id, invoices);
          const outstanding = rows.reduce((s, r) => s + r.outstanding_amount, 0);
          expect(outstanding, `op ${op}: outstanding of ${who.name}`).toBeCloseTo(Math.max(0, expected(who)), 2);
        }
      }
    }
  }, 120_000);
});
