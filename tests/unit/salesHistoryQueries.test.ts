import { describe, expect, it } from 'vitest';
import { salesHistoryDb } from './fixtures/salesHistoryDb';
import { getInvoicesStatement, getInvoicesSummaryStatement, findInvoiceItemsByInvoiceIdAndIsGstApplicable } from '../../electron/db/statements/invoices';

describe('Sales History query budget', () => {
  it('limits conversion checks to 30 IDs in a 5,000-invoice shop', () => {
    const { db, memory } = salesHistoryDb();
    try {
      const product = memory.prepare("INSERT INTO products(product_id,tenant_id,name,base_price,is_gst_applicable,is_deleted) VALUES(?,'t1',?,100,0,0)");
      const invoice = memory.prepare("INSERT INTO invoices(invoice_id,invoice_number,tenant_id,invoice_type,created_at,subtotal,tax_total,grand_total) VALUES(?,?,'t1','BILL_OF_SUPPLY','2026-10-27T09:00:00.000Z',100,0,100)");
      const item = memory.prepare("INSERT INTO invoice_items(item_id,invoice_id,product_id,name,quantity,unit_price,total) VALUES(?,?,?,?,1,100,100)");
      memory.exec('BEGIN');
      for (let p = 0; p < 1000; p++) product.run('p' + p, 'Product ' + p);
      for (let i = 0; i < 5000; i++) {
        const id = 'inv-' + String(i).padStart(5, '0');
        invoice.run(id, 'BOS-' + i);
        for (let j = 0; j < 3; j++) item.run(id + '-' + j, id, 'p' + ((i + j) % 1000), 'Product ' + ((i + j) % 1000));
      }
      memory.exec('COMMIT');
      const args = { activeTenantId: 't1', onlyUserInvoices: false, accounting_view: 'REAL_SALES', limit: 30, dateRange: null };
      const start = performance.now();
      const pageQuery = getInvoicesStatement(db, args);
      const page = pageQuery.statement.all(...pageQuery.params) as { invoice_id: string }[];
      const listMs = performance.now() - start;
      const summaryStart = performance.now();
      const summary = getInvoicesSummaryStatement(db, args);
      expect(summary.statement.get(...summary.params)).toMatchObject({ totalInvoices: 5000 });
      const summaryMs = performance.now() - summaryStart;
      const legacyStart = performance.now();
      const legacy = findInvoiceItemsByInvoiceIdAndIsGstApplicable(db).all('t1', 't1');
      const legacyMs = performance.now() - legacyStart;
      console.info(JSON.stringify({ fixtureInvoices: 5000, fixtureItems: 15000, listRows: page.length, listMs, summaryMs, legacyConversionRows: legacy.length, legacyConversionMs: legacyMs }));
      const scopedStart = performance.now();
      const scoped = findInvoiceItemsByInvoiceIdAndIsGstApplicable(db, page.map(row => row.invoice_id)).all('t1', 't1', ...page.map(row => row.invoice_id));
      console.info(JSON.stringify({ fixtureInvoices: 5000, fixtureItems: 15000, listRows: page.length, listMs, summaryMs, legacyConversionRows: legacy.length, legacyConversionMs: legacyMs, scopedConversionRows: scoped.length, scopedConversionMs: performance.now() - scopedStart }));
      expect(page).toHaveLength(30);
      expect(legacy).toHaveLength(5000);
      expect(scoped).toHaveLength(30);
      expect(scoped).toEqual(legacy.filter(row => page.some(inv => inv.invoice_id === (row as { invoice_id: string }).invoice_id)));
    } finally {
      memory.close();
    }
  });

  it('preserves tenant, deletion and conversion rules and both eligibility results when scoped', () => {
    const { db, memory } = salesHistoryDb();
    try {
      memory.exec("INSERT INTO products(product_id,tenant_id,name,base_price,is_gst_applicable) VALUES('taxed','t1','Taxed',100,1),('plain','t1','Plain',100,0); INSERT INTO invoices(invoice_id,tenant_id,invoice_type,is_deleted,converted_to_invoice_id) VALUES('eligible','t1','BILL_OF_SUPPLY',0,NULL),('ineligible','t1','BILL_OF_SUPPLY',0,NULL),('other-tenant','t2','BILL_OF_SUPPLY',0,NULL),('deleted','t1','BILL_OF_SUPPLY',1,NULL),('converted','t1','BILL_OF_SUPPLY',0,'gst-copy'); INSERT INTO invoice_items(item_id,invoice_id,product_id,quantity,unit_price,total) VALUES('line1','eligible','taxed',1,100,100),('line2','ineligible','plain',1,100,100),('line3','other-tenant','taxed',1,100,100)");
      const ids = ['eligible', 'ineligible', 'other-tenant', 'deleted', 'converted'];
      const result = findInvoiceItemsByInvoiceIdAndIsGstApplicable(db, ids).all('t1', 't1', ...ids);
      expect(result).toEqual(expect.arrayContaining([
        expect.objectContaining({ invoice_id: 'eligible', convertible: 1 }),
        expect.objectContaining({ invoice_id: 'ineligible', convertible: 0 }),
      ]));
      expect(result).toHaveLength(2);
      expect(findInvoiceItemsByInvoiceIdAndIsGstApplicable(db, []).all('t1', 't1')).toEqual([]);
    } finally { memory.close(); }
  });
});
