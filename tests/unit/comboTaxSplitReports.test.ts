import { DatabaseSync } from 'node:sqlite';
import type Database from 'better-sqlite3';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createCoreTables } from '../../electron/db/schemaCoreTables';
import { createExtendedTables } from '../../electron/db/schemaExtendedTables';
import { ensureSchemaColumns } from '../../electron/db/schemaColumns';
import { calculateComboTaxBreakdown } from '../../electron/utils/comboTaxHelper';
import { buildInvoiceProductRows } from '../../src/utils/pricing/salesHistoryTax';

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

describe('Combo Tax Splitting in Billing & Reports', () => {
  it('correctly pro-rates combo price across 5% and 18% constituent items', () => {
    const constituents = [
      { product_id: 'p1', product_name: 'Tea Pack', quantity: 1, base_price: 100, tax_rate_percent: 5, is_gst_applicable: 1, hsn_sac_code: '0902' },
      { product_id: 'p2', product_name: 'Electric Kettle', quantity: 1, base_price: 300, tax_rate_percent: 18, is_gst_applicable: 1, hsn_sac_code: '8516' },
    ];

    const breakdown = calculateComboTaxBreakdown({
      comboPrice: 350,
      quantity: 1,
      constituents,
      supplyType: 'INTRA',
    });

    // Standalone total = 100 + 300 = 400
    // Weight p1 = 100 / 400 = 0.25 -> 350 * 0.25 = 87.50 taxable. Tax at 5% = 4.38 (2.19 CGST, 2.19 SGST)
    // Weight p2 = 300 / 400 = 0.75 -> 350 * 0.75 = 262.50 taxable. Tax at 18% = 47.25 (23.63 CGST, 23.62 SGST)
    expect(breakdown.constituents).toHaveLength(2);
    expect(breakdown.constituents[0].allocated_taxable).toBe(87.5);
    expect(breakdown.constituents[0].tax_rate_percent).toBe(5);
    expect(breakdown.constituents[0].tax_amount).toBe(4.38);

    expect(breakdown.constituents[1].allocated_taxable).toBe(262.5);
    expect(breakdown.constituents[1].tax_rate_percent).toBe(18);
    expect(breakdown.constituents[1].tax_amount).toBe(47.25);

    expect(breakdown.totalTaxable).toBe(350);
    expect(breakdown.totalTax).toBe(51.63);
    expect(breakdown.totalCgst + breakdown.totalSgst).toBeCloseTo(51.63, 2);
  });

  it('splits combo revenue across 5% and 18% tax slabs in GSTR-1 Table 7 (B2CS) instead of 0%', () => {
    const tenantId = 'tenant_combo_test';

    // Seed constituent products in catalog
    state.db.prepare(`
      INSERT INTO products (product_id, tenant_id, name, base_price, tax_rate_percent, is_gst_applicable, hsn_sac_code)
      VALUES 
        ('prod-tea', '${tenantId}', 'Premium Tea', 100.0, 5.0, 1, '0902'),
        ('prod-cup', '${tenantId}', 'Ceramic Mug', 300.0, 18.0, 1, '6912'),
        ('combo-1', '${tenantId}', 'Morning Tea Gift Set', 350.0, 0, 0, '')
    `).run();

    // Seed combo offer
    state.db.prepare(`
      INSERT INTO combo_offers (combo_id, tenant_id, name, combo_price, is_active, is_deleted)
      VALUES ('combo-1', '${tenantId}', 'Morning Tea Gift Set', 350.0, 1, 0)
    `).run();

    state.db.prepare(`
      INSERT INTO combo_items (combo_item_id, combo_id, tenant_id, product_id, quantity)
      VALUES 
        ('ci-1', 'combo-1', '${tenantId}', 'prod-tea', 1),
        ('ci-2', 'combo-1', '${tenantId}', 'prod-cup', 1)
    `).run();

    // Seed invoice with combo line item (pro-rated constituents in combo_details)
    const constituentsJson = JSON.stringify([
      { product_id: 'prod-tea', product_name: 'Premium Tea', quantity: 1, product_price: 100, tax_rate_percent: 5, is_gst_applicable: 1, hsn_sac_code: '0902', uom: 'PKT' },
      { product_id: 'prod-cup', product_name: 'Ceramic Mug', quantity: 1, product_price: 300, tax_rate_percent: 18, is_gst_applicable: 1, hsn_sac_code: '6912', uom: 'NOS' },
    ]);

    state.db.prepare(`
      INSERT INTO invoices (
        invoice_id, tenant_id, invoice_number, invoice_type, created_at,
        subtotal, tax_total, grand_total, customer_name, customer_gstin,
        customer_state, supply_type, cgst_total, sgst_total, igst_total, is_deleted
      ) VALUES (
        'inv-combo-1', '${tenantId}', 'INV-156', 'GST', '2026-10-15 10:00:00',
        350.0, 51.63, 401.63, 'Walk-in Customer', NULL,
        '32', 'INTRA', 25.82, 25.81, 0.0, 0
      )
    `).run();

    state.db.prepare(`
      INSERT INTO invoice_items (
        item_id, invoice_id, tenant_id, product_id, name,
        quantity, unit_price, tax_amount, total,
        cgst_rate, sgst_rate, igst_rate, cgst_amount, sgst_amount, igst_amount,
        hsn_sac_code, uom, combo_id, combo_details
      ) VALUES (
        'item-c-1', 'inv-combo-1', '${tenantId}', 'combo-1', 'Morning Tea Gift Set',
        1, 350.0, 51.63, 401.63,
        7.38, 7.37, 0.0, 25.82, 25.81, 0.0,
        '', 'SET', 'combo-1', '${constituentsJson}'
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

    // GSTR-1 Table 7 (B2CS) must NOT contain a 0% rate row for this combo.
    // Instead, it must have two entries: 5% and 18%!
    expect(report.b2cs).toHaveLength(2);

    const b2cs5 = report.b2cs.find(r => r.applicable_tax_rate === 5);
    const b2cs18 = report.b2cs.find(r => r.applicable_tax_rate === 18);
    const b2cs0 = report.b2cs.find(r => r.applicable_tax_rate === 0);

    expect(b2cs0).toBeUndefined();
    expect(b2cs5).toBeDefined();
    expect(b2cs18).toBeDefined();

    expect(b2cs5!.taxable_value).toBe(87.5);
    expect(b2cs5!.cgst + b2cs5!.sgst).toBeCloseTo(4.38, 2);

    expect(b2cs18!.taxable_value).toBe(262.5);
    expect(b2cs18!.cgst + b2cs18!.sgst).toBeCloseTo(47.25, 2);

    // Table 12 (HSN) must report child HSNs (0902 and 6912)
    expect(report.hsn).toHaveLength(2);
    const hsnCodes = report.hsn.map(h => h.hsn_sc);
    expect(hsnCodes).toContain('0902');
    expect(hsnCodes).toContain('6912');

    // rate_breakdown must also split into 5% and 18%
    expect(report.rate_breakdown).toBeDefined();
    const rate5 = report.rate_breakdown?.find(r => r.rate === 5);
    const rate18 = report.rate_breakdown?.find(r => r.rate === 18);
    expect(rate5?.taxable).toBe(87.5);
    expect(rate18?.taxable).toBe(262.5);
  });

  it('resolves historical bill (Bill #156) with legacy minimal combo_details from SQLite catalog', () => {
    const tenantId = 'tenant_legacy_bill';

    // Seed constituent products in catalog
    state.db.prepare(`
      INSERT INTO products (product_id, tenant_id, name, base_price, tax_rate_percent, is_gst_applicable, hsn_sac_code)
      VALUES 
        ('prod-oil', '${tenantId}', 'Sunflower Oil', 200.0, 5.0, 1, '1512'),
        ('prod-ghee', '${tenantId}', 'Pure Desi Ghee', 600.0, 12.0, 1, '0405'),
        ('combo-festive', '${tenantId}', 'Festive Cooking Pack', 700.0, 0, 0, '')
    `).run();

    // Seed combo offer
    state.db.prepare(`
      INSERT INTO combo_offers (combo_id, tenant_id, name, combo_price, is_active, is_deleted)
      VALUES ('combo-festive', '${tenantId}', 'Festive Cooking Pack', 700.0, 1, 0)
    `).run();

    state.db.prepare(`
      INSERT INTO combo_items (combo_item_id, combo_id, tenant_id, product_id, quantity)
      VALUES 
        ('ci-f1', 'combo-festive', '${tenantId}', 'prod-oil', 1),
        ('ci-f2', 'combo-festive', '${tenantId}', 'prod-ghee', 1)
    `).run();

    // Bill #156 legacy simulation: combo_details only had minimal [{ product_id, quantity }]
    const legacyDetails = JSON.stringify([
      { product_id: 'prod-oil', quantity: 1 },
      { product_id: 'prod-ghee', quantity: 1 },
    ]);

    state.db.prepare(`
      INSERT INTO invoices (
        invoice_id, tenant_id, invoice_number, invoice_type, created_at,
        subtotal, tax_total, grand_total, customer_name, customer_gstin,
        customer_state, supply_type, cgst_total, sgst_total, igst_total, is_deleted
      ) VALUES (
        'inv-156', '${tenantId}', '156', 'GST', '2026-10-18 14:00:00',
        700.0, 71.75, 771.75, 'Retail Shopper', NULL,
        '32', 'INTRA', 35.88, 35.87, 0.0, 0
      )
    `).run();

    state.db.prepare(`
      INSERT INTO invoice_items (
        item_id, invoice_id, tenant_id, product_id, name,
        quantity, unit_price, tax_amount, total,
        cgst_rate, sgst_rate, igst_rate, cgst_amount, sgst_amount, igst_amount,
        hsn_sac_code, uom, combo_id, combo_details
      ) VALUES (
        'item-156-1', 'inv-156', '${tenantId}', 'combo-festive', 'Festive Cooking Pack',
        1, 700.0, 71.75, 771.75,
        5.13, 5.12, 0.0, 35.88, 35.87, 0.0,
        '', 'SET', 'combo-festive', '${legacyDetails}'
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

    // Must resolve catalog rates (5% and 12%) and populate Table 7
    expect(report.b2cs).toHaveLength(2);
    const b2cs5 = report.b2cs.find(r => r.applicable_tax_rate === 5);
    const b2cs12 = report.b2cs.find(r => r.applicable_tax_rate === 12);

    expect(b2cs5).toBeDefined();
    expect(b2cs12).toBeDefined();

    // Oil standalone = 200, Ghee standalone = 600, total = 800.
    // Oil weight = 200/800 = 0.25 -> 700 * 0.25 = 175 taxable.
    // Ghee weight = 600/800 = 0.75 -> 700 * 0.75 = 525 taxable.
    expect(b2cs5!.taxable_value).toBe(175);
    expect(b2cs12!.taxable_value).toBe(525);
  });

  it('buildInvoiceProductRows expands combo line into constituent rows for Sales History tax table', () => {
    const inv = {
      invoice_id: 'inv-combo-sh',
      invoice_number: 'INV-200',
      created_at: '2026-10-15 10:00:00',
      subtotal: 350,
      tax_total: 51.63,
      grand_total: 401.63,
    };

    const items = [
      {
        product_id: 'combo-1',
        name: 'Morning Tea Gift Set',
        quantity: 1,
        unit_price: 350,
        total: 401.63,
        tax_amount: 51.63,
        combo_id: 'combo-1',
        combo_details: JSON.stringify([
          { product_id: 'p-tea', product_name: 'Tea Pack', quantity: 1, product_price: 100, tax_rate_percent: 5, hsn_sac_code: '0902', uom: 'PKT' },
          { product_id: 'p-cup', product_name: 'Mug', quantity: 1, product_price: 300, tax_rate_percent: 18, hsn_sac_code: '6912', uom: 'NOS' },
        ]),
      },
    ];

    const rows = buildInvoiceProductRows(inv, items);
    expect(rows).toHaveLength(2);

    expect(rows[0].gstRate).toBe(5);
    expect(rows[0].taxable).toBe(87.5);
    expect(rows[0].tax).toBe(4.38);

    expect(rows[1].gstRate).toBe(18);
    expect(rows[1].taxable).toBe(262.5);
    expect(rows[1].tax).toBe(47.25);
  });

  it('correctly reports standard POS checkout invoice where total is taxable base (e.g. 100@5% + 150@18% combo at 200)', () => {
    const tenantId = 'tenant_user_case';

    state.db.prepare(`
      INSERT INTO products (product_id, tenant_id, name, base_price, tax_rate_percent, is_gst_applicable, hsn_sac_code)
      VALUES 
        ('prod-a', '${tenantId}', 'Product A', 100.0, 5.0, 1, '1111'),
        ('prod-b', '${tenantId}', 'Product B', 150.0, 18.0, 1, '2222'),
        ('combo-ab', '${tenantId}', 'Product AB Combo', 200.0, 0, 0, '')
    `).run();

    state.db.prepare(`
      INSERT INTO combo_offers (combo_id, tenant_id, name, combo_price, is_active, is_deleted)
      VALUES ('combo-ab', '${tenantId}', 'Product AB Combo', 200.0, 1, 0)
    `).run();

    state.db.prepare(`
      INSERT INTO combo_items (combo_item_id, combo_id, tenant_id, product_id, quantity)
      VALUES 
        ('ci-ab1', 'combo-ab', '${tenantId}', 'prod-a', 1),
        ('ci-ab2', 'combo-ab', '${tenantId}', 'prod-b', 1)
    `).run();

    // In Nafid POS checkout:
    // unit_price = 200.0, total = 200.0 (taxable turnover), tax_amount = 25.60
    // grand_total = 225.60
    state.db.prepare(`
      INSERT INTO invoices (
        invoice_id, tenant_id, invoice_number, invoice_type, created_at,
        subtotal, tax_total, grand_total, customer_name, customer_gstin,
        customer_state, supply_type, cgst_total, sgst_total, igst_total, is_deleted
      ) VALUES (
        'inv-ab-1', '${tenantId}', 'INV-USER', 'GST', '2026-10-15 10:00:00',
        200.0, 25.60, 225.60, 'Walk-in Customer', NULL,
        '32', 'INTRA', 12.80, 12.80, 0.0, 0
      )
    `).run();

    state.db.prepare(`
      INSERT INTO invoice_items (
        item_id, invoice_id, tenant_id, product_id, name,
        quantity, unit_price, tax_amount, total,
        cgst_rate, sgst_rate, igst_rate, cgst_amount, sgst_amount, igst_amount,
        hsn_sac_code, uom, combo_id, combo_details
      ) VALUES (
        'item-ab-1', 'inv-ab-1', '${tenantId}', 'combo-ab', 'Product AB Combo',
        1, 200.0, 25.60, 200.0,
        6.4, 6.4, 0.0, 12.80, 12.80, 0.0,
        '', 'SET', 'combo-ab', NULL
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

    // Table 7 (B2CS) must show:
    // 5% slab: Taxable 80.00, CGST 2.00, SGST 2.00, Total Tax 4.00
    // 18% slab: Taxable 120.00, CGST 10.80, SGST 10.80, Total Tax 21.60
    const b2cs5 = report.b2cs.find(r => r.applicable_tax_rate === 5);
    const b2cs18 = report.b2cs.find(r => r.applicable_tax_rate === 18);

    expect(b2cs5).toBeDefined();
    expect(b2cs5!.taxable_value).toBe(80);
    expect(b2cs5!.cgst).toBe(2);
    expect(b2cs5!.sgst).toBe(2);

    expect(b2cs18).toBeDefined();
    expect(b2cs18!.taxable_value).toBe(120);
    expect(b2cs18!.cgst).toBe(10.8);
    expect(b2cs18!.sgst).toBe(10.8);

    // Rate breakdown must also reconcile:
    // 5% row + 18% row = 200.00 taxable, 25.60 tax
    const r5 = report.rate_breakdown?.find(r => r.rate === 5);
    const r18 = report.rate_breakdown?.find(r => r.rate === 18);

    expect(r5?.taxable).toBe(80);
    expect(r5?.totalTax).toBe(4);

    expect(r18?.taxable).toBe(120);
    expect(r18?.totalTax).toBe(21.6);
  });
});
