import { DatabaseSync } from 'node:sqlite';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { createCoreTables } from '../../electron/db/schemaCoreTables';
import { createExtendedTables } from '../../electron/db/schemaExtendedTables';
import { m024PurchaseInterstate } from '../../electron/db/migrations/024-purchase-interstate';

const state = vi.hoisted(() => ({ db: null as unknown }));
vi.mock('../../electron/db/localDb', () => ({ getDb: () => state.db }));
vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => [] } }));
vi.mock('../../electron/services/invoiceNumberService', () => ({ getOrInitTerminalCode: () => 'TEST' }));
vi.mock('../../electron/services/storeTime', () => ({
  localTimestamp: () => '2026-11-21 12:00:00',
  localDate: () => '2026-11-21',
  parseCleanDate: (d: string) => d,
  getStoreTimezoneSetting: () => 'UTC',
  storeWallClockToUtc: (d: string, h: number, m: number, s: number) => new Date(`${d}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}Z`),
}));
vi.mock('../../electron/services/storeCountryService', () => ({
  getStoreCountrySetting: () => 'IN',
  roundStoreMoney: (n: number) => Math.round(n * 100) / 100,
  storeMoneyMinorUnit: () => 0.01,
}));
vi.mock('../../electron/sync/syncWorker', () => ({
  runInitialSync: vi.fn(async () => {}),
  triggerUrgentCashSync: vi.fn(async () => {}),
}));

import { addPurchaseBill, updatePurchaseBill, deletePurchaseBill } from '../../electron/services/purchasesService';

let sql: DatabaseSync;

beforeEach(() => {
  sql = new DatabaseSync(':memory:');
  createCoreTables(sql as unknown as Parameters<typeof createCoreTables>[0]);
  createExtendedTables(sql as unknown as Parameters<typeof createExtendedTables>[0]);
  m024PurchaseInterstate.up(sql as unknown as Parameters<typeof m024PurchaseInterstate.up>[0]);
  sql.exec('ALTER TABLE invoices ADD COLUMN counts_in_revenue INTEGER NOT NULL DEFAULT 1;');

  state.db = {
    prepare: (s: string) => sql.prepare(s),
    transaction: (fn: () => unknown) => () => {
      sql.exec('BEGIN');
      try {
        const result = fn();
        sql.exec('COMMIT');
        return result;
      } catch (e) {
        sql.exec('ROLLBACK');
        throw e;
      }
    },
  };

  sql.prepare('INSERT INTO parties (party_id, tenant_id, name, balance, estimate_balance, gst_balance) VALUES (?, ?, ?, ?, ?, ?)')
    .run('sup1', 't', 'Supplier One', 0, 0, 0);

  sql.prepare('INSERT INTO products (product_id, tenant_id, name, base_price, current_stock) VALUES (?, ?, ?, ?, ?)')
    .run('prod1', 't', 'Product One', 100, 50);

  sql.prepare(`
    INSERT INTO cash_drawer (drawer_id, tenant_id, business_date, status, opening_balance, cash_sales, cash_in, cash_out, current_cash, expected_closing)
    VALUES (?, ?, ?, 'OPEN', ?, ?, ?, ?, ?, ?)
  `).run('d1', 't', '2026-11-21', 5000, 0, 0, 0, 5000, 5000);
});

afterEach(() => {
  sql.close();
});

function createBillPayload(id: string, paymentType: string, totalAmount: number) {
  return {
    purchase_bill_id: id,
    tenant_id: 't',
    bill_number: id,
    supplier_id: 'sup1',
    supplier_name: 'Supplier One',
    total_amount: totalAmount,
    bill_type: 'GST',
    payment_type: paymentType,
    items: [
      {
        item_id: `${id}-item-1`,
        product_id: 'prod1',
        name: 'Product One',
        quantity: 2,
        purchase_price: totalAmount / 2,
        total_amount: totalAmount,
      },
    ],
  };
}

