import { DatabaseSync } from 'node:sqlite';
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createCoreTables } from '../../electron/db/schemaCoreTables';
import { createExtendedTables } from '../../electron/db/schemaExtendedTables';
import { ensureSchemaColumns } from '../../electron/db/schemaColumns';
import { runColumnMigrations } from '../../electron/db/migrationsColumns';
import { m024PurchaseInterstate } from '../../electron/db/migrations/024-purchase-interstate';
const state = vi.hoisted(() => ({ db: null as unknown as Database.Database }));
vi.mock('../../electron/db/localDb', () => ({ getDb: () => state.db }));
vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => [] } }));
vi.mock('../../electron/whatsapp/shopClosingReportService', () => ({ sendShopClosingReport: vi.fn() }));
vi.mock('../../electron/sync/syncWorker', () => ({ runInitialSync: async () => {} }));
import { addPartyLedgerEntry, updatePartyLedgerEntry, deletePartyLedgerEntry, restorePartyLedgerEntry } from '../../electron/services/partiesService';
import { syncLedgerPaymentAccount } from '../../electron/services/ledgerPaymentAccounts';
import { createReturn, deleteReturn } from '../../electron/services/returnsService';
import { buildPayStatement } from '../../src/utils/pricing/staffPayStatement';
import { addStaffTransaction, getStaffLedger, saveStaffAttendance, getStaffAttendance } from '../../electron/services/staffService';
import { addPurchaseBill, updatePurchaseBill, deletePurchaseBill } from '../../electron/services/purchasesService';

let raw: DatabaseSync;
beforeEach(() => {
  raw = new DatabaseSync(':memory:');
  state.db = Object.assign(raw, { transaction: (fn: () => unknown) => () => {
    raw.exec('SAVEPOINT ledger_test');
    try { const result = fn(); raw.exec('RELEASE ledger_test'); return result; }
    catch (error) { raw.exec('ROLLBACK TO ledger_test; RELEASE ledger_test'); throw error; }
  } }) as unknown as Database.Database;
  createCoreTables(state.db); createExtendedTables(state.db); ensureSchemaColumns(state.db); runColumnMigrations(state.db);
  raw.exec("ALTER TABLE returns ADD COLUMN is_deleted INTEGER NOT NULL DEFAULT 0");
  raw.exec("ALTER TABLE return_items ADD COLUMN combo_details TEXT");
  m024PurchaseInterstate.up(state.db);
  raw.exec("INSERT INTO parties (party_id,tenant_id,name) VALUES ('p','t','Wholesale customer')");
  for (const type of ['UPI', 'CARD', 'BANK']) raw.prepare(`INSERT INTO payment_sources
    (source_id,tenant_id,name,type,current_balance,is_default,is_enabled) VALUES (?,'t',?,?,0,1,1)`).run(type,type,type);
});
afterEach(() => raw.close());
const balance = (source: string) => (raw.prepare('SELECT current_balance AS b FROM payment_sources WHERE source_id = ?').get(source) as { b: number }).b;
const add = (method: string, amount = 1500, id = 'l') => addPartyLedgerEntry({ ledger_id: id, tenant_id: 't', party_id: 'p', amount,
  description: 'Repayment', transaction_type: 'DEBIT', payment_method: method });

it.each(['UPI', 'CARD', 'BANK_TRANSFER'])('staff payout reduces its %s account, while accruals do not move money', payment_method => {
  raw.exec("INSERT INTO staff (staff_id,tenant_id,name,staff_code) VALUES ('worker','t','QA Worker','QA-1')");
  const source = payment_method === 'BANK_TRANSFER' ? 'BANK' : payment_method;
  addStaffTransaction({ tenant_id: 't', staff_id: 'worker', type: 'SALARY_ACCRUAL', amount: 500, payment_method });
  expect(balance(source)).toBe(0);
  addStaffTransaction({ tenant_id: 't', staff_id: 'worker', type: 'ADVANCE', amount: 100.25, payment_method });
  addStaffTransaction({ tenant_id: 't', staff_id: 'worker', type: 'SALARY_PAYMENT', amount: 50.25, payment_method });
  expect(balance(source)).toBe(-150.5);
});

it('rolls back staff and financial ledgers together if account posting fails', () => {
  raw.exec("INSERT INTO staff (staff_id,tenant_id,name,staff_code) VALUES ('worker','t','QA Worker','QA-1')");
  raw.exec("CREATE TRIGGER reject_staff_posting BEFORE INSERT ON payment_source_transactions BEGIN SELECT RAISE(ABORT, 'test failure'); END");
  expect(() => addStaffTransaction({ tenant_id: 't', staff_id: 'worker', type: 'ADVANCE', amount: 100, payment_method: 'UPI' })).toThrow('test failure');
  expect(raw.prepare('SELECT COUNT(*) AS n FROM staff_transactions').get()?.n).toBe(0);
  expect(raw.prepare('SELECT COUNT(*) AS n FROM staff_ledger').get()?.n).toBe(0);
  expect(balance('UPI')).toBe(0);
});

