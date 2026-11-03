// @vitest-environment jsdom
/**
 * Restaurant order → Billing → checkout through the real BillingPage and stores (fake Electron bridge, as in
 * billingScreen.ui.test.tsx). The order id must reach `db:checkout` (the main process closes the order in the same
 * transaction) and must not stay on the tab for the next bill. Found missing in the app: `updateActiveTab` dropped it.
 */
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Answer = (...args: unknown[]) => unknown;
let answers: Record<string, Answer> = {};
let calls: { name: string; args: unknown[] }[] = [];
const fakeBridge = new Proxy({}, {
  get: (_t, name: string) => {
    if (name.startsWith('on')) return () => () => {};
    return async (...args: unknown[]) => {
      calls.push({ name, args });
      return answers[name] ? answers[name](...args) : [];
    };
  },
});
(window as unknown as { electronAPI: unknown }).electronAPI = fakeBridge;
Element.prototype.scrollIntoView = () => {}; // not implemented by jsdom

const { useAuthStore } = await import('../../src/store/authStore');
const { useCartStore } = await import('../../src/store/cartStore');
const { useTabStore } = await import('../../src/store/tabStore');
const { BillingPage } = await import('../../src/components/billing/BillingPage');
const { sendOrderToBilling } = await import('../../src/components/restaurant/restaurantBillHandover');
const { orderToCartItems, DEFAULT_SERVICE_CHARGE } = await import('../../src/components/restaurant/restaurantRules');
const cartInitial = useCartStore.getInitialState();
const tabsInitial = useTabStore.getInitialState();
const callsTo = (name: string) => calls.filter((c) => c.name === name);

const lines = [
  { line_id: 'l1', tenant_id: 't1', order_id: 'o1', product_id: 'p1', name: 'Shawarma', category: 'Grill', quantity: 2, unit_price: 10,
    tax_rate: 0, modifiers: JSON.stringify([{ modifier_id: 'm1', name: 'Extra cheese', price: 2, tax_rate: 0 }]), note: null, seat: null,
    station_id: null, kot_id: 'k1', status: 'ACTIVE' as const, void_reason: null, voided_by: null, voided_at: null, void_kot_id: null,
    moved_from_line_id: null, created_by: null, created_at: '' },
];
const items = orderToCartItems({ order_type: 'DINE_IN', delivery_fee: 0 }, lines, {
  products: {}, serviceCharge: { ...DEFAULT_SERVICE_CHARGE, enabled: true, percent: 10, taxRate: 0 },
});

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  calls = [];
  answers = {
    dbPeekNextInvoiceNumber: () => ({ success: true, invoiceNumber: 'POS1-101', counter: 101, prefix: 'POS1-' }),
    dbGetNextInvoiceNumber: () => ({ success: true, invoiceNumber: 'POS1-101', counter: 101 }),
    dbGetNextServerInvoiceNumber: () => ({ success: false, offline: true }),
    dbCheckout: () => ({ success: true, invoice_id: 'i1', invoice_number: 'POS1-101' }),
    printReceipt: () => ({ success: true }),
  };
  localStorage.clear();
  useCartStore.setState(cartInitial, true);
  useTabStore.setState(tabsInitial, true);
  useAuthStore.setState({ isAuthenticated: true, tenantId: 't1', role: 'ADMIN', permissions: ['*'] });
});
afterEach(() => { cleanup(); vi.clearAllTimers(); vi.useRealTimers(); });

describe('restaurant order in billing', () => {
  it('opens the order in a tab and checkout sends the order id, then clears it from the tab', async () => {
    const user = userEvent.setup();
    render(<BillingPage />);
    await screen.findByPlaceholderText(/Search products or scan barcode/);
    act(() => sendOrderToBilling({ orderId: 'o1', title: 'Table T1 · POS1-7', items }));

    await screen.findByText('Shawarma');
    const tab = useTabStore.getState().tabs.find(t => t.id === useTabStore.getState().activeTabId);
    expect(tab).toMatchObject({ restaurantOrderId: 'o1', description: 'Table T1 · POS1-7' });

    act(() => useTabStore.getState().updateActiveTab({ paymentMethod: 'CASH', receivedAmount: 0 }));
    await user.click(screen.getByRole('button', { name: 'Save', exact: true }));
    await waitFor(() => expect(callsTo('dbCheckout')).toHaveLength(1));
    const payload = callsTo('dbCheckout')[0].args[0] as Record<string, unknown>;
    // 2 × 10 + Extra cheese 2 × 2 + service charge 10% of 24.
    expect(payload).toMatchObject({ restaurant_order_id: 'o1', grand_total: 26.4, notes: 'Table T1 · POS1-7' });
    expect((payload.items as { product_id: string }[]).map(i => i.product_id)).toEqual(['p1', 'rst-mod-m1', 'rst-service-charge']);
    await waitFor(() => expect(useTabStore.getState().tabs.some(t => t.restaurantOrderId)).toBe(false));
  });

  it('a retail bill sends no order id', async () => {
    render(<BillingPage />);
    await screen.findByPlaceholderText(/Search products or scan barcode/);
    expect(useTabStore.getState().tabs.every(t => !t.restaurantOrderId)).toBe(true);
  });
});
