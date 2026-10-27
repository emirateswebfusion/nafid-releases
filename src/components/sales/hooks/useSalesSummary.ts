import { useMemo, useState } from 'react';
import type { InvoiceSummary } from '../../../data/invoices';
import { getInvoicePreDeductionTotal } from '../../../utils/pricing/salesHistoryAmount';
import type { InvoiceProductTotals } from '../../../utils/pricing/salesHistoryTax';
import { getInvoiceRevenueForFilter } from '../salesHistoryFormat';
import type { SalesInvoiceRow } from '../salesTypes';

interface SummaryContext {
  invoices: SalesInvoiceRow[];
  accountingView: 'REAL_SALES' | 'TAX_FILING' | 'ALL';
  paymentFilter: string;
  loading: boolean;
  taxFilterActive: boolean;
  taxProductLoading: boolean;
  taxProductTotals: InvoiceProductTotals | null;
}

/** Full-filter totals load independently; opening a bill does not recalculate the fallback. */
export function useSalesSummary(ctx: SummaryContext) {
  const [dbSummary, setDbSummary] = useState<InvoiceSummary | null>(null);
  const [summaryPending, setSummaryPending] = useState(false);
  const { invoices, accountingView, paymentFilter, loading, taxFilterActive, taxProductLoading, taxProductTotals } = ctx;
  const baseSummary = useMemo(() => {
    const live = invoices.filter(i => accountingView === 'TAX_FILING'
      ? i.invoice_type === 'GST'
      : accountingView === 'REAL_SALES' ? i.invoice_type === 'BILL_OF_SUPPLY' : !i.converted_from_invoice_id);
    const fallback = {
      totalSales: live.reduce((sum, inv) => sum + getInvoiceRevenueForFilter(inv, paymentFilter), 0),
      totalSalesBeforeDeductions: live.reduce((sum, inv) => sum + getInvoicePreDeductionTotal(inv), 0),
      totalInvoices: live.length,
      totalTax: live.reduce((sum, inv) => sum + (Number(inv.tax_total) || 0), 0),
      totalDiscount: live.reduce((sum, inv) => sum + (Number(inv.discount_total) || 0), 0),
      avgOrder: 0,
    };
    fallback.avgOrder = fallback.totalInvoices > 0 ? fallback.totalSales / fallback.totalInvoices : 0;
    return dbSummary
      ? { ...dbSummary, totalSalesBeforeDeductions: dbSummary.totalSalesBeforeDeductions ?? fallback.totalSalesBeforeDeductions }
      : fallback;
  }, [invoices, accountingView, paymentFilter, dbSummary]);

  const summary = taxFilterActive ? {
    totalSales: taxProductTotals?.netRevenue ?? 0,
    totalSalesBeforeDeductions: taxProductTotals?.totalSales ?? 0,
    totalInvoices: taxProductTotals?.invoiceCount ?? 0,
    totalTax: taxProductTotals?.totalTax ?? 0,
    totalDiscount: taxProductTotals?.totalDiscount ?? 0,
    avgOrder: taxProductTotals && taxProductTotals.invoiceCount > 0
      ? taxProductTotals.netRevenue / taxProductTotals.invoiceCount : 0,
  } : baseSummary;
  return {
    summary, summaryLoading: loading || (taxFilterActive ? taxProductLoading : summaryPending),
    setDbSummary, setSummaryPending,
  };
}
