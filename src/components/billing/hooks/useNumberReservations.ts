import { useCallback } from 'react';
import { reserveInvoiceNumber, refreshInvoiceNumberForType, reserveScrapInvoiceNumber, reserveQuotationNumber, reserveReturnNumber } from '../numberReservation';
import type { Tab } from '../../../store/tabStore';
import type { InvoiceType } from '../../../store/cartStore';

export interface UseNumberReservationsContext {
  customerGstin: string;
  editingActive: string | null;
  editingQuotationId: string | null;
  enableThreeInvoiceSeries: boolean;
  getActiveTab: () => Tab | undefined;
  invoiceType: InvoiceType;
  isB2B: boolean;
  isQuotationMode: boolean;
  isReturnMode: boolean;
  isScrapMode: boolean;
  setInvoiceType: (type: InvoiceType) => void;
  syncActiveSnapshot: () => void;
  tenantId: string | null;
  updateActiveTab: (updates: Partial<Omit<Tab, "id" | "snapshot">>) => void;
}

/** Reserves the next invoice / scrap / quotation / return number for the active tab, and switches GST vs bill-of-supply numbering. */
export function useNumberReservations(ctx: UseNumberReservationsContext) {
  const { customerGstin, editingActive, editingQuotationId, enableThreeInvoiceSeries, getActiveTab, invoiceType, isB2B, isQuotationMode, isReturnMode, isScrapMode, setInvoiceType, syncActiveSnapshot, tenantId, updateActiveTab } = ctx;
    const reserveInvoiceNumberForTab = useCallback(async (forceRefresh = false) => {
    await reserveInvoiceNumber({ tenantId, getActiveTab, updateActiveTab, enableThreeInvoiceSeries, invoiceType, customerGstin, isScrapMode, isQuotationMode, isReturnMode, editingActive }, forceRefresh);
  }, [tenantId, getActiveTab, updateActiveTab, enableThreeInvoiceSeries, invoiceType, customerGstin, isB2B, isScrapMode, isQuotationMode, isReturnMode, editingActive]);

  const handleInvoiceTypeChange = async (type: 'GST' | 'BILL_OF_SUPPLY') => {
    setInvoiceType(type);
    setTimeout(() => {
      syncActiveSnapshot();
    }, 0);

    await refreshInvoiceNumberForType({ tenantId, getActiveTab, updateActiveTab, enableThreeInvoiceSeries, customerGstin }, type);
  };

  const reserveScrapInvoiceNumberForTab = useCallback(async (forceRefresh = false) => {
    await reserveScrapInvoiceNumber({ getActiveTab, updateActiveTab, editingActive }, forceRefresh);
  }, [getActiveTab, updateActiveTab, editingActive]);

  const reserveQuotationNumberForTab = useCallback(async (forceRefresh = false) => {
    await reserveQuotationNumber({ getActiveTab, updateActiveTab, editingQuotationId }, forceRefresh);
  }, [getActiveTab, updateActiveTab, editingQuotationId]);

  const reserveReturnNumberForTab = useCallback(async (forceRefresh = false) => {
    await reserveReturnNumber({ tenantId, getActiveTab, updateActiveTab }, forceRefresh);
  }, [tenantId, getActiveTab, updateActiveTab]);

  return { reserveInvoiceNumberForTab, handleInvoiceTypeChange, reserveScrapInvoiceNumberForTab, reserveQuotationNumberForTab, reserveReturnNumberForTab };
}
