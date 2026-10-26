import React, { useEffect, useRef } from 'react';
import { useBillingUIStore } from '../../../store/billingUIStore';
import { useTabStore, type TabSnapshot, saveStoredTabs } from '../../../store/tabStore';
import { useCartStore } from '../../../store/cartStore';
import type { Tab } from '../../../store/tabStore';

export interface UseBillingEntryContext {
  addTab: (initialSnapshot?: TabSnapshot, title?: string) => string;
  isCashSettlementEnabled: boolean;
  isQuotationMode: boolean;
  quotationGstEnabledSetting: boolean;
  reserveQuotationNumberForTab: (forceRefresh?: boolean) => Promise<void>;
  searchRef: React.RefObject<HTMLInputElement | null>;
  syncActiveSnapshot: () => void;
  tabCounterRef: React.RefObject<number>;
  updateActiveTab: (updates: Partial<Omit<Tab, "id" | "snapshot">>) => void;
}

/**
 * Runs once when the billing screen opens: decides from the navigation source (and pending quotation / edit requests)
 * whether to keep the open tabs and cart, adapt or add a quotation tab, or reset; on unmount it saves the active cart
 * snapshot to the tab store.
 */
export function useBillingEntry(ctx: UseBillingEntryContext) {
  const { addTab, isCashSettlementEnabled, isQuotationMode, quotationGstEnabledSetting, reserveQuotationNumberForTab, searchRef, syncActiveSnapshot, tabCounterRef, updateActiveTab } = ctx;
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const currentUiConfig = useBillingUIStore.getState().config;
    const navSource = sessionStorage.getItem('last_pos_nav_source') || 'page_exit';
    
    // Evaluate exact toggle based on navigation source
    const preserveCart = navSource === 'header_button'
      ? (currentUiConfig.preserveCartOnHeaderNavigation !== false)
      : (currentUiConfig.preserveCartOnPageExit !== false);

    sessionStorage.removeItem('last_pos_nav_source');

    const isPendingNewQuotation = localStorage.getItem('pendingNewQuotation') === 'true';
    if (isPendingNewQuotation) {
      localStorage.removeItem('pendingNewQuotation');
    }
    const editQ = localStorage.getItem('editQuotationData');
    const isQActive = isPendingNewQuotation || isQuotationMode || Boolean(editQ);

    const existingTabs = useTabStore.getState().tabs;
    const currentActiveTabId = useTabStore.getState().activeTabId;

    if (isPendingNewQuotation) {
      // Dedicated robust Quotation Mode initialization
      useCartStore.getState().clearCart();
      useCartStore.getState().setReturnMode(false);
      useCartStore.getState().setIsScrapMode(false);
      useCartStore.getState().setEditingQuotation(null, null);
      useCartStore.getState().setEditingInvoice(null, null, null);
      useCartStore.getState().setQuotationMode(true);

      const quotationSnapshot: TabSnapshot = {
        items: [],
        invoiceType: quotationGstEnabledSetting ? 'GST' : 'BILL_OF_SUPPLY',
        discountType: 'FIXED',
        discountValue: 0,
        customerState: 'KL',
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

      const activeTab = existingTabs.find(t => t.id === currentActiveTabId);
      // If current active tab is clean (no items and not editing), adapt it to New Quote
      if (activeTab && (!activeTab.snapshot?.items || activeTab.snapshot.items.length === 0) && !activeTab.snapshot?.editingInvoiceNumber) {
        updateActiveTab({
          title: 'New Quote',
          customerName: '',
          customerPhone: '',
          customerGstin: '',
          customerAddress: '',
          paymentMethod: isCashSettlementEnabled ? 'PENDING' : 'CASH',
          receivedAmount: 0,
          reservedInvoiceNumber: '',
          reservedQuotationNumber: '',
        });
        const { tabs: currentTabs, activeTabId: curTabId } = useTabStore.getState();
        const updatedTabs = currentTabs.map(t => t.id === curTabId ? {
          ...t,
          title: 'New Quote',
          reservedInvoiceNumber: '',
          reservedQuotationNumber: '',
          snapshot: quotationSnapshot,
        } : t);
        useTabStore.setState({ tabs: updatedTabs });
        saveStoredTabs(updatedTabs, curTabId);
        useCartStore.setState({
          items: [],
          isQuotationMode: true,
          isReturnMode: false,
          isScrapMode: false,
          editingQuotationId: null,
          editingQuotationNumber: null,
          editingInvoiceId: null,
          editingInvoiceNumber: null,
        });
        syncActiveSnapshot();
        reserveQuotationNumberForTab(true);
      } else {
        // Otherwise append a new dedicated tab for Quotation mode
        addTab(quotationSnapshot, 'New Quote');
        reserveQuotationNumberForTab(true);
      }
      setTimeout(() => {
        window.focus();
        if (searchRef.current) {
          searchRef.current.focus();
          searchRef.current.select();
        }
      }, 100);
    } else if (preserveCart && existingTabs.length > 0 && !isQActive) {
      // PRESERVE CART & TABS
      let activeTab = existingTabs.find(t => t.id === currentActiveTabId);
      if (!activeTab) {
        activeTab = existingTabs[0];
        useTabStore.setState({ activeTabId: activeTab.id });
      }
      if (activeTab.snapshot) {
        const isRet = Boolean(activeTab.snapshot.isReturnMode);
        const rawItems = activeTab.snapshot.items || [];
        const hasReturnItems = rawItems.some((i) => i.isReturnItem);
        const sanitizedItems = isRet
          ? rawItems.filter((i) => i.isReturnItem)
          : rawItems.filter((i) => !i.isReturnItem);

        if (!isRet && (hasReturnItems || activeTab.reservedReturnNumber)) {
          updateActiveTab({
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

        useCartStore.setState({
          items: sanitizedItems,
          invoiceType: activeTab.snapshot.invoiceType || 'BILL_OF_SUPPLY',
          discountType: activeTab.snapshot.discountType || 'FIXED',
          discountValue: activeTab.snapshot.discountValue || 0,
          customerState: activeTab.snapshot.customerState || 'KL',
          scrapDeduction: activeTab.snapshot.scrapDeduction || 0,
          scrapInvoiceNumber: activeTab.snapshot.scrapInvoiceNumber || '',
          returnDeduction: activeTab.snapshot.returnDeduction || 0,
          returnInvoiceNumber: activeTab.snapshot.returnInvoiceNumber || '',
          isQuotationMode: activeTab.snapshot.isQuotationMode || false,
          isReturnMode: activeTab.snapshot.isReturnMode || false,
          isScrapMode: activeTab.snapshot.isScrapMode || false,
          returnRefundMethod: activeTab.snapshot.returnRefundMethod || 'ADJUST_BILL',
          editingQuotationId: activeTab.snapshot.editingQuotationId || null,
          editingQuotationNumber: activeTab.snapshot.editingQuotationNumber || null,
          editingInvoiceId: activeTab.snapshot.editingInvoiceId || null,
          editingInvoiceNumber: activeTab.snapshot.editingInvoiceNumber || null,
          editingInvoiceRole: activeTab.snapshot.editingInvoiceRole || null,
          pendingScrapInvoiceToEdit: activeTab.snapshot.pendingScrapInvoiceToEdit || null,
        });
      }
      tabCounterRef.current = Math.max(1, existingTabs.length);
    } else {
      // LEGACY RESET or NEW EXPLICIT QUOTATION
      useTabStore.setState({ tabs: [], activeTabId: '' });

      tabCounterRef.current++;
      if (isQActive) {
        useCartStore.getState().setQuotationMode(true);
        const snapshot: TabSnapshot = {
          items: [],
          invoiceType: 'BILL_OF_SUPPLY',
          discountType: 'FIXED',
          discountValue: 0,
          customerState: 'KL',
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
        addTab(snapshot, `New Quote`);
        reserveQuotationNumberForTab(true);
      } else {
        addTab(undefined, `Bill ${tabCounterRef.current}`);
      }
      useCartStore.getState().setEditingInvoice(null, null, null);
    }

    return () => {
      // Unmount cleanup: sync active cart snapshot to tabStore when navigating away from BillingPage
      const cfg = useBillingUIStore.getState().config;
      const src = sessionStorage.getItem('last_pos_nav_source') || 'page_exit';
      const shouldSync = src === 'header_button'
        ? (cfg.preserveCartOnHeaderNavigation !== false)
        : (cfg.preserveCartOnPageExit !== false);

      if (shouldSync) {
        useTabStore.getState().syncActiveSnapshot();
      }
    };
  }, []);

  const initialized = useRef(false);

}
