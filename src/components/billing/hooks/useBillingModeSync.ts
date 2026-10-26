import { useRef, useEffect } from 'react';
import { useCartStore } from '../../../store/cartStore';
import type { CartItem } from '../../../store/cartStore';
import type { Tab } from '../../../store/tabStore';
import type { FeatureFlags } from '../../../config/featureFlags';

export interface UseBillingModeSyncContext {
  activeTab: Tab | undefined;
  activeTabId: string;
  clearReturnDeduction: () => void;
  clearScrapDeduction: () => void;
  editingInvoiceNumber: string | null;
  enableScrap: boolean;
  featureFlags: FeatureFlags | null;
  getActiveTab: () => Tab | undefined;
  isCashSettlementEnabled: boolean;
  isQuotationMode: boolean;
  isReturnMode: boolean;
  isScrapMode: boolean;
  items: CartItem[];
  removeItem: (productId: string) => void;
  reserveInvoiceNumberForTab: (forceRefresh?: boolean) => Promise<void>;
  reserveReturnNumberForTab: (forceRefresh?: boolean) => Promise<void>;
  setIsScrapMode: (isScrapMode: boolean) => void;
  setQuotationMode: (isQuotationMode: boolean) => void;
  setReturnMode: (isReturnMode: boolean) => void;
  /** Only ever reset here. */
  setSelectedReturnInvoice: (value: null) => void;
  syncActiveSnapshot: () => void;
  updateActiveTab: (updates: Partial<Omit<Tab, "id" | "snapshot">>) => void;
}

/** Mode / tab sync: clean cart items when scrap or return mode toggles, keep feature-flagged modes off, and retitle the
 * tab with the reserved number of the current mode. Effects in their original order. */
export function useBillingModeSync(ctx: UseBillingModeSyncContext) {
  const { activeTab, activeTabId, clearReturnDeduction, clearScrapDeduction, editingInvoiceNumber, enableScrap, featureFlags, getActiveTab, isCashSettlementEnabled, isQuotationMode, isReturnMode, isScrapMode, items, removeItem, reserveInvoiceNumberForTab, reserveReturnNumberForTab, setIsScrapMode, setQuotationMode, setReturnMode, setSelectedReturnInvoice, syncActiveSnapshot, updateActiveTab } = ctx;
  const lastActiveTabId = useRef(activeTabId);

  const prevScrapMode = useRef(isScrapMode);

  const prevReturnMode = useRef(isReturnMode);

  // Clean up incompatible items when scrap mode changes
  useEffect(() => {
    if (lastActiveTabId.current !== activeTabId) {
      prevScrapMode.current = isScrapMode;
      return;
    }
    if (prevScrapMode.current && !isScrapMode) {
      items.filter(i => i.isScrap).forEach(i => removeItem(i.product_id));
    } else if (!prevScrapMode.current && isScrapMode) {
      items.filter(i => !i.isScrap).forEach(i => removeItem(i.product_id));
      clearScrapDeduction();
    }
    prevScrapMode.current = isScrapMode;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- items, removeItem, and clearScrapDeduction excluded: tracking cart edits would repeat the mode-transition cleanup.
  }, [isScrapMode, activeTabId]);

  // Clean up return items when return mode toggles
  useEffect(() => {
    if (lastActiveTabId.current !== activeTabId) {
      prevReturnMode.current = isReturnMode;
      return;
    }
    if (prevReturnMode.current && !isReturnMode) {
      useCartStore.setState(s => ({
        items: s.items.filter(i => !i.isReturnItem)
      }));
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
      setSelectedReturnInvoice(null);
      reserveInvoiceNumberForTab();
      syncActiveSnapshot();
    } else if (!prevReturnMode.current && isReturnMode) {
      useCartStore.setState(s => ({
        items: s.items.filter(i => i.isReturnItem)
      }));
      clearReturnDeduction();
      reserveReturnNumberForTab();
      syncActiveSnapshot();
    }
    prevReturnMode.current = isReturnMode;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- clearReturnDeduction, reserveInvoiceNumberForTab, reserveReturnNumberForTab, syncActiveSnapshot, and updateActiveTab excluded: tracking these callbacks would repeat invoice cleanup or number reservations.
  }, [isReturnMode, activeTabId, setSelectedReturnInvoice]);

  useEffect(() => {
    if (!enableScrap && isScrapMode) {
      setIsScrapMode(false);
    }
  }, [enableScrap, isScrapMode, setIsScrapMode]);

  useEffect(() => {
    if (!featureFlags) return;
    if (featureFlags.quotations === false && isQuotationMode) setQuotationMode(false);
    if (featureFlags.returns === false && isReturnMode) setReturnMode(false);
    if (featureFlags.cash_settlement === false && activeTab?.paymentMethod === 'PENDING') {
      updateActiveTab({ paymentMethod: 'CASH' });
    }
  }, [featureFlags, isQuotationMode, isReturnMode, activeTab?.paymentMethod, setQuotationMode, setReturnMode, updateActiveTab]);

  useEffect(() => {
    if (!isCashSettlementEnabled && activeTab?.paymentMethod === 'PENDING') {
      updateActiveTab({ paymentMethod: 'CASH' });
    }
  }, [isCashSettlementEnabled, activeTab?.paymentMethod, updateActiveTab]);

  // Update tab title when mode changes (normal, scrap, quotation, return)
  const prevReserveMode = useRef<'normal' | 'scrap' | 'return' | 'quotation' | null>(null);

  useEffect(() => {
    syncActiveSnapshot();
    if (lastActiveTabId.current !== activeTabId) {
      prevReserveMode.current = isScrapMode ? 'scrap' : isReturnMode ? 'return' : isQuotationMode ? 'quotation' : 'normal';
      return;
    }
    const currentMode = isScrapMode ? 'scrap' : isReturnMode ? 'return' : isQuotationMode ? 'quotation' : 'normal';
    if (prevReserveMode.current !== currentMode && !editingInvoiceNumber) {
      prevReserveMode.current = currentMode;
      const tab = getActiveTab();
      if (tab) {
        let targetNum = tab.reservedInvoiceNumber;
        if (isScrapMode) targetNum = tab.reservedScrapInvoiceNumber;
        else if (isQuotationMode) targetNum = tab.reservedQuotationNumber;
        else if (isReturnMode) targetNum = tab.reservedReturnNumber;

        const shouldUpdate = !tab.title || tab.title === 'New' || tab.title === 'New Quote' || tab.title === tab.reservedInvoiceNumber || tab.title === tab.reservedScrapInvoiceNumber || tab.title === tab.reservedQuotationNumber || tab.title === tab.reservedReturnNumber || tab.title.startsWith('Bill ') || tab.title.startsWith('GST-');
        if (targetNum && shouldUpdate) {
          updateActiveTab({ title: targetNum });
        }
      }
    }
  }, [isScrapMode, isReturnMode, isQuotationMode, activeTabId, getActiveTab, updateActiveTab, editingInvoiceNumber, syncActiveSnapshot]);

  useEffect(() => {
    lastActiveTabId.current = activeTabId;
  }, [activeTabId]);

}
