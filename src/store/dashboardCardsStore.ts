import { create } from 'zustand';

export const DEFAULT_DASHBOARD_CARDS_ORDER = [
  'billing',
  'cashier',
  'inventory',
  'ecommerce',
  'advertisements',
  'ai-assistant',
  'grades',
  'pricing-tiers',
  'financial-report',
  'stock-print',
  'quotations',
  'purchase-bills',
  'warranties',
  'returns',
  'scrap',
  'parties',
  'payments',
  'customers',
  'staff',
  'combo-offers',
  'history',
  'recycle-bin',
];

export function getDashboardCardsStorageKey(
  tenantId?: string | null,
  userId?: string | null,
  role?: string | null
): string {
  const t = tenantId || 'global';
  const u = userId ? `user_${userId}` : role ? `role_${role}` : 'default';
  return `nafid_pos_card_order_${t}_${u}`;
}

export function getDashboardCardsElectronKey(
  userId?: string | null,
  role?: string | null
): string {
  const u = userId ? `user_${userId}` : role ? `role_${role}` : 'default';
  return `dashboard_card_order_${u}`;
}

export function normalizeCardOrder(savedOrder: unknown): string[] {
  if (!Array.isArray(savedOrder)) {
    return [...DEFAULT_DASHBOARD_CARDS_ORDER];
  }

  // Filter only string ids
  const validSaved = savedOrder.filter((id): id is string => typeof id === 'string');

  // Maintain unique items from saved
  const orderedList: string[] = [];
  for (const id of validSaved) {
    if (!orderedList.includes(id)) {
      orderedList.push(id);
    }
  }

  // Append any default cards that are missing from the saved order
  for (const id of DEFAULT_DASHBOARD_CARDS_ORDER) {
    if (!orderedList.includes(id)) {
      orderedList.push(id);
    }
  }

  return orderedList;
}

interface DashboardCardsState {
  cardOrder: string[];
  isEditMode: boolean;
  isLoaded: boolean;
  setIsEditMode: (editing: boolean) => void;
  loadCardOrder: (
    tenantId?: string | null,
    userId?: string | null,
    role?: string | null
  ) => Promise<string[]>;
  setCardOrder: (
    order: string[],
    tenantId?: string | null,
    userId?: string | null,
    role?: string | null
  ) => Promise<void>;
  moveCard: (
    cardId: string,
    direction: 'up' | 'down' | 'top' | 'bottom',
    tenantId?: string | null,
    userId?: string | null,
    role?: string | null
  ) => void;
  reorderCards: (
    startIndex: number,
    endIndex: number,
    tenantId?: string | null,
    userId?: string | null,
    role?: string | null
  ) => void;
  resetToDefault: (
    tenantId?: string | null,
    userId?: string | null,
    role?: string | null
  ) => Promise<void>;
}

export const useDashboardCardsStore = create<DashboardCardsState>((set, get) => ({
  cardOrder: [...DEFAULT_DASHBOARD_CARDS_ORDER],
  isEditMode: false,
  isLoaded: false,

  setIsEditMode: (editing) => set({ isEditMode: editing }),

  loadCardOrder: async (tenantId, userId, role) => {
    const storageKey = getDashboardCardsStorageKey(tenantId, userId, role);
    let resolvedOrder: string[] = [...DEFAULT_DASHBOARD_CARDS_ORDER];

    // 1. Try local storage (fast & synchronous)
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        resolvedOrder = normalizeCardOrder(parsed);
      }
    } catch (err) {
      console.warn('Failed to parse card order from localStorage', err);
    }

    set({ cardOrder: resolvedOrder, isLoaded: true });

    // 2. Try electron settings store if available (asynchronous sync)
    if (typeof window !== 'undefined' && window.electronAPI?.settingsGet) {
      try {
        const electronKey = getDashboardCardsElectronKey(userId, role);
        const saved = await window.electronAPI.settingsGet({
          tenant_id: tenantId || 'global',
          key: electronKey,
        });

        if (saved) {
          const normalized = normalizeCardOrder(saved);
          set({ cardOrder: normalized });
          try {
            localStorage.setItem(storageKey, JSON.stringify(normalized));
          } catch {}
          return normalized;
        }
      } catch (err) {
        console.warn('Failed to load card order from electron settings', err);
      }
    }

    return resolvedOrder;
  },

  setCardOrder: async (order, tenantId, userId, role) => {
    const normalized = normalizeCardOrder(order);
    set({ cardOrder: normalized });

    const storageKey = getDashboardCardsStorageKey(tenantId, userId, role);
    try {
      localStorage.setItem(storageKey, JSON.stringify(normalized));
    } catch (err) {
      console.warn('Failed to save card order to localStorage', err);
    }

    if (typeof window !== 'undefined' && window.electronAPI?.settingsSet) {
      try {
        const electronKey = getDashboardCardsElectronKey(userId, role);
        await window.electronAPI.settingsSet({
          tenant_id: tenantId || 'global',
          key: electronKey,
          value: normalized,
        });
      } catch (err) {
        console.warn('Failed to save card order to electron settings', err);
      }
    }
  },

  moveCard: (cardId, direction, tenantId, userId, role) => {
    const current = [...get().cardOrder];
    const index = current.indexOf(cardId);
    if (index === -1) return;

    if (direction === 'top') {
      if (index === 0) return;
      current.splice(index, 1);
      current.unshift(cardId);
    } else if (direction === 'bottom') {
      if (index === current.length - 1) return;
      current.splice(index, 1);
      current.push(cardId);
    } else if (direction === 'up') {
      if (index <= 0) return;
      const temp = current[index - 1];
      current[index - 1] = current[index];
      current[index] = temp;
    } else if (direction === 'down') {
      if (index >= current.length - 1) return;
      const temp = current[index + 1];
      current[index + 1] = current[index];
      current[index] = temp;
    }

    get().setCardOrder(current, tenantId, userId, role);
  },

  reorderCards: (startIndex, endIndex, tenantId, userId, role) => {
    const current = [...get().cardOrder];
    if (
      startIndex < 0 ||
      startIndex >= current.length ||
      endIndex < 0 ||
      endIndex >= current.length ||
      startIndex === endIndex
    ) {
      return;
    }

    const [moved] = current.splice(startIndex, 1);
    current.splice(endIndex, 0, moved);
    get().setCardOrder(current, tenantId, userId, role);
  },

  resetToDefault: async (tenantId, userId, role) => {
    const defaults = [...DEFAULT_DASHBOARD_CARDS_ORDER];
    set({ cardOrder: defaults });

    const storageKey = getDashboardCardsStorageKey(tenantId, userId, role);
    try {
      localStorage.setItem(storageKey, JSON.stringify(defaults));
    } catch {}

    if (typeof window !== 'undefined' && window.electronAPI?.settingsSet) {
      try {
        const electronKey = getDashboardCardsElectronKey(userId, role);
        await window.electronAPI.settingsSet({
          tenant_id: tenantId || 'global',
          key: electronKey,
          value: defaults,
        });
      } catch {}
    }
  },
}));
