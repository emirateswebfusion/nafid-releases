import { useEffect } from 'react';
import { useTabStore } from '../../../store/tabStore';
import { useCartStore } from '../../../store/cartStore';
import type { Tab } from '../../../store/tabStore';

export interface UseScrapInvoiceEditEventsContext {
  loadScrapInvoiceForEdit: (invNum: string) => Promise<void>;
  updateActiveTab: (updates: Partial<Omit<Tab, "id" | "snapshot">>) => void;
}

/** Scrap invoice editing: unmount cleanup and the edit-scrap-invoice window event. */
export function useScrapInvoiceEditEvents(ctx: UseScrapInvoiceEditEventsContext) {
  const { loadScrapInvoiceForEdit, updateActiveTab } = ctx;
  // Closing the billing page — clear modes persisted in the global cart store
  // (Return/Quotation) so the next open starts fresh, without a one-frame flash
  // of the previously active mode. Scrap & Past-Bill are local state and already
  // reset on remount. External flows (SalesHistory return, scrap edit) re-enable
  // their mode via events fired after remount.
  useEffect(() => {
    return () => {
      const currentActiveTab = useTabStore.getState().getActiveTab();
      if (currentActiveTab?.snapshot?.isQuotationMode) {
        return;
      }
      if (localStorage.getItem('pendingNewQuotation') === 'true' || localStorage.getItem('editQuotationData') || localStorage.getItem('editBillData')) {
        return;
      }
      const wasReturn = useCartStore.getState().isReturnMode || Boolean(currentActiveTab?.snapshot?.isReturnMode);
      if (wasReturn) {
        useTabStore.getState().updateActiveTab({
          customerName: '',
          customerPhone: '',
          customerGstin: '',
          customerAddress: '',
          customerId: '',
          receivedAmount: 0,
          actualRefundPaid: 0,
          reservedReturnNumber: '',
        });
      }
      useCartStore.getState().setReturnMode(false);
      useCartStore.getState().setQuotationMode(false);
    };
  }, []);

  useEffect(() => {
    const handleEditScrapInvoiceEvent = (e: any) => {
      const invNum = e.detail?.invoiceNumber;
      if (invNum) {
        useCartStore.getState().setIsScrapMode(true);
        updateActiveTab({ title: invNum, reservedScrapInvoiceNumber: invNum });
        loadScrapInvoiceForEdit(invNum);
      }
    };

    window.addEventListener('edit-scrap-invoice' as any, handleEditScrapInvoiceEvent as EventListener);
    return () => {
      window.removeEventListener('edit-scrap-invoice' as any, handleEditScrapInvoiceEvent as EventListener);
    };
  }, [loadScrapInvoiceForEdit, updateActiveTab]);

}
