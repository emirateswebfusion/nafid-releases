import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuthStore } from '../../store/authStore';
import { CLOUD_API } from '../../data/cloud/client';
import { scanGoCloud, type ScanGoCart, type ScanGoConfig } from '../../data/cloud/scanGo';
import { getProductsByIds } from '../../data/products';
import { customersApi } from '../../data/customers';
import { billPhoneFor, cartToBillItems, isOpenCart, ticketCodeFromInput } from './scanGoRules';
import { flushScanGoCompletions, sendCartToBilling } from './scanGoBillHandover';
import type { ToastMessage } from '../ui/FloatToast';

const POLL_MS = 20_000;
const messageOf = (error: unknown, fallback: string) => (error instanceof Error && error.message ? error.message : fallback);

/** The counter's Scan & Go queue: polls the cloud while billing is open and opens carts in a normal bill. */
export function useCustomerCarts() {
  const tenantId = useAuthStore(s => s.tenantId);
  const [config, setConfig] = useState<ScanGoConfig | null>(null);
  const [carts, setCarts] = useState<ScanGoCart[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const available = Boolean(CLOUD_API && tenantId);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const refresh = useCallback(async () => {
    if (!available) return;
    setLoading(true);
    try {
      const nextConfig = await scanGoCloud.getConfig();
      if (!mounted.current || useAuthStore.getState().tenantId !== tenantId) return;
      setConfig(nextConfig);
      await flushScanGoCompletions(tenantId!);
      if (nextConfig.enabled) {
        const list = await scanGoCloud.list();
        if (mounted.current && useAuthStore.getState().tenantId === tenantId) setCarts(list);
      } else {
        setCarts([]);
      }
      if (mounted.current) setLoadError(null);
    } catch (error) {
      if (mounted.current) setLoadError(messageOf(error, 'Customer carts could not be loaded.'));
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [available, tenantId]);

  useEffect(() => {
    if (!available) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- refresh starts the first cloud load when billing opens; its loading state appears immediately, as before.
    void refresh();
    const timer = setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, POLL_MS);
    const onSettings = () => { void refresh(); };
    window.addEventListener('scan-go-settings-updated', onSettings);
    return () => { clearInterval(timer); window.removeEventListener('scan-go-settings-updated', onSettings); };
  }, [available, refresh]);

  const run = useCallback(async (cartId: string, action: () => Promise<void>) => {
    setBusyId(cartId);
    try {
      await action();
    } catch (error) {
      setToast({ type: 'error', text: messageOf(error, 'The cart could not be updated.') });
    } finally {
      if (mounted.current) setBusyId(null);
      void refresh();
    }
  }, [refresh]);

  /** Checks every item exists on this PC, takes the cart for this cashier and opens it in a bill. Returns true when opened. */
  const openInBill = useCallback(async (cart: ScanGoCart): Promise<boolean> => {
    if (!tenantId) return false;
    let opened = false;
    await run(cart.id, async () => {
      const products = await getProductsByIds({ tenant_id: tenantId, product_ids: cart.items.map(i => i.product_id) });
      const { items, missing } = cartToBillItems(cart, products);
      if (missing.length > 0 || items.length === 0) {
        setToast({ type: 'warning', text: `${missing.map(m => m.name).join(', ') || 'These items'} ${missing.length === 1 ? 'is' : 'are'} not on this PC yet. Sync, then open the cart again.` });
        return;
      }
      if (useAuthStore.getState().tenantId !== tenantId) return;
      const claimed = await scanGoCloud.claim(cart.id);
      const last10 = claimed.customer_phone.replace(/\D/g, '').slice(-10);
      const localCustomers = last10 ? await customersApi.findCustomers({ tenant_id: tenantId, phone: last10 }).catch(() => []) : [];
      if (useAuthStore.getState().tenantId !== tenantId) return;
      sendCartToBilling({
        cartId: claimed.id,
        tenantId,
        title: `Scan & Go ${claimed.ticket_code}`,
        items,
        customerId: claimed.customer_id,
        customerName: claimed.customer_name,
        customerPhone: billPhoneFor(claimed, localCustomers),
      });
      opened = true;
    });
    return opened;
  }, [run, tenantId]);

  const reject = useCallback((cart: ScanGoCart, reason: string) => run(cart.id, async () => {
    await scanGoCloud.reject(cart.id, reason.trim() || undefined);
    setToast({ type: 'info', text: `Cart ${cart.ticket_code} rejected. The customer sees it on the phone.` });
  }), [run]);

  const release = useCallback((cart: ScanGoCart) => run(cart.id, async () => {
    await scanGoCloud.release(cart.id);
  }), [run]);

  /** A ticket typed or scanned into the search box: the matching open cart, or null with a toast. */
  const findByTicket = useCallback(async (input: string): Promise<ScanGoCart | null> => {
    const code = ticketCodeFromInput(input);
    if (!code) { setToast({ type: 'warning', text: 'Ticket codes have 4 letters or digits.' }); return null; }
    const local = carts.find(c => c.ticket_code === code && isOpenCart(c));
    if (local) return local;
    try { return await scanGoCloud.findByCode(code); } catch (error) { setToast({ type: 'warning', text: messageOf(error, 'No waiting cart has this ticket code.') }); return null; }
  }, [carts]);

  const openCount = carts.filter(c => c.status === 'PENDING').length;
  return { available, config, carts, openCount, loading, loadError, busyId, toast, setToast, refresh, openInBill, reject, release, findByTicket };
}

export type CustomerCartsState = ReturnType<typeof useCustomerCarts>;
