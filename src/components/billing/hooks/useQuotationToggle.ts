import { useEffect, useRef } from 'react';
import type { InvoiceType } from '../../../store/cartStore';

export interface QuotationToggleContext {
  activeTabId: string | null;
  invoiceType: InvoiceType;
  isQuotationMode: boolean;
  isScrapMode: boolean;
  isReturnMode: boolean;
  isPastBillMode: boolean;
  quotationGstEnabledSetting: boolean;
  setQuotationMode: (on: boolean) => void;
  setIsScrapMode: (on: boolean) => void;
  setReturnMode: (on: boolean) => void;
  setIsPastBillMode: (on: boolean) => void;
  setInvoiceType: (type: InvoiceType) => void;
  reserveQuotationNumberForTab: () => void;
}

/**
 * Quotation mode on/off for the header button and F6. Entering leaves scrap/return/past-bill mode, switches to GST when
 * the quotation GST setting is on, and previews a quotation number. Leaving restores the invoice type that was active
 * before entering (it used to stay on GST, so the next sale was billed as GST). Switching tabs forgets it.
 */
export function useQuotationToggle({
  activeTabId, invoiceType, isQuotationMode, isScrapMode, isReturnMode, isPastBillMode, quotationGstEnabledSetting,
  setQuotationMode, setIsScrapMode, setReturnMode, setIsPastBillMode, setInvoiceType, reserveQuotationNumberForTab,
}: QuotationToggleContext) {
  const invoiceTypeBeforeQuotationRef = useRef<InvoiceType | null>(null);
  useEffect(() => { invoiceTypeBeforeQuotationRef.current = null; }, [activeTabId]);

  return () => {
    const next = !isQuotationMode;
    setQuotationMode(next);
    if (next && isScrapMode) setIsScrapMode(false);
    if (next && isReturnMode) setReturnMode(false);
    if (next && isPastBillMode) setIsPastBillMode(false);
    if (next) {
      invoiceTypeBeforeQuotationRef.current = invoiceType;
      if (quotationGstEnabledSetting) setInvoiceType('GST');
      reserveQuotationNumberForTab();
    } else if (invoiceTypeBeforeQuotationRef.current) {
      setInvoiceType(invoiceTypeBeforeQuotationRef.current);
      invoiceTypeBeforeQuotationRef.current = null;
    }
  };
}
