// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const product = {
  product_id: 'p1', tenant_id: 't1', name: 'Steel Rod', sku_barcode: '1001', item_code: 'SR1', category: 'Hardware',
  hsn_sac_code: '7214', purchase_price: 70, base_price: 100, is_gst_applicable: 0, tax_rate_percent: 0, uom: 'Pcs',
  brand_manufacturer: null, current_stock: 50, reorder_level: 5, domain_attributes: null, discount_percent: null,
  discount_flat: null, offer_price: null, is_deleted: 0, deleted_at: null, billing_type: 'UNIT', grade_id: null,
  pricing_mode: null, average_weight_per_piece: null, weight_override_allowed: 0, is_service_item: 0, sync_status: 'SYNCED',
  print_status: null, created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z', row_version: 1, origin: null,
};

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
Element.prototype.scrollIntoView = () => {};

const { useAuthStore } = await import('../../src/store/authStore');
const { useCartStore } = await import('../../src/store/cartStore');
const { useTabStore } = await import('../../src/store/tabStore');
const { BillingPage } = await import('../../src/components/billing/BillingPage');
const cartInitial = useCartStore.getInitialState();
const tabsInitial = useTabStore.getInitialState();

const callsTo = (name: string) => calls.filter((c) => c.name === name);

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  calls = [];
  answers = {
    dbGetProducts: () => [product],
    dbPeekNextInvoiceNumber: () => ({ success: true, invoiceNumber: 'POS1-101', counter: 101, prefix: 'POS1-' }),
    dbGetNextInvoiceNumber: () => ({ success: true, invoiceNumber: 'POS1-101', counter: 101 }),
    dbGetNextServerInvoiceNumber: () => ({ success: false, offline: true }),
    dbCheckout: () => ({ success: true, invoice_id: 'i1', invoice_number: 'POS1-101' }),
    printReceipt: () => ({ success: true }),
    dbGetCustomers: () => [],
    dbFindCustomers: () => [],
    dbGetStaff: () => [],
    dbGetParties: () => [],
  };
  localStorage.clear();
  useCartStore.setState(cartInitial, true);
  useTabStore.setState(tabsInitial, true);
  useAuthStore.setState({ isAuthenticated: true, tenantId: 't1', role: 'ADMIN', permissions: ['*'] });
});
afterEach(() => { cleanup(); vi.clearAllTimers(); vi.useRealTimers(); });

describe('customer details in billing screen', () => {
  it('types customer name and phone and verifies checkout payload', async () => {
    const user = userEvent.setup();
    render(<BillingPage />);

    // Add product
    const search = await screen.findByPlaceholderText(/Search products or scan barcode/);
    await user.type(search, 'rod');
    await user.keyboard('{Enter}');
    await screen.findByText('Steel Rod');
    await user.keyboard('{Enter}{Escape}');

    // Type customer name and phone
    const nameInput = screen.getByPlaceholderText(/Customer Name/);
    await user.type(nameInput, 'Mohammed Ali');

    const phoneInput = screen.getByPlaceholderText(/Phone/);
    await user.type(phoneInput, '9847112233');

    // Save bill
    await user.click(screen.getByRole('button', { name: 'Save', exact: true }));
    await waitFor(() => expect(callsTo('dbCheckout')).toHaveLength(1));

    const payload = callsTo('dbCheckout')[0].args[0] as Record<string, unknown>;
    console.log('dbCheckout payload customer fields:', {
      customer_id: payload.customer_id,
      customer_name: payload.customer_name,
      customer_phone: payload.customer_phone,
      customer_address: payload.customer_address,
    });

    expect(payload.customer_name).toBe('Mohammed Ali');
    expect(payload.customer_phone).toBe('9847112233');
  });

  it('types a new customer name that is a partial substring of existing customer and checks if customer_id gets hijacked', async () => {
    answers.dbFindCustomers = () => [
      { customer_id: 'existing-id-ali-khan', name: 'Ali Khan', phone: '9999999999', current_points_balance: 50 },
    ];

    const user = userEvent.setup();
    render(<BillingPage />);

    // Add product
    const search = await screen.findByPlaceholderText(/Search products or scan barcode/);
    await user.type(search, 'rod');
    await user.keyboard('{Enter}');
    await screen.findByText('Steel Rod');
    await user.keyboard('{Enter}{Escape}');

    // Type new customer: "Ali" (different person, new customer)
    const nameInput = screen.getByPlaceholderText(/Customer Name/);
    await user.type(nameInput, 'Ali');

    // Wait for debounce in useCustomerAutoMatch (200ms)
    act(() => {
      vi.advanceTimersByTime(300);
    });

    // Save bill
    await user.click(screen.getByRole('button', { name: 'Save', exact: true }));
    await waitFor(() => expect(callsTo('dbCheckout')).toHaveLength(1));

    const payload = callsTo('dbCheckout')[0].args[0] as Record<string, unknown>;
    expect(payload.customer_name).toBe('Ali');
    // Customer ID must NOT be hijacked to existing-id-ali-khan
    expect(payload.customer_id).toBeNull();
  });

  it('resets customer_id when customer name input is changed after previous selection', async () => {
    answers.dbGetCustomers = () => [
      { customer_id: 'cust-old-1', name: 'Old Customer', phone: '9800000000' },
    ];

    const user = userEvent.setup();
    render(<BillingPage />);

    // Add product
    const search = await screen.findByPlaceholderText(/Search products or scan barcode/);
    await user.type(search, 'rod');
    await user.keyboard('{Enter}');
    await screen.findByText('Steel Rod');
    await user.keyboard('{Enter}{Escape}');

    // Manually simulate active tab having an old customer ID (e.g. from previous tab/selection)
    act(() => {
      useTabStore.getState().updateActiveTab({ customerId: 'cust-old-1', customerName: 'Old Customer' });
    });

    // Cashier clears or edits name to type a new customer
    const nameInput = screen.getByPlaceholderText(/Customer Name/);
    await user.clear(nameInput);
    await user.type(nameInput, 'Brand New Customer');

    const phoneInput = screen.getByPlaceholderText(/Phone/);
    await user.type(phoneInput, '9895123456');

    // Save bill
    await user.click(screen.getByRole('button', { name: 'Save', exact: true }));
    await waitFor(() => expect(callsTo('dbCheckout')).toHaveLength(1));

    const payload = callsTo('dbCheckout')[0].args[0] as Record<string, unknown>;
    expect(payload.customer_name).toBe('Brand New Customer');
    expect(payload.customer_phone).toBe('9895123456');
    // customer_id must be null (not the old customer id)
    expect(payload.customer_id).toBeNull();
  });
});