it('clears Cash Register entry and refunds cash drawer when editing a CASH purchase bill to CREDIT', () => {
  // 1. Initial entry: Saved as CASH for 1000
  const addRes = addPurchaseBill(createBillPayload('PUR-001', 'CASH', 1000));
  expect(addRes.success).toBe(true);

  // Verify cash transaction was recorded
  const txsAfterAdd = sql.prepare("SELECT * FROM cash_transactions WHERE category = 'Purchase Bill'").all() as Array<{ amount: number; type: string }>;
  expect(txsAfterAdd.length).toBe(1);
  expect(txsAfterAdd[0].amount).toBe(1000);
  expect(txsAfterAdd[0].type).toBe('CASH_OUT');

  // Verify cash drawer deducted
  const drawerAfterAdd = sql.prepare('SELECT * FROM cash_drawer WHERE drawer_id = ?').get('d1') as { cash_out: number; current_cash: number; expected_closing: number };
  expect(drawerAfterAdd.cash_out).toBe(1000);
  expect(drawerAfterAdd.current_cash).toBe(4000);
  expect(drawerAfterAdd.expected_closing).toBe(4000);

  // 2. Edit bill: Change payment mode to CREDIT
  const updateRes = updatePurchaseBill(createBillPayload('PUR-001', 'CREDIT', 1000));
  expect(updateRes.success).toBe(true);

  // Verify cash transaction is removed from cash_transactions
  const txsAfterUpdate = sql.prepare("SELECT * FROM cash_transactions WHERE category = 'Purchase Bill'").all();
  expect(txsAfterUpdate.length).toBe(0);

  // Verify cash drawer is refunded
  const drawerAfterUpdate = sql.prepare('SELECT * FROM cash_drawer WHERE drawer_id = ?').get('d1') as { cash_out: number; current_cash: number; expected_closing: number };
  expect(drawerAfterUpdate.cash_out).toBe(0);
  expect(drawerAfterUpdate.current_cash).toBe(5000);
  expect(drawerAfterUpdate.expected_closing).toBe(5000);

  // Verify party ledger reflects the credit transaction
  const ledgerEntries = sql.prepare('SELECT * FROM party_ledger WHERE party_id = ? AND is_deleted = 0').all('sup1') as Array<{ debit_amount: number }>;
  expect(ledgerEntries.length).toBe(1);
  expect(ledgerEntries[0].debit_amount).toBe(1000);
});

it('removes credit ledger and posts to cash drawer when editing CREDIT bill to CASH', () => {
  // 1. Initial entry: Saved as CREDIT for 1000
  expect(addPurchaseBill(createBillPayload('PUR-002', 'CREDIT', 1000)).success).toBe(true);
  expect(sql.prepare("SELECT COUNT(*) AS count FROM cash_transactions WHERE category = 'Purchase Bill'").get() as { count: number }).toEqual({ count: 0 });

  const activeLedger1 = sql.prepare('SELECT COUNT(*) AS count FROM party_ledger WHERE party_id = ? AND is_deleted = 0').get('sup1') as { count: number };
  expect(activeLedger1.count).toBe(1);

  // 2. Edit bill: Change payment mode to CASH
  expect(updatePurchaseBill(createBillPayload('PUR-002', 'CASH', 1000)).success).toBe(true);

  // Active ledger entries should be 0 (previous marked deleted)
  const activeLedger2 = sql.prepare('SELECT COUNT(*) AS count FROM party_ledger WHERE party_id = ? AND is_deleted = 0').get('sup1') as { count: number };
  expect(activeLedger2.count).toBe(0);

  // Cash transaction should be recorded
  const txs = sql.prepare("SELECT * FROM cash_transactions WHERE category = 'Purchase Bill'").all() as Array<{ amount: number }>;
  expect(txs.length).toBe(1);
  expect(txs[0].amount).toBe(1000);

  const drawer = sql.prepare('SELECT * FROM cash_drawer WHERE drawer_id = ?').get('d1') as { cash_out: number; current_cash: number };
  expect(drawer.cash_out).toBe(1000);
  expect(drawer.current_cash).toBe(4000);
});

it('adjusts cash transaction and drawer when editing total amount of a CASH bill', () => {
  expect(addPurchaseBill(createBillPayload('PUR-003', 'CASH', 1000)).success).toBe(true);
  expect(updatePurchaseBill(createBillPayload('PUR-003', 'CASH', 1500)).success).toBe(true);

  const txs = sql.prepare("SELECT * FROM cash_transactions WHERE category = 'Purchase Bill'").all() as Array<{ amount: number }>;
  expect(txs.length).toBe(1);
  expect(txs[0].amount).toBe(1500);

  const drawer = sql.prepare('SELECT * FROM cash_drawer WHERE drawer_id = ?').get('d1') as { cash_out: number; current_cash: number };
  expect(drawer.cash_out).toBe(1500);
  expect(drawer.current_cash).toBe(3500);
});

