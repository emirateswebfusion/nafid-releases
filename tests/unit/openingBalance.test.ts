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
import { deleteInvoice, updateInvoice } from '../../electron/services/invoiceEditService';
import { addParty, addPartyLedgerEntry, bulkImportParties, getParties } from '../../electron/services/partiesService';
import { importOpeningBalances, type OpeningImportInput } from '../../electron/services/partyOpeningBalance';
import { computeCustomerCreditStatusSync } from '../../electron/services/customerCreditService';
import { backfillCreditInvoices, resetBackfillThrottle } from '../../electron/services/partyLedgerService';
import { parseOpeningBalanceGrid } from '../../src/components/data-upload/openingBalanceFile';
import { CustomerIdentityService } from '../../electron/db/customerIdentity';
import * as partiesSyncSql from '../../electron/db/statements/sync/partiesSync';

const AS_OF = '2026-10-31T18:29:59.000Z';
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

const payFields = (total: number, method: string, received = 0) => ({ payment_method: method, received_amount: method === 'CASH' ? total : received, balance_amount: method === 'CREDIT' ? total - received : 0, split_details: null });
const lines = (total: number) => [{ item_id: crypto.randomUUID(), product_id: 'p', name: 'Cement', quantity: 1, unit_price: total, tax_amount: 0, total }];
function bill(no: string, name: string, phone: string | null, total: number, method = 'CREDIT', received = 0, invoiceId = no) {
  const res = checkout({ invoice_id: invoiceId, user_id: 'u', tenant_id: 't', invoice_number: no, invoice_type: 'ESTIMATE', subtotal: total, tax_total: 0, discount_total: 0, grand_total: total, customer_name: name, customer_phone: phone, items: lines(total), ...payFields(total, method, received) } as Parameters<typeof checkout>[0]);
  expect(res.success, JSON.stringify(res)).toBe(true);
  recentCheckoutsCache.clear();
}
async function edit(no: string, name: string, phone: string | null, total: number, method = 'CREDIT', received = 0) {
  const res = await updateInvoice({ invoice_id: no, tenant_id: 't', role: 'ADMIN', subtotal: total, tax_total: 0, discount_total: 0, discount_type: 'FIXED', discount_value: 0, grand_total: total, customer_name: name, customer_phone: phone, items: lines(total), ...payFields(total, method, received) } as Parameters<typeof updateInvoice>[0]);
  expect(res.success, JSON.stringify(res)).toBe(true);
  recentCheckoutsCache.clear();
}
const newParty = (id: string, name: string, phone: string | null, balance: number, balance_type = 'RECEIVABLE', party_type = 'CUSTOMER') =>
  expect(addParty({ party_id: id, tenant_id: 't', name, phone, balance, balance_type, party_type } as Parameters<typeof addParty>[0]).success).toBe(true);
const balanceOf = (id: string) => (getParties('t') as Array<{ party_id: string; balance: number }>).find(p => p.party_id === id)!.balance;
const ledgerSum = (id: string) => (raw.prepare('SELECT ROUND(COALESCE(SUM(credit_amount - debit_amount), 0), 2) s FROM party_ledger WHERE party_id = ? AND is_deleted = 0').get(id) as { s: number }).s;
const pay = (id: string, amount: number, reference: string | null = null) => expect(addPartyLedgerEntry({ ledger_id: crypto.randomUUID(), party_id: id, tenant_id: 't', transaction_type: 'DEBIT', amount, description: 'Payment', transaction_date: '2026-11-01T12:00:00.000Z', reference_number: reference, payment_method: 'OTHER' } as Parameters<typeof addPartyLedgerEntry>[0]).success).toBe(true);
function outstanding(name: string) {
  const c = raw.prepare("SELECT customer_id FROM customers WHERE tenant_id = 't' AND LOWER(name) = LOWER(?)").get(name) as { customer_id: string };
  const invoices = raw.prepare("SELECT * FROM invoices WHERE tenant_id = 't' AND is_deleted = 0 AND LOWER(customer_name) = LOWER(?)").all(name) as Parameters<typeof computeCustomerCreditStatusSync>[3];
  return Object.fromEntries(computeCustomerCreditStatusSync(state.db, 't', c.customer_id, invoices).map(i => [i.invoice_number, i.outstanding_amount]));
}
const importFile = (rows: OpeningImportInput['rows'], extra: Partial<OpeningImportInput> = {}) =>
  importOpeningBalances({ tenant_id: 't', party_type: 'CUSTOMER', as_of: AS_OF, apply: true, rows, ...extra });