it('purchase edits and deletion replace only the supplier account effect', () => {
  const bill = { purchase_bill_id: 'purchase', tenant_id: 't', bill_number: 'PUR-QA', supplier_name: 'QA supplier',
    total_amount: 100, payment_type: 'UPI', items: [] };
  expect(addPurchaseBill(bill)).toEqual({ success: true });
  expect(balance('UPI')).toBe(-100);
  expect(updatePurchaseBill({ ...bill, total_amount: 150 })).toEqual({ success: true });
  expect(balance('UPI')).toBe(-150);
  expect(updatePurchaseBill({ ...bill, total_amount: 150, payment_type: 'BANK_TRANSFER' })).toEqual({ success: true });
  expect([balance('UPI'), balance('BANK')]).toEqual([0, -150]);
  expect(deletePurchaseBill('purchase')).toEqual({ success: true });
  expect(deletePurchaseBill('purchase')).toEqual({ success: true });
  expect(balance('BANK')).toBe(0);
});

it.each(['UPI', 'CARD', 'BANK_TRANSFER'])('posts %s repayment once and reverses edits, deletes and restores', method => {
  const source = method === 'BANK_TRANSFER' ? 'BANK' : method;
  expect(add(method)).toEqual({ success: true });
  expect(balance(source)).toBe(1500);
  syncLedgerPaymentAccount(state.db, 'l', 'p');
  expect(balance(source)).toBe(1500);
  expect(updatePartyLedgerEntry({ ledger_id: 'l', party_id: 'p', amount: 1000 })).toEqual({ success: true });
  expect(balance(source)).toBe(1000);
  expect(deletePartyLedgerEntry({ ledger_id: 'l', party_id: 'p' })).toEqual({ success: true });
  expect(balance(source)).toBe(0);
  expect(deletePartyLedgerEntry({ ledger_id: 'l', party_id: 'p' })).toEqual({ success: true });
  expect(balance(source)).toBe(0);
  expect(restorePartyLedgerEntry({ ledger_id: 'l', party_id: 'p' })).toEqual({ success: true });
  expect(balance(source)).toBe(1000);
});

it('moves an edited repayment between UPI and card, then cash, without doubling collections', () => {
  expect(add('UPI')).toEqual({ success: true });
  expect(updatePartyLedgerEntry({ ledger_id: 'l', party_id: 'p', payment_method: 'CARD' })).toEqual({ success: true });
  expect([balance('UPI'), balance('CARD')]).toEqual([0,1500]);
  expect(updatePartyLedgerEntry({ ledger_id: 'l', party_id: 'p', payment_method: 'CASH' })).toEqual({ success: true });
  expect([balance('UPI'), balance('CARD')]).toEqual([0,0]);
  expect(raw.prepare("SELECT amount FROM cash_transactions WHERE category = 'PARTY_LEDGER:l'").get()?.amount).toBe(1500);
});

it.each([0, -1, NaN, Infinity, '1500oops'])('rejects invalid repayment amount %s without financial writes', amount => {
  const result = addPartyLedgerEntry({ ledger_id:'bad',tenant_id:'t',party_id:'p',amount,description:'Bad input',transaction_type:'DEBIT',payment_method:'UPI' });
  expect(result.success).toBe(false);
  expect(balance('UPI')).toBe(0);
  expect(raw.prepare('SELECT COUNT(*) AS n FROM party_ledger').get()?.n).toBe(0);
});

it('keeps two identical legitimate repayments and reverses a party payment direction', () => {
  expect(add('UPI',1500,'a')).toEqual({ success: true });
  expect(add('UPI',1500,'b')).toEqual({ success: true });
  expect(balance('UPI')).toBe(3000);
  expect(updatePartyLedgerEntry({ ledger_id:'b',party_id:'p',transaction_type:'CREDIT' })).toEqual({ success:true });
  expect(balance('UPI')).toBe(0);
});

it('does not post invoice checkout collections a second time through the ledger', () => {
  raw.exec("INSERT INTO invoices (invoice_id,tenant_id,invoice_number) VALUES ('i','t','B-1')");
  raw.exec("INSERT INTO party_ledger (ledger_id,party_id,tenant_id,description,debit_amount,running_balance,payment_method,reference_number) VALUES ('l','p','t','Payment received',1500,0,'UPI','B-1-UPI')");
  syncLedgerPaymentAccount(state.db,'l','p');
  expect(balance('UPI')).toBe(0);
});

it('rejects a duplicate payment id without collecting it twice', () => {
  expect(add('UPI')).toEqual({ success:true });
  expect(add('UPI').success).toBe(false);
  expect(balance('UPI')).toBe(1500);
  expect(raw.prepare('SELECT COUNT(*) AS n FROM party_ledger').get()?.n).toBe(1);
});

