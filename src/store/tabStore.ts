import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type { CartItem, InvoiceType } from './cartStore';
import { useCartStore } from './cartStore';

type PaymentMethod = 'PENDING' | 'CASH' | 'CARD' | 'UPI' | 'CREDIT';

export interface TabSnapshot {
  items: CartItem[];
  invoiceType: InvoiceType;
  discountType: 'FIXED' | 'PERCENTAGE';
  discountValue: number;
  customerState: string;
}

export interface Tab {
  id: string;
  title: string;
  snapshot: TabSnapshot;
  customerName: string;
  customerPhone: string;
  customerGstin: string;
  customerAddress: string;
  paymentMethod: PaymentMethod;
  receivedAmount: number;
  reservedInvoiceNumber: string;
  reservedScrapInvoiceNumber: string;
  reservedQuotationNumber: string;
  scrapPaymentStatus: 'CASH' | 'PENDING';
}

interface TabState {
  tabs: Tab[];
  activeTabId: string;
  addTab: (initialSnapshot?: TabSnapshot, title?: string) => string;
  closeTab: (id: string) => void;
  switchTab: (id: string) => void;
  renameTab: (id: string, title: string) => void;
  updateActiveTab: (updates: Partial<Omit<Tab, 'id' | 'snapshot'>>) => void;
  syncActiveSnapshot: () => void;
  getActiveTab: () => Tab | undefined;
}

function createDefaultTab(): Tab {
  const id = uuidv4();
  return {
    id,
    title: 'New',
    snapshot: {
      items: [],
      invoiceType: 'BILL_OF_SUPPLY',
      discountType: 'FIXED',
      discountValue: 0,
      customerState: 'KL',
    },
    customerName: '',
    customerPhone: '',
    customerGstin: '',
    customerAddress: '',
    paymentMethod: 'PENDING',
    receivedAmount: 0,
    reservedInvoiceNumber: '',
    reservedScrapInvoiceNumber: '',
    reservedQuotationNumber: '',
    scrapPaymentStatus: 'PENDING',
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
          return { ...t, snapshot: { items: cartState.items, invoiceType: cartState.invoiceType, discountType: cartState.discountType, discountValue: cartState.discountValue, customerState: cartState.customerState } };
        }
        return t;
      });
    }

    const tab = createDefaultTab();
    if (title) tab.title = title;
    if (initialSnapshot) {
      tab.snapshot = initialSnapshot;
    } else {
      useCartStore.setState({ items: [], invoiceType: 'BILL_OF_SUPPLY', discountType: 'FIXED', discountValue: 0, customerState: 'KL' });
    }

    set({ tabs: [...currentTabs, tab], activeTabId: tab.id });
    return tab.id;
  },

  closeTab: (id) => {
    const { tabs, activeTabId } = get();
    const cartState = useCartStore.getState();
    const savedTabs = tabs.map(t =>
      t.id === id && t.id === activeTabId
        ? { ...t, snapshot: { items: cartState.items, invoiceType: cartState.invoiceType, discountType: cartState.discountType, discountValue: cartState.discountValue, customerState: cartState.customerState } }
        : t
    );
    const newTabs = savedTabs.filter(t => t.id !== id);
    if (newTabs.length === 0) {
      const tab = createDefaultTab();
      useCartStore.setState({ items: [], invoiceType: 'BILL_OF_SUPPLY', discountType: 'FIXED', discountValue: 0, customerState: 'KL' });
      set({ tabs: [tab], activeTabId: tab.id });
      return;
    }
    let newActive = activeTabId;
    if (activeTabId === id) {
      const idx = tabs.findIndex(t => t.id === id);
      newActive = newTabs[Math.min(idx, newTabs.length - 1)].id;
      const targetTab = newTabs.find(t => t.id === newActive);
      if (targetTab) {
        useCartStore.setState({
          items: targetTab.snapshot.items,
          invoiceType: targetTab.snapshot.invoiceType,
          discountType: targetTab.snapshot.discountType,
          discountValue: targetTab.snapshot.discountValue,
          customerState: targetTab.snapshot.customerState,
        });
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
          snapshot: {
            items: cartState.items,
            invoiceType: cartState.invoiceType,
            discountType: cartState.discountType,
            discountValue: cartState.discountValue,
            customerState: cartState.customerState,
          },
        };
      }
      return t;
    });

    const targetTab = updatedTabs.find(t => t.id === targetId);
    if (targetTab) {
      useCartStore.setState({
        items: targetTab.snapshot.items,
        invoiceType: targetTab.snapshot.invoiceType,
        discountType: targetTab.snapshot.discountType,
        discountValue: targetTab.snapshot.discountValue,
        customerState: targetTab.snapshot.customerState,
      });
    }

    set({ tabs: updatedTabs, activeTabId: targetId });
  },

  updateActiveTab: (updates) => {
    const { tabs, activeTabId } = get();
    set({
      tabs: tabs.map(t =>
        t.id === activeTabId ? { ...t, ...updates } : t
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
            snapshot: {
              items: cartState.items,
              invoiceType: cartState.invoiceType,
              discountType: cartState.discountType,
              discountValue: cartState.discountValue,
              customerState: cartState.customerState,
            },
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