describe('opening balance from the party form', () => {
  it('uploads: the row is PENDING and marked as opening (D1)', () => {
    newParty('A', 'Ravi', '9800000001', 10000);
    const row = raw.prepare("SELECT sync_status, reference_number, payment_method, credit_amount FROM party_ledger WHERE party_id = 'A'").get() as Record<string, unknown>;
    expect(row).toMatchObject({ sync_status: 'PENDING', reference_number: 'OPENING-BALANCE', payment_method: 'OPENING', credit_amount: 10000 });
    expect(balanceOf('A')).toBe(10000);
  });

  it('a negative receivable is an advance with a ledger row, not a debt (D4)', () => {
    newParty('N', 'Adv', '9800000078', -500);
    expect(balanceOf('N')).toBe(-500);
    expect(ledgerSum('N')).toBe(-500);
  });

  it('a payable keeps its meaning', () => {
    newParty('S', 'Supp', '9800000077', 800, 'PAYABLE', 'SUPPLIER');
    expect(balanceOf('S')).toBe(-800);
    expect(ledgerSum('S')).toBe(-800);
  });

  it('stored balance always equals the ledger: no party is left with money and no rows (D5)', () => {
    newParty('A', 'Ravi', '9800000001', 700);
    newParty('N', 'Adv', '9800000002', -300);
    newParty('Z', 'Zero', '9800000003', 0);
    for (const id of ['A', 'N', 'Z']) expect(balanceOf(id)).toBe(ledgerSum(id));
  });
});

