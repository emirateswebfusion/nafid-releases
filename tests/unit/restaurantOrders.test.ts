/**
 * Restaurant mode main process: real SQLite schema (baseline + migrations 002 and 016) and the real order, setup and
 * checkout services. Covers station routing, part voids, merge / split, the forward-only rules every writer obeys,
 * the billing claim and settlement inside checkout (no double billing).
 */
import { DatabaseSync } from 'node:sqlite';
import type Database from 'better-sqlite3';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createCoreTables } from '../../electron/db/schemaCoreTables';
import { createExtendedTables } from '../../electron/db/schemaExtendedTables';
import { ensureSchemaColumns } from '../../electron/db/schemaColumns';
import { runColumnMigrations } from '../../electron/db/migrationsColumns';
import { m002SyncOutbox } from '../../electron/db/migrations/002-sync-outbox';
import { m016Restaurant } from '../../electron/db/migrations/016-restaurant';
const state = vi.hoisted(() => ({ db: null as unknown as Database.Database, tick: 0 }));
vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => [] } }));
vi.mock('../../electron/whatsapp/shopClosingReportService', () => ({ sendShopClosingReport: vi.fn() }));
vi.mock('../../electron/db/localDb', () => ({ getDb: () => state.db }));
vi.mock('../../electron/services/cashDrawerService', () => ({ getCashAmountFromInvoice: () => 0, adjustPaymentSourcesForInvoice: vi.fn(), syncPaymentSourcesForInvoice: vi.fn(), adjustCashDrawerForInvoice: vi.fn(), getOpenCashDrawer: () => null, reconcileCashDrawer: vi.fn(), autoCloseOverdueDrawers: vi.fn(), deduplicateAndGetOpenDrawer: () => null }));
vi.mock('../../electron/services/cashRegisterLedgerService', () => ({ recordLedgerCashEntry: vi.fn() }));
vi.mock('../../electron/services/invoiceNumberService', () => ({ rollbackUnsavedInvoiceNumber: vi.fn(), getOrInitTerminalCode: () => 'POS1', getGuaranteedNextInvoiceNumber: () => ({ invoiceNumber: `AUTO-${++state.tick}` }) }));
vi.mock('../../electron/services/storeTime', () => ({
  localTimestamp: () => new Date().toISOString(), localDate: () => '2026-11-03', getStoreTimezoneSetting: () => 'Asia/Dubai', parseCleanDate: (d: string) => d,
}));
vi.mock('../../electron/sync/syncWorker', () => ({ runInitialSync: async () => {}, triggerUrgentInvoiceSync: async () => {}, triggerUrgentCashSync: async () => {} }));
import * as setup from '../../electron/services/restaurantSetupService';
import * as orders from '../../electron/services/restaurantOrderService';
import { checkout, recentCheckoutsCache } from '../../electron/services/invoiceCheckoutService';
import { upsertPulledRow } from '../../electron/db/statements/sync/restaurantSync';
import { upsertTableRows } from '../../electron/sync/lanUpsert';

const T = 'shop';
let raw: DatabaseSync;
beforeEach(() => {
  raw = new DatabaseSync(':memory:');
  state.db = Object.assign(raw, { transaction: (fn: () => unknown) => () => { raw.exec('SAVEPOINT test_tx'); try { const result = fn(); raw.exec('RELEASE test_tx'); return result; } catch (e) { raw.exec('ROLLBACK TO test_tx; RELEASE test_tx'); throw e; } } }) as unknown as Database.Database;
  createCoreTables(state.db); createExtendedTables(state.db); ensureSchemaColumns(state.db); runColumnMigrations(state.db);
  state.db.exec("ALTER TABLE invoices ADD COLUMN counts_in_revenue INTEGER NOT NULL DEFAULT 1; ALTER TABLE invoices ADD COLUMN bill_purpose TEXT NOT NULL DEFAULT 'SALE'; ALTER TABLE invoices ADD COLUMN stock_applied INTEGER NOT NULL DEFAULT 1;");
  state.db.exec('CREATE TABLE IF NOT EXISTS sync_meta (key TEXT PRIMARY KEY, value TEXT); CREATE TABLE IF NOT EXISTS sync_apply_guard (id INTEGER PRIMARY KEY);');
  m002SyncOutbox.up(state.db);
  m016Restaurant.up(state.db);
  raw.prepare("INSERT OR REPLACE INTO sync_meta (key, value) VALUES ('origin', 'termA')").run();
  recentCheckoutsCache.clear();
});
afterEach(() => raw.close());

const ok = <T extends { success: boolean }>(r: T): Extract<T, { success: true }> => {
  if (!r.success) throw new Error(`expected success: ${JSON.stringify(r)}`);
  return r as Extract<T, { success: true }>;
};

