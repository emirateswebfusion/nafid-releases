import { DatabaseSync } from 'node:sqlite';
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createCoreTables } from '../../electron/db/schemaCoreTables';
import { createExtendedTables } from '../../electron/db/schemaExtendedTables';
import { ensureSchemaColumns } from '../../electron/db/schemaColumns';
import { runColumnMigrations } from '../../electron/db/migrationsColumns';
import { runStartupMigrations } from '../../electron/db/migrations';
const state = vi.hoisted(() => ({ db: null as unknown as Database.Database }));
vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => [] } }));
vi.mock('../../electron/db/localDb', () => ({ getDb: () => state.db }));
vi.mock('../../electron/whatsapp/shopClosingReportService', () => ({ sendShopClosingReport: vi.fn() }));
vi.mock('../../electron/sync/syncWorker', () => ({ runInitialSync: async () => {}, triggerUrgentCashSync: async () => {} }));
import * as parties from '../../electron/services/partiesService';
import * as customers from '../../electron/services/customersService';
import * as cashier from '../../electron/services/cashierService';
import { autoDeduplicateCustomersAndParties } from '../../electron/db/customerDedupe';
import { upsertTableRows } from '../../electron/sync/lanUpsert';
import { localDate } from '../../electron/services/storeTime';

let raw: DatabaseSync;
let day: string;
beforeEach(() => {
  raw = new DatabaseSync(':memory:');
  let tx = 0;
  state.db = Object.assign(raw, { transaction: (fn: (...args: unknown[]) => unknown) => (...args: unknown[]) => {
    const id = `integrity_${++tx}`; raw.exec(`SAVEPOINT ${id}`);
    try { const result = fn(...args); raw.exec(`RELEASE ${id}`); return result; }
    catch (error) { raw.exec(`ROLLBACK TO ${id}; RELEASE ${id}`); throw error; }
  }, pragma: (sql: string) => raw.prepare(`PRAGMA ${sql}`).all() }) as unknown as Database.Database;
  createCoreTables(state.db); createExtendedTables(state.db); ensureSchemaColumns(state.db);
  runColumnMigrations(state.db); runStartupMigrations(state.db);
  day = localDate(new Date(), 'shop');
  raw.prepare("INSERT INTO cash_drawer(drawer_id,tenant_id,business_date,status,opening_balance) VALUES('drawer','shop',?,'OPEN',1000)").run(day);
  expect(parties.addParty({ party_id: 'party', tenant_id: 'shop', name: 'KSFE Chitty', party_type: 'CUSTOM', phone: '9890000001' }).success).toBe(true);
});
afterEach(() => raw.close());
const cash = (ledgerId = 'payment', partyId = 'party') => parties.addPartyLedgerEntry({
  ledger_id: ledgerId, party_id: partyId, tenant_id: 'shop', amount: 500, transaction_type: 'CREDIT',
  payment_method: 'CASH', reference_number: 'Cash Register', description: 'Cash paid',
});
const count = (table: string) => Number(raw.prepare(`SELECT count(*) n FROM ${table}`).get()?.n);

