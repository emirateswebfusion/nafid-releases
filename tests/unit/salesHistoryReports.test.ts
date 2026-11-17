import { describe, expect, it } from 'vitest';
import { salesHistoryDb } from './fixtures/salesHistoryDb';
import { getInvoicesSummaryStatement } from '../../electron/db/statements/invoices';
import { sumCashSalesInWindow } from '../../electron/db/statements/cashDrawer';
import { buildShopClosingSummaryData } from '../../electron/whatsapp/shopClosingSummary';
import { getInvoiceNetTotal, getInvoicePreDeductionTotal } from '../../src/utils/pricing/salesHistoryAmount';
import { getInvoiceRevenueForFilter, groupByDay } from '../../src/components/sales/salesHistoryFormat';
import { calculatePaymentBreakdown } from '../../src/services/offlineAi/format';
import type { Invoice } from '../../src/data/invoices';

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
      expect(closing.grossSales - closing.totalDiscount).toBe(totals.totalSalesBeforeDeductions);
      expect(cash.total_cash_sales).toBe(totals.totalSales);
    } finally { memory.close(); }
  });

  it('reports split payments under each payment mode using only that mode collected portion, not the full bill total', () => {
    const { db, memory } = salesHistoryDb();
    try {
      // Split bill: grand_total 1000, paid via Cash 400 + UPI 600
      memory.exec("INSERT INTO invoices(invoice_id,invoice_number,tenant_id,invoice_type,subtotal,tax_total,discount_total,grand_total,payment_method,split_details,received_amount,created_at,settled_at) VALUES('split1','INV-SPLIT','t1','BILL_OF_SUPPLY',1000,0,0,1000,'SPLIT','{\"cash\":400,\"upi\":600}',1000,'2026-10-27T11:00:00.000Z','2026-10-27T11:00:00.000Z')");

      // 1. Database summary query with CASH filter
      const cashArgs = { activeTenantId: 't1', onlyUserInvoices: false, accounting_view: 'ALL', payment_method: 'CASH', dateRange: { startUtc: '2026-10-27T00:00:00.000Z', endUtc: '2026-10-27T23:59:59.999Z' } };
      const cashSummary = getInvoicesSummaryStatement(db, cashArgs);
      const cashTotals = cashSummary.statement.get(...cashSummary.params) as { totalSales: number; totalSalesBeforeDeductions: number };
      expect(cashTotals.totalSales).toBe(400);
      expect(cashTotals.totalSalesBeforeDeductions).toBe(400);

      // 2. Database summary query with UPI filter
      const upiArgs = { activeTenantId: 't1', onlyUserInvoices: false, accounting_view: 'ALL', payment_method: 'UPI', dateRange: { startUtc: '2026-10-27T00:00:00.000Z', endUtc: '2026-10-27T23:59:59.999Z' } };
      const upiSummary = getInvoicesSummaryStatement(db, upiArgs);
      const upiTotals = upiSummary.statement.get(...upiSummary.params) as { totalSales: number; totalSalesBeforeDeductions: number };
      expect(upiTotals.totalSales).toBe(600);
      expect(upiTotals.totalSalesBeforeDeductions).toBe(600);

      // 3. getInvoiceRevenueForFilter & groupByDay
      const invRow = memory.prepare("SELECT * FROM invoices WHERE invoice_id='split1'").get() as Invoice;
      expect(getInvoiceRevenueForFilter(invRow, 'CASH')).toBe(400);
      expect(getInvoiceRevenueForFilter(invRow, 'UPI')).toBe(600);
      expect(getInvoiceRevenueForFilter(invRow, 'CARD')).toBe(0);

      const dailyCash = groupByDay([invRow], 'CASH');
      expect(dailyCash[0].sales).toBe(400);
      const dailyUpi = groupByDay([invRow], 'UPI');
      expect(dailyUpi[0].sales).toBe(600);

      // 4. Shop closing report breakdown
      const closing = buildShopClosingSummaryData(db, 't1', '2026-10-27', { status: 'OPEN', opening_balance: 0 });
      expect(closing.paymentBreakdown.cash).toBe(400);
      expect(closing.paymentBreakdown.upi).toBe(600);
      expect(closing.paymentBreakdown.card).toBe(0);

      // 5. Offline AI payment breakdown
      const aiBreakdown = calculatePaymentBreakdown([invRow]);
      expect(aiBreakdown.cash).toBe(400);
      expect(aiBreakdown.upi).toBe(600);
      expect(aiBreakdown.card).toBe(0);
      expect(aiBreakdown.totalSales).toBe(1000);
    } finally { memory.close(); }
  });
});
