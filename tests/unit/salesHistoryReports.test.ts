import { describe, expect, it } from 'vitest';
import { salesHistoryDb } from './fixtures/salesHistoryDb';
import { getInvoicesSummaryStatement } from '../../electron/db/statements/invoices';
import { sumCashSalesInWindow } from '../../electron/db/statements/cashDrawer';
import { buildShopClosingSummaryData } from '../../electron/whatsapp/shopClosingSummary';
import { getInvoiceNetTotal, getInvoicePreDeductionTotal } from '../../src/utils/pricing/salesHistoryAmount';

describe('Sales History / Cash Register / Shop Closing reconciliation', () => {
  it('counts real sales once, including direct GST, and agrees on tax and deductions for the same settled cash scope', () => {
    const { db, memory } = salesHistoryDb();
    try {
      memory.exec("INSERT INTO invoices(invoice_id,invoice_number,tenant_id,invoice_type,subtotal,tax_total,discount_total,points_redeemed_discount,scrap_deduction,return_deduction,grand_total,payment_method,received_amount,created_at,settled_at) VALUES('gst','GST-1','t1','GST',100,18,10,3,5,2,98,'CASH',98,'2026-10-27T09:00:00.000Z','2026-10-27T09:00:00.000Z'),('bos','BOS-1','t1','BILL_OF_SUPPLY',200,0,0,0,0,0,200,'CASH',200,'2026-10-27T10:00:00.000Z','2026-10-27T10:00:00.000Z'),('copy','GST-2','t1','GST',200,36,0,0,0,0,236,'CASH',0,'2026-10-27T10:00:00.000Z','2026-10-27T10:00:00.000Z'); UPDATE invoices SET converted_from_invoice_id='bos' WHERE invoice_id='copy'; UPDATE invoices SET converted_to_invoice_id='copy' WHERE invoice_id='bos'");
      const args = { activeTenantId: 't1', onlyUserInvoices: false, accounting_view: 'ALL', payment_method: 'CASH', dateRange: { startUtc: '2026-10-27T00:00:00.000Z', endUtc: '2026-10-27T23:59:59.999Z' } };
      const history = getInvoicesSummaryStatement(db, args);
      const totals = history.statement.get(...history.params) as { totalSales: number; totalSalesBeforeDeductions: number; totalTax: number; totalInvoices: number };
      const cash = sumCashSalesInWindow(db).get('t1', args.dateRange.startUtc, args.dateRange.endUtc, args.dateRange.endUtc) as { total_cash_sales: number };
      const closing = buildShopClosingSummaryData(db, 't1', '2026-10-27', { status: 'OPEN', opening_balance: 0 });
      const realInvoices = memory.prepare("SELECT * FROM invoices WHERE converted_from_invoice_id IS NULL").all();
      expect(totals.totalSales).toBe(298);
      expect(totals.totalInvoices).toBe(2);
      expect(totals.totalTax).toBe(18);
      expect(totals.totalSales).toBe(realInvoices.reduce((sum, row) => sum + getInvoiceNetTotal(row), 0));
      expect(totals.totalSalesBeforeDeductions).toBe(realInvoices.reduce((sum, row) => sum + getInvoicePreDeductionTotal(row), 0));
      expect(closing.netSales).toBe(totals.totalSales);
      expect(closing.totalTax).toBe(totals.totalTax);
      expect(closing.grossSales - closing.totalDiscount).toBe(totals.totalSales);
      expect(cash.total_cash_sales).toBe(totals.totalSales);
    } finally { memory.close(); }
  });
});
