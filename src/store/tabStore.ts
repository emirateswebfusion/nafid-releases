import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type { CartItem, InvoiceType } from './cartStore';
import { useCartStore } from './cartStore';
import { useFeatureFlagsStore } from '../featureFlags';

export type PaymentMethod = 'PENDING' | 'CASH' | 'CARD' | 'UPI' | 'CHEQUE' | 'CREDIT' | 'SPLIT';

export interface SplitDetails {
  cash: number;
  card: number;
  upi: number;
  credit?: number;
  cheque?: number;
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
  returnRefundMethod: 'CASH' | 'UPI' | 'CARD' | 'BANK_TRANSFER' | 'STORE_CREDIT' | 'ADJUST_BILL' | 'CREDIT';
  editingQuotationId: string | null;
  editingQuotationNumber: string | null;
  editingInvoiceId: string | null;
  editingInvoiceNumber: string | null;
  editingInvoiceRole: 'SUPER_ADMIN' | 'ADMIN' | 'STAFF' | null;
  pendingScrapInvoiceToEdit: string | null;
  manualTotalOverride?: number | null;
  isB2B?: boolean;
  billDate?: string | null;
}

export interface Tab {
  id: string;
  title: string;
  snapshot: TabSnapshot;
  customerId?: string;
  customerName: string;
  customerPhone: string;
  customerGstin: string;
  customerAddress: string;
  billDate?: string | null;
  description?: string;
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
  manualTotalOverride?: number | null;
  editingInvoiceContribution?: number;
  editingInvoicePartyKey?: string;
  /** Actual physical cash refunded to customer — may differ from computed refundAmount */
  actualRefundPaid: number;
  reservedInvoiceNumber: string;
  reservedScrapInvoiceNumber: string;
  reservedQuotationNumber: string;
  reservedReturnNumber: string;
  scrapPaymentStatus: 'CASH' | 'PENDING' | 'CREDIT' | 'SETTLED';
  isStaffCustomer?: boolean;
  staffId?: string;
  selectedUpiId?: string;
  selectedUpiSourceId?: string;
  selectedUpiName?: string;
  isB2B?: boolean;
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
    manualTotalOverride: useTabStore?.getState?.()?.getActiveTab?.()?.manualTotalOverride ?? null,
    isB2B: useTabStore?.getState?.()?.getActiveTab?.()?.isB2B ?? false,
    billDate: useTabStore?.getState?.()?.getActiveTab?.()?.billDate ?? null,
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
  if (snapshot.manualTotalOverride !== undefined) {
    useTabStore.getState().updateActiveTab({ manualTotalOverride: snapshot.manualTotalOverride });
  }
  if (snapshot.isB2B !== undefined) {
    useTabStore.getState().updateActiveTab({ isB2B: snapshot.isB2B });
  }
  if (snapshot.billDate !== undefined) {
    useTabStore.getState().updateActiveTab({ billDate: snapshot.billDate });
  }
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
  const flags = useFeatureFlagsStore.getState().flags;
  const isCashSettlementOn = flags?.cash_settlement !== false;
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
      isB2B: false,
    },
    customerName: '',
    customerPhone: '',
    customerGstin: '',
    customerAddress: '',
    billDate: null,
    isB2B: false,
    description: '',
    paymentMethod: isCashSettlementOn ? 'PENDING' : 'CASH',
    splitDetails: { cash: 0, card: 0, upi: 0, cheque: 0, bank_transfer: 0 },
    receivedAmount: 0,
    manualTotalOverride: null,
    actualRefundPaid: 0,
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

const TAB_STORAGE_KEY = 'vendora-pos-tabs-state';

function loadStoredTabs(): { tabs: Tab[]; activeTabId: string } | null {
  try {
    const raw = localStorage.getItem(TAB_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.tabs) && parsed.tabs.length > 0 && typeof parsed.activeTabId === 'string') {
        return { tabs: parsed.tabs, activeTabId: parsed.activeTabId };
      }
    }
  } catch (e) {
    console.error('Failed to load tabs from localStorage', e);
  }
  return null;
}

export function saveStoredTabs(tabs: Tab[], activeTabId: string) {
  try {
    const uiConfigRaw = localStorage.getItem('vendora-billing-ui-config');
    const uiConfig = uiConfigRaw ? JSON.parse(uiConfigRaw) : null;
    const preserveHeader = uiConfig?.preserveCartOnHeaderNavigation !== false;
    const preserveExit = uiConfig?.preserveCartOnPageExit !== false;
    const preserveLegacy = uiConfig?.preserveCartOnNavigation !== false;
    const preserve = preserveHeader || preserveExit || preserveLegacy;
    if (preserve) {
      localStorage.setItem(TAB_STORAGE_KEY, JSON.stringify({ tabs, activeTabId }));
    } else {
      localStorage.removeItem(TAB_STORAGE_KEY);
    }
  } catch (e) {
    console.error('Failed to save tabs to localStorage', e);
  }
}

