import { isDesktopRuntime } from '../../data/client';
import { invoicesApi } from '../../data/invoices';
import { quotationsApi } from '../../data/quotations';
import { returnsApi } from '../../data/returns';
import { scrapApi } from '../../data/scrap';
import type { InvoiceType } from '../../store/cartStore';
import { useTabStore, type Tab } from '../../store/tabStore';
import { getNextOffsetInvoiceNumber } from '../../utils/invoiceNumberHelper';

/**
 * Number previews for billing tabs. Each tab shows the next invoice / scrap / quotation / return number; it is
 * *peeked* (not consumed) from the database and offset past numbers other open tabs already show, so two tabs
 * never preview the same number. Checkout assigns the real number when the bill is saved.
 *
 * The title rules differ per document type on purpose or by history; they are kept exactly as they were.
 */

type UpdateActiveTab = (updates: Partial<Omit<Tab, 'id' | 'snapshot'>>) => void;

interface TabAccess {
  getActiveTab: () => Tab | undefined;
  updateActiveTab: UpdateActiveTab;
}

/** Numbers for a new tab: next invoice, scrap, quotation and return numbers, past those other tabs hold. */
export async function peekNewTabNumbers({ tenantId, enableThreeInvoiceSeries }: { tenantId: string | null; enableThreeInvoiceSeries: boolean }) {
  let billNumber = '';
  let scrapNumber = '';
  let quotationNumber = '';
  let returnNumber = '';
  const allTabs = useTabStore.getState().tabs;
  if (isDesktopRuntime()) {
    const series = enableThreeInvoiceSeries ? 'normal' : undefined;
    try {
      const r = await invoicesApi.peekNextInvoiceNumber({ tenant_id: tenantId || 'global', series });
      if (r?.success && r.invoiceNumber) {
        const reserved = allTabs.map(t => t.reservedInvoiceNumber);
        billNumber = getNextOffsetInvoiceNumber(r.invoiceNumber, reserved);
      }
    } catch { }
    try {
      const r = await scrapApi.peekNextScrapInvoiceNumber({ tenant_id: 'global' });
      if (r?.success && r.invoiceNumber) {
        const reserved = allTabs.map(t => t.reservedScrapInvoiceNumber);
        scrapNumber = getNextOffsetInvoiceNumber(r.invoiceNumber, reserved);
      }
    } catch { }
    try {
      const r = await quotationsApi.peekNextQuotationNumber({ tenant_id: 'global' });
      if (r?.success && r.quotationNumber) {
        const reserved = allTabs.map(t => t.reservedQuotationNumber);
        quotationNumber = getNextOffsetInvoiceNumber(r.quotationNumber, reserved);
      }
    } catch { }
    try {
      const r = await returnsApi.peekNextReturnNumber({ tenant_id: tenantId || 'global' });
      if (r?.success && r.returnNumber) {
        const reserved = allTabs.map(t => t.reservedReturnNumber);
        returnNumber = getNextOffsetInvoiceNumber(r.returnNumber, reserved);
      }
    } catch { }
  }
  return { billNumber, scrapNumber, quotationNumber, returnNumber };
}

export interface InvoiceNumberContext extends TabAccess {
  tenantId: string | null;
  enableThreeInvoiceSeries: boolean;
  invoiceType: InvoiceType;
  customerGstin: string;
  isScrapMode: boolean;
  isQuotationMode: boolean;
  isReturnMode: boolean;
  editingActive: string | null;
}