function seed() {
  const table = ok(setup.saveTable({ tenant_id: T, label: 'T1', area: 'Main', seats: 4 })).table_id;
  const table2 = ok(setup.saveTable({ tenant_id: T, label: 'T2' })).table_id;
  ok(setup.saveStation({ tenant_id: T, name: 'Grill', categories: ['Grill', 'Shawarma'], is_default: true }));
  ok(setup.saveStation({ tenant_id: T, name: 'Juice bar', categories: ['Juices'] }));
  return { table, table2 };
}

const item = (name: string, category: string, quantity = 1, unit_price = 10, extra: Record<string, unknown> = {}) =>
  ({ product_id: `p-${name}`, name, category, quantity, unit_price, tax_rate: 5, ...extra });

const linesOf = (orderId: string) => orders.getOrder({ order_id: orderId }).lines;
const activeQty = (orderId: string, name: string) => linesOf(orderId).filter(l => l.status === 'ACTIVE' && l.name === name).reduce((s, l) => s + l.quantity, 0);

describe('restaurant orders', () => {
  it('opens one order per table and numbers orders per terminal and day', () => {
    const { table } = seed();
    const first = ok(orders.openOrder({ tenant_id: T, order_type: 'DINE_IN', table_id: table, covers: 2 })).order;
    expect(first.order_no).toMatch(/^TERM-1$/);
    expect(orders.openOrder({ tenant_id: T, order_type: 'DINE_IN', table_id: table })).toEqual({ success: false, error: 'The table already has an open order' });
    const takeaway = ok(orders.openOrder({ tenant_id: T, order_type: 'TAKEAWAY' })).order;
    expect(takeaway.order_no).toBe('TERM-2');
    expect(orders.openOrder({ tenant_id: T, order_type: 'DELIVERY' })).toEqual({ success: false, error: 'A delivery needs the customer phone' });
    expect(ok(orders.openOrder({ tenant_id: T, order_type: 'DELIVERY', channel: 'TALABAT', channel_ref: 'TB-991' })).order.channel).toBe('TALABAT');
  });

  it('routes sent items to kitchen stations, one ticket each, default station for other categories', () => {
    const { table } = seed();
    const order = ok(orders.openOrder({ tenant_id: T, order_type: 'DINE_IN', table_id: table })).order;
    const sent = ok(orders.sendItems({ tenant_id: T, order_id: order.order_id, user_id: 'u', lines: [
      item('Chicken shawarma', 'Shawarma', 2, 12, { modifiers: [{ modifier_id: 'm1', name: 'Extra garlic', price: 1, tax_rate: 5 }], note: 'no pickles' }),
      item('Orange juice', 'Juices'), item('Water', 'Drinks'),
    ] }));
    expect(sent.kot_ids).toHaveLength(2);
    const { kots, lines } = orders.getOrder({ order_id: order.order_id });
    expect(kots.map(k => k.station_name).sort()).toEqual(['Grill', 'Juice bar']);
    const grill = kots.find(k => k.station_name === 'Grill')!;
    expect(lines.filter(l => l.kot_id === grill.kot_id).map(l => l.name).sort()).toEqual(['Chicken shawarma', 'Water']);
    expect(JSON.parse(lines.find(l => l.name === 'Chicken shawarma')!.modifiers)).toEqual([{ modifier_id: 'm1', name: 'Extra garlic', price: 1, tax_rate: 5 }]);
  });

  it('voids part of a line: kept and voided quantities are exact, a VOID ticket is created', () => {
    const { table } = seed();
    const order = ok(orders.openOrder({ tenant_id: T, order_type: 'DINE_IN', table_id: table })).order;
    ok(orders.sendItems({ tenant_id: T, order_id: order.order_id, user_id: 'u', lines: [item('Tea', 'Drinks', 3, 2)] }));
    const line = linesOf(order.order_id)[0];
    expect(orders.voidLines({ order_id: order.order_id, reason: 'MOVED', lines: [{ line_id: line.line_id }] }).success).toBe(false);
    const voided = ok(orders.voidLines({ order_id: order.order_id, reason: 'Customer changed mind', user_id: 'u', lines: [{ line_id: line.line_id, quantity: 1 }] }));
    expect(activeQty(order.order_id, 'Tea')).toBe(2);
    const all = linesOf(order.order_id);
    const real = all.filter(l => l.status === 'VOIDED' && l.void_reason !== 'MOVED');
    expect(real.map(l => [l.quantity, l.void_reason, l.void_kot_id])).toEqual([[1, 'Customer changed mind', voided.kot_ids[0]]]);
    expect(orders.getOrder({ order_id: order.order_id }).kots.find(k => k.kot_id === voided.kot_ids[0])?.kind).toBe('VOID');
  });

  it('merges two tables: items and tickets move, the source is cancelled as MERGED, covers add up', () => {
    const { table, table2 } = seed();
    const a = ok(orders.openOrder({ tenant_id: T, order_type: 'DINE_IN', table_id: table, covers: 2 })).order;
    const b = ok(orders.openOrder({ tenant_id: T, order_type: 'DINE_IN', table_id: table2, covers: 3 })).order;
    ok(orders.sendItems({ tenant_id: T, order_id: a.order_id, lines: [item('Tea', 'Drinks', 1)] }));
    ok(orders.sendItems({ tenant_id: T, order_id: b.order_id, lines: [item('Tea', 'Drinks', 2), item('Juice', 'Juices')] }));
    ok(orders.mergeOrders({ target_order_id: a.order_id, source_order_id: b.order_id }));
    expect(activeQty(a.order_id, 'Tea')).toBe(3);
    expect(activeQty(a.order_id, 'Juice')).toBe(1);
    const source = orders.getOrder({ order_id: b.order_id });
    expect([source.order?.status, source.order?.cancel_reason, source.order?.merged_into_order_id]).toEqual(['CANCELLED', 'MERGED', a.order_id]);
    expect(source.kots).toHaveLength(0);
    expect(orders.getOrder({ order_id: a.order_id }).kots).toHaveLength(3);
    expect(orders.getOrder({ order_id: a.order_id }).order?.covers).toBe(5);
    expect(ok(orders.moveTable({ order_id: a.order_id, table_id: table2 })).success).toBe(true);
  });

  it('splits chosen quantities into a new bill on the same table and keeps the rest', () => {
    const { table } = seed();
    const order = ok(orders.openOrder({ tenant_id: T, order_type: 'DINE_IN', table_id: table })).order;
    ok(orders.sendItems({ tenant_id: T, order_id: order.order_id, lines: [item('Biryani', 'Grill', 4, 20)] }));
    const line = linesOf(order.order_id)[0];
    expect(orders.splitOrder({ order_id: order.order_id, lines: [{ line_id: line.line_id, quantity: 4 }] }).success).toBe(false);
    const child = ok(orders.splitOrder({ order_id: order.order_id, lines: [{ line_id: line.line_id, quantity: 1 }] })).order_id;
    expect(activeQty(order.order_id, 'Biryani')).toBe(3);
    expect(activeQty(child, 'Biryani')).toBe(1);
    expect(orders.getOrder({ order_id: child }).order?.parent_order_id).toBe(order.order_id);
    expect(orders.listActive({ tenant_id: T }).orders.filter(o => o.table_id === table)).toHaveLength(2);
  });

  it('cancels with VOID tickets for what the kitchen already has', () => {
    const { table } = seed();
    const order = ok(orders.openOrder({ tenant_id: T, order_type: 'DINE_IN', table_id: table })).order;
    ok(orders.sendItems({ tenant_id: T, order_id: order.order_id, lines: [item('Tea', 'Drinks', 1), item('Juice', 'Juices')] }));
    expect(ok(orders.cancelOrder({ order_id: order.order_id, reason: 'Guest left' })).kot_ids).toHaveLength(2);
    expect(orders.getOrder({ order_id: order.order_id }).order?.status).toBe('CANCELLED');
    expect(orders.sendItems({ tenant_id: T, order_id: order.order_id, lines: [item('Tea', 'Drinks')] })).toEqual({ success: false, error: 'The order is cancelled' });
  });
});

