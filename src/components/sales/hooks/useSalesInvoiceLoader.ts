import type React from 'react';
import { hasBridge, isDesktopRuntime } from '../../../data/client';
import { listInvoices, getInvoiceItems, invoicesApi } from '../../../data/invoices';
import { buildTaxFilteredProductRows, sortInvoicesByInvoiceNumber } from '../../../utils/salesHistoryTax';
import { useAuthStore } from '../../../store/authStore';
import { isStaffRole, shouldApplyStaffMasking, getStaffSalesDateScope } from '../../../utils/staffDataMasking';
import type { StaffDataMaskingConfig } from '../../../utils/staffDataMasking';
import type { InvoiceProductRow, InvoiceProductTotals } from '../../../utils/salesHistoryTax';
import type { SalesInvoiceRow } from '../salesTypes';

export interface UseSalesInvoiceLoaderContext {
  accountingView: "REAL_SALES" | "TAX_FILING" | "ALL";
  debouncedSearch: string;
  filterDate: string;
  filterDateEnd: string;
  invoiceTypeFilter: string;
  isFetching: boolean;
  LIMIT: 30;
  maskingConfig: StaffDataMaskingConfig;
  offset: number;
  paymentFilter: string;
  prefetchInvoiceRef: React.RefObject<(id: string) => void>;
  setDbSummary: React.Dispatch<React.SetStateAction<{ totalSales: number; totalSalesBeforeDeductions?: number; totalInvoices: number; totalTax: number; totalDiscount: number; avgOrder: number; } | null>>;
  setHasMore: React.Dispatch<React.SetStateAction<boolean>>;
  setInvoices: React.Dispatch<React.SetStateAction<SalesInvoiceRow[]>>;
  setIsFetching: React.Dispatch<React.SetStateAction<boolean>>;
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setOffset: React.Dispatch<React.SetStateAction<number>>;
  setTaxProductLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setTaxProductRows: React.Dispatch<React.SetStateAction<InvoiceProductRow[]>>;
  setTaxProductTotals: React.Dispatch<React.SetStateAction<InvoiceProductTotals | null>>;
  taxFilterActive: boolean;
  taxPercentageFilter: string;
  taxProductRequestRef: React.RefObject<number>;
}

/**
 * Loads the Sales History list for the current filters, page by page (`loadInvoices(reset)`), and, when a tax rate
 * filter is set, the matching product rows and totals (`loadTaxProductRows`).
 */
