import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../../electron/db/statements/types';
import {
  updateInvoiceCreatedAt,
  updateInvoiceItemsCreatedAt,
  findInvoicesByInvoiceId2,
} from '../../electron/db/statements/invoices';

let sqlite: DatabaseSync;
let db: Db;

beforeEach(() => {
  sqlite = new DatabaseSync(':memory:');
  db = sqlite as unknown as Db;
  sqlite.exec(`
    CREATE TABLE invoices (
      invoice_id TEXT PRIMARY KEY,
      tenant_id TEXT,
      invoice_number TEXT,
      invoice_type TEXT,
      grand_total REAL DEFAULT 100,
      subtotal REAL DEFAULT 100,
      tax_total REAL DEFAULT 0,
      discount_total REAL DEFAULT 0,
      payment_method TEXT DEFAULT 'CASH',
      received_amount REAL DEFAULT 100,
      balance_amount REAL DEFAULT 0,
      customer_id TEXT,
      converted_from_invoice_id TEXT,
      converted_from_invoice_number TEXT,
      converted_to_invoice_id TEXT,
      converted_to_invoice_number TEXT,
      sync_status TEXT DEFAULT 'SYNCED',
      created_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE invoice_items (
      item_id TEXT PRIMARY KEY,
      invoice_id TEXT,
      name TEXT,
      quantity REAL DEFAULT 1,
      unit_price REAL DEFAULT 100,
      total REAL DEFAULT 100,
      sync_status TEXT DEFAULT 'SYNCED',
      created_at TEXT
    );
  `);
});

afterEach(() => {
  sqlite.close();
});

describe('Converted invoice date editing and synchronization', () => {
  it('updates both converted GST invoice and source Bill of Supply when date is updated', () => {
    const originalDate = '2026-10-15T10:00:00.000Z';
    const newDate = '2026-10-20T10:00:00.000Z';

    // Seed original Bill of Supply (BOS-71)
    sqlite.prepare(`
      INSERT INTO invoices (invoice_id, tenant_id, invoice_number, invoice_type, converted_to_invoice_id, converted_to_invoice_number, created_at)
      VALUES ('bos-71-id', 'shop', 'BOS-71', 'BILL_OF_SUPPLY', 'b2c-71-id', 'B2C-71', ?)
    `).run(originalDate);

    sqlite.prepare(`
      INSERT INTO invoice_items (item_id, invoice_id, name, created_at)
      VALUES ('bos-item-1', 'bos-71-id', 'Cookware Set', ?)
    `).run(originalDate);

    // Seed converted GST invoice (B2C-71)
    sqlite.prepare(`
      INSERT INTO invoices (invoice_id, tenant_id, invoice_number, invoice_type, converted_from_invoice_id, converted_from_invoice_number, created_at)
      VALUES ('b2c-71-id', 'shop', 'B2C-71', 'GST', 'bos-71-id', 'BOS-71', ?)
    `).run(originalDate);

    sqlite.prepare(`
      INSERT INTO invoice_items (item_id, invoice_id, name, created_at)
      VALUES ('b2c-item-1', 'b2c-71-id', 'Cookware Set', ?)
    `).run(originalDate);

    // Simulate date edit logic on B2C-71
    const existingInv = findInvoicesByInvoiceId2(db).get('b2c-71-id') as Record<string, unknown>;
    expect(existingInv.converted_from_invoice_id).toBe('bos-71-id');

    // Update B2C-71
    updateInvoiceCreatedAt(db).run(newDate, 'b2c-71-id');
    updateInvoiceItemsCreatedAt(db).run(newDate, 'b2c-71-id');

    // Keep linked conversion document in sync
    if (existingInv.converted_from_invoice_id) {
      updateInvoiceCreatedAt(db).run(newDate, existingInv.converted_from_invoice_id as string);
      updateInvoiceItemsCreatedAt(db).run(newDate, existingInv.converted_from_invoice_id as string);
    }

    // Verify B2C-71
    const updatedB2c = findInvoicesByInvoiceId2(db).get('b2c-71-id') as Record<string, unknown>;
    expect(updatedB2c.created_at).toBe(newDate);
    expect(updatedB2c.sync_status).toBe('PENDING');

    // Verify source BOS-71 was also updated
    const updatedBos = findInvoicesByInvoiceId2(db).get('bos-71-id') as Record<string, unknown>;
    expect(updatedBos.created_at).toBe(newDate);
    expect(updatedBos.sync_status).toBe('PENDING');

    // Verify items
    const b2cItem = sqlite.prepare("SELECT created_at, sync_status FROM invoice_items WHERE invoice_id = 'b2c-71-id'").get() as Record<string, unknown>;
    expect(b2cItem.created_at).toBe(newDate);
    expect(b2cItem.sync_status).toBe('PENDING');

    const bosItem = sqlite.prepare("SELECT created_at, sync_status FROM invoice_items WHERE invoice_id = 'bos-71-id'").get() as Record<string, unknown>;
    expect(bosItem.created_at).toBe(newDate);
    expect(bosItem.sync_status).toBe('PENDING');
  });

  it('updates converted GST invoice when source Bill of Supply date is edited', () => {
    const originalDate = '2026-10-15T10:00:00.000Z';
    const newDate = '2026-10-22T14:30:00.000Z';

    sqlite.prepare(`
      INSERT INTO invoices (invoice_id, tenant_id, invoice_number, invoice_type, converted_to_invoice_id, converted_to_invoice_number, created_at)
      VALUES ('bos-71-id', 'shop', 'BOS-71', 'BILL_OF_SUPPLY', 'b2c-71-id', 'B2C-71', ?)
    `).run(originalDate);

    sqlite.prepare(`
      INSERT INTO invoices (invoice_id, tenant_id, invoice_number, invoice_type, converted_from_invoice_id, converted_from_invoice_number, created_at)
      VALUES ('b2c-71-id', 'shop', 'B2C-71', 'GST', 'bos-71-id', 'BOS-71', ?)
    `).run(originalDate);

    const existingInv = findInvoicesByInvoiceId2(db).get('bos-71-id') as Record<string, unknown>;
    expect(existingInv.converted_to_invoice_id).toBe('b2c-71-id');

    updateInvoiceCreatedAt(db).run(newDate, 'bos-71-id');
    if (existingInv.converted_to_invoice_id) {
      updateInvoiceCreatedAt(db).run(newDate, existingInv.converted_to_invoice_id as string);
    }

    const updatedB2c = findInvoicesByInvoiceId2(db).get('b2c-71-id') as Record<string, unknown>;
    expect(updatedB2c.created_at).toBe(newDate);
    expect(updatedB2c.sync_status).toBe('PENDING');
  });
});
