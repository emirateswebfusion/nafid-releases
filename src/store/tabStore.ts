import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type { CartItem, InvoiceType } from './cartStore';
import { useCartStore } from './cartStore';
import { getFeatureFlags } from '../featureFlags';

export type PaymentMethod = 'PENDING' | 'CASH' | 'CARD' | 'UPI' | 'CREDIT' | 'SPLIT';

export interface SplitDetails {
  cash: number;
  card: number;
  upi: number;
  credit?: number;
  bank_transfer?: number;
}

export interface TabSnapshot {
  items: CartItem[];
  invoiceType: InvoiceType;
  discountType: 'FIXED' | 'PERCENTAGE';
  discountValue: number;
  customerState: string;
  scrapDeduction: number;
  scrapInvoiceNumber: string;
  returnDeduction: number;
  returnInvoiceNumber: string;
  isQuotationMode: boolean;
  isReturnMode: boolean;
  isScrapMode: boolean;
  returnRefundMethod: 'CASH' | 'UPI' | 'CARD' | 'BANK_TRANSFER' | 'STORE_CREDIT' | 'ADJUST_BILL';
  editingQuotationId: string | null;
  editingQuotationNumber: string | null;
  editingInvoiceId: string | null;
  editingInvoiceNumber: string | null;
  editingInvoiceRole: 'SUPER_ADMIN' | 'ADMIN' | 'STAFF' | null;
  pendingScrapInvoiceToEdit: string | null;
}

export interface Tab {
  id: string;
  title: string;
  snapshot: TabSnapshot;
  customerName: string;
  customerPhone: string;
  customerGstin: string;
  customerAddress: string;
  transporterName?: string;
  vehicleNumber?: string;
  transporterDocNo?: string;
  transporterDocDate?: string;
  ewayBillNo?: string;
  ewayBillDate?: string;
  shippingName?: string;
  shippingAddress?: string;
  shippingGstin?: string;
  paymentMethod: PaymentMethod;
  splitDetails?: SplitDetails;
  receivedAmount: number;
  reservedInvoiceNumber: string;
  reservedScrapInvoiceNumber: string;
  reservedQuotationNumber: string;
  reservedReturnNumber: string;
  scrapPaymentStatus: 'CASH' | 'PENDING' | 'CREDIT' | 'SETTLED';
  selectedUpiId?: string;
  selectedUpiSourceId?: string;
  selectedUpiName?: string;
}

interface TabState {
  tabs: Tab[];
  activeTabId: string;
  addTab: (initialSnapshot?: TabSnapshot, title?: string) => string;
  closeTab: (id: string) => void;
  switchTab: (id: string) => void;
  renameTab: (id: string, title: string) => void;
  updateActiveTab: (updates: Partial<Omit<Tab, 'id' | 'snapshot'>>) => void;
  updateTabById: (id: string, updates: Partial<Omit<Tab, 'id' | 'snapshot'>>) => void;
  syncActiveSnapshot: () => void;
  getActiveTab: () => Tab | undefined;
}

function getSnapshotFromCartStore(cartState: any): TabSnapshot {
  return {
    items: cartState.items,
    invoiceType: cartState.invoiceType,
    discountType: cartState.discountType,
    discountValue: cartState.discountValue,
    customerState: cartState.customerState,
    scrapDeduction: cartState.scrapDeduction,
    scrapInvoiceNumber: cartState.scrapInvoiceNumber,
    returnDeduction: cartState.returnDeduction,
    returnInvoiceNumber: cartState.returnInvoiceNumber,
    isQuotationMode: cartState.isQuotationMode,
    isReturnMode: cartState.isReturnMode,
    isScrapMode: cartState.isScrapMode,
    returnRefundMethod: cartState.returnRefundMethod,
    editingQuotationId: cartState.editingQuotationId,
    editingQuotationNumber: cartState.editingQuotationNumber,
    editingInvoiceId: cartState.editingInvoiceId,
    editingInvoiceNumber: cartState.editingInvoiceNumber,
    editingInvoiceRole: cartState.editingInvoiceRole,
    pendingScrapInvoiceToEdit: cartState.pendingScrapInvoiceToEdit,
  };
}