it('commits a register payment and its party ledger once in the same transaction', () => {
  expect(cashier.addTransaction({ tenant_id: 'shop', user_id: 'owner', type: 'CASH_OUT', amount: 500,
    party: { party_id: 'party', ledger_id: 'atomic', description: 'Monthly payment' } }).success).toBe(true);
  expect(count('party_ledger')).toBe(1); expect(count('cash_transactions')).toBe(1);
  expect(raw.prepare('SELECT category FROM cash_transactions').get()?.category).toBe('PARTY_LEDGER:atomic');
});
it.each(['ledger', 'cash'])('rolls back both records, balances and outbox when %s storage fails', failure => {
  const before = count('sync_outbox');
  raw.exec(`CREATE TRIGGER reject_payment BEFORE INSERT ON ${failure === 'ledger' ? 'party_ledger' : 'cash_transactions'} BEGIN SELECT RAISE(ABORT,'test storage failure'); END`);
  const result = cashier.addTransaction({ tenant_id: 'shop', user_id: 'owner', type: 'CASH_OUT', amount: 500,
    party: { party_id: 'party', ledger_id: 'atomic', description: 'Monthly payment' } });
  expect(result.success).toBe(false); expect(count('party_ledger')).toBe(0); expect(count('cash_transactions')).toBe(0);
  expect(raw.prepare("SELECT balance FROM parties WHERE party_id='party'").get()?.balance).toBe(0);
  expect(count('sync_outbox')).toBe(before);
});
it('rejects a missing party without leaving a hidden cash row', () => {
  expect(cashier.addTransaction({ tenant_id: 'shop', user_id: 'owner', type: 'CASH_OUT', amount: 500,
    party: { party_id: 'missing', ledger_id: 'atomic', description: 'Payment' } }).success).toBe(false);
  expect(count('cash_transactions')).toBe(0);
});
it('never guesses a ledger identity when deleting another equal cash expense', () => {
  expect(cash().success).toBe(true);
  expect(cashier.addTransaction({ tenant_id: 'shop', user_id: 'owner', type: 'CASH_OUT', amount: 500, category: 'Tea' }).success).toBe(true);
  const id = String(raw.prepare("SELECT transaction_id FROM cash_transactions WHERE category='Tea'").get()?.transaction_id);
  expect(cashier.deleteTransaction({ tenant_id: 'shop', user_id: 'owner', transaction_id: id }).success).toBe(true);
  expect(parties.getPartyLedger('party')).toHaveLength(1);
});
it('rejects a mismatched delete before removing any linked cash record', () => {
  cash(); const before = count('cash_transactions');
  expect(parties.deletePartyLedgerEntry({ ledger_id: 'payment', party_id: 'wrong' }).success).toBe(false);
  expect(count('cash_transactions')).toBe(before); expect(parties.getPartyLedger('party')).toHaveLength(1);
});
it('restores one linked cash row, including when general ledger integration is off', () => {
  cash(); expect(parties.deletePartyLedgerEntry({ ledger_id: 'payment', party_id: 'party' }).success).toBe(true);
  raw.prepare("INSERT INTO settings(tenant_id,key,value) VALUES('shop','cash_register_ledger_mode','off')").run();
  expect(parties.restorePartyLedgerEntry({ ledger_id: 'payment', party_id: 'party' }).success).toBe(true);
  expect(parties.restorePartyLedgerEntry({ ledger_id: 'payment', party_id: 'party' }).success).toBe(true);
  expect(count('cash_transactions')).toBe(1);
});
it('rejects a mismatched restore without recreating another party cash record', () => {
  cash(); parties.deletePartyLedgerEntry({ ledger_id: 'payment', party_id: 'party' });
  expect(parties.restorePartyLedgerEntry({ ledger_id: 'payment', party_id: 'wrong' }).success).toBe(false);
  expect(count('cash_transactions')).toBe(0);
  expect(raw.prepare('SELECT is_deleted FROM party_ledger').get()?.is_deleted).toBe(1);
});
it('shares edited amount/date and original register direction in live and history feeds', () => {
  cash(); parties.updatePartyLedgerEntry({ ledger_id: 'payment', party_id: 'party', amount: 700 });
  const live = cashier.getTransactions({ tenant_id: 'shop' });
  const history = cashier.getDayTransactions({ tenant_id: 'shop', business_date: day });
  expect(Array.isArray(live) && live[0]).toMatchObject({ amount: 700, type: 'CASH_OUT' });
  expect(Array.isArray(history) && history[0]).toMatchObject({ amount: 700, type: 'CASH_OUT' });
});
it('saves an explicit Estimate to GST correction', () => {
  cash(); parties.updatePartyLedgerEntry({ ledger_id: 'payment', party_id: 'party', balance_type: 'ESTIMATE' });
  expect(parties.updatePartyLedgerEntry({ ledger_id: 'payment', party_id: 'party', balance_type: 'GST' }).success).toBe(true);
  expect(raw.prepare('SELECT balance_type FROM party_ledger').get()?.balance_type).toBe('GST');
});
it('customer creation, editing and deletion cannot change a CUSTOM account sharing its phone', () => {
  cash(); expect(customers.createCustomer({ customer_id: 'customer', tenant_id: 'shop', name: 'Another Customer', phone: '9890000001' }).success).toBe(true);
  expect(customers.updateCustomer({ customer_id: 'customer', tenant_id: 'shop', name: 'Renamed Customer', phone: '9890000001' }).success).toBe(true);
  expect(customers.deleteCustomer({ customer_id: 'customer', tenant_id: 'shop' }).success).toBe(true);
  expect(raw.prepare("SELECT name,is_deleted FROM parties WHERE party_id='party'").get()).toMatchObject({ name: 'KSFE Chitty', is_deleted: 0 });
  expect(parties.getPartyLedger('party')).toHaveLength(1);
});
it('startup cleanup preserves distinct CUSTOM identities even with equal names', () => {
  cash(); raw.prepare("INSERT INTO parties(party_id,tenant_id,name,party_type) VALUES('canonical','shop','KSFE Chitty','CUSTOM')").run();
  expect(autoDeduplicateCustomersAndParties(state.db).merged_parties).toBe(0);
  expect(raw.prepare("SELECT count(*) n FROM parties WHERE COALESCE(is_deleted,0)=0").get()?.n).toBe(2);
});
it('startup cleanup preserves same-name CUSTOMER identities and their independent ledgers', () => {
  raw.exec("INSERT INTO parties(party_id,tenant_id,name,party_type,balance,phone) VALUES('a','shop','Same Customer','CUSTOMER',1000,'1111111'),('b','shop','Same Customer','CUSTOMER',500,'2222222')");
  parties.addPartyLedgerEntry({ ledger_id: 'b-payment', party_id: 'b', tenant_id: 'shop', amount: 500, transaction_type: 'CREDIT', description: 'Payment' });
  expect(autoDeduplicateCustomersAndParties(state.db).merged_parties).toBe(0);
  expect(raw.prepare("SELECT party_id FROM party_ledger WHERE ledger_id='b-payment'").get()?.party_id).toBe('b');
  expect(raw.prepare("SELECT COUNT(*) n FROM parties WHERE party_id IN ('a','b') AND COALESCE(is_deleted,0)=0").get()?.n).toBe(2);
});
it('refuses ambiguous customer deletion and only cascades an exact party identity', () => {
  raw.exec("INSERT INTO parties(party_id,tenant_id,name,party_type,phone) VALUES('a','shop','Same','CUSTOMER','222'),('b','shop','Same','CUSTOMER','222'); INSERT INTO customers(customer_id,tenant_id,name,phone) VALUES('ambiguous','shop','Same','222')");
  expect(customers.deleteCustomer({ customer_id: 'ambiguous', tenant_id: 'shop' }).success).toBe(false);
  expect(raw.prepare("SELECT is_deleted FROM customers WHERE customer_id='ambiguous'").get()?.is_deleted ?? 0).toBe(0);
  raw.exec("UPDATE customers SET customer_id='a' WHERE customer_id='ambiguous'");
  expect(customers.deleteCustomer({ customer_id: 'a', tenant_id: 'shop' }).success).toBe(true);
  expect(raw.prepare("SELECT is_deleted FROM parties WHERE party_id='b'").get()?.is_deleted ?? 0).toBe(0);
});
it('a historical description edit cannot open a new drawer without a new cash movement', () => {
  cash(); raw.prepare("UPDATE cash_drawer SET business_date='2026-10-15',status='CLOSED',closed_at='2026-10-15T18:00:00Z' WHERE drawer_id='drawer'").run();
  expect(parties.updatePartyLedgerEntry({ ledger_id: 'payment', party_id: 'party', description: 'Correct spelling' }).success).toBe(true);
  expect(count('cash_drawer')).toBe(1);
});
it('a stale LAN deleted copy never replaces the newer pending payment', () => {
  cash(); const row = raw.prepare('SELECT * FROM party_ledger').get()!;
  raw.prepare("UPDATE party_ledger SET row_version=9,updated_at='2026-11-19T12:00:00Z' WHERE ledger_id='payment'").run();
  upsertTableRows(state.db, 'party_ledger', [{ ...row, row_version: 1, is_deleted: 1, updated_at: '2026-11-01T12:00:00Z' }]);
  expect(raw.prepare('SELECT is_deleted,row_version FROM party_ledger').get()).toMatchObject({ is_deleted: 0, row_version: 9 });
});
it('accepts a higher LAN version despite clock skew and makes retries idempotent', () => {
  cash(); const row = raw.prepare('SELECT * FROM party_ledger').get()!;
  const incoming = { ...row, row_version: Number(row.row_version) + 1, origin: 'peer', credit_amount: 700, updated_at: '2020-01-01T00:00:00Z' };
  upsertTableRows(state.db, 'party_ledger', [incoming]);
  expect(raw.prepare('SELECT credit_amount FROM party_ledger').get()?.credit_amount).toBe(700);
  const before = count('sync_outbox');
  upsertTableRows(state.db, 'party_ledger', [incoming]);
  expect(count('sync_outbox')).toBe(before);
});
