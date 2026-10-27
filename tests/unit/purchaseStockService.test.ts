import { DatabaseSync } from 'node:sqlite';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { createCoreTables } from '../../electron/db/schemaCoreTables';
import { createExtendedTables } from '../../electron/db/schemaExtendedTables';
const state = vi.hoisted(() => ({ db: null as unknown }));
vi.mock('../../electron/db/localDb', () => ({ getDb: () => state.db }));
vi.mock('../../electron/services/cashDrawerService', () => ({ getOpenCashDrawer: () => null }));
vi.mock('../../electron/services/partyLedgerService', () => ({ recalcPartyBalances: vi.fn() }));
vi.mock('../../electron/services/invoiceNumberService', () => ({ getOrInitTerminalCode: () => 'TEST' }));
vi.mock('../../electron/services/storeTime', () => ({ localTimestamp: () => '2026-10-27', localDate: () => '2026-10-27' }));
vi.mock('../../electron/sync/syncWorker', () => ({ runInitialSync: async () => {} }));
import { addPurchaseBill, updatePurchaseBill, deletePurchaseBill } from '../../electron/services/purchasesService';
let sql: DatabaseSync;
beforeEach(() => {
  sql = new DatabaseSync(':memory:');
  createCoreTables(sql as unknown as Parameters<typeof createCoreTables>[0]);
  createExtendedTables(sql as unknown as Parameters<typeof createExtendedTables>[0]);
  state.db = { prepare: (s: string) => sql.prepare(s), transaction: (fn: () => unknown) => () => {
    sql.exec('BEGIN'); try { const result = fn(); sql.exec('COMMIT'); return result; } catch (e) { sql.exec('ROLLBACK'); throw e; }
  }};
  sql.prepare('INSERT INTO products (product_id,tenant_id,name,base_price,current_stock) VALUES (?,?,?,?,?)').run('p','t','Product',10,20);
});
afterEach(() => sql.close());
function bill(id: string, type = 'GST', quantity = 3, skip = 0) {
  return { purchase_bill_id: id, tenant_id: 't', bill_number: id, supplier_name: 'Supplier', total_amount: 0, bill_type: type,
    items: [{ item_id: id + '-item', product_id: 'p', name: 'Product', quantity, purchase_price: 5, total_amount: quantity * 5, skip_stock_update: skip }] };
}
const stock = () => sql.prepare('SELECT current_stock FROM products WHERE product_id=?').get('p')?.current_stock;
it.each(['GST','ESTIMATE'])('%s create/edit/repeated edit/delete posts only the bill quantity', type => {
  expect(addPurchaseBill(bill('one',type))).toEqual({ success: true }); expect(stock()).toBe(23);
  expect(updatePurchaseBill(bill('one',type,5))).toEqual({ success: true }); expect(stock()).toBe(25);
  expect(updatePurchaseBill(bill('one',type,5))).toEqual({ success: true }); expect(stock()).toBe(25);
  expect(deletePurchaseBill('one')).toEqual({ success: true }); expect(stock()).toBe(20);
  expect(deletePurchaseBill('one')).toEqual({ success: true }); expect(stock()).toBe(20);
});
it('an unrelated historical estimate does not suppress a new physical GST purchase', () => {
  expect(addPurchaseBill(bill('estimate','ESTIMATE'))).toEqual({ success: true });
  expect(addPurchaseBill(bill('physical'))).toEqual({ success: true }); expect(stock()).toBe(26);
});
it('paper/shared GST documents never add or reverse physical stock', () => {
  addPurchaseBill(bill('estimate','ESTIMATE'));
  addPurchaseBill(bill('paper','GST',3,1)); expect(stock()).toBe(23);
  updatePurchaseBill(bill('paper','GST',5,1)); expect(stock()).toBe(23);
  deletePurchaseBill('paper'); expect(stock()).toBe(23);
});
it('editing a physical GST bill after an estimate was added reverses its original posting', () => {
  addPurchaseBill(bill('physical')); addPurchaseBill(bill('estimate','ESTIMATE'));
  updatePurchaseBill(bill('physical','GST',5)); expect(stock()).toBe(28);
});
it('duplicate bill creation rolls back without adding stock twice', () => {
  addPurchaseBill(bill('one')); expect(addPurchaseBill(bill('one')).success).toBe(false); expect(stock()).toBe(23);
});
