// @vitest-environment jsdom
/**
 * Screen test for billing: the real BillingPage (components → hooks → stores → src/data) runs in jsdom against a fake
 * Electron bridge, so a cashier's key presses are exercised end to end without a database. The bridge answers every
 * call with an empty list unless a test sets an answer in `answers`; every call is recorded in `calls`.
 */
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

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
Element.prototype.scrollIntoView = () => {}; // not implemented by jsdom

const { useAuthStore } = await import('../../src/store/authStore');
const { useCartStore } = await import('../../src/store/cartStore');
const { useTabStore } = await import('../../src/store/tabStore');
const { BillingPage } = await import('../../src/components/billing/BillingPage');
const cartInitial = useCartStore.getInitialState();
const tabsInitial = useTabStore.getInitialState();

const callsTo = (name: string) => calls.filter((c) => c.name === name);
const itemsSummary = () => screen.getByText('Items Summary').closest('div')!.parentElement!;

async function addSteelRod() {
  const user = userEvent.setup();
  render(<BillingPage />);
  const search = await screen.findByPlaceholderText(/Search products or scan barcode/);
  await user.type(search, 'rod');
  await user.keyboard('{Enter}');
  await screen.findByText('Steel Rod');
  return user;
}

beforeEach(() => {
  calls = [];
  answers = {
    dbGetProducts: () => [product],
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
afterEach(() => cleanup());

describe('billing screen', () => {
  it('searches a product, adds it with Enter and shows the totals', async () => {
    await addSteelRod();
    expect(callsTo('dbGetProducts').every((c) => (c.args[0] as { tenant_id: string }).tenant_id === 't1')).toBe(true);
    const summary = within(itemsSummary());
    expect(summary.getByText('1 Product')).toBeTruthy();
    expect(summary.getAllByText('₹100.00').length).toBeGreaterThan(0);
  });

  it('F12 saves the bill with the right number, items and totals and prints the receipt', async () => {
    const user = await addSteelRod();
    await user.keyboard('{Enter}{Escape}'); // close the price-tier picker that opens on the new line
    await user.keyboard('{F12}');
    await waitFor(() => expect(callsTo('dbCheckout')).toHaveLength(1));

    const payload = callsTo('dbCheckout')[0].args[0] as Record<string, unknown>;
    expect(payload).toMatchObject({
      tenant_id: 't1', invoice_number: 'POS1-101', invoice_type: 'BILL_OF_SUPPLY',
      subtotal: 100, tax_total: 0, discount_total: 0, grand_total: 100,
    });
    expect(payload.items).toEqual([expect.objectContaining({ product_id: 'p1', name: 'Steel Rod', quantity: 1, unit_price: 100, total: 100 })]);
    expect(await screen.findByText(/Invoice completed & Receipt printed!/)).toBeTruthy();
    const [tenant, receipt] = callsTo('printReceipt')[0].args as [string, string];
    expect(tenant).toBe('t1');
    expect(receipt).toContain('POS1-101');
    expect(receipt).toContain('Steel Rod');
    expect(receipt).toContain('100.00');
    expect(screen.queryByText(/Checkout failed/)).toBeNull();
  });

  it('a failed save keeps the cart and tells the cashier', async () => {
    answers.dbCheckout = () => ({ success: false, error: 'disk full' });
    const user = await addSteelRod();
    await user.keyboard('{Enter}{Escape}');
    await user.keyboard('{F12}');
    expect(await screen.findByText(/Checkout failed: disk full/)).toBeTruthy();
    expect(screen.getByText('Steel Rod')).toBeTruthy();
  });

  it('does not save an empty bill', async () => {
    const user = userEvent.setup();
    render(<BillingPage />);
    await screen.findByPlaceholderText(/Search products or scan barcode/);
    await user.keyboard('{F12}');
    await new Promise((r) => setTimeout(r, 300));
    expect(callsTo('dbCheckout')).toHaveLength(0);
  });
});