export function useSalesInvoiceLoader(ctx: UseSalesInvoiceLoaderContext) {
  const { accountingView, debouncedSearch, filterDate, filterDateEnd, invoiceTypeFilter, isFetching, LIMIT, maskingConfig, offset, paymentFilter, prefetchInvoiceRef, setDbSummary, setHasMore, setInvoices, setIsFetching, setLoading, setOffset, setTaxProductLoading, setTaxProductRows, setTaxProductTotals, taxFilterActive, taxPercentageFilter, taxProductRequestRef } = ctx;
  const loadTaxProductRows = async (filters: any, targetRate: string) => {
    if (!hasBridge('dbGetInvoices') || !hasBridge('dbGetInvoiceItems')) return;
    const requestId = ++taxProductRequestRef.current;
    setTaxProductLoading(true);
    try {
      const data = await listInvoices({ ...filters, limit: 100000, offset: 0 });
      if (!Array.isArray(data)) {
        if (requestId === taxProductRequestRef.current) {
          setTaxProductRows([]);
          setTaxProductTotals(null);
        }
        return;
      }

      const scopedData = filters?.accounting_view === 'TAX_FILING'
        ? data
        : filters?.accounting_view === 'REAL_SALES'
          ? data.filter((inv: any) => inv.invoice_type === 'BILL_OF_SUPPLY')
          : data.filter((inv: any) => !inv.converted_from_invoice_id);

      const itemsByInvoice: Record<string, any[]> = {};
      await Promise.all(scopedData.map(async (inv: any) => {
        try {
          const invoiceItems = await getInvoiceItems(inv.invoice_id);
          itemsByInvoice[inv.invoice_id] = Array.isArray(invoiceItems) ? invoiceItems : [];
        } catch {
          itemsByInvoice[inv.invoice_id] = [];
        }
      }));

      if (requestId !== taxProductRequestRef.current) return;
      const result = buildTaxFilteredProductRows(
        sortInvoicesByInvoiceNumber(scopedData),
        itemsByInvoice,
        Number(targetRate)
      );
      setTaxProductRows(result.rows);
      setTaxProductTotals(result.totals);
    } catch (err) {
      console.error('[SalesHistory] Failed to load GST product rows:', err);
      if (requestId === taxProductRequestRef.current) {
        setTaxProductRows([]);
        setTaxProductTotals(null);
      }
    } finally {
      if (requestId === taxProductRequestRef.current) setTaxProductLoading(false);
    }
  };

  const loadInvoices = async (reset = false) => {
    if (!reset && isFetching) return;
    setIsFetching(true);
    if (isDesktopRuntime()) {
      const { userId, role, tenantId, restrictedPage } = useAuthStore.getState();
      const currentOffset = reset ? 0 : offset;
      
      const isBiller = role === 'BILLER';
      const permissions = restrictedPage ? restrictedPage.split(',').filter(Boolean) : [];
      const hasGstInvoicesOnly = isBiller && permissions.includes('OPT_VIEW_GST_INVOICES_ONLY');
      const effectiveInvoiceType = hasGstInvoicesOnly
        ? (invoiceTypeFilter && invoiceTypeFilter !== 'BILL_OF_SUPPLY' ? invoiceTypeFilter : 'GST')
        : accountingView === 'REAL_SALES'
          ? 'BILL_OF_SUPPLY'
          : (invoiceTypeFilter || undefined);

      const isStaffUser = isStaffRole(role);
      const shouldMaskStaff = shouldApplyStaffMasking(role, maskingConfig);
      let effectiveFilterDate = filterDate || undefined;
      let effectiveFilterDateEnd = filterDateEnd || undefined;
      if (shouldMaskStaff && maskingConfig.sales_history_scope !== 'ALL') {
        const staffScope = getStaffSalesDateScope(maskingConfig, isStaffUser);
        if (staffScope.startDate) effectiveFilterDate = staffScope.startDate;
        if (staffScope.endDate) effectiveFilterDateEnd = staffScope.endDate;
      }

      try {
        const filters = {
          user_id: userId, tenant_id: tenantId, role,
          search: debouncedSearch || undefined, payment_method: paymentFilter || undefined,
          invoice_type: effectiveInvoiceType,
          tax_rate_percent: accountingView === 'REAL_SALES' ? undefined : (taxPercentageFilter || undefined),
          filterDate: effectiveFilterDate, filterDateEnd: effectiveFilterDateEnd,
          accounting_view: accountingView,
        };

        const promises: Promise<any>[] = [
          listInvoices({ ...filters, limit: LIMIT, offset: currentOffset })
        ];
        if (reset && hasBridge('dbGetInvoicesSummary')) {
          promises.push(invoicesApi.getInvoicesSummary(filters));
        }

        const [data, summaryRes] = await Promise.all(promises);

        if (reset && summaryRes && typeof summaryRes === 'object' && !('error' in summaryRes)) {
          setDbSummary(summaryRes);
        }

        if (reset) {
          if (taxFilterActive) {
            void loadTaxProductRows(filters, taxPercentageFilter);
          } else {
            taxProductRequestRef.current++;
            setTaxProductRows([]);
            setTaxProductTotals(null);
            setTaxProductLoading(false);
          }
        }

        if (Array.isArray(data)) {
          if (reset) {
            setInvoices(data);
            // Pre-warm top 5 most recent bills quietly so clicking any recent bill is 100% instant
            if (data.length > 0) {
              setTimeout(() => {
                data.slice(0, 5).forEach((item: any) => {
                  if (item?.invoice_id) prefetchInvoiceRef.current(item.invoice_id);
                });
              }, 200);
            }
          }
          else {
            setInvoices(prev => {
              const existingIds = new Set(prev.map(i => i.invoice_id));
              const newItems = data.filter(i => !existingIds.has(i.invoice_id));
              return [...prev, ...newItems];
            });
          }
          setOffset(currentOffset + data.length);
          setHasMore(data.length === LIMIT);
        } else if (data && typeof data === 'object' && 'error' in data) {
          console.error('[SalesHistory] dbGetInvoices returned an error object:', data);
        } else {
          console.warn('[SalesHistory] Unexpected response from dbGetInvoices:', data);
        }
      } catch (err: any) {
        console.error('[SalesHistory] Exception while calling dbGetInvoices:', err);
      } finally {
        setLoading(false);
        setIsFetching(false);
      }
    } else {
      console.warn('[SalesHistory] isDesktopRuntime() is missing - unable to query local database.');
      setLoading(false);
      setIsFetching(false);
    }
  };

  return { loadInvoices };
}