describe('forward-only rules (every writer)', () => {
  it('ignores a stale copy that would reopen a settled order, un-void a line or move a ticket back', () => {
    const { table } = seed();
    const order = ok(orders.openOrder({ tenant_id: T, order_type: 'DINE_IN', table_id: table })).order;
    ok(orders.sendItems({ tenant_id: T, order_id: order.order_id, lines: [item('Tea', 'Drinks', 2)] }));
    const line = linesOf(order.order_id)[0];
    const kot = orders.getOrder({ order_id: order.order_id }).kots[0];
    ok(orders.voidLines({ order_id: order.order_id, reason: 'Wrong item entered', lines: [{ line_id: line.line_id }] }));
    raw.prepare(`UPDATE kot_tickets SET kds_status = 'READY' WHERE kot_id = ?`).run(kot.kot_id);
    raw.prepare(`UPDATE restaurant_orders SET status = 'SETTLED', invoice_id = 'inv' WHERE order_id = ?`).run(order.order_id);

    // LAN ingest (column-blind upsert) of stale copies from another terminal.
    upsertTableRows(state.db, 'restaurant_orders', [{ ...order, status: 'OPEN', invoice_id: null, sync_status: 'PENDING' }]);
    upsertTableRows(state.db, 'restaurant_order_lines', [{ ...line, status: 'ACTIVE', sync_status: 'PENDING' }]);
    upsertTableRows(state.db, 'kot_tickets', [{ ...kot, kds_status: 'NEW', sync_status: 'PENDING' }]);
    // Cloud pull of a stale order.
    raw.prepare(`UPDATE restaurant_orders SET sync_status = 'SYNCED' WHERE order_id = ?`).run(order.order_id);
    const { statement, columns } = upsertPulledRow(state.db, 'restaurant_orders');
    statement.run(Object.fromEntries(columns.map(c => [c, c === 'status' ? 'OPEN' : (order as unknown as Record<string, unknown>)[c] ?? null])));

    const after = orders.getOrder({ order_id: order.order_id });
    expect(after.order?.status).toBe('SETTLED');
    expect(after.order?.invoice_id).toBe('inv');
    expect(after.lines.find(l => l.line_id === line.line_id)?.status).toBe('VOIDED');
    expect(after.kots.find(k => k.kot_id === kot.kot_id)?.kds_status).toBe('READY');
  });

  it('a cloud pull keeps local unsent changes', () => {
    const { table } = seed();
    const order = ok(orders.openOrder({ tenant_id: T, order_type: 'DINE_IN', table_id: table, covers: 2 })).order;
    const { statement, columns } = upsertPulledRow(state.db, 'restaurant_orders');
    statement.run(Object.fromEntries(columns.map(c => [c, c === 'covers' ? 9 : (order as unknown as Record<string, unknown>)[c] ?? null])));
    expect(orders.getOrder({ order_id: order.order_id }).order?.covers).toBe(2);
  });
});

