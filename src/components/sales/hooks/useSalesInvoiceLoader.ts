import type { InvoiceItem, InvoiceFilters, InvoiceSummary } from '../../../data/invoices';
import type React from 'react';
import { useEffect, useRef } from 'react';
import { hasBridge, isDesktopRuntime } from '../../../data/client';
import { listInvoices, getInvoiceItems, invoicesApi } from '../../../data/invoices';
import { buildTaxFilteredProductRows, sortInvoicesByInvoiceNumber } from '../../../utils/pricing/salesHistoryTax';
import { useAuthStore } from '../../../store/authStore';
import { isStaffRole, shouldApplyStaffMasking, getStaffSalesDateScope } from '../../../utils/security/staffDataMasking';
import type { StaffDataMaskingConfig } from '../../../utils/security/staffDataMasking';
import type { InvoiceProductRow, InvoiceProductTotals } from '../../../utils/pricing/salesHistoryTax';
import type { SalesInvoiceRow } from '../salesTypes';
import { isLegacyBillerRole } from '../../../utils/security/permissions';

export interface UseSalesInvoiceLoaderContext {
  accountingView: "REAL_SALES" | "TAX_FILING" | "ALL";
  debouncedSearch: string;
  filterDate: string;
  filterDateEnd: string;
  invoiceTypeFilter: string;
  LIMIT: 30;
  maskingConfig: StaffDataMaskingConfig;
  offset: number;
  paymentFilter: string;
  enableConvertToGst: boolean;
  setConvertibleMap: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  setSummaryPending: React.Dispatch<React.SetStateAction<boolean>>;
  setDbSummary: React.Dispatch<React.SetStateAction<InvoiceSummary | null>>;
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
  const { accountingView, debouncedSearch, filterDate, filterDateEnd, invoiceTypeFilter, LIMIT, maskingConfig, offset, paymentFilter, enableConvertToGst, setConvertibleMap, setSummaryPending, setDbSummary, setHasMore, setInvoices, setIsFetching, setLoading, setOffset, setTaxProductLoading, setTaxProductRows, setTaxProductTotals, taxFilterActive, taxPercentageFilter, taxProductRequestRef } = ctx;
  const generation = useRef(0);
  const pageInFlight = useRef(false);
  useEffect(() => () => { generation.current++; }, []);

  const loadTaxProductRows = async (filters: InvoiceFilters, targetRate: string) => {
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
          ? data.filter((inv) => inv.invoice_type === 'BILL_OF_SUPPLY')
          : data.filter((inv) => !inv.converted_from_invoice_id);

      const itemsByInvoice: Record<string, InvoiceItem[]> = {};
      await Promise.all(scopedData.map(async (inv) => {
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
    if (!reset && pageInFlight.current) return;
    if (reset) {
      generation.current++;
      setDbSummary(null);
      setSummaryPending(hasBridge('dbGetInvoicesSummary'));
      setConvertibleMap({});
      taxProductRequestRef.current++;
    }
    const requestId = generation.current;
    pageInFlight.current = true;
    setIsFetching(true);
    if (isDesktopRuntime()) {
      const { userId, role, tenantId, restrictedPage } = useAuthStore.getState();
      const currentOffset = reset ? 0 : offset;
      
      const isBiller = isLegacyBillerRole(role);
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
          user_id: userId as string | undefined, tenant_id: tenantId as string | undefined, role: role as string | undefined,
          search: debouncedSearch || undefined, payment_method: paymentFilter || undefined,
          invoice_type: effectiveInvoiceType,
          tax_rate_percent: accountingView === 'REAL_SALES' ? undefined : (taxPercentageFilter || undefined),
          filterDate: effectiveFilterDate, filterDateEnd: effectiveFilterDateEnd,
          accounting_view: accountingView,
        };

        const data = await listInvoices({ ...filters, limit: LIMIT, offset: currentOffset });
        if (requestId !== generation.current) return;

        // Rows become usable before aggregate or conversion work runs in the main process.
        if (reset && hasBridge('dbGetInvoicesSummary')) {
          void invoicesApi.getInvoicesSummary(filters).then(summary => {
            if (requestId === generation.current && summary && !('error' in summary)) setDbSummary(summary);
          }).catch(err => {
            console.error('[SalesHistory] Failed to load totals:', err);
          }).finally(() => {
            if (requestId === generation.current) setSummaryPending(false);
          });
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
          }
          else {
            setInvoices(prev => {
              const existingIds = new Set(prev.map(i => i.invoice_id));
              const newItems = data.filter(i => !existingIds.has(i.invoice_id));
              return [...prev, ...newItems];
            });
          }
          const ids = data.filter(inv => inv.invoice_type === 'BILL_OF_SUPPLY' && !inv.converted_to_invoice_id).map(inv => inv.invoice_id);
          if (enableConvertToGst && ids.length && hasBridge('dbGetBosConvertibleInvoices')) {
            void invoicesApi.getBosConvertibleInvoices(tenantId || 'global', ids).then(rows => {
              if (requestId !== generation.current || !Array.isArray(rows)) return;
              setConvertibleMap(previous => ({ ...previous, ...Object.fromEntries(rows.map(row => [row.invoice_id, Boolean(row.convertible)])) }));
            }).catch(err => console.error('[SalesHistory] Failed to check conversion eligibility:', err));
          }
          setOffset(currentOffset + data.length);
          setHasMore(data.length === LIMIT);
        } else if (data && typeof data === 'object' && 'error' in data) {
          console.error('[SalesHistory] dbGetInvoices returned an error object:', data);
        } else {
          console.warn('[SalesHistory] Unexpected response from dbGetInvoices:', data);
        }
      } catch (err) {
        console.error('[SalesHistory] Exception while calling dbGetInvoices:', err);
        if (requestId === generation.current) setSummaryPending(false);
      } finally {
        if (requestId === generation.current) {
          pageInFlight.current = false;
          setLoading(false);
          setIsFetching(false);
        }
      }
    } else {
      console.warn('[SalesHistory] isDesktopRuntime() is missing - unable to query local database.');
      pageInFlight.current = false;
      setSummaryPending(false);
      setLoading(false);
      setIsFetching(false);
    }
  };

  return { loadInvoices };
}