function applySnapshotToCartStore(snapshot: TabSnapshot) {
  useCartStore.setState({
    items: snapshot.items,
    invoiceType: snapshot.invoiceType,
    discountType: snapshot.discountType,
    discountValue: snapshot.discountValue,
    customerState: snapshot.customerState,
    scrapDeduction: snapshot.scrapDeduction,
    scrapInvoiceNumber: snapshot.scrapInvoiceNumber,
    returnDeduction: snapshot.returnDeduction,
    returnInvoiceNumber: snapshot.returnInvoiceNumber,
    isQuotationMode: snapshot.isQuotationMode || false,
    isReturnMode: snapshot.isReturnMode || false,
    isScrapMode: snapshot.isScrapMode || false,
    returnRefundMethod: snapshot.returnRefundMethod || 'ADJUST_BILL',
    editingQuotationId: snapshot.editingQuotationId || null,
    editingQuotationNumber: snapshot.editingQuotationNumber || null,
    editingInvoiceId: snapshot.editingInvoiceId || null,
    editingInvoiceNumber: snapshot.editingInvoiceNumber || null,
    editingInvoiceRole: snapshot.editingInvoiceRole || null,
    pendingScrapInvoiceToEdit: snapshot.pendingScrapInvoiceToEdit || null,
  });
}

function resetCartStore(preserveModes = false) {
  const currentCartState = useCartStore.getState();
  useCartStore.setState({
    items: [],
    invoiceType: 'BILL_OF_SUPPLY',
    discountType: 'FIXED',
    discountValue: 0,
    customerState: 'KL',
    scrapDeduction: 0,
    scrapInvoiceNumber: '',
    returnDeduction: 0,
    returnInvoiceNumber: '',
    isQuotationMode: preserveModes ? currentCartState.isQuotationMode : false,
    isReturnMode: preserveModes ? currentCartState.isReturnMode : false,
    isScrapMode: preserveModes ? currentCartState.isScrapMode : false,
    returnRefundMethod: 'ADJUST_BILL',
    editingQuotationId: null,
    editingQuotationNumber: null,
    editingInvoiceId: null,
    editingInvoiceNumber: null,
    editingInvoiceRole: null,
    pendingScrapInvoiceToEdit: null,
  });
}

function createDefaultTab(): Tab {
  const id = uuidv4();
  const activeTab = useTabStore?.getState?.()?.getActiveTab?.();
  const currentCartState = useCartStore?.getState?.();
  const isQuotationMode = currentCartState?.isQuotationMode || false;
  const isReturnMode = currentCartState?.isReturnMode || false;
  const isScrapMode = currentCartState?.isScrapMode || false;
  const isCashSettlementOn = getFeatureFlags().cash_settlement !== false;
  return {
    id,
    title: isQuotationMode ? 'New Quote' : isReturnMode ? 'Return' : isScrapMode ? 'Scrap' : 'New',
    snapshot: {
      items: [],
      invoiceType: 'BILL_OF_SUPPLY',
      discountType: 'FIXED',
      discountValue: 0,
      customerState: 'KL',
      scrapDeduction: 0,
      scrapInvoiceNumber: '',
      returnDeduction: 0,
      returnInvoiceNumber: '',
      isQuotationMode,
      isReturnMode,
      isScrapMode,
      returnRefundMethod: 'ADJUST_BILL',
      editingQuotationId: currentCartState?.editingQuotationId || null,
      editingQuotationNumber: currentCartState?.editingQuotationNumber || null,
      editingInvoiceId: null,
      editingInvoiceNumber: null,
      editingInvoiceRole: null,
      pendingScrapInvoiceToEdit: null,
    },
    customerName: '',
    customerPhone: '',
    customerGstin: '',
    customerAddress: '',
    paymentMethod: isCashSettlementOn ? 'PENDING' : 'CASH',
    splitDetails: { cash: 0, card: 0, upi: 0, bank_transfer: 0 },
    receivedAmount: 0,
    reservedInvoiceNumber: '',
    reservedScrapInvoiceNumber: '',
    reservedQuotationNumber: '',
    reservedReturnNumber: '',
    scrapPaymentStatus: 'PENDING',
    selectedUpiId: activeTab?.selectedUpiId,
    selectedUpiSourceId: activeTab?.selectedUpiSourceId,
    selectedUpiName: activeTab?.selectedUpiName,
  };
}

