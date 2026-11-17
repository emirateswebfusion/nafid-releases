/** Scan & Go at the counter: cart → bill lines from this PC's products, loyalty phone, ticket input, completion retry. */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const storage = vi.hoisted(() => {
  const data = new Map<string, string>();
  const stub = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => { data.set(k, String(v)); },
    removeItem: (k: string) => { data.delete(k); },
    clear: () => data.clear(),
  };
  (globalThis as { localStorage?: unknown }).localStorage = stub;
  return stub;
});
const complete = vi.hoisted(() => vi.fn());
vi.mock('../../src/store/authStore', () => ({ useAuthStore: { getState: () => ({ tenantId: 'shop' }) } }));
vi.mock('../../src/data/cloud/scanGo', () => ({ scanGoCloud: { complete } }));

import { billPhoneFor, cartToBillItems, minutesLeft, ticketCodeFromInput } from '../../src/components/scanGo/scanGoRules';
import { completeScanGoCart, flushScanGoCompletions } from '../../src/components/scanGo/scanGoBillHandover';
import type { Product } from '../../src/data/products';
import type { ScanGoCartLine } from '../../src/data/cloud/scanGo';

const product = (over: Partial<Product>): Product => ({
  product_id: 'p1', tenant_id: 't', name: 'Milk 1L', sku_barcode: '890001', item_code: null, hsn_sac_code: '0401', purchase_price: 40,
  base_price: 56, is_gst_applicable: 1, tax_rate_percent: 5, uom: 'pcs', brand_manufacturer: 'Amul', domain_attributes: null,
  discount_percent: null, discount_flat: null, offer_price: 52, billing_type: 'PIECE', grade_id: null, pricing_mode: 'FIXED_PRICE',
  is_deleted: 0,
  ...over,
} as Product);
const line = (product_id: string, quantity: number, name = product_id): ScanGoCartLine => ({ product_id, name, barcode: null, uom: null, quantity, unit_price: 999, line_total: 999 * quantity });

describe('cart to bill lines', () => {
  it('prices from the local product row (offer, tax, HSN), never from the phone estimate', () => {
    const { items, missing } = cartToBillItems({ items: [line('p1', 3)] }, [product({})]);
    expect(missing).toEqual([]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ product_id: 'p1', name: 'Milk 1L', base_price: 56, offer_price: 52, catalog_offer_price: 52, tax_rate_percent: 5, hsn_sac_code: '0401', is_gst_applicable: true, quantity: 3, purchase_price: 40 });
  });

  it('lists products this PC does not have (not synced or deleted) instead of guessing', () => {
    const { items, missing } = cartToBillItems({ items: [line('p1', 1), line('new', 2, 'New soap'), line('gone', 1)] }, [product({}), product({ product_id: 'gone', is_deleted: 1 })]);
    expect(items.map(i => i.product_id)).toEqual(['p1']);
    expect(missing.map(m => m.name)).toEqual(['New soap', 'gone']);
  });
});

describe('loyalty phone on the bill', () => {
  const cart = { customer_phone: '919876543210', customer_id: 'c-9' };
  it('uses the shop record found by customer id, then by the last 10 digits, else the sign-in number', () => {
    expect(billPhoneFor(cart, [{ customer_id: 'c-1', phone: '98765 43210' }, { customer_id: 'c-9', phone: '9876543210' }])).toBe('9876543210');
    expect(billPhoneFor(cart, [{ customer_id: 'c-1', phone: '98765 43210' }])).toBe('98765 43210');
    expect(billPhoneFor(cart, [])).toBe('919876543210');
  });
});

describe('ticket input and expiry', () => {
  it('accepts typed codes in any case and scanned ticket QR payloads', () => {
    expect(ticketCodeFromInput(' k6qa ')).toBe('K6QA');
    expect(ticketCodeFromInput('nafid://scan-go-ticket?code=K6QA')).toBe('K6QA');
    expect(ticketCodeFromInput('O0I1')).toBeNull();
    expect(ticketCodeFromInput('K6QAX')).toBeNull();
  });
  it('shows minutes left only for waiting carts', () => {
    const now = Date.parse('2026-11-15T10:00:00Z');
    expect(minutesLeft({ status: 'PENDING', expires_at: '2026-11-15T10:12:30Z' }, now)).toBe(13);
    expect(minutesLeft({ status: 'PENDING', expires_at: '2026-11-15T09:00:00Z' }, now)).toBe(0);
    expect(minutesLeft({ status: 'CLAIMED', expires_at: '2026-11-15T10:12:30Z' }, now)).toBeNull();
  });
});

describe('completion after checkout', () => {
  beforeEach(() => { storage.clear(); complete.mockReset(); });

  it('keeps a failed completion and retries it; retains refused confirmations for reconciliation', async () => {
    complete.mockRejectedValueOnce(new Error('Failed to fetch'));
    expect(await completeScanGoCart('cart-1', 'inv-1', '101', 'shop')).toBe(false);
    complete.mockRejectedValueOnce(new Error('Failed to fetch'));
    await flushScanGoCompletions('shop');
    expect(JSON.parse(storage.getItem('scanGoPendingCompletions:shop') || '[]')).toHaveLength(1);
    complete.mockResolvedValueOnce({});
    await flushScanGoCompletions('shop');
    expect(complete).toHaveBeenLastCalledWith('cart-1', { invoice_id: 'inv-1', invoice_number: '101' });
    expect(JSON.parse(storage.getItem('scanGoPendingCompletions:shop') || '[]')).toHaveLength(0);

    complete.mockRejectedValueOnce(new Error('offline'));
    await completeScanGoCart('cart-2', 'inv-2', null, 'shop');
    complete.mockRejectedValueOnce(new Error('This cart is no longer waiting. Refresh the list.'));
    await flushScanGoCompletions('shop');
    expect(JSON.parse(storage.getItem('scanGoPendingCompletions:shop') || '[]')).toHaveLength(1);
  });

  it('reports success when the cloud confirms', async () => {
    complete.mockResolvedValueOnce({});
    expect(await completeScanGoCart('cart-3', 'inv-3', '7', 'shop')).toBe(true);
    expect(JSON.parse(storage.getItem('scanGoPendingCompletions:shop') || '[]')).toEqual([]);
  });
});
