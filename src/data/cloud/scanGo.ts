import { cloudFetch } from './client';

/**
 * Scan & Go customer carts at the counter (cloud `/api/customer-carts`, server `routes/customerCarts.ts`).
 * A cart is the customer's request, priced by the server when sent; it is never a sale. The cashier opens it in a
 * normal bill and the POS checkout creates the invoice, then `complete` records that invoice on the cart.
 */

export type ScanGoCartStatus = 'PENDING' | 'CLAIMED' | 'COMPLETED' | 'REJECTED' | 'EXPIRED' | 'CANCELLED';

export interface ScanGoCartLine {
  product_id: string;
  name: string;
  barcode: string | null;
  uom: string | null;
  quantity: number;
  unit_price: number;
  line_total: number;
}

export interface ScanGoCart {
  id: string;
  ticket_code: string;
  ticket_qr: string;
  status: ScanGoCartStatus;
  customer_name: string | null;
  customer_phone: string;
  customer_id: string | null;
  items: ScanGoCartLine[];
  item_count: number;
  subtotal: number;
  created_at: string | null;
  expires_at: string | null;
  claimed_by: string | null;
  claimed_by_name: string | null;
  claimed_at: string | null;
  completed_at: string | null;
  invoice_id: string | null;
  invoice_number: string | null;
  reject_reason: string | null;
}

export interface ScanGoConfig {
  enabled: boolean;
  code: string | null;
  qr_payload: string | null;
  qr_svg: string | null;
}

const BASE = '/api/customer-carts';
const post = (path: string, body?: unknown) =>
  cloudFetch<{ cart: ScanGoCart }>(`${BASE}${path}`, { method: 'POST', body: JSON.stringify(body ?? {}) }).then((r) => r.cart);

export const scanGoCloud = {
  getConfig: () => cloudFetch<ScanGoConfig>(`${BASE}/config`),
  /** Owner only: an explicit on/off operation (not a Settings draft). */
  setEnabled: (enabled: boolean) => cloudFetch<ScanGoConfig>(`${BASE}/config`, { method: 'PUT', body: JSON.stringify({ enabled }) }),
  list: () => cloudFetch<{ carts: ScanGoCart[] }>(BASE).then((r) => r.carts),
  findByCode: (code: string) => cloudFetch<{ cart: ScanGoCart }>(`${BASE}/by-code/${encodeURIComponent(code)}`).then((r) => r.cart),
  claim: (cartId: string) => post(`/${encodeURIComponent(cartId)}/claim`),
  release: (cartId: string) => post(`/${encodeURIComponent(cartId)}/release`),
  complete: (cartId: string, invoice: { invoice_id: string; invoice_number: string | null }) => post(`/${encodeURIComponent(cartId)}/complete`, invoice),
  reject: (cartId: string, reason?: string) => post(`/${encodeURIComponent(cartId)}/reject`, { reason: reason ?? null }),
};
