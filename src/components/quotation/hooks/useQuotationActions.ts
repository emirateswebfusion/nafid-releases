import { parseUTCDate } from '../../../utils/time/utc';
import { useCartStore } from '../../../store/cartStore';
import { useTabStore, type TabSnapshot, saveStoredTabs } from '../../../store/tabStore';
import { isDesktopRuntime } from '../../../data/client';
import { quotationsApi } from '../../../data/quotations';
import type { Quotation, QuotationItem } from '../quotationTypes';
import type { QuotationState } from './useQuotationState';

export interface UseQuotationActionsContext {
  loadQuotations: () => Promise<void>;
  onClose: () => void;
  qm: QuotationState;
}

/** Quotation actions: create a new quotation tab, view one, and edit / delete / convert with confirmation. */
export function useQuotationActions(ctx: UseQuotationActionsContext) {
  const { loadQuotations, onClose } = ctx;
  const {
    quotationGstEnabledSetting, setConfirmDialog, setPreviewGstEnabled, setQuotationItems, setQuotations,
    setSelectedQuotation, setShowDetail, setStatusMessage, shopState, showDetail,
  } = ctx.qm;

  const handleCreateNewQuotation = () => {
    useCartStore.getState().setRole('BILLER');
    useCartStore.getState().clearCart();
    useCartStore.getState().setReturnMode(false);
    useCartStore.getState().setIsScrapMode(false);
    useCartStore.getState().setEditingQuotation(null, null);
    useCartStore.getState().setEditingInvoice(null, null, null);
    useCartStore.getState().setQuotationMode(true);
    localStorage.setItem('pendingNewQuotation', 'true');

    const quotationSnapshot: TabSnapshot = {
      items: [],
      invoiceType: quotationGstEnabledSetting ? 'GST' : 'BILL_OF_SUPPLY',
      discountType: 'FIXED',
      discountValue: 0,
      customerState: shopState || 'KL',
      scrapDeduction: 0,
      scrapInvoiceNumber: '',
      returnDeduction: 0,
      returnInvoiceNumber: '',
      isQuotationMode: true,
      isReturnMode: false,
      isScrapMode: false,
      returnRefundMethod: 'ADJUST_BILL',
      editingQuotationId: null,
      editingQuotationNumber: null,
      editingInvoiceId: null,
      editingInvoiceNumber: null,
      editingInvoiceRole: null,
      pendingScrapInvoiceToEdit: null,
    };

    const tabStore = useTabStore.getState();
    const existingTabs = tabStore.tabs;
    const currentActiveTabId = tabStore.activeTabId;
    const activeTab = existingTabs.find(t => t.id === currentActiveTabId);

    if (activeTab && (!activeTab.snapshot?.items || activeTab.snapshot.items.length === 0) && !activeTab.snapshot?.editingInvoiceNumber) {
      const updated = existingTabs.map(t => t.id === currentActiveTabId ? {
        ...t,
        title: 'New Quote',
        customerName: '',
        customerPhone: '',
        customerGstin: '',
        customerAddress: '',
        receivedAmount: 0,
        reservedInvoiceNumber: '',
        reservedQuotationNumber: '',
        snapshot: quotationSnapshot,
      } : t);
      useTabStore.setState({ tabs: updated });
      saveStoredTabs(updated, currentActiveTabId);
    } else {
      tabStore.addTab(quotationSnapshot, 'New Quote');
    }

    window.dispatchEvent(new CustomEvent('open-new-quotation'));
    onClose();
  };

  const viewQuotation = async (q: Quotation) => {
    setSelectedQuotation(q);

    let itemsToSet: QuotationItem[] = [];
    if (isDesktopRuntime()) {
      const its = await quotationsApi.getQuotationItems(q.quotation_id);
      if (Array.isArray(its) && its.length > 0) {
        itemsToSet = its;
      } else if (Array.isArray((q as Quotation & { items: QuotationItem[] }).items) && (q as Quotation & { items: QuotationItem[] }).items.length > 0) {
        itemsToSet = (q as Quotation & { items: QuotationItem[] }).items;
      }
    } else if (Array.isArray((q as Quotation & { items: QuotationItem[] }).items)) {
      itemsToSet = (q as Quotation & { items: QuotationItem[] }).items;
    }
    if (itemsToSet.length > 1) {
      const timestamps = itemsToSet.map((i: QuotationItem) => i.created_at ? parseUTCDate(i.created_at).getTime() : 0).filter(Boolean);
      const uniqueTs = Array.from(new Set(timestamps));
      if (uniqueTs.length > 1) {
        const latestTs = Math.max(...uniqueTs);
        itemsToSet = itemsToSet.filter((i: QuotationItem) => (i.created_at ? parseUTCDate(i.created_at).getTime() : 0) === latestTs);
      }
    }
    setQuotationItems(itemsToSet);

    // Determine GST mode:
    // 1. If shop setting "Enable GST in Quotations" is enabled, quotation should display GST boxes!
    // 2. Or if explicitly marked as GST (q.is_gst === 1) or has tax total > 0
    // 3. Or if any item in the quotation has HSN code or GST applicable
    const hasGstInItems = itemsToSet.some(i => Boolean(i.hsn_code || (i as QuotationItem).hsn_sac_code || Number(i.tax_rate_percent) > 0 || i.is_gst_applicable));
    const isGstDoc = quotationGstEnabledSetting || q.is_gst === 1 || Number(q.tax_total) > 0 || hasGstInItems;
    setPreviewGstEnabled(Boolean(isGstDoc));

    setShowDetail(true);
  };

  const handleEditQuotation = (q: Quotation) => {
    setConfirmDialog({
      isOpen: true,
      title: `Edit ${q.quotation_number}`,
      message: `Are you sure you want to edit ${q.quotation_number}? This will open all quotation items in billing mode.`,
      confirmText: 'Edit Quotation',
      variant: 'blue',
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        if (isDesktopRuntime()) {
          const its = await quotationsApi.getQuotationItems(q.quotation_id);
          if (Array.isArray(its)) {
            localStorage.setItem('editQuotationData', JSON.stringify({ quotation: q, items: its }));
            window.dispatchEvent(new CustomEvent('open-quotation-edit'));
            onClose();
          }
        }
      },
    });
  };

  const handleDeleteQuotation = (q: Quotation) => {
    setConfirmDialog({
      isOpen: true,
      title: `Delete ${q.quotation_number}`,
      message: `Are you sure you want to delete ${q.quotation_number}? This action cannot be undone.`,
      confirmText: 'Delete Quotation',
      variant: 'red',
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        if (isDesktopRuntime()) {
          const res = await quotationsApi.deleteQuotation(q.quotation_id);
          if (res.success) {
            setStatusMessage({ text: `Quotation ${q.quotation_number} deleted`, type: 'success' });
            setQuotations(prev => {
              const updated = prev.filter(item => item.quotation_id !== q.quotation_id);
              localStorage.setItem('nafid_quotations_cache', JSON.stringify(updated));
              return updated;
            });
            await loadQuotations();
            if (showDetail) setShowDetail(false);
          } else {
            setStatusMessage({ text: res.error || 'Delete failed', type: 'error' });
          }
        }
        setTimeout(() => setStatusMessage(null), 3000);
      },
    });
  };

  const handleConvertToInvoice = (q: Quotation) => {
    setConfirmDialog({
      isOpen: true,
      title: `Convert ${q.quotation_number}`,
      message: `Convert ${q.quotation_number} to invoice? This will load items directly into POS checkout.`,
      confirmText: 'Convert to Invoice',
      variant: 'emerald',
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        if (isDesktopRuntime()) {
          const its = await quotationsApi.getQuotationItems(q.quotation_id);
          if (Array.isArray(its)) {
            localStorage.setItem('editQuotationData', JSON.stringify({ quotation: q, items: its, convertToInvoice: true }));
            window.dispatchEvent(new CustomEvent('open-quotation-edit'));
            onClose();
          }
        }
      },
    });
  };

  return { handleCreateNewQuotation, viewQuotation, handleEditQuotation, handleDeleteQuotation, handleConvertToInvoice };
}
