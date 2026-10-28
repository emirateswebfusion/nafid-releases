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

import { checkout } from '../../electron/services/invoiceCheckoutService';
import { getCustomers } from '../../electron/services/customersService';
import { getParties } from '../../electron/services/partiesService';

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
    }
  }) as unknown as Database.Database;
  createCoreTables(state.db);
  createExtendedTables(state.db);
  ensureSchemaColumns(state.db);
  runColumnMigrations(state.db);
  state.db.exec("ALTER TABLE invoices ADD COLUMN counts_in_revenue INTEGER NOT NULL DEFAULT 1; ALTER TABLE invoices ADD COLUMN bill_purpose TEXT NOT NULL DEFAULT 'SALE'; ALTER TABLE invoices ADD COLUMN stock_applied INTEGER NOT NULL DEFAULT 1;");
  raw.prepare("INSERT INTO products (product_id, tenant_id, name, base_price, current_stock) VALUES ('p', 't', 'Cement bag', 100, 100000)").run();
});
afterEach(() => raw.close());

describe('customer creation during checkout', () => {
  it('creates customer in customers and parties table when typing a new customer', () => {
    const res = checkout({
      invoice_id: 'inv-1',
      user_id: 'u',
      tenant_id: 't',
      invoice_number: 'INV-1',
      invoice_type: 'ESTIMATE',
      subtotal: 100,
      tax_total: 0,
      discount_total: 0,
      grand_total: 100,
      payment_method: 'CASH',
      received_amount: 100,
      balance_amount: 0,
      customer_id: null,
      customer_name: 'Shabeer New',
      customer_phone: '9847123456',
      customer_address: 'Calicut',
      customer_gstin: '32ABCDE1234F1Z5',
      items: [{ item_id: 'item-1', product_id: 'p', name: 'Cement bag', quantity: 1, unit_price: 100, tax_amount: 0, total: 100 }],
    } as unknown as Parameters<typeof checkout>[0]);

    expect(res.success).toBe(true);

    const customers = getCustomers({ tenant_id: 't' });
    expect(customers.length).toBe(1);
    expect(customers[0].name).toBe('Shabeer New');
    expect(customers[0].phone).toBe('9847123456');
    expect(customers[0].address).toBe('Calicut');
    expect(customers[0].gstin).toBe('32ABCDE1234F1Z5');

    const parties = getParties('t');
    expect(parties.length).toBe(1);
    expect(parties[0].name).toBe('Shabeer New');
    expect(parties[0].gstin).toBe('32ABCDE1234F1Z5');
  });

  it('creates a new customer when name is the same as existing customer but phone is different', () => {
    // First bill for Ramesh with phone 9847000001
    checkout({
      invoice_id: 'inv-1',
      user_id: 'u',
      tenant_id: 't',
      invoice_number: 'INV-1',
      invoice_type: 'ESTIMATE',
      subtotal: 100,
      tax_total: 0,
      discount_total: 0,
      grand_total: 100,
      payment_method: 'CASH',
      received_amount: 100,
      balance_amount: 0,
      customer_id: null,
      customer_name: 'Ramesh',
      customer_phone: '9847000001',
      items: [{ item_id: 'item-1', product_id: 'p', name: 'Cement bag', quantity: 1, unit_price: 100, tax_amount: 0, total: 100 }],
    } as unknown as Parameters<typeof checkout>[0]);

    // Second bill for another Ramesh with phone 9847000002
    checkout({
      invoice_id: 'inv-2',
      user_id: 'u',
      tenant_id: 't',
      invoice_number: 'INV-2',
      invoice_type: 'ESTIMATE',
      subtotal: 100,
      tax_total: 0,
      discount_total: 0,
      grand_total: 100,
      payment_method: 'CASH',
      received_amount: 100,
      balance_amount: 0,
      customer_id: null,
      customer_name: 'Ramesh',
      customer_phone: '9847000002',
      items: [{ item_id: 'item-2', product_id: 'p', name: 'Cement bag', quantity: 1, unit_price: 100, tax_amount: 0, total: 100 }],
    } as unknown as Parameters<typeof checkout>[0]);

    const customers = getCustomers({ tenant_id: 't' });
    expect(customers.length).toBe(2);
    expect(customers.map((c) => c.phone).sort()).toEqual(['9847000001', '9847000002']);
  });
});