export const useTabStore = create<TabState>((set, get) => ({
  tabs: [],
  activeTabId: '',

  addTab: (initialSnapshot?, title?) => {
    const state = get();

    let currentTabs = state.tabs;
    if (state.activeTabId && state.tabs.length > 0) {
      const cartState = useCartStore.getState();
      currentTabs = state.tabs.map(t => {
        if (t.id === state.activeTabId) {
          return { ...t, snapshot: getSnapshotFromCartStore(cartState) };
        }
        return t;
      });
    }

    const tab = createDefaultTab();
    if (title) tab.title = title;
    if (initialSnapshot) {
      tab.snapshot = initialSnapshot;
    } else {
      resetCartStore(true);
    }

    set({ tabs: [...currentTabs, tab], activeTabId: tab.id });
    return tab.id;
  },

  closeTab: (id) => {
    const { tabs, activeTabId } = get();
    const cartState = useCartStore.getState();
    const savedTabs = tabs.map(t =>
      t.id === id && t.id === activeTabId
        ? { ...t, snapshot: getSnapshotFromCartStore(cartState) }
        : t
    );
    const newTabs = savedTabs.filter(t => t.id !== id);
    if (newTabs.length === 0) {
      const tab = createDefaultTab();
      resetCartStore();
      set({ tabs: [tab], activeTabId: tab.id });
      return;
    }
    let newActive = activeTabId;
    if (activeTabId === id) {
      const idx = tabs.findIndex(t => t.id === id);
      newActive = newTabs[Math.min(idx, newTabs.length - 1)].id;
      const targetTab = newTabs.find(t => t.id === newActive);
      if (targetTab) {
        applySnapshotToCartStore(targetTab.snapshot);
      }
    }
    set({ tabs: newTabs, activeTabId: newActive });
  },

  renameTab: (id, title) => {
    const { tabs } = get();
    set({
      tabs: tabs.map(t => t.id === id ? { ...t, title } : t),
    });
  },

  switchTab: (targetId) => {
    const { tabs, activeTabId } = get();
    if (targetId === activeTabId) return;

    const cartState = useCartStore.getState();
    const updatedTabs = tabs.map(t => {
      if (t.id === activeTabId) {
        return {
          ...t,
          snapshot: getSnapshotFromCartStore(cartState),
        };
      }
      return t;
    });

    const targetTab = updatedTabs.find(t => t.id === targetId);
    if (targetTab) {
      applySnapshotToCartStore(targetTab.snapshot);
    }

    set({ tabs: updatedTabs, activeTabId: targetId });
  },

  updateActiveTab: (updates) => {
    const { tabs, activeTabId } = get();
    const allowedKeys: (keyof Omit<Tab, 'id' | 'snapshot'>)[] = [
      'title', 'customerName', 'customerPhone', 'customerGstin', 'customerAddress',
      'paymentMethod', 'splitDetails', 'receivedAmount', 'reservedInvoiceNumber',
      'reservedScrapInvoiceNumber', 'reservedQuotationNumber', 'reservedReturnNumber',
      'scrapPaymentStatus', 'selectedUpiId', 'selectedUpiSourceId', 'selectedUpiName'
    ];
    const filtered = Object.fromEntries(
      Object.entries(updates).filter(([k]) => (allowedKeys as string[]).includes(k))
    );
    set({
      tabs: tabs.map(t =>
        t.id === activeTabId ? { ...t, ...filtered } as Tab : t
      ),
    });
  },

  updateTabById: (id, updates) => {
    const { tabs } = get();
    const allowedKeys: (keyof Omit<Tab, 'id' | 'snapshot'>)[] = [
      'title', 'customerName', 'customerPhone', 'customerGstin', 'customerAddress',
      'paymentMethod', 'splitDetails', 'receivedAmount', 'reservedInvoiceNumber',
      'reservedScrapInvoiceNumber', 'reservedQuotationNumber', 'reservedReturnNumber',
      'scrapPaymentStatus', 'selectedUpiId', 'selectedUpiSourceId', 'selectedUpiName'
    ];
    const filtered = Object.fromEntries(
      Object.entries(updates).filter(([k]) => (allowedKeys as string[]).includes(k))
    );
    set({
      tabs: tabs.map(t =>
        t.id === id ? { ...t, ...filtered } as Tab : t
      ),
    });
  },

  syncActiveSnapshot: () => {
    const { tabs, activeTabId } = get();
    const cartState = useCartStore.getState();
    set({
      tabs: tabs.map(t => {
        if (t.id === activeTabId) {
          return {
            ...t,
            snapshot: getSnapshotFromCartStore(cartState),
          };
        }
        return t;
      }),
    });
  },

  getActiveTab: () => {
    const { tabs, activeTabId } = get();
    return tabs.find(t => t.id === activeTabId);
  },
}));

if (typeof window !== 'undefined') {
  (window as any).useTabStore = useTabStore;
}
