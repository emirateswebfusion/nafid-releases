import { useEffect, useLayoutEffect, useRef } from 'react';
import { useCartStore, type CartItem } from '../../store/cartStore';
import { useTabStore, type Tab, type TabSnapshot } from '../../store/tabStore';

/**
 * Hands a restaurant order to Billing (same localStorage + window event pattern as Edit Bill): the order's cart lines
 * open in a billing tab that carries `restaurantOrderId`, and the normal checkout bills it and closes the order.
 */

export const RESTAURANT_BILL_KEY = 'restaurantBillData';
export const RESTAURANT_BILL_EVENT = 'open-restaurant-bill';

export interface RestaurantBillHandover {
  orderId: string;
  title: string;
  items: CartItem[];
  customerName?: string | null;
  customerPhone?: string | null;
  customerAddress?: string | null;
  waiterUserId?: string | null;
  waiterName?: string | null;
}

export function sendOrderToBilling(data: RestaurantBillHandover): void {
  try {
    localStorage.setItem(RESTAURANT_BILL_KEY, JSON.stringify(data));
  } catch { /* storage unavailable: nothing to hand over */ }
  window.dispatchEvent(new CustomEvent(RESTAURANT_BILL_EVENT));
}

export interface RestaurantBillHandoverContext {
  addItem: (item: Omit<CartItem, 'quantity'> & { quantity?: number }) => void;
  addTab: (initialSnapshot?: TabSnapshot, title?: string) => string;
  clearCart: () => void;
  syncActiveSnapshot: () => void;
  updateActiveTab: (updates: Partial<Omit<Tab, 'id' | 'snapshot'>>) => void;
}

/** Billing side: opens a handed-over order in its own tab (on mount and on the event). */
export function useRestaurantBillHandover(ctx: RestaurantBillHandoverContext): void {
  const ctxRef = useRef(ctx);
  useLayoutEffect(() => {
    ctxRef.current = ctx;
  });
  useEffect(() => {
    const handler = () => {
      const c = ctxRef.current;
      let raw: string | null = null;
      try {
        raw = localStorage.getItem(RESTAURANT_BILL_KEY);
        localStorage.removeItem(RESTAURANT_BILL_KEY);
      } catch { /* storage unavailable */ }
      if (!raw) return;
      let data: RestaurantBillHandover;
      try { data = JSON.parse(raw) as RestaurantBillHandover; } catch { return; }
      if (!data?.orderId || !Array.isArray(data.items) || data.items.length === 0) return;

      const existing = useTabStore.getState().tabs.find(t => t.restaurantOrderId === data.orderId);
      // The same order billed again (more items since): refill its tab instead of opening a second one.
      if (existing) useTabStore.getState().switchTab(existing.id);
      const hasCart = useCartStore.getState().items.length > 0 || !!useCartStore.getState().editingInvoiceId;
      if (!existing && (!useTabStore.getState().activeTabId || hasCart)) c.addTab(undefined, data.title);
      c.clearCart();
      for (const item of data.items) c.addItem({ ...item, quantity: Number(item.quantity) || 1 });
      if (data.waiterUserId) useCartStore.getState().setSalesStaff(data.waiterUserId, data.waiterName ?? null);
      const activeId = useTabStore.getState().activeTabId;
      if (activeId) useTabStore.getState().renameTab(activeId, data.title);
      c.updateActiveTab({
        restaurantOrderId: data.orderId,
        customerName: data.customerName ?? '',
        customerPhone: data.customerPhone ?? '',
        customerAddress: data.customerAddress ?? '',
        // The tab title shows the invoice number, so the table / token goes into the bill remarks.
        description: data.title,
      });
      c.syncActiveSnapshot();
    };
    handler();
    window.addEventListener(RESTAURANT_BILL_EVENT, handler);
    return () => window.removeEventListener(RESTAURANT_BILL_EVENT, handler);
  }, []);
}
