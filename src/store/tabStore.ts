import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type { CartItem, InvoiceType } from './cartStore';
import { useCartStore } from './cartStore';

type PaymentMethod = 'CASH' | 'CARD' | 'UPI' | 'CREDIT';

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
  paymentMethod: PaymentMethod;
  receivedAmount: number;
}

interface TabState {
  tabs: Tab[];
  activeTabId: string;
  addTab: (initialSnapshot?: TabSnapshot) => string;
  closeTab: (id: string) => void;
  switchTab: (id: string) => void;
  updateActiveTab: (updates: Partial<Omit<Tab, 'id' | 'snapshot'>>) => void;
  syncActiveSnapshot: () => void;
}

function createDefaultTab(): Tab {
  const id = uuidv4();
  return {
    id,
    title: `Bill ${id.slice(0, 4).toUpperCase()}`,
    snapshot: {
      items: [],
      invoiceType: 'BILL_OF_SUPPLY',
      discountType: 'FIXED',
      discountValue: 0,
      customerState: 'MH',
    },
    customerName: '',
    customerPhone: '',
    customerGstin: '',
    paymentMethod: 'CASH',
    receivedAmount: 0,
  };
}

export const useTabStore = create<TabState>((set, get) => ({
  tabs: [],
  activeTabId: '',

  addTab: (initialSnapshot?) => {
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
    if (initialSnapshot) {
      tab.snapshot = initialSnapshot;
    } else {
      useCartStore.setState({ items: [], invoiceType: 'BILL_OF_SUPPLY', discountType: 'FIXED', discountValue: 0, customerState: 'MH' });
    }

    set({ tabs: [...currentTabs, tab], activeTabId: tab.id });
    return tab.id;
  },

  closeTab: (id) => {
    const { tabs, activeTabId } = get();
    if (tabs.length <= 1) return;
    const idx = tabs.findIndex(t => t.id === id);
    const newTabs = tabs.filter(t => t.id !== id);
    let newActive = activeTabId;
    if (activeTabId === id) {
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
}));