describe('opening balance import', () => {
  it('sets existing parties, keeps both signs and the file total, and a repeat changes nothing (D2)', () => {
    newParty('A', 'Ravi Traders', '9800000001', 0);
    newParty('B', 'Anil', null, 0);
    const res = importFile([{ name: 'ravi  traders', amount: 1250.5 }, { name: 'Anil', amount: -300 }]);
    expect(res).toMatchObject({ success: true, applied: true, posted: 2, total: 950.5 });
    expect(balanceOf('A')).toBe(1250.5);
    expect(balanceOf('B')).toBe(-300);
    expect((raw.prepare("SELECT transaction_date, sync_status FROM party_ledger WHERE party_id = 'A'").get() as Record<string, string>)).toMatchObject({ transaction_date: AS_OF, sync_status: 'PENDING' });

    const again = importFile([{ name: 'Ravi Traders', amount: 1250.5 }, { name: 'Anil', amount: -300 }]);
    expect(again).toMatchObject({ applied: true, posted: 0 });
    expect(raw.prepare('SELECT COUNT(*) c FROM party_ledger').get()).toEqual({ c: 2 });
    expect(balanceOf('A')).toBe(1250.5);
  });

  it('writes nothing when any row is unmatched, ambiguous or conflicting', () => {
    newParty('A', 'Ravi', '9800000001', 0);
    newParty('B', 'Anil', '9800000002', 400);
    raw.prepare("INSERT INTO parties (party_id, tenant_id, name, phone, party_type, is_deleted) VALUES ('T1', 't', 'Twin', '9800000011', 'CUSTOMER', 0), ('T2', 't', 'TWIN.', '9800000012', 'CUSTOMER', 0)").run();
    const res = importFile([{ name: 'Ravi', amount: 100 }, { name: 'Nobody', amount: 5 }, { name: 'Twin', amount: 5 }, { name: 'Anil', amount: 999 }]);
    expect(res).toMatchObject({ success: true, applied: false, posted: 0, blocked: 3 });
    expect(res.results!.map(r => r.status)).toEqual(['post', 'unmatched', 'ambiguous', 'conflict']);
    expect(balanceOf('A')).toBe(0);
    expect(balanceOf('B')).toBe(400);
  });

  it('a name twice in the file is blocked, and a preview writes nothing', () => {
    newParty('A', 'Ravi', '9800000001', 0);
    expect(importFile([{ name: 'Ravi', amount: 1 }, { name: 'RAVI', amount: 2 }]).blocked).toBe(2);
    expect(importFile([{ name: 'Ravi', amount: 1 }], { apply: false })).toMatchObject({ applied: false, blocked: 0 });
    expect(balanceOf('A')).toBe(0);
  });

  it('matches name only: parties sharing a phone stay separate', () => {
    newParty('A', 'Ravi', '9800000001', 0);
    newParty('B', 'Ravi Son', '9800000001', 0);
    importFile([{ name: 'Ravi Son', amount: 50 }]);
    expect(balanceOf('A')).toBe(0);
    expect(balanceOf('B')).toBe(50);
  });

  it('for suppliers a positive amount is what the shop owes', () => {
    newParty('S', 'Supp', '9800000077', 0, 'PAYABLE', 'SUPPLIER');
    importFile([{ name: 'Supp', amount: 800 }], { party_type: 'SUPPLIER' });
    expect(balanceOf('S')).toBe(-800);
    expect(importFile([{ name: 'Supp', amount: 800 }], { party_type: 'SUPPLIER' }).posted).toBe(0);
  });

  it('customer import cannot touch a supplier with the same name', () => {
    newParty('S', 'Same', '9800000077', 0, 'PAYABLE', 'SUPPLIER');
    expect(importFile([{ name: 'Same', amount: 1 }]).blocked).toBe(1);
  });

  it('the general import tells the screen when it left an existing balance alone', () => {
    newParty('A', 'Ravi', '9800000001', 0);
    const res = bulkImportParties([{ party_id: 'NEW', tenant_id: 't', name: 'Ravi', phone: '9800000001', balance: 5000, balance_type: 'RECEIVABLE', party_type: 'CUSTOMER' } as Parameters<typeof bulkImportParties>[0][number]]);
    expect(res).toMatchObject({ success: true, ignored_balances: 1 });
    expect(balanceOf('A')).toBe(0);
  });

  it('the general import posts one signed row for a new party', () => {
    bulkImportParties([{ party_id: 'NEW', tenant_id: 't', name: 'Fresh', phone: '9800000005', balance: -120, balance_type: 'RECEIVABLE', party_type: 'CUSTOMER' } as Parameters<typeof bulkImportParties>[0][number]]);
    expect(balanceOf('NEW')).toBe(-120);
    expect(ledgerSum('NEW')).toBe(-120);
  });
});

describe('opening balance file', () => {
  it('reads a billing export with title rows, blank balances and a Total row', () => {
    const grid = [[], ['SHOP'], ['Customer List'], [], ['SlNo', 'Code', 'Account Name', 'Address1', 'Balance', 'Credit Limit'],
      ['1', '0001', 'Ravi', 'Town', 141525, 0], ['2', '0002', 'Blank', 'Town', '', 0], ['3', '0003', 'Adv', 'Town', '-84,500.50', 0], [], ['', '', 'Total', '', 57024.5, '']];
    expect(parseOpeningBalanceGrid(grid)).toEqual({ rows: [{ name: 'Ravi', amount: 141525 }, { name: 'Adv', amount: -84500.5 }], fileTotal: 57024.5 });
  });

  it('reports a file with no usable header and a balance that is not a number', () => {
    expect(parseOpeningBalanceGrid([['a', 'b']]).error).toBeTruthy();
    expect(parseOpeningBalanceGrid([['Name', 'Balance'], ['Ravi', 'abc']]).rows[0].error).toContain('abc');
  });
});

