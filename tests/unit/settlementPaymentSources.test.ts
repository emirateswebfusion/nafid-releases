import { DatabaseSync } from 'node:sqlite';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { createCoreTables } from '../../electron/db/schemaCoreTables';
import { createExtendedTables } from '../../electron/db/schemaExtendedTables';
const state = vi.hoisted(() => ({ db: null as unknown }));
vi.mock('../../electron/db/localDb', () => ({ getDb: () => state.db }));
vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => [] } }));
vi.mock('../../electron/services/cashDrawerService', async importOriginal => ({
  ...await importOriginal<typeof import('../../electron/services/cashDrawerService')>(),
  getOpenCashDrawer: () => null,
}));
vi.mock('../../electron/services/partyLedgerService', () => ({ syncInvoiceCreditLedger: vi.fn() }));
vi.mock('../../electron/whatsapp/shopClosingReportService', () => ({ sendShopClosingReport: vi.fn() }));
vi.mock('../../electron/services/storeTime', () => ({ localTimestamp: () => '2026-10-27', localDate: () => '2026-10-27' }));
vi.mock('../../electron/sync/syncWorker', () => ({ triggerUrgentInvoiceSync: async () => {}, triggerUrgentCashSync: async () => {} }));
import { settlePayment } from '../../electron/services/cashierService';
import { getSources, getTransactions } from '../../electron/services/paymentSourcesService';
let sql: DatabaseSync;
beforeEach(() => {
  sql = new DatabaseSync(':memory:');
  createCoreTables(sql as unknown as Parameters<typeof createCoreTables>[0]);
  createExtendedTables(sql as unknown as Parameters<typeof createExtendedTables>[0]);
  state.db = { prepare: (s: string) => sql.prepare(s), transaction: (fn: () => unknown) => () => {
    sql.exec('BEGIN'); try { const result = fn(); sql.exec('COMMIT'); return result; } catch (e) { sql.exec('ROLLBACK'); throw e; }
  }};
  sql.exec("INSERT INTO invoices (invoice_id,tenant_id,invoice_number,subtotal,grand_total,payment_method) VALUES ('i','t','INV-1',100,100,'PENDING')");
  sql.exec("INSERT INTO payment_sources (source_id,tenant_id,name,type,upi_id,current_balance,is_default) VALUES ('upi','t','UPI','UPI','abc@upi',10,1)");
});
afterEach(() => sql.close());
const settle = (method: string, split?: Record<string, unknown>, source?: string) => settlePayment({ tenant_id:'t',invoice_id:'i',received_amount:100,payment_method:method,split_details:split,payment_source_id:source,user_id:'u' });
const balance = () => (getSources('t') as { current_balance: number }[])[0].current_balance;
it('posts the selected UPI portion of cash plus UPI split to Payment Methods', () => {
  expect(settle('SPLIT',{cash:60,upi:40,upi_source_id:'upi'})).toEqual({success:true});
  expect(balance()).toBe(50);
  expect(getTransactions({tenant_id:'t',source_id:'upi'})).toEqual([expect.objectContaining({amount:40})]);
});
it('uses the same default UPI account as billing for a plain UPI settlement', () => {
  expect(settle('UPI')).toEqual({success:true}); expect(balance()).toBe(110);
});
it('cash settlement does not change a payment source', () => {
  expect(settle('CASH')).toEqual({success:true}); expect(balance()).toBe(10);
});
it('an explicitly selected UPI source receives the plain payment once', () => {
  expect(settle('UPI',undefined,'upi')).toEqual({success:true}); expect(balance()).toBe(110);
});

it.each(['CARD', 'BANK_TRANSFER'])('posts %s settlements to the configured default account', method => {
  const sourceType = method === 'BANK_TRANSFER' ? 'BANK' : 'CARD';
  sql.prepare('INSERT INTO payment_sources (source_id,tenant_id,name,type,current_balance,is_default) VALUES (?,?,?,?,?,1)').run('other','t',method,sourceType,20);
  expect(settle(method)).toEqual({success:true});
  expect(getTransactions({tenant_id:'t',source_id:'other'})).toEqual([expect.objectContaining({amount:100})]);
});
it('posts every non-cash split portion once alongside cash', () => {
  sql.exec("INSERT INTO payment_sources (source_id,tenant_id,name,type,current_balance) VALUES ('card','t','Card','CARD',0), ('bank','t','Bank','BANK',0)");
  expect(settle('SPLIT',{cash:10,upi:20,card:30,bank_transfer:40,upi_source_id:'upi',card_source_id:'card',bank_source_id:'bank'})).toEqual({success:true});
  for (const [source, amount] of [['upi',20],['card',30],['bank',40]] as const) {
    expect(getTransactions({tenant_id:'t',source_id:source})).toEqual([expect.objectContaining({amount})]);
  }
});
