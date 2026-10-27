import { useRef, useEffect } from 'react';
import { reserveGstSeriesNumber } from '../numberReservation';
import { useTabStore } from '../../../store/tabStore';
import { isDesktopRuntime } from '../../../data/client';
import { invoicesApi } from '../../../data/invoices';
import { scrapApi } from '../../../data/scrap';
import { quotationsApi } from '../../../data/quotations';
import { returnsApi } from '../../../data/returns';
import { getNextOffsetInvoiceNumber } from '../../../utils/pricing/invoiceNumberHelper';
import type { InvoiceType } from '../../../store/cartStore';
import type { Tab } from '../../../store/tabStore';

export interface UseTabNumberRefreshContext {
  activeTabId: string;
  customerGstin: string;
  enableThreeInvoiceSeries: boolean;
  getActiveTab: () => Tab | undefined;
  invoiceType: InvoiceType;
  isB2B: boolean;
  isQuotationMode: boolean;
  isReturnMode: boolean;
  isScrapMode: boolean;
  reserveInvoiceNumberForTab: (forceRefresh?: boolean) => Promise<void>;
  reserveQuotationNumberForTab: (forceRefresh?: boolean) => Promise<void>;
  reserveReturnNumberForTab: (forceRefresh?: boolean) => Promise<void>;
  reserveScrapInvoiceNumberForTab: (forceRefresh?: boolean) => Promise<void>;
  tenantId: string | null;
  updateActiveTab: (updates: Partial<Omit<Tab, "id" | "snapshot">>) => void;
}

/**
 * Keeps each tab's reserved document number current: re-peek on a B2C <-> B2B switch (three-series mode), reserve a
 * number when the active tab has none for its mode, and re-peek every tab after a bill is created elsewhere.
 */
export function useTabNumberRefresh(ctx: UseTabNumberRefreshContext) {
  const { activeTabId, customerGstin, enableThreeInvoiceSeries, getActiveTab, invoiceType, isB2B, isQuotationMode, isReturnMode, isScrapMode, reserveInvoiceNumberForTab, reserveQuotationNumberForTab, reserveReturnNumberForTab, reserveScrapInvoiceNumberForTab, tenantId, updateActiveTab } = ctx;
  // Re-peek invoice number when customer GSTIN / B2B mode changes (B2C ↔ B2B switch)
  const prevIsB2B = useRef(false);

  useEffect(() => {
    if (!enableThreeInvoiceSeries || invoiceType !== 'GST') return;
    if (prevIsB2B.current !== isB2B) {
      prevIsB2B.current = isB2B;
      const series = isB2B ? 'gst_b2b' : 'gst_b2c';
      reserveGstSeriesNumber({ tenantId, getActiveTab, updateActiveTab }, series);
    }
  }, [isB2B, enableThreeInvoiceSeries, invoiceType, tenantId, getActiveTab, updateActiveTab]);

  // Reserve invoice/scrap/quotation/return number when tab becomes active without a reservation
  useEffect(() => {
    if (isScrapMode) {
      reserveScrapInvoiceNumberForTab();
    } else if (isQuotationMode) {
      reserveQuotationNumberForTab();
    } else if (isReturnMode) {
      reserveReturnNumberForTab();
    } else {
      reserveInvoiceNumberForTab();
    }
  }, [activeTabId, reserveInvoiceNumberForTab, reserveScrapInvoiceNumberForTab, reserveQuotationNumberForTab, reserveReturnNumberForTab, isScrapMode, isQuotationMode, isReturnMode]);

  // Whenever checkout/billing completes, invalidate stale reserved numbers across tabs and re-peek
  useEffect(() => {
    const handleInvoiceCreated = async () => {
      const { tabs } = useTabStore.getState();
      let updatedTabs = [...tabs];

      let baseNormal = '';
      let baseScrap = '';
      let baseQuotation = '';
      let baseReturn = '';

      if (isDesktopRuntime()) {
        try {
          const series = enableThreeInvoiceSeries ? (invoiceType === 'GST' ? (customerGstin?.trim() ? 'gst_b2b' : 'gst_b2c') : 'normal') : undefined;
          const r = await invoicesApi.peekNextInvoiceNumber({ tenant_id: tenantId || 'global', series });
          if (r?.success && r.invoiceNumber) baseNormal = r.invoiceNumber;
        } catch { /* ignore */ }

        try {
          const r = await scrapApi.peekNextScrapInvoiceNumber({ tenant_id: 'global' });
          if (r?.success && r.invoiceNumber) baseScrap = r.invoiceNumber;
        } catch { /* ignore */ }

        try {
          const r = await quotationsApi.peekNextQuotationNumber({ tenant_id: 'global' });
          if (r?.success && r.quotationNumber) baseQuotation = r.quotationNumber;
        } catch { /* ignore */ }

        try {
          const r = await returnsApi.peekNextReturnNumber({ tenant_id: tenantId || 'global' });
          if (r?.success && r.returnNumber) baseReturn = r.returnNumber;
        } catch { /* ignore */ }
      }

      const reservedNormalList: string[] = [];
      const reservedScrapList: string[] = [];
      const reservedQuotationList: string[] = [];
      const reservedReturnList: string[] = [];

      updatedTabs = updatedTabs.map(t => {
        if (t.snapshot.editingInvoiceId || t.snapshot.editingQuotationId) return t;

        const nextNormal = baseNormal ? getNextOffsetInvoiceNumber(baseNormal, reservedNormalList) : '';
        if (nextNormal) reservedNormalList.push(nextNormal);

        const nextScrap = baseScrap ? getNextOffsetInvoiceNumber(baseScrap, reservedScrapList) : '';
        if (nextScrap) reservedScrapList.push(nextScrap);

        const nextQuotation = baseQuotation ? getNextOffsetInvoiceNumber(baseQuotation, reservedQuotationList) : '';
        if (nextQuotation) reservedQuotationList.push(nextQuotation);

        const nextReturn = baseReturn ? getNextOffsetInvoiceNumber(baseReturn, reservedReturnList) : '';
        if (nextReturn) reservedReturnList.push(nextReturn);

        const isScrap = t.snapshot.isScrapMode;
        const isQuotation = t.snapshot.isQuotationMode;
        const isReturn = t.snapshot.isReturnMode;
        const activeNum = isReturn ? nextReturn : isScrap ? nextScrap : isQuotation ? nextQuotation : nextNormal;

        const oldTitle = t.title;
        const shouldUpdateTitle = !oldTitle || oldTitle === 'New' || oldTitle === t.reservedInvoiceNumber || oldTitle === t.reservedScrapInvoiceNumber || oldTitle === t.reservedQuotationNumber || oldTitle === t.reservedReturnNumber || oldTitle.startsWith('Bill ') || oldTitle.startsWith('GST-');

        return {
          ...t,
          reservedInvoiceNumber: nextNormal,
          reservedScrapInvoiceNumber: nextScrap,
          reservedQuotationNumber: nextQuotation,
          reservedReturnNumber: nextReturn,
          title: shouldUpdateTitle && activeNum ? activeNum : t.title,
        };
      });

      useTabStore.setState({ tabs: updatedTabs });
    };

    window.addEventListener('checkout:completed', handleInvoiceCreated);
    window.addEventListener('invoice:created', handleInvoiceCreated);
    return () => {
      window.removeEventListener('checkout:completed', handleInvoiceCreated);
      window.removeEventListener('invoice:created', handleInvoiceCreated);
    };
  }, [tenantId, enableThreeInvoiceSeries, invoiceType, customerGstin]);

}
