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
  getOrInitTerminalCode: () => 'POS1',
  getGuaranteedNextInvoiceNumber: () => ({ invoiceNumber: `AUTO-${++state.tick}` }),
  peekGuaranteedNextInvoiceNumber: () => `AUTO-${state.tick + 1}`,
  requestServerInvoiceNumber: async () => ({ success: true, invoiceNumber: `AUTO-${++state.tick}` }),
}));
vi.mock('../../electron/services/storeTime', () => {
  const stamp = () => new Date(Date.UTC(2026, 10, 10, 10, 0, 0) + (++state.tick) * 60_000).toISOString();
  return { localTimestamp: stamp, localDate: () => '2026-11-10', getStoreTimezoneSetting: () => 'Asia/Kolkata', parseCleanDate: (d: string) => d };
});
vi.mock('../../electron/sync/syncWorker', () => ({
  runInitialSync: async () => {},
  triggerUrgentInvoiceSync: async () => {},
  triggerUrgentCashSync: async () => {},
}));

import { checkout, recentCheckoutsCache } from '../../electron/services/invoiceCheckoutService';
import { previewConvertBosToGst, convertBosToGst } from '../../electron/services/bosConversionService';
import * as invoicesSql from '../../electron/db/statements/invoices';

let raw: DatabaseSync;

