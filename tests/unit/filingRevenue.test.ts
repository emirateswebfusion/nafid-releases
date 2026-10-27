import { describe, expect, it } from 'vitest';
import { salesHistoryDb } from './fixtures/salesHistoryDb';
import { getInvoicesStatement, getInvoicesSummaryStatement } from '../../electron/db/statements/invoices';
import { sumCashSalesInWindow } from '../../electron/db/statements/cashDrawer';

describe('stored revenue decisions and filing history', () => {
  it.each([0, 1])('lists filing bills while totals honor stored inclusion=%s', included => {
    const { db, memory } = salesHistoryDb();
    try {
      memory.prepare("INSERT INTO invoices (invoice_id,tenant_id,invoice_number,invoice_type,customer_gstin,grand_total,subtotal,payment_method,created_at,counts_in_revenue,bill_purpose,stock_applied) VALUES ('f','t1','GST-1','GST','GSTIN',100,100,'CASH','2026-10-27T10:00:00Z',?,'FILING_ONLY',0)").run(included);
      const args = { activeTenantId: 't1', onlyUserInvoices: false, dateRange: null, accounting_view: 'ALL' };
      const list = getInvoicesStatement(db, args);
      expect(list.statement.all(...list.params)).toMatchObject([{ bill_purpose: 'FILING_ONLY' }]);
      for (const accounting_view of ['ALL', 'TAX_FILING']) {
        const summary = getInvoicesSummaryStatement(db, { ...args, accounting_view });
        expect(summary.statement.get(...summary.params)).toMatchObject({ totalSales: included * 100 });
      }
      expect(sumCashSalesInWindow(db).get('t1', '2026-10-27T00:00:00Z', null, null)).toMatchObject({ total_cash_sales: included * 100 });
      const hiddenCategory = getInvoicesStatement(db, { ...args, invoice_type: 'GST_B2B', showFilingB2b: false });
      expect(hiddenCategory.statement.all(...hiddenCategory.params)).toEqual([]);
      const shownCategory = getInvoicesStatement(db, { ...args, invoice_type: 'GST_B2B', showFilingB2b: true });
      expect(shownCategory.statement.all(...shownCategory.params)).toHaveLength(1);
      const filingCategory = getInvoicesStatement(db, { ...args, invoice_type: 'FILING_ONLY', showFilingB2b: false });
      expect(filingCategory.statement.all(...filingCategory.params)).toHaveLength(1);
    } finally { memory.close(); }
  });
});
