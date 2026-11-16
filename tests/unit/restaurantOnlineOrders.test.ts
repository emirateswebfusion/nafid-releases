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
vi.mock('../../electron/services/cashDrawerService', () => ({
  getCashAmountFromInvoice: () => 0,
  adjustPaymentSourcesForInvoice: vi.fn(),
  syncPaymentSourcesForInvoice: vi.fn(),
  adjustCashDrawerForInvoice: vi.fn(),
  getOpenCashDrawer: () => null,
  reconcileCashDrawer: vi.fn(),
  autoCloseOverdueDrawers: vi.fn(),
  deduplicateAndGetOpenDrawer: () => null,
}));
vi.mock('../../electron/services/cashRegisterLedgerService', () => ({ recordLedgerCashEntry: vi.fn() }));
vi.mock('../../electron/services/invoiceNumberService', () => ({
  rollbackUnsavedInvoiceNumber: vi.fn(),
  getOrInitTerminalCode: () => 'POS1',
  getGuaranteedNextInvoiceNumber: () => ({ invoiceNumber: `AUTO-${++state.tick}` }),
}));
vi.mock('../../electron/services/storeTime', () => ({
  localTimestamp: () => new Date().toISOString(),
  localDate: () => '2026-11-14',
  getStoreTimezoneSetting: () => 'Asia/Dubai',
  parseCleanDate: (d: string) => d,
}));
vi.mock('../../electron/sync/syncWorker', () => ({
  runInitialSync: async () => {},
  triggerUrgentInvoiceSync: async () => {},
  triggerUrgentCashSync: async () => {},
}));

import * as setup from '../../electron/services/restaurantSetupService';
import * as orders from '../../electron/services/restaurantOrderService';
import { checkout, recentCheckoutsCache } from '../../electron/services/invoiceCheckoutService';

const T = 'shop';
let raw: DatabaseSync;

