import { create } from 'zustand';
import { isDesktopRuntime } from '../data/client';
import { listProducts } from '../data/products';
import { getSetting, setSetting } from '../data/settings';
import {
  addReadIds, buildStockNotifications, parseReadIds, removeReadId,
  type AppNotification, type StockSnapshot,
} from '../utils/notifications/notifications';

/** How many products per stock status are turned into notifications on one load. */
const STOCK_NOTIFICATION_LIMIT = 100;

export function notificationReadSettingKey(userId: string | null | undefined): string {
  return `notifications_read_${userId || 'default'}`;
}

interface NotificationScope { tenantId: string; userId: string | null }

export interface NotificationState {
  stockNotifications: Omit<AppNotification, 'read'>[];
  readIds: string[];
  isLoading: boolean;
  error: string | null;
  scope: NotificationScope | null;
  /** Loads the user's read ids and, when `includeStock` (the user may view products), the shop's stock alerts. */
  load: (tenantId: string, userId: string | null, includeStock?: boolean) => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markUnread: (id: string) => Promise<void>;
  markAllRead: (ids: readonly string[]) => Promise<void>;
}

async function persistReadIds(scope: NotificationScope | null, readIds: string[]): Promise<void> {
  if (!scope || !isDesktopRuntime()) return;
  try {
    await setSetting({ tenant_id: scope.tenantId, key: notificationReadSettingKey(scope.userId), value: JSON.stringify(readIds) });
  } catch (err) {
    console.warn('[notifications] Could not save read state:', err);
  }
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  stockNotifications: [],
  readIds: [],
  isLoading: false,
  error: null,
  scope: null,

  load: async (tenantId, userId, includeStock = true) => {
    const scope = { tenantId, userId };
    set({ isLoading: true, error: null, scope, ...(includeStock ? {} : { stockNotifications: [] }) });
    if (!isDesktopRuntime()) {
      set({ isLoading: false });
      return;
    }
    try {
      const [low, out, storedRead] = await Promise.all([
        includeStock ? listProducts({ tenant_id: tenantId, stockStatus: 'low_stock', limit: STOCK_NOTIFICATION_LIMIT }) : Promise.resolve([]),
        includeStock ? listProducts({ tenant_id: tenantId, stockStatus: 'out_of_stock', limit: STOCK_NOTIFICATION_LIMIT }) : Promise.resolve([]),
        getSetting({ tenant_id: tenantId, key: notificationReadSettingKey(userId) }),
      ]);
      const current = get().scope;
      if (current?.tenantId !== tenantId || current.userId !== userId) return;
      const snapshots: StockSnapshot[] = [...out, ...low].map(p => ({
        product_id: p.product_id, name: p.name, current_stock: p.current_stock, reorder_level: p.reorder_level,
      }));
      set({ stockNotifications: buildStockNotifications(snapshots), readIds: parseReadIds(storedRead), isLoading: false });
    } catch (err) {
      set({ isLoading: false, error: err instanceof Error ? err.message : 'Could not load notifications' });
    }
  },

  markRead: async (id) => {
    const readIds = addReadIds(get().readIds, [id]);
    set({ readIds });
    await persistReadIds(get().scope, readIds);
  },

  markUnread: async (id) => {
    const readIds = removeReadId(get().readIds, id);
    set({ readIds });
    await persistReadIds(get().scope, readIds);
  },

  markAllRead: async (ids) => {
    if (ids.length === 0) return;
    const readIds = addReadIds(get().readIds, ids);
    set({ readIds });
    await persistReadIds(get().scope, readIds);
  },
}));
