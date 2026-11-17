import { useEffect, useLayoutEffect, useRef } from 'react';
import { type CartItem } from '../../store/cartStore';
import { useTabStore, type Tab, type TabSnapshot } from '../../store/tabStore';
import { scanGoCloud } from '../../data/cloud/scanGo';
import { useAuthStore } from '../../store/authStore';

/**
 * Hands a claimed Scan & Go cart to Billing (same localStorage + window event pattern as restaurant orders): the cart
 * opens in its own billing tab carrying `scanGoCartId`; the normal checkout bills it (stock, cash, tax, loyalty) and
 * then `completeScanGoCart` records the invoice on the cloud cart.
 */

export const SCAN_GO_BILL_KEY = 'scanGoBillData';
export const SCAN_GO_BILL_EVENT = 'open-scan-go-bill';
const PENDING_COMPLETIONS_KEY = 'scanGoPendingCompletions';

export interface ScanGoBillHandover {
  cartId: string;
  tenantId: string;
  title: string;
  items: CartItem[];
  customerId?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
}

export function sendCartToBilling(data: ScanGoBillHandover): void {
  localStorage.setItem(SCAN_GO_BILL_KEY, JSON.stringify(data));
  window.dispatchEvent(new CustomEvent(SCAN_GO_BILL_EVENT));
}

export interface ScanGoBillHandoverContext {
  addItem: (item: Omit<CartItem, 'quantity'> & { quantity?: number }) => void;
  addTab: (initialSnapshot?: TabSnapshot, title?: string) => string;
  clearCart: () => void;
  syncActiveSnapshot: () => void;
  updateActiveTab: (updates: Partial<Omit<Tab, 'id' | 'snapshot'>>) => void;
}

/** Billing side: opens a handed-over cart in its own tab (on mount and on the event). */
export function useScanGoBillHandover(ctx: ScanGoBillHandoverContext): void {
  const ctxRef = useRef(ctx);
  useLayoutEffect(() => {
    ctxRef.current = ctx;
  });
  useEffect(() => {
    const handler = () => {
      const c = ctxRef.current;
      let raw: string | null = null;
      try {
        raw = localStorage.getItem(SCAN_GO_BILL_KEY);
        localStorage.removeItem(SCAN_GO_BILL_KEY);
      } catch { /* storage unavailable */ }
      if (!raw) return;
      let data: ScanGoBillHandover;
      try { data = JSON.parse(raw) as ScanGoBillHandover; } catch { return; }
      if (!data?.cartId || data.tenantId !== useAuthStore.getState().tenantId || !Array.isArray(data.items) || data.items.length === 0) return;

      const existing = useTabStore.getState().tabs.find(t => t.scanGoCartId === data.cartId);
      if (existing) {
        useTabStore.getState().switchTab(existing.id);
        return; // Preserve cashier edits when reopening this cart.
      }
      c.addTab(undefined, data.title);
      c.clearCart();
      for (const item of data.items) c.addItem({ ...item, quantity: Number(item.quantity) || 1 });
      const activeId = useTabStore.getState().activeTabId;
      if (activeId) useTabStore.getState().renameTab(activeId, data.title);
      c.updateActiveTab({
        scanGoCartId: data.cartId,
        customerId: data.customerId ?? undefined,
        customerName: data.customerName ?? '',
        customerPhone: data.customerPhone ?? '',
        description: data.title,
      });
      c.syncActiveSnapshot();
    };
    handler();
    window.addEventListener(SCAN_GO_BILL_EVENT, handler);
    return () => window.removeEventListener(SCAN_GO_BILL_EVENT, handler);
  }, []);
}

interface PendingCompletion { cartId: string; invoice_id: string; invoice_number: string | null }
const completionKey = (tenantId: string) => `${PENDING_COMPLETIONS_KEY}:${tenantId}`;
const flushes = new Map<string, Promise<void>>();

function readPending(tenantId: string): PendingCompletion[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(completionKey(tenantId)) || '[]');
    return Array.isArray(parsed) ? parsed.filter((p): p is PendingCompletion => !!p && typeof p === 'object' && typeof (p as PendingCompletion).cartId === 'string' && typeof (p as PendingCompletion).invoice_id === 'string') : [];
  } catch { return []; }
}
function writePending(tenantId: string, list: PendingCompletion[]): void {
  localStorage.setItem(completionKey(tenantId), JSON.stringify(list));
}

/** Persist before starting the network request, so restart or an interrupted request can be retried safely. */
export async function completeScanGoCart(cartId: string, invoiceId: string, invoiceNumber: string | null, tenantId: string): Promise<boolean> {
  try {
    writePending(tenantId, [...readPending(tenantId).filter(p => p.cartId !== cartId), { cartId, invoice_id: invoiceId, invoice_number: invoiceNumber }]);
    await flushScanGoCompletions(tenantId);
    return !readPending(tenantId).some(p => p.cartId === cartId);
  } catch { return false; }
}

/** Retry only this shop, serialize overlapping refreshes, and remove only confirmed entries from the latest queue. */
export function flushScanGoCompletions(tenantId: string): Promise<void> {
  const current = flushes.get(tenantId);
  if (current) return current;
  const flush = (async () => {
    for (const pending of readPending(tenantId)) {
      if (useAuthStore.getState().tenantId !== tenantId) break;
      try {
        await scanGoCloud.complete(pending.cartId, { invoice_id: pending.invoice_id, invoice_number: pending.invoice_number });
        writePending(tenantId, readPending(tenantId).filter(p => p.cartId !== pending.cartId || p.invoice_id !== pending.invoice_id));
      } catch { /* Keep conflicts and transport failures visible for retry; neither confirms completion. */ }
    }
  })().finally(() => { flushes.delete(tenantId); });
  flushes.set(tenantId, flush);
  return flush;
}