beforeEach(() => {
  recentCheckoutsCache.clear();
  raw = new DatabaseSync(':memory:');
  state.db = Object.assign(raw, {
    transaction: (fn: (...args: unknown[]) => unknown) => (...args: unknown[]) => {
      raw.exec('SAVEPOINT test_tx');
      try {
        const result = fn(...args);
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

  state.db.exec(`
    ALTER TABLE invoices ADD COLUMN counts_in_revenue INTEGER NOT NULL DEFAULT 1;
    ALTER TABLE invoices ADD COLUMN bill_purpose TEXT NOT NULL DEFAULT 'SALE';
    ALTER TABLE invoices ADD COLUMN stock_applied INTEGER NOT NULL DEFAULT 1;
  `);

  // Insert two products that belong to a combo
  raw.prepare(`
    INSERT INTO products (product_id, tenant_id, name, base_price, current_stock, is_gst_applicable, tax_rate_percent, is_deleted)
    VALUES ('p-tea', 't1', 'Tea Powder 500g', 150, 20, 1, 5, 0)
  `).run();

  raw.prepare(`
    INSERT INTO products (product_id, tenant_id, name, base_price, current_stock, is_gst_applicable, tax_rate_percent, is_deleted)
    VALUES ('p-sugar', 't1', 'Sugar 1kg', 50, 30, 1, 18, 0)
  `).run();

  // Insert combo offer and combo items
  raw.prepare(`
    INSERT INTO combo_offers (combo_id, tenant_id, name, combo_price, is_active, is_deleted)
    VALUES ('combo-1', 't1', 'Tea & Sugar Combo', 180, 1, 0)
  `).run();

  raw.prepare(`
    INSERT INTO combo_items (combo_item_id, combo_id, tenant_id, product_id, quantity)
    VALUES ('ci-1', 'combo-1', 't1', 'p-tea', 1)
  `).run();

  raw.prepare(`
    INSERT INTO combo_items (combo_item_id, combo_id, tenant_id, product_id, quantity)
    VALUES ('ci-2', 'combo-1', 't1', 'p-sugar', 2)
  `).run();
});

afterEach(() => {
  raw.close();
});

describe('combo checkout stock deduction and GST conversion', () => {
  it('deducts constituent stock for items in the combo on checkout', () => {
    const res = checkout({
      invoice_id: 'inv-combo-1',
      user_id: 'u1',
      tenant_id: 't1',
      invoice_number: 'BOS-001',
      invoice_type: 'BILL_OF_SUPPLY',
      subtotal: 360,
      tax_total: 0,
      discount_total: 0,
      grand_total: 360,
      payment_method: 'CASH',
      items: [
        {
          item_id: 'item-1',
          product_id: 'combo-1',
          name: 'Tea & Sugar Combo',
          quantity: 2, // 2 combos sold -> 2*1=2 Tea, 2*2=4 Sugar
          unit_price: 180,
          tax_amount: 0,
          total: 360,
          isCombo: true,
          combo_id: 'combo-1',
          combo_items: [
            { product_id: 'p-tea', quantity: 1 },
            { product_id: 'p-sugar', quantity: 2 },
          ],
        },
      ],
    });

    expect(res.success).toBe(true);

    const teaStock = raw.prepare("SELECT current_stock FROM products WHERE product_id = 'p-tea'").get() as { current_stock: number };
    const sugarStock = raw.prepare("SELECT current_stock FROM products WHERE product_id = 'p-sugar'").get() as { current_stock: number };

    // Initially Tea: 20, Sugar: 30.
    // 2 combos sold: Tea 20 - 2 = 18; Sugar 30 - 4 = 26.
    expect(teaStock.current_stock).toBe(18);
    expect(sugarStock.current_stock).toBe(26);

    // Verify invoice_items row saved combo details
    const itemRow = raw.prepare("SELECT combo_id, combo_details FROM invoice_items WHERE item_id = 'item-1'").get() as { combo_id: string; combo_details: string };
    expect(itemRow.combo_id).toBe('combo-1');
    expect(itemRow.combo_details).toBeTruthy();
  });

  it('marks Bill of Supply containing GST-based combo as convertible to GST', () => {
    checkout({
      invoice_id: 'inv-combo-2',
      user_id: 'u1',
      tenant_id: 't1',
      invoice_number: 'BOS-002',
      invoice_type: 'BILL_OF_SUPPLY',
      subtotal: 180,
      tax_total: 0,
      discount_total: 0,
      grand_total: 180,
      payment_method: 'CASH',
      items: [
        {
          item_id: 'item-2',
          product_id: 'combo-1',
          name: 'Tea & Sugar Combo',
          quantity: 1,
          unit_price: 180,
          tax_amount: 0,
          total: 180,
          isCombo: true,
          combo_id: 'combo-1',
          combo_items: [
            { product_id: 'p-tea', quantity: 1 },
            { product_id: 'p-sugar', quantity: 2 },
          ],
        },
      ],
    });

    // Check findInvoiceItemsByInvoiceIdAndIsGstApplicable
    const results = invoicesSql.findInvoiceItemsByInvoiceIdAndIsGstApplicable(state.db, ['inv-combo-2']).all('t1', 't1', 'inv-combo-2') as Array<{ invoice_id: string; convertible: number }>;
    expect(results).toHaveLength(1);
    expect(results[0].convertible).toBe(1);
  });

  it('previews GST conversion for combo invoice using the mixed-supply highest rate', () => {
    checkout({
      invoice_id: 'inv-combo-3',
      user_id: 'u1',
      tenant_id: 't1',
      invoice_number: 'BOS-003',
      invoice_type: 'BILL_OF_SUPPLY',
      subtotal: 180,
      tax_total: 0,
      discount_total: 0,
      grand_total: 180,
      payment_method: 'CASH',
      items: [
        {
          item_id: 'item-3',
          product_id: 'combo-1',
          name: 'Tea & Sugar Combo',
          quantity: 1,
          unit_price: 180,
          tax_amount: 0,
          total: 180,
          isCombo: true,
          combo_id: 'combo-1',
          combo_items: [
            { product_id: 'p-tea', quantity: 1 },
            { product_id: 'p-sugar', quantity: 2 },
          ],
        },
      ],
    });

    const preview = previewConvertBosToGst({
      invoice_ids: ['inv-combo-3'],
      tenant_id: 't1',
      tax_mode: 'EXCLUSIVE',
    });

    expect(preview.success).toBe(true);
    expect(preview.invoices).toHaveLength(1);
    expect(preview.invoices[0].skipped_items).toEqual([]);
    // Highest rate between 5% (Tea) and 18% (Sugar) is 18%.
    // 180 * 0.18 = 32.4 tax
    expect(preview.invoices[0].tax_amount).toBeCloseTo(32.4);
    expect(preview.invoices[0].converted_grand_total).toBeCloseTo(212.4);
  });

  it('converts Bill of Supply with combo to a new GST invoice with highest constituent tax rate', async () => {
    checkout({
      invoice_id: 'inv-combo-4',
      user_id: 'u1',
      tenant_id: 't1',
      invoice_number: 'BOS-004',
      invoice_type: 'BILL_OF_SUPPLY',
      subtotal: 180,
      tax_total: 0,
      discount_total: 0,
      grand_total: 180,
      payment_method: 'CASH',
      items: [
        {
          item_id: 'item-4',
          product_id: 'combo-1',
          name: 'Tea & Sugar Combo',
          quantity: 1,
          unit_price: 180,
          tax_amount: 0,
          total: 180,
          isCombo: true,
          combo_id: 'combo-1',
          combo_items: [
            { product_id: 'p-tea', quantity: 1 },
            { product_id: 'p-sugar', quantity: 2 },
          ],
        },
      ],
    });

    const res = await convertBosToGst({
      invoice_ids: ['inv-combo-4'],
      tenant_id: 't1',
      user_id: 'u1',
      tax_mode: 'EXCLUSIVE',
    });

    expect(res.success).toBe(true);
    expect(res.results).toHaveLength(1);
    expect(res.results![0].success).toBe(true);
    expect(res.results![0].new_number).toBe('AUTO-5');

    // Verify converted invoice in database has GST tax applied
    const converted = raw.prepare(`
      SELECT * FROM invoices WHERE converted_from_invoice_id = 'inv-combo-4'
    `).get() as { grand_total: number; tax_total: number; invoice_type: string };

    expect(converted).toBeDefined();
    expect(converted.invoice_type).toBe('GST');
    expect(converted.tax_total).toBeCloseTo(32.4);
    expect(converted.grand_total).toBeCloseTo(212.4);
  });
});