beforeEach(() => {
  raw = new DatabaseSync(':memory:');
  state.db = Object.assign(raw, {
    transaction: (fn: () => unknown) => () => {
      raw.exec('SAVEPOINT test_tx');
      try {
        const result = fn();
        raw.exec('RELEASE test_tx');
        return result;
      } catch (e) {
        raw.exec('ROLLBACK TO test_tx; RELEASE test_tx');
        throw e;
      }
    },
  }) as unknown as Database.Database;

  createCoreTables(state.db);
  createExtendedTables(state.db);
  ensureSchemaColumns(state.db);
  runColumnMigrations(state.db);
  state.db.exec(
    "ALTER TABLE invoices ADD COLUMN counts_in_revenue INTEGER NOT NULL DEFAULT 1; ALTER TABLE invoices ADD COLUMN bill_purpose TEXT NOT NULL DEFAULT 'SALE'; ALTER TABLE invoices ADD COLUMN stock_applied INTEGER NOT NULL DEFAULT 1;"
  );
  state.db.exec(
    'CREATE TABLE IF NOT EXISTS sync_meta (key TEXT PRIMARY KEY, value TEXT); CREATE TABLE IF NOT EXISTS sync_apply_guard (id INTEGER PRIMARY KEY);'
  );
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

describe('online orders & WhatsApp QR integration in POS', () => {
  it('generates table QR code and valid mobile ordering URL', async () => {
    const tableId = ok(setup.saveTable({ tenant_id: T, label: 'T4', area: 'Terrace', seats: 4 })).table_id;

    const qrResult = await orders.generateTableQr({
      tenant_id: T,
      table_id: tableId,
      table_label: 'T4',
      order_type: 'DINE_IN',
    });

    const res = ok(qrResult);
    expect(res.url).toContain('/order?');
    expect(res.url).toContain('tenant_id=shop');
    expect(res.url).toContain('table_id=');
    expect(res.url).toContain('order_type=DINE_IN');
    expect(res.qr_code).toMatch(/^data:image\/png;base64,/);
  });

  it('formats WhatsApp message with direct ordering link and phone number', () => {
    const waResult = orders.sendTableWhatsApp({
      phone: '050 123 4567',
      url: 'https://order.nafid.app/order/abc-123',
      shop_name: 'Al Safadi Restaurant',
      table_label: 'T4',
    });

    const res = ok(waResult);
    expect(res.formattedPhone).toBe('971501234567');
    expect(res.wa_url).toContain('https://wa.me/971501234567');
    expect(res.wa_url).toContain(encodeURIComponent('Al Safadi Restaurant'));
  });

  it('receives online orders in PENDING_APPROVAL and accepts them with KOT ticket generation', () => {
    // 1. Seed kitchen stations
    ok(setup.saveStation({ tenant_id: T, name: 'Hot Kitchen', categories: ['Biryani', 'Curry'], is_default: true }));
    ok(setup.saveStation({ tenant_id: T, name: 'Beverage Bar', categories: ['Juices', 'Tea'] }));

    // 2. Insert an incoming online order (e.g. synced from cloud)
    const orderId = 'online-order-1';
    raw.prepare(`
      INSERT INTO restaurant_orders (
        order_id, tenant_id, order_no, order_type, table_id, covers,
        customer_name, customer_phone, channel, status, opened_at, business_date
      ) VALUES (
        'online-order-1', 'shop', 'ONL-1001', 'DINE_IN', 'tbl-1', 2,
        'Rashid', '+971501112233', 'ONLINE', 'PENDING_APPROVAL', '2026-11-14T10:00:00Z', '2026-11-14'
      )
    `).run();

    raw.prepare(`
      INSERT INTO restaurant_order_lines (
        line_id, tenant_id, order_id, product_id, name, category,
        quantity, unit_price, tax_rate, modifiers, status
      ) VALUES
        ('line-1', 'shop', 'online-order-1', 'prod-1', 'Chicken Biryani', 'Biryani', 2, 30.0, 5.0, '[]', 'ACTIVE'),
        ('line-2', 'shop', 'online-order-1', 'prod-2', 'Fresh Lime Soda', 'Juices', 2, 10.0, 5.0, '[]', 'ACTIVE')
    `).run();

    // 3. Query pending online orders
    const pending = ok(orders.listPendingOnlineOrders({ tenant_id: T }));
    expect(pending.orders.length).toBe(1);
    expect(pending.orders[0].order_no).toBe('ONL-1001');
    expect(pending.orders[0].lines.length).toBe(2);

    // 4. Staff accepts online order -> moves to OPEN and generates KOTs for kitchen stations
    const acceptResult = ok(orders.acceptOnlineOrder({ order_id: orderId, user_id: 'waiter-1' }));
    expect(acceptResult.order_id).toBe(orderId);
    expect(acceptResult.kot_ids.length).toBe(2); // One for Hot Kitchen, one for Beverage Bar

    // Verify order is now active/open
    const active = orders.listActive({ tenant_id: T });
    const order = active.orders.find(o => o.order_id === orderId);
    expect(order).toBeDefined();
    expect(order?.status).toBe('OPEN');

    // 5. Verify KOT tickets created
    expect(active.kots.filter(k => k.order_id === orderId).length).toBe(2);
  });

  it('rejects an online order with reason', () => {
    raw.prepare(`
      INSERT INTO restaurant_orders (
        order_id, tenant_id, order_no, order_type, table_id, covers,
        customer_name, customer_phone, channel, status, opened_at, business_date
      ) VALUES (
        'online-order-reject', 'shop', 'ONL-1002', 'TAKEAWAY', NULL, 1,
        'Ali', '+971509990000', 'ONLINE', 'PENDING_APPROVAL', '2026-11-14T10:05:00Z', '2026-11-14'
      )
    `).run();

    const rejectRes = ok(orders.rejectOnlineOrder({ order_id: 'online-order-reject', reason: 'Kitchen at full capacity' }));
    expect(rejectRes.success).toBe(true);

    const pending = ok(orders.listPendingOnlineOrders({ tenant_id: T }));
    expect(pending.orders.length).toBe(0);
  });

  it('allows checkout and settlement of an accepted online order into a tax invoice', () => {
    // Insert and accept an order
    const orderId = 'online-order-settle';
    raw.prepare(`
      INSERT INTO restaurant_orders (
        order_id, tenant_id, order_no, order_type, table_id, covers,
        customer_name, customer_phone, channel, status, opened_at, business_date
      ) VALUES (
        'online-order-settle', 'shop', 'ONL-1003', 'DINE_IN', 'tbl-2', 2,
        'Zaid', '+971507776655', 'ONLINE', 'OPEN', '2026-11-14T10:10:00Z', '2026-11-14'
      )
    `).run();

    raw.prepare(`
      INSERT INTO restaurant_order_lines (
        line_id, tenant_id, order_id, product_id, name, category,
        quantity, unit_price, tax_rate, modifiers, status
      ) VALUES
        ('line-3', 'shop', 'online-order-settle', 'prod-mutton', 'Mutton Mandi', 'Grill', 1, 50.0, 5.0, '[]', 'ACTIVE')
    `).run();

    // Bill the order through checkout
    const result = checkout({
      invoice_id: 'inv-online-1',
      tenant_id: T,
      user_id: 'cashier-1',
      invoice_number: '',
      invoice_type: 'TAX_INVOICE',
      subtotal: 50.0,
      tax_total: 2.5,
      discount_total: 0,
      grand_total: 52.5,
      payment_method: 'CASH',
      received_amount: 52.5,
      balance_amount: 0,
      restaurant_order_id: orderId,
      items: [
        {
          item_id: 'item-1',
          product_id: 'prod-mutton',
          name: 'Mutton Mandi',
          quantity: 1,
          unit_price: 50.0,
          selling_price: 50.0,
          tax_rate: 5.0,
          tax_amount: 2.5,
          total: 52.5,
          is_service_item: false,
        },
      ],
    } as unknown as Parameters<typeof checkout>[0]);

    expect(result.success).toBe(true);

    // Verify the order is marked SETTLED
    const row = raw.prepare("SELECT status, invoice_number FROM restaurant_orders WHERE order_id = 'online-order-settle'").get() as { status: string; invoice_number: string } | undefined;
    expect(row?.status).toBe('SETTLED');
    expect(row?.invoice_number).toMatch(/^AUTO-/);
  });

  it('supports home delivery QR tokens, delivery WhatsApp dispatch, and delivery address tracking', async () => {
    // 1. Generate Home Delivery QR
    const qrResult = await orders.generateTableQr({
      tenant_id: T,
      order_type: 'DELIVERY',
    });
    const res = ok(qrResult);
    expect(res.url).toContain('/order?');
    expect(res.url).toContain('order_type=DELIVERY');
    expect(res.url).toContain('tenant_id=shop');
    expect(res.url).not.toContain('table_id=');

    // 2. Format WhatsApp for Delivery
    const waResult = ok(orders.sendTableWhatsApp({
      phone: '050 999 8877',
      url: res.url,
      shop_name: 'Al Safadi Restaurant',
      order_type: 'DELIVERY',
    }));
    expect(waResult.formattedPhone).toBe('971509998877');
    expect(decodeURIComponent(waResult.wa_url)).toContain('Home Delivery Menu - Al Safadi Restaurant');
    expect(decodeURIComponent(waResult.wa_url)).toContain('doorstep');

    // 3. Receive an incoming Delivery Order with address & delivery fee
    raw.prepare(`
      INSERT INTO restaurant_orders (
        order_id, tenant_id, order_no, order_type, table_id, covers,
        customer_name, customer_phone, delivery_address, delivery_fee, channel, status, opened_at, business_date
      ) VALUES (
        'delivery-order-1', 'shop', 'ONL-DEL-1', 'DELIVERY', NULL, 0,
        'Mohammed', '+971509998877', 'Flat 402, Al Nahda Tower, Sharjah', 10.0, 'ONLINE', 'PENDING_APPROVAL', '2026-11-14T10:00:00Z', '2026-11-14'
      )
    `).run();

    const pending = ok(orders.listPendingOnlineOrders({ tenant_id: T }));
    const found = pending.orders.find(o => o.order_id === 'delivery-order-1');
    expect(found).toBeDefined();
    expect(found?.order_type).toBe('DELIVERY');
    expect(found?.delivery_address).toBe('Flat 402, Al Nahda Tower, Sharjah');
    expect(found?.delivery_fee).toBe(10.0);
  });
});