it('rolls back the customer payment when its account posting fails', () => {
  raw.exec("CREATE TRIGGER reject_account BEFORE INSERT ON payment_source_transactions BEGIN SELECT RAISE(ABORT, 'simulated storage failure'); END");
  expect(add('UPI').success).toBe(false);
  expect(balance('UPI')).toBe(0);
  expect(raw.prepare('SELECT COUNT(*) AS n FROM party_ledger').get()?.n).toBe(0);
  expect(raw.prepare("SELECT balance FROM parties WHERE party_id='p'").get()?.balance).toBe(0);
});

it('refuses a payment whose customer belongs to another shop', () => {
  expect(addPartyLedgerEntry({ ledger_id:'bad',tenant_id:'other',party_id:'p',amount:100,
    description:'wrong shop',transaction_type:'DEBIT',payment_method:'UPI' }).success).toBe(false);
  expect(raw.prepare('SELECT COUNT(*) AS n FROM party_ledger').get()?.n).toBe(0);
});

it.each(['UPI', 'CARD', 'BANK_TRANSFER'])('deducts a %s return refund once and reverses its cancellation', refund_method => {
  const source = refund_method === 'BANK_TRANSFER' ? 'BANK' : refund_method;
  raw.exec("INSERT INTO products (product_id,tenant_id,name,base_price,current_stock) VALUES ('product','t','Rice sack',375.5,10)");
  raw.exec("INSERT INTO invoices (invoice_id,tenant_id,invoice_number,grand_total,payment_method) VALUES ('i','t','B-1',375.5,'UPI')");
  expect(add(refund_method,1000)).toEqual({ success:true });
  raw.exec("INSERT INTO invoice_items(item_id,invoice_id,tenant_id,product_id,name,quantity,unit_price,total) VALUES('source','i','t','product','Rice sack',1,375.5,375.5)");
  const payload = { return_id:'r',invoice_id:'i',tenant_id:'t',return_number:'RTN-1',subtotal:375.5,tax_total:0,grand_total:375.5,
    refund_method,items:[{return_item_id:'ri',product_id:'product',name:'Rice sack',quantity:1,unit_price:375.5,tax_amount:0,total:375.5}] };
  expect(createReturn(payload)).toEqual({ success:true });
  expect(balance(source)).toBe(624.5);
  expect(raw.prepare("SELECT current_stock FROM products WHERE product_id='product'").get()?.current_stock).toBe(11);
  expect(deleteReturn('r')).toEqual({ success:true });
  expect(balance(source)).toBe(1000);
  expect(deleteReturn('r')).toEqual({ success:true });
  expect(balance(source)).toBe(1000);
  expect(raw.prepare("SELECT current_stock FROM products WHERE product_id='product'").get()?.current_stock).toBe(10);
});

it('completes staff salary steps with a reconciled ledger, cash drawer and editable attendance', () => {
  raw.exec("INSERT INTO staff (staff_id,tenant_id,name,staff_code) VALUES ('worker','t','QA Worker','QA-1'); INSERT INTO cash_drawer (drawer_id,tenant_id,business_date,status,opening_balance,current_cash,expected_closing) VALUES ('staff-drawer','t','2026-11-05','OPEN',10000,10000,10000)");
  for(const [type,amount] of [['SALARY_ACCRUAL',6500],['ADVANCE',1500],['BONUS',100],['DEDUCTION',50],['STAFF_PURCHASE',200],['SALARY_PAYMENT',4850]] as const) {
    expect(addStaffTransaction({tenant_id:'t',staff_id:'worker',type,amount,payment_method:'CASH'}).success).toBe(true);
  }
  const ledger=getStaffLedger({tenant_id:'t',staff_id:'worker'}) as import('../../src/utils/pricing/staffPayStatement').PayLedgerRow[];
  expect(buildPayStatement(ledger,new Date())).toMatchObject({salaryAdded:6500,advances:1500,extras:100,deductions:50,storePurchases:200,salaryPaid:4850,balance:0});
  expect(raw.prepare("SELECT cash_out,current_cash FROM cash_drawer WHERE drawer_id='staff-drawer'").get()).toMatchObject({cash_out:6350,current_cash:3650});
  const saved=saveStaffAttendance({tenant_id:'t',staff_id:'worker',date:'2026-11-05',status:'PRESENT'});
  const edited=saveStaffAttendance({tenant_id:'t',staff_id:'worker',date:'2026-11-05',status:'HALF_DAY'});
  expect(edited.attendance_id).toBe(saved.attendance_id);
  expect(getStaffAttendance({tenant_id:'t',staff_id:'worker',month:'2026-11'})).toMatchObject([{status:'HALF_DAY'}]);
  expect(getStaffAttendance({tenant_id:'other-shop',staff_id:'worker',month:'2026-11'})).toEqual([]);
  expect(getStaffLedger({tenant_id:'t',staff_id:'worker'})).toHaveLength(6);
});
