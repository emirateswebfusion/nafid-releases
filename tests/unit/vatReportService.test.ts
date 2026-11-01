import { DatabaseSync } from 'node:sqlite';
import type Database from 'better-sqlite3';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createCoreTables } from '../../electron/db/schemaCoreTables';
import { createExtendedTables } from '../../electron/db/schemaExtendedTables';
import { ensureSchemaColumns } from '../../electron/db/schemaColumns';

const state = vi.hoisted(() => ({ db: null as unknown as Database.Database }));
vi.mock('../../electron/db/localDb', () => ({ getDb: () => state.db }));

import { getVatReport } from '../../electron/services/vatReportService';
import {
  getLocalVatFilings,
  upsertLocalVatFiling,
  recordLocalVatManualAck,
} from '../../electron/services/vatFilingService';
import { m014VatLocalFilings } from '../../electron/db/migrations/014-vat-local-filings';

let raw: DatabaseSync;

beforeEach(() => {
  raw = new DatabaseSync(':memory:');
  state.db = Object.assign(raw, {
    transaction: (fn: () => unknown) => () => fn(),
  }) as unknown as Database.Database;

  createCoreTables(state.db);
  createExtendedTables(state.db);
  ensureSchemaColumns(state.db);
  m014VatLocalFilings.up(state.db);
});

afterEach(() => {
  raw.close();
});