describe('payments against an opening balance (D3)', () => {
  beforeEach(() => { newParty('A', 'Ravi', '9800000001', 10000); bill('B1', 'Ravi', '9800000001', 5000); });
  const opening = () => balanceOf('A') - Object.values(outstanding('Ravi')).reduce((s, v) => s + v, 0);

  it('an unreferenced payment clears the opening first: the bill stays whole', () => {
    pay('A', 3000);
    expect(balanceOf('A')).toBe(12000);
    expect(outstanding('Ravi')).toEqual({ B1: 5000 });
    expect(opening()).toBe(7000);
  });

  it('beyond the opening it goes on to the oldest bill', () => {
    pay('A', 12000);
    expect(balanceOf('A')).toBe(3000);
    expect(outstanding('Ravi')).toEqual({ B1: 3000 });
    expect(opening()).toBe(0);
  });

  it('a payment naming the bill still goes to that bill', () => {
    pay('A', 2000, 'B1');
    expect(outstanding('Ravi')).toEqual({ B1: 3000 });
    expect(opening()).toBe(10000);
  });

  it('a receipt marked OPENING-BALANCE beyond the opening pays the bill', () => {
    pay('A', 11000, 'OPENING-BALANCE');
    expect(balanceOf('A')).toBe(4000);
    expect(outstanding('Ravi')).toEqual({ B1: 4000 });
  });

  it('an advance pays later bills', () => {
    newParty('N', 'Adv', '9800000078', -1000);
    bill('B2', 'Adv', '9800000078', 2500);
    expect(balanceOf('N')).toBe(1500);
    expect(outstanding('Adv')).toEqual({ B2: 1500 });
  });
});

describe('edits never disturb an opening balance', () => {
  it('sale, edit, cash, part payment, delete', async () => {
    newParty('A', 'Ravi', '9800000001', 10000);
    bill('B1', 'Ravi', '9800000001', 5000);
    expect(balanceOf('A')).toBe(15000);
    await edit('B1', 'Ravi', '9800000001', 6000);
    expect(balanceOf('A')).toBe(16000);
    await edit('B1', 'Ravi', '9800000001', 6000, 'CASH');
    expect(balanceOf('A')).toBe(10000);
    await edit('B1', 'Ravi', '9800000001', 4000, 'CREDIT', 1000);
    expect(balanceOf('A')).toBe(13000);
    deleteInvoice('B1');
    resetBackfillThrottle();
    expect(balanceOf('A')).toBe(10000);
    expect(ledgerSum('A')).toBe(10000);
  });
});

describe('two bills with one number (D6)', () => {
  beforeEach(() => {
    newParty('A', 'Ravi', '9800000001', 0);
    newParty('B', 'Anil', '9800000002', 0);
    bill('POS1-001', 'Ravi', '9800000001', 700, 'CREDIT', 0, 'inv-x');
    // A sync collision renamed the first bill; its ledger row still carries the old reference.
    raw.prepare("UPDATE invoices SET invoice_number = 'POS1-001-CX' WHERE invoice_id = 'inv-x'").run();
    bill('POS1-001', 'Anil', '9800000002', 300, 'CREDIT', 0, 'inv-y');
  });

  it('the second bill does not take over the first bill\'s ledger row', () => {
    expect(balanceOf('A')).toBe(700);
    expect(ledgerSum('A')).toBe(700);
    expect(balanceOf('B')).toBe(300);
  });

  it('editing either bill leaves the other alone, and backfill never doubles', async () => {
    await edit('inv-y', 'Anil', '9800000002', 350);
    expect(balanceOf('A')).toBe(700);
    expect(balanceOf('B')).toBe(350);
    resetBackfillThrottle();
    backfillCreditInvoices(state.db);
    expect(ledgerSum('A')).toBe(700);
    expect(ledgerSum('B')).toBe(350);
  });

  it('a row under the old number-based id is replaced on the next save, not added to', async () => {
    raw.prepare("DELETE FROM party_ledger WHERE party_id = 'B'").run();
    raw.prepare("INSERT INTO party_ledger (ledger_id, party_id, tenant_id, transaction_date, description, credit_amount, debit_amount, running_balance, balance_type, reference_number, is_deleted) VALUES ('legacy', 'B', 't', '2026-11-01', 'Credit Sale POS1-001', 300, 0, 300, 'GST', 'POS1-001', 0)").run();
    await edit('inv-y', 'Anil', '9800000002', 320);
    expect(ledgerSum('B')).toBe(320);
    expect(ledgerSum('A')).toBe(700);
  });
});