/** Next sales invoice number for the active tab (series by invoice type and B2B). Skipped in other modes and while editing. */
export async function reserveInvoiceNumber({ tenantId, getActiveTab, updateActiveTab, enableThreeInvoiceSeries, invoiceType, customerGstin, isScrapMode, isQuotationMode, isReturnMode, editingActive }: InvoiceNumberContext, forceRefresh = false) {
  if (!isDesktopRuntime()) return;
  const tab = getActiveTab();
  if (!tab) return;
  if (isScrapMode || isQuotationMode || isReturnMode || tab.snapshot?.isQuotationMode) return;
  if (editingActive) return;

  try {
    const tabIsB2B = (invoiceType === 'GST') && (Boolean(customerGstin?.trim()) || Boolean(tab?.isB2B));
    const series = enableThreeInvoiceSeries ? (invoiceType === 'GST' ? (tabIsB2B ? 'gst_b2b' : 'gst_b2c') : 'normal') : (invoiceType === 'GST' ? 'gst' : undefined);
    const result = await invoicesApi.peekNextInvoiceNumber({ tenant_id: tenantId || 'global', series });
    if (result.success && result.invoiceNumber) {
      const allTabs = useTabStore.getState().tabs;
      const otherTabsReserved = allTabs.filter(t => t.id !== tab.id).map(t => t.reservedInvoiceNumber);
      const nextNum = getNextOffsetInvoiceNumber(result.invoiceNumber, otherTabsReserved);
      const oldReserved = tab.reservedInvoiceNumber;
      if (forceRefresh || !oldReserved || oldReserved !== nextNum) {
        const shouldUpdateTitle = !tab.title || tab.title === 'New' || tab.title === oldReserved || tab.title.startsWith('Bill ') || tab.title.startsWith('GST-');
        updateActiveTab({
          reservedInvoiceNumber: nextNum,
          title: shouldUpdateTitle ? nextNum : tab.title
        });
      }
    }
  } catch (e) {
    console.error('Failed to peek invoice number', e);
  }
}

/** Re-peek the invoice number after switching Bill of Supply / GST; always retitles the tab. */
export async function refreshInvoiceNumberForType(
  { tenantId, getActiveTab, updateActiveTab, enableThreeInvoiceSeries, customerGstin }: TabAccess & { tenantId: string | null; enableThreeInvoiceSeries: boolean; customerGstin: string },
  type: 'GST' | 'BILL_OF_SUPPLY',
) {
  try {
    const tab = getActiveTab();
    const tabIsB2B = (type === 'GST') && (Boolean(customerGstin?.trim()) || Boolean(tab?.isB2B));
    const series = enableThreeInvoiceSeries ? (type === 'GST' ? (tabIsB2B ? 'gst_b2b' : 'gst_b2c') : 'normal') : (type === 'GST' ? 'gst' : undefined);
    const result = await invoicesApi.peekNextInvoiceNumber({ tenant_id: tenantId || 'global', series });
    if (result.success && result.invoiceNumber) {
      const allTabs = useTabStore.getState().tabs;
      const otherTabsReserved = allTabs.filter(t => t?.id !== tab?.id).map(t => t.reservedInvoiceNumber);
      const nextNum = getNextOffsetInvoiceNumber(result.invoiceNumber, otherTabsReserved);
      updateActiveTab({ 
        reservedInvoiceNumber: nextNum,
        title: nextNum
      });
    }
  } catch (e) {
    console.error('Failed to peek next invoice number on type change', e);
  }
}

/** Next scrap invoice number for the active tab. Skipped while editing. */
export async function reserveScrapInvoiceNumber({ getActiveTab, updateActiveTab, editingActive }: TabAccess & { editingActive: string | null }, forceRefresh = false) {
  if (!isDesktopRuntime()) return;
  const tab = getActiveTab();
  if (!tab) return;
  if (editingActive) return;

  try {
    const result = await scrapApi.peekNextScrapInvoiceNumber({ tenant_id: 'global' });
    if (result.success && result.invoiceNumber) {
      const allTabs = useTabStore.getState().tabs;
      const otherTabsReserved = allTabs.filter(t => t.id !== tab.id).map(t => t.reservedScrapInvoiceNumber);
      const nextNum = getNextOffsetInvoiceNumber(result.invoiceNumber, otherTabsReserved);
      const oldReserved = tab.reservedScrapInvoiceNumber;
      if (forceRefresh || !oldReserved || oldReserved !== nextNum) {
        const shouldUpdateTitle = !tab.title || tab.title === 'New' || tab.title === oldReserved || tab.title.startsWith('Bill ');
        updateActiveTab({
          reservedScrapInvoiceNumber: nextNum,
          title: shouldUpdateTitle ? nextNum : tab.title
        });
      }
    }
  } catch (e) {
    console.error('Failed to reserve scrap invoice number', e);
  }
}