describe('billing claim and settlement', () => {
  it('lets one terminal bill an order; another is refused until the claim is released or stale', () => {
    const { table } = seed();
    const order = ok(orders.openOrder({ tenant_id: T, order_type: 'DINE_IN', table_id: table })).order;
    expect(orders.claimLocal({ order_id: order.order_id, terminal: 'A' })).toEqual({ success: true });
    expect(orders.claimLocal({ order_id: order.order_id, terminal: 'A' })).toEqual({ success: true });
    expect(orders.claimLocal({ order_id: order.order_id, terminal: 'B' })).toMatchObject({ success: false, holder: 'A' });
    expect(orders.sendItems({ tenant_id: T, order_id: order.order_id, lines: [item('Tea', 'Drinks')] })).toEqual({ success: false, error: 'The order is being billed' });
    raw.prepare(`UPDATE restaurant_orders SET billing_since = '2020-01-01T00:00:00.000Z' WHERE order_id = ?`).run(order.order_id);
    expect(orders.claimLocal({ order_id: order.order_id, terminal: 'B' })).toEqual({ success: true });
    ok(orders.releaseClaim({ order_id: order.order_id }));
    expect(orders.getOrder({ order_id: order.order_id }).order?.status).toBe('OPEN');
  });

  it('checkout closes the order in the same transaction and refuses to bill it twice', () => {
    const { table } = seed();
    const order = ok(orders.openOrder({ tenant_id: T, order_type: 'DINE_IN', table_id: table })).order;
    const bill = (invoiceId: string) => checkout({
      invoice_id: invoiceId, tenant_id: T, user_id: 'u', invoice_number: '', invoice_type: 'GST', subtotal: 20, tax_total: 1,
      discount_total: 0, grand_total: 21, payment_method: 'CASH', received_amount: 21, balance_amount: 0,
      restaurant_order_id: order.order_id,
      items: [{ item_id: crypto.randomUUID(), product_id: 'p-Tea', name: 'Tea', quantity: 2, unit_price: 10, tax_amount: 1, total: 20 }],
    } as unknown as Parameters<typeof checkout>[0]);
    const first = bill('inv-1');
    expect(first.success).toBe(true);
    const settled = orders.getOrder({ order_id: order.order_id }).order;
    expect([settled?.status, settled?.invoice_id]).toEqual(['SETTLED', 'inv-1']);
    recentCheckoutsCache.clear();
    const second = bill('inv-2');
    expect(second).toEqual({ success: false, error: expect.stringContaining('already billed') });
    expect(raw.prepare(`SELECT COUNT(*) AS n FROM invoices WHERE invoice_id = 'inv-2'`).get()).toEqual({ n: 0 });
    expect(orders.listActive({ tenant_id: T }).closedToday.map(o => o.order_id)).toEqual([order.order_id]);
  });

  it('a retail checkout without an order is unchanged', () => {
    const r = checkout({
      invoice_id: 'retail', tenant_id: T, user_id: 'u', invoice_number: '', invoice_type: 'GST', subtotal: 10, tax_total: 0,
      discount_total: 0, grand_total: 10, payment_method: 'CASH', received_amount: 10, balance_amount: 0,
      items: [{ item_id: crypto.randomUUID(), product_id: 'x', name: 'X', quantity: 1, unit_price: 10, tax_amount: 0, total: 10 }],
    } as unknown as Parameters<typeof checkout>[0]);
    expect(r.success).toBe(true);
  });
});