const initialStoredData = loadStoredTabs();

export const useTabStore = create<TabState>((set, get) => ({
  tabs: initialStoredData?.tabs || [],
  activeTabId: initialStoredData?.activeTabId || '',

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
      applySnapshotToCartStore(initialSnapshot);
    } else {
      resetCartStore(true);
    }

    const newTabs = [...currentTabs, tab];
    set({ tabs: newTabs, activeTabId: tab.id });
    saveStoredTabs(newTabs, tab.id);
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
      saveStoredTabs([tab], tab.id);
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
    saveStoredTabs(newTabs, newActive);
  },

  renameTab: (id, title) => {
    const { tabs, activeTabId } = get();
    const updatedTabs = tabs.map(t => t.id === id ? { ...t, title } : t);
    set({ tabs: updatedTabs });
    saveStoredTabs(updatedTabs, activeTabId);
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
    saveStoredTabs(updatedTabs, targetId);
  },

  updateActiveTab: (updates) => {
    const { tabs, activeTabId } = get();
    const allowedKeys: (keyof Omit<Tab, 'id' | 'snapshot'>)[] = [
      'title', 'customerId', 'customerName', 'customerPhone', 'customerGstin', 'customerAddress',
      'billDate',
      'description', 'transporterName', 'vehicleNumber', 'transporterDocNo', 'transporterDocDate',
      'ewayBillNo', 'ewayBillDate', 'shippingName', 'shippingAddress', 'shippingGstin',
      'paymentMethod', 'splitDetails', 'receivedAmount', 'manualTotalOverride', 'actualRefundPaid',
      'reservedInvoiceNumber', 'reservedScrapInvoiceNumber', 'reservedQuotationNumber', 'reservedReturnNumber',
      'scrapPaymentStatus', 'isStaffCustomer', 'staffId', 'selectedUpiId', 'selectedUpiSourceId', 'selectedUpiName', 'isB2B'
    ];
    const filtered = Object.fromEntries(
      Object.entries(updates).filter(([k]) => (allowedKeys as string[]).includes(k))
    );
    const updatedTabs = tabs.map(t =>
      t.id === activeTabId ? { ...t, ...filtered } as Tab : t
    );
    set({ tabs: updatedTabs });
    saveStoredTabs(updatedTabs, activeTabId);
  },

  updateTabById: (id, updates) => {
    const { tabs, activeTabId } = get();
    const allowedKeys: (keyof Omit<Tab, 'id' | 'snapshot'>)[] = [
      'title', 'customerId', 'customerName', 'customerPhone', 'customerGstin', 'customerAddress',
      'billDate',
      'description', 'transporterName', 'vehicleNumber', 'transporterDocNo', 'transporterDocDate',
      'ewayBillNo', 'ewayBillDate', 'shippingName', 'shippingAddress', 'shippingGstin',
      'paymentMethod', 'splitDetails', 'receivedAmount', 'manualTotalOverride', 'actualRefundPaid',
      'reservedInvoiceNumber', 'reservedScrapInvoiceNumber', 'reservedQuotationNumber', 'reservedReturnNumber',
      'scrapPaymentStatus', 'isStaffCustomer', 'staffId', 'selectedUpiId', 'selectedUpiSourceId', 'selectedUpiName', 'isB2B'
    ];
    const filtered = Object.fromEntries(
      Object.entries(updates).filter(([k]) => (allowedKeys as string[]).includes(k))
    );
    const updatedTabs = tabs.map(t =>
      t.id === id ? { ...t, ...filtered } as Tab : t
    );
    set({ tabs: updatedTabs });
    saveStoredTabs(updatedTabs, activeTabId);
  },

  syncActiveSnapshot: () => {
    const { tabs, activeTabId } = get();
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
    set({ tabs: updatedTabs });
    saveStoredTabs(updatedTabs, activeTabId);
  },

  getActiveTab: () => {
    const { tabs, activeTabId } = get();
    return tabs.find(t => t.id === activeTabId);
  },
}));

if (typeof window !== 'undefined') {
  (window as any).useTabStore = useTabStore;
}