describe('UAE VAT 201 Report Service', () => {
  it('accurately calculates Section 1 Output VAT, Section 2 Input VAT, and Section 3 Net Payable', () => {
    const tenantId = 'tenant_uae';

    // 1. Seed products
    state.db.prepare(`
      INSERT INTO products (product_id, tenant_id, name, base_price)
      VALUES 
        ('prod-1', '${tenantId}', 'Smartphone Case', 100.0),
        ('prod-2', '${tenantId}', 'Screen Protector', 50.0)
    `).run();

    // 2. Seed a Simplified Tax Invoice in Dubai (100 AED taxable + 5 AED VAT = 105 AED)
    state.db.prepare(`
      INSERT INTO invoices (
        invoice_id, tenant_id, invoice_number, invoice_type, created_at,
        subtotal, tax_total, grand_total, customer_name, customer_gstin,
        customer_state, is_deleted
      ) VALUES (
        'inv-1', '${tenantId}', 'INV-AE-001', 'tax_invoice', '2026-10-15 10:00:00',
        100.0, 5.0, 105.0, 'Retail Shopper', NULL,
        'DUBAI', 0
      )
    `).run();

    state.db.prepare(`
      INSERT INTO invoice_items (
        item_id, invoice_id, tenant_id, product_id, name,
        quantity, unit_price, tax_amount, total
      ) VALUES (
        'item-1', 'inv-1', '${tenantId}', 'prod-1', 'Smartphone Case',
        1, 100.0, 5.0, 105.0
      )
    `).run();

    // 3. Seed a Full Tax B2B Invoice in Dubai (12,000 AED taxable + 600 AED VAT = 12,600 AED) with valid customer TRN
    state.db.prepare(`
      INSERT INTO invoices (
        invoice_id, tenant_id, invoice_number, invoice_type, created_at,
        subtotal, tax_total, grand_total, customer_name, customer_gstin,
        customer_state, is_deleted
      ) VALUES (
        'inv-2', '${tenantId}', 'INV-AE-002', 'tax_invoice', '2026-10-20 14:00:00',
        12000.0, 600.0, 12600.0, 'Al Futtaim Electronics', '100456789012345',
        'DUBAI', 0
      )
    `).run();

    state.db.prepare(`
      INSERT INTO invoice_items (
        item_id, invoice_id, tenant_id, product_id, name,
        quantity, unit_price, tax_amount, total
      ) VALUES (
        'item-2', 'inv-2', '${tenantId}', 'prod-2', 'Screen Protector',
        240, 50.0, 600.0, 12600.0
      )
    `).run();

    // 3b. Seed a Zero-Rated Export Invoice (500 AED taxable, 0 AED tax)
    state.db.prepare(`
      INSERT INTO invoices (
        invoice_id, tenant_id, invoice_number, invoice_type, created_at,
        subtotal, tax_total, grand_total, customer_name, customer_gstin,
        customer_state, is_deleted
      ) VALUES (
        'inv-3', '${tenantId}', 'INV-AE-EXP-001', 'tax_invoice', '2026-10-22 11:00:00',
        500.0, 0.0, 500.0, 'Overseas Client', NULL,
        'DUBAI', 0
      )
    `).run();

    state.db.prepare(`
      INSERT INTO invoice_items (
        item_id, invoice_id, tenant_id, product_id, name,
        quantity, unit_price, tax_amount, total
      ) VALUES (
        'item-3', 'inv-3', '${tenantId}', 'prod-1', 'Smartphone Case',
        5, 100.0, 0.0, 500.0
      )
    `).run();

    // 4. Seed a Credit Note / Return (100 AED taxable + 5 AED VAT = 105 AED)
    state.db.prepare(`
      INSERT INTO returns (
        return_id, invoice_id, tenant_id, return_number, credit_note_number,
        original_invoice_number, original_invoice_date, customer_name,
        subtotal, tax_total, grand_total, created_at
      ) VALUES (
        'ret-1', 'inv-1', '${tenantId}', 'RET-001', 'CN-001',
        'INV-AE-001', '2026-10-15', 'Retail Shopper',
        100.0, 5.0, 105.0, '2026-10-25 16:00:00'
      )
    `).run();

    // 5. Seed a Purchase Bill (Input Tax: 5,000 AED total, 5% standard VAT)
    state.db.prepare(`
      INSERT INTO purchase_bills (
        purchase_bill_id, tenant_id, bill_number, supplier_name,
        bill_date, invoice_number, total_amount, created_at
      ) VALUES (
        'pb-1', '${tenantId}', 'PB-001', 'Tech Distributor LLC',
        '2026-10-10', 'SUP-INV-99', 5250.0, '2026-10-10 09:00:00'
      )
    `).run();

    state.db.prepare(`
      INSERT INTO purchase_bill_items (
        item_id, purchase_bill_id, tenant_id, product_id, name,
        quantity, purchase_price, total_amount, is_gst_applicable, tax_rate_percent
      ) VALUES (
        'pbi-1', 'pb-1', '${tenantId}', 'prod-1', 'Smartphone Case',
        50, 100.0, 5250.0, 1, 5.0
      )
    `).run();

    // Run report
    const res = getVatReport({
      tenant_id: tenantId,
      from_date: '2026-10-01',
      to_date: '2026-10-31',
      shop_emirate: 'DUBAI',
      shop_trn: '100123456789003',
      shop_name: 'Nafid Dubai Flagship',
    });

    expect('error' in res).toBe(false);
    if ('error' in res) return;

    // Check Section 1 (Output Tax)
    // Dubai Box 1b:
    // Sales: 100 + 12,000 = 12,100 AED taxable, 5 + 600 = 605 AED VAT
    // Adjustments: 100 AED taxable, 5 AED VAT
    expect(res.section1Output.standardRatedSupplies.dubai.amount).toBe(12100);
    expect(res.section1Output.standardRatedSupplies.dubai.vatAmount).toBe(605);
    expect(res.section1Output.standardRatedSupplies.dubai.adjustment).toBe(100);
    expect(res.section1Output.standardRatedSupplies.dubai.adjustmentVat).toBe(5);

    // Box 4 Zero-Rated Supplies
    expect(res.section1Output.zeroRatedSupplies.amount).toBe(500);

    // Box 8 Total Output Tax: 12,100 standard + 500 zero-rated = 12,600 AED
    expect(res.section1Output.totalOutputTax.totalAmount).toBe(12600);
    // Box 8 Total Output Tax Due: 605 - 5 = 600 AED
    expect(res.section1Output.totalOutputTax.netOutputVatDue).toBe(600);

    // Check Section 2 (Input Tax)
    // Box 9: 5,250 AED inclusive 5% VAT:
    // VAT = 5250 * 5/105 = 250 AED, Taxable = 5000 AED
    expect(res.section2Input.standardRatedExpenses.vatAmount).toBe(250);
    expect(res.section2Input.totalInputTax.netInputVatRecoverable).toBe(250);

    // Check Section 3 (Net VAT Due)
    // Box 12: 600 AED Output Tax
    // Box 13: 250 AED Recoverable Input Tax
    // Box 14: 600 - 250 = 350 AED Payable to FTA
    expect(res.netDue.totalDueTax).toBe(600);
    expect(res.netDue.totalRecoverableTax).toBe(250);
    expect(res.netDue.netVatPayable).toBe(350);
    expect(res.netDue.status).toBe('PAYABLE');

    // Check Audit breakdowns
    expect(res.salesAudit).toHaveLength(3);
    expect(res.salesAudit[0].invoiceType).toBe('SIMPLIFIED');
    expect(res.salesAudit[1].invoiceType).toBe('FULL'); // Has TRN and > 10,000 AED
    expect(res.salesAudit[2].taxCategory).toBe('ZERO_RATED');
    expect(res.creditNotesAudit).toHaveLength(1);
    expect(res.purchaseAudit).toHaveLength(1);

    // Validation checks passed
    const blocking = res.validationIssues.filter(i => i.severity === 'BLOCKING');
    expect(blocking).toHaveLength(0);
  });

  it('manages local VAT filing lifecycle (draft, approve, manual acknowledgement)', () => {
    // 1. Initial state is empty
    const initial = getLocalVatFilings();
    expect(Array.isArray(initial)).toBe(true);
    if (!Array.isArray(initial)) return;
    expect(initial).toHaveLength(0);

    // 2. Upsert Draft filing
    const draftRes = upsertLocalVatFiling({
      period: '2026-Q3',
      return_type: 'VAT201',
      status: 'DRAFT',
      filing_mode: 'OFFLINE_FAF',
      net_output_vat: 1500,
      recoverable_input_vat: 500,
      net_vat_payable: 1000,
      net_vat_status: 'PAYABLE',
      notes: 'Initial draft for Q3 review',
    });
    expect('error' in draftRes).toBe(false);

    let rows = getLocalVatFilings();
    expect(Array.isArray(rows)).toBe(true);
    if (!Array.isArray(rows)) return;
    expect(rows).toHaveLength(1);
    expect(rows[0].period).toBe('2026-Q3');
    expect(rows[0].status).toBe('DRAFT');
    expect(rows[0].net_vat_payable).toBe(1000);

    // 3. Approve filing
    const approveRes = upsertLocalVatFiling({
      id: rows[0].id,
      period: '2026-Q3',
      return_type: 'VAT201',
      status: 'APPROVED',
      filing_mode: 'EMARATAX_PORTAL',
      net_output_vat: 1500,
      recoverable_input_vat: 500,
      net_vat_payable: 1000,
      net_vat_status: 'PAYABLE',
      approved_by: 'Lead Accountant',
      approved_at: '2026-10-25 15:00:00',
    });
    expect('error' in approveRes).toBe(false);

    rows = getLocalVatFilings();
    if (!Array.isArray(rows)) return;
    expect(rows[0].status).toBe('APPROVED');
    expect(rows[0].approved_by).toBe('Lead Accountant');

    // 4. Record EmaraTax Acknowledgement
    const ackRes = recordLocalVatManualAck({
      id: rows[0].id,
      period: '2026-Q3',
      return_type: 'VAT201',
      filing_mode: 'EMARATAX_PORTAL',
      acknowledgement_number: 'FTA-ACK-2026-998877',
      filing_date: '2026-10-28',
      net_output_vat: 1500,
      recoverable_input_vat: 500,
      net_vat_payable: 1000,
      net_vat_status: 'PAYABLE',
      notes: 'Submitted on EmaraTax portal without issues',
      approved_by: 'Lead Accountant',
    });
    expect('error' in ackRes).toBe(false);

    rows = getLocalVatFilings();
    if (!Array.isArray(rows)) return;
    expect(rows[0].status).toBe('FILED');
    expect(rows[0].acknowledgement_number).toBe('FTA-ACK-2026-998877');
    expect(rows[0].filing_date).toBe('2026-10-28');
  });
});