/** Next quotation number for the active tab (clears the invoice number). Skipped while editing a quotation. */
export async function reserveQuotationNumber({ getActiveTab, updateActiveTab, editingQuotationId }: TabAccess & { editingQuotationId: string | null }, forceRefresh = false) {
  if (!isDesktopRuntime()) return;
  const tab = getActiveTab();
  if (!tab) return;
  if (editingQuotationId) return;

  try {
    const result = await quotationsApi.peekNextQuotationNumber({ tenant_id: 'global' });
    if (result.success && result.quotationNumber) {
      const allTabs = useTabStore.getState().tabs;
      const otherTabsReserved = allTabs.filter(t => t.id !== tab.id).map(t => t.reservedQuotationNumber);
      const nextNum = getNextOffsetInvoiceNumber(result.quotationNumber, otherTabsReserved);
      const oldReserved = tab.reservedQuotationNumber;
      if (forceRefresh || !oldReserved || oldReserved !== nextNum) {
        const shouldUpdateTitle = !tab.title || tab.title === 'New' || tab.title === 'New Quote' || tab.title === oldReserved || tab.title.startsWith('Bill ') || (tab.reservedInvoiceNumber && tab.title === tab.reservedInvoiceNumber);
        updateActiveTab({
          reservedQuotationNumber: nextNum,
          reservedInvoiceNumber: '',
          title: shouldUpdateTitle ? nextNum : tab.title
        });
      }
    }
  } catch (e) {
    console.error('Failed to reserve quotation number', e);
  }
}

/** Next return number for the active tab. */
export async function reserveReturnNumber({ tenantId, getActiveTab, updateActiveTab }: TabAccess & { tenantId: string | null }, forceRefresh = false) {
  if (!isDesktopRuntime()) return;
  const tab = getActiveTab();
  if (!tab) return;

  try {
    const result = await returnsApi.peekNextReturnNumber({ tenant_id: tenantId || 'global' });
    if (result.success && result.returnNumber) {
      const allTabs = useTabStore.getState().tabs;
      const otherTabsReserved = allTabs.filter(t => t.id !== tab.id).map(t => t.reservedReturnNumber);
      const nextNum = getNextOffsetInvoiceNumber(result.returnNumber, otherTabsReserved);
      const oldReserved = tab.reservedReturnNumber;
      if (forceRefresh || !oldReserved || oldReserved !== nextNum) {
        const shouldUpdateTitle = !tab.title || tab.title === 'New' || tab.title === oldReserved || tab.title.startsWith('Bill ');
        updateActiveTab({
          reservedReturnNumber: nextNum,
          title: shouldUpdateTitle ? nextNum : tab.title
        });
      }
    }
  } catch (e) {
    console.error('Failed to reserve return number', e);
  }
}

/**
 * GST B2C/B2B switch in three-series mode: next number of that series, past numbers other tabs show; always
 * retitles the tab. (Before 2026-10-23 these callers used the raw peek, so two GST tabs could preview the same number.)
 */
export async function reserveGstSeriesNumber(
  { tenantId, getActiveTab, updateActiveTab }: TabAccess & { tenantId: string | null },
  series: 'gst_b2c' | 'gst_b2b',
) {
  const result = await invoicesApi.peekNextInvoiceNumber({ tenant_id: tenantId || 'global', series });
  if (result.success && result.invoiceNumber) {
    const tab = getActiveTab();
    const otherTabsReserved = useTabStore.getState().tabs.filter(t => t.id !== tab?.id).map(t => t.reservedInvoiceNumber);
    const nextNum = getNextOffsetInvoiceNumber(result.invoiceNumber, otherTabsReserved);
    updateActiveTab({ reservedInvoiceNumber: nextNum, title: nextNum });
  }
}