describe('a bill never exists without its ledger rows (D10)', () => {
  it('a ledger failure at checkout rolls the whole bill back', () => {
    newParty('A', 'Ravi', '9800000001', 0);
    const spy = vi.spyOn(CustomerIdentityService, 'findOrCreateCustomerAndParty').mockReturnValue(null);
    const res = checkout({ invoice_id: 'F1', user_id: 'u', tenant_id: 't', invoice_number: 'F1', invoice_type: 'ESTIMATE', subtotal: 500, tax_total: 0, discount_total: 0, grand_total: 500, customer_name: 'Ravi', customer_phone: '9800000001', items: lines(500), ...payFields(500, 'CREDIT') } as Parameters<typeof checkout>[0]);
    spy.mockRestore();
    expect(res.success).toBe(false);
    expect(raw.prepare("SELECT COUNT(*) c FROM invoices WHERE invoice_id = 'F1'").get()).toEqual({ c: 0 });
    expect(raw.prepare("SELECT current_stock s FROM products WHERE product_id = 'p'").get()).toEqual({ s: 100000 });
  });

  it('one bill that cannot be repaired does not stop the repair of the others', () => {
    newParty('A', 'Ravi', '9800000001', 0);
    bill('G1', 'Ravi', '9800000001', 100);
    bill('G2', 'Ravi', '9800000001', 200);
    raw.prepare("DELETE FROM party_ledger WHERE party_id = 'A'").run();
    const real = CustomerIdentityService.findOrCreateCustomerAndParty;
    let calls = 0;
    const spy = vi.spyOn(CustomerIdentityService, 'findOrCreateCustomerAndParty').mockImplementation((...args) => (++calls === 1 ? null : real.apply(CustomerIdentityService, args)));
    resetBackfillThrottle();
    backfillCreditInvoices(state.db);
    spy.mockRestore();
    expect(raw.prepare("SELECT COUNT(*) c FROM party_ledger WHERE party_id = 'A' AND is_deleted = 0").get()).toEqual({ c: 1 });
  });
});

describe('pull de-duplication (D9)', () => {
  it('ledger rows moved to the cloud copy of a party stay queued for upload', () => {
    newParty('LOCAL', 'Ravi', '9800000001', 0);
    bill('H1', 'Ravi', '9800000001', 100);
    raw.prepare("INSERT INTO parties (party_id, tenant_id, name, phone, party_type, is_deleted) VALUES ('CLOUD', 't', 'Ravi Cloud', '9800000002', 'CUSTOMER', 0)").run();
    raw.prepare("UPDATE party_ledger SET sync_status = 'SYNCED' WHERE party_id = 'LOCAL'").run();
    partiesSyncSql.updatePartyLedger(state.db).run('CLOUD', 'LOCAL', 't');
    expect(raw.prepare("SELECT party_id, sync_status FROM party_ledger WHERE reference_number = 'H1'").get()).toEqual({ party_id: 'CLOUD', sync_status: 'PENDING' });
  });
});

describe('customers with the same name (D7)', () => {
  beforeEach(() => newParty('A', 'Ravi', '9800000001', 10000));
  const ravis = () => raw.prepare("SELECT party_id, phone, balance FROM parties WHERE tenant_id = 't' AND LOWER(name) = 'ravi' AND is_deleted = 0 ORDER BY phone").all() as Array<{ party_id: string; phone: string | null; balance: number }>;

  it('a different phone is another person, also after a name-only bill created a phone-less customer', () => {
    bill('N1', 'Ravi', null, 1000);
    bill('N2', 'Ravi', '9800000099', 200);
    const rows = ravis();
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ party_id: 'A', balance: 11000 });
    expect(rows[1]).toMatchObject({ phone: '9800000099', balance: 200 });
  });

  it('the same phone, or no phone, stays on the one account', () => {
    bill('N1', 'Ravi', '9800000001', 100);
    bill('N2', 'Ravi', null, 100);
    expect(ravis()).toHaveLength(1);
    expect(balanceOf('A')).toBe(10200);
  });

  it('a party without a phone takes the first phone typed for it', () => {
    newParty('P', 'Noor', null, 700);
    bill('N3', 'Noor', '9800000055', 300);
    expect(balanceOf('P')).toBe(1000);
  });
});