it('cleans up cash transactions and restores drawer upon bill deletion', () => {
  expect(addPurchaseBill(createBillPayload('PUR-004', 'CASH', 800)).success).toBe(true);
  expect(deletePurchaseBill('PUR-004').success).toBe(true);

  const txs = sql.prepare("SELECT * FROM cash_transactions WHERE category = 'Purchase Bill'").all();
  expect(txs.length).toBe(0);

  const drawer = sql.prepare('SELECT * FROM cash_drawer WHERE drawer_id = ?').get('d1') as { cash_out: number; current_cash: number };
  expect(drawer.cash_out).toBe(0);
  expect(drawer.current_cash).toBe(5000);
});

it('clears Cash Register entry and updates closed drawer when editing CASH bill to CREDIT after drawer is CLOSED', () => {
  // 1. Initial entry: Saved as CASH for 1000 while drawer was open
  expect(addPurchaseBill(createBillPayload('PUR-005', 'CASH', 1000)).success).toBe(true);

  // 2. Simulate drawer closing (status = 'CLOSED', counted cash = 4000)
  const closedAt = new Date().toISOString();
  sql.prepare(`
    UPDATE cash_drawer 
    SET status = 'CLOSED', closed_at = ?, actual_cash = 4000, cash_short = 0, cash_excess = 0
    WHERE drawer_id = 'd1'
  `).run(closedAt);

  // 3. User edits bill to CREDIT after drawer closing
  expect(updatePurchaseBill(createBillPayload('PUR-005', 'CREDIT', 1000)).success).toBe(true);

  // Verify cash transaction is removed
  const txs = sql.prepare("SELECT * FROM cash_transactions WHERE category = 'Purchase Bill'").all();
  expect(txs.length).toBe(0);

  // Verify closed drawer reflects removal of cash_out
  const drawer = sql.prepare('SELECT * FROM cash_drawer WHERE drawer_id = ?').get('d1') as {
    status: string; cash_out: number; expected_closing: number; actual_cash: number; cash_short: number
  };
  expect(drawer.status).toBe('CLOSED');
  expect(drawer.cash_out).toBe(0);
  expect(drawer.expected_closing).toBe(5000);
  // With expected 5000 and counted 4000, short is 1000
  expect(drawer.cash_short).toBe(1000);

  // Verify party ledger reflects the credit transaction
  const ledgerEntries = sql.prepare('SELECT * FROM party_ledger WHERE party_id = ? AND is_deleted = 0').all('sup1') as Array<{ debit_amount: number }>;
  expect(ledgerEntries.length).toBe(1);
  expect(ledgerEntries[0].debit_amount).toBe(1000);
});

it('records cash transaction and reconciles drawer when editing CREDIT bill to CASH even if drawer is CLOSED', () => {
  // 1. Initial entry: Saved as CREDIT for 1000
  expect(addPurchaseBill(createBillPayload('PUR-006', 'CREDIT', 1000)).success).toBe(true);

  // 2. Simulate drawer closing
  const closedAt = new Date().toISOString();
  sql.prepare(`
    UPDATE cash_drawer 
    SET status = 'CLOSED', closed_at = ?, actual_cash = 5000, cash_short = 0, cash_excess = 0
    WHERE drawer_id = 'd1'
  `).run(closedAt);

  // 3. User edits bill to CASH while drawer is CLOSED
  expect(updatePurchaseBill(createBillPayload('PUR-006', 'CASH', 1000)).success).toBe(true);

  // Verify cash transaction is recorded
  const txs = sql.prepare("SELECT * FROM cash_transactions WHERE category = 'Purchase Bill'").all() as Array<{ amount: number }>;
  expect(txs.length).toBe(1);
  expect(txs[0].amount).toBe(1000);

  // Verify drawer totals
  const drawer = sql.prepare('SELECT * FROM cash_drawer WHERE drawer_id = ?').get('d1') as {
    status: string; cash_out: number; expected_closing: number; actual_cash: number; cash_excess: number
  };
  expect(drawer.status).toBe('CLOSED');
  expect(drawer.cash_out).toBe(1000);
  expect(drawer.expected_closing).toBe(4000);
  // Counted was 5000, expected is now 4000 -> excess is 1000
  expect(drawer.cash_excess).toBe(1000);
});
