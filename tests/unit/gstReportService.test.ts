import { DatabaseSync } from 'node:sqlite';
import type Database from 'better-sqlite3';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createCoreTables } from '../../electron/db/schemaCoreTables';
import { createExtendedTables } from '../../electron/db/schemaExtendedTables';
import { ensureSchemaColumns } from '../../electron/db/schemaColumns';

const state = vi.hoisted(() => ({ db: null as unknown as Database.Database }));
vi.mock('../../electron/db/localDb', () => ({ getDb: () => state.db }));

import { getGstReport } from '../../electron/services/gstReportService';

let raw: DatabaseSync;

beforeEach(() => {
  raw = new DatabaseSync(':memory:');
  state.db = Object.assign(raw, {
    transaction: (fn: () => unknown) => () => fn(),
  }) as unknown as Database.Database;

  createCoreTables(state.db);
  createExtendedTables(state.db);
  ensureSchemaColumns(state.db);
});

afterEach(() => {
  raw.close();
});

describe('GSTR-1 Report Service', () => {
  it('aggregates period invoices into GSTR-1 tables without errors', () => {
    const tenantId = 't_test';

    // Seed products first for foreign key integrity
    state.db.prepare(`
      INSERT INTO products (product_id, tenant_id, name, base_price, hsn_sac_code)
      VALUES 
        ('prod-1', '${tenantId}', 'LED Bulb 9W', 50.0, '8539'),
        ('prod-2', '${tenantId}', 'Ceiling Fan', 500.0, '8414')
    `).run();

    // Seed B2CS intra-state invoice (unregistered retail)
    state.db.prepare(`
      INSERT INTO invoices (
        invoice_id, tenant_id, invoice_number, invoice_type, created_at,
        subtotal, tax_total, grand_total, customer_name, customer_gstin,
        customer_state, supply_type, cgst_total, sgst_total, igst_total, is_deleted
      ) VALUES (
        'inv-1', '${tenantId}', 'INV-001', 'tax_invoice', '2026-10-15 10:00:00',
        100.0, 18.0, 118.0, 'Retail Customer', NULL,
        '32', 'INTRA', 9.0, 9.0, 0.0, 0
      )
    `).run();

    state.db.prepare(`
      INSERT INTO invoice_items (
        item_id, invoice_id, tenant_id, product_id, name,
        quantity, unit_price, tax_amount, total,
        cgst_rate, sgst_rate, igst_rate, cgst_amount, sgst_amount, igst_amount,
        hsn_sac_code, uom
      ) VALUES (
        'item-1', 'inv-1', '${tenantId}', 'prod-1', 'LED Bulb 9W',
        2, 50.0, 18.0, 118.0,
        9.0, 9.0, 0.0, 9.0, 9.0, 0.0,
        '8539', 'NOS'
      )
    `).run();

    // Seed B2B registered invoice
    state.db.prepare(`
      INSERT INTO invoices (
        invoice_id, tenant_id, invoice_number, invoice_type, created_at,
        subtotal, tax_total, grand_total, customer_name, customer_gstin,
        customer_state, supply_type, cgst_total, sgst_total, igst_total, is_deleted
      ) VALUES (
        'inv-2', '${tenantId}', 'INV-002', 'tax_invoice', '2026-10-20 11:30:00',
        500.0, 90.0, 590.0, 'Acme Corp', '32AABCA1234A1Z5',
        '32', 'INTRA', 45.0, 45.0, 0.0, 0
      )
    `).run();

    state.db.prepare(`
      INSERT INTO invoice_items (
        item_id, invoice_id, tenant_id, product_id, name,
        quantity, unit_price, tax_amount, total,
        cgst_rate, sgst_rate, igst_rate, cgst_amount, sgst_amount, igst_amount,
        hsn_sac_code, uom
      ) VALUES (
        'item-2', 'inv-2', '${tenantId}', 'prod-2', 'Ceiling Fan',
        1, 500.0, 90.0, 590.0,
        9.0, 9.0, 0.0, 45.0, 45.0, 0.0,
        '8414', 'NOS'
      )
    `).run();

    const report = getGstReport({
      tenant_id: tenantId,
      from_date: '2026-10-01',
      to_date: '2026-10-31',
      shop_state_code: '32',
    });

    expect('error' in report).toBe(false);
    if ('error' in report) return;

    // Verify summary
    expect(report.summary.total_invoices).toBe(2);
    expect(report.summary.total_invoice_value).toBe(708.0);
    expect(report.summary.total_taxable_value).toBe(600.0);
    expect(report.summary.total_tax).toBe(108.0);
    expect(report.summary.total_cgst).toBe(54.0);
    expect(report.summary.total_sgst).toBe(54.0);
    expect(report.summary.total_igst).toBe(0.0);

    // Verify B2B table
    expect(report.b2b).toHaveLength(1);
    expect(report.b2b[0].invoice_number).toBe('INV-002');
    expect(report.b2b[0].gstin).toBe('32AABCA1234A1Z5');

    // Verify B2CS table
    expect(report.b2cs).toHaveLength(1);
    expect(report.b2cs[0].supply_type).toBe('INTRA');
    expect(report.b2cs[0].applicable_tax_rate).toBe(18);

    // Verify Table 12 HSN summary
    expect(report.hsn).toHaveLength(2);
    const hsnCodes = report.hsn.map(h => h.hsn_sc);
    expect(hsnCodes).toContain('8539');
    expect(hsnCodes).toContain('8414');

    // Verify Table 13 Documents issued (invoices + credit notes)
    expect(report.doc_issue).toHaveLength(2);
    expect(report.doc_issue[0].nature_of_document).toBe('Invoices for outward supply');
    expect(report.doc_issue[0].from_doc).toBe('INV-001');
    expect(report.doc_issue[0].to_doc).toBe('INV-002');
    expect(report.doc_issue[0].total_docs).toBe(2);
    expect(report.doc_issue[1].nature_of_document).toBe('Credit notes');
    expect(report.doc_issue[1].total_docs).toBe(0);
  });
});
