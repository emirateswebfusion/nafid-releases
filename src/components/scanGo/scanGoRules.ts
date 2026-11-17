import type { CartItem } from '../../store/cartStore';
import type { Product } from '../../data/products';
import type { ScanGoCart, ScanGoCartLine, ScanGoCartStatus } from '../../data/cloud/scanGo';

/**
 * Scan & Go at the counter: turn a customer's cart into ordinary billing lines. The bill is priced by the POS from its
 * own product rows (the same fields product search adds), never from the phone's estimate, so tax, offers and
 * rounding follow the normal checkout rules.
 */

export const TICKET_QR_PREFIX = 'nafid://scan-go-ticket?code=';
const TICKET_ALPHABET = 'ACDEFGHJKLMNPQRTUVWXY3469';

/** A ticket code as typed or scanned (QR payload), or null. Mirrors nafid-server `normalizeTicketCode`. */
export function ticketCodeFromInput(raw: string): string | null {
  const value = raw.trim();
  const code = (value.startsWith(TICKET_QR_PREFIX) ? value.slice(TICKET_QR_PREFIX.length) : value).toUpperCase();
  return new RegExp(`^[${TICKET_ALPHABET}]{4}$`).test(code) ? code : null;
}

export const OPEN_STATUSES: ScanGoCartStatus[] = ['PENDING', 'CLAIMED'];
export const isOpenCart = (cart: Pick<ScanGoCart, 'status'>) => OPEN_STATUSES.includes(cart.status);

export const STATUS_LABEL: Record<ScanGoCartStatus, string> = {
  PENDING: 'Waiting', CLAIMED: 'Being billed', COMPLETED: 'Billed', REJECTED: 'Rejected', EXPIRED: 'Expired', CANCELLED: 'Cancelled by customer',
};

/** Minutes left before a waiting cart expires (0 when due), for the queue row. */
export function minutesLeft(cart: Pick<ScanGoCart, 'status' | 'expires_at'>, now = Date.now()): number | null {
  if (cart.status !== 'PENDING' || !cart.expires_at) return null;
  return Math.max(0, Math.ceil((new Date(cart.expires_at).getTime() - now) / 60_000));
}

/** One billing line per cart line, built like a product picked in search (no pricing tier). */
export function productToBillItem(product: Product, quantity: number): CartItem {
  return {
    product_id: product.product_id,
    name: product.name,
    base_price: Number(product.base_price) || 0,
    purchase_price: product.pricing_mode === 'GRADE_RATE' && product.grade_purchase_price != null ? Number(product.grade_purchase_price) : Number(product.purchase_price ?? 0),
    tax_rate_percent: Number(product.tax_rate_percent ?? 0),
    hsn_sac_code: product.hsn_sac_code || null,
    is_gst_applicable: product.is_gst_applicable !== 0,
    uom: product.uom ?? undefined,
    billing_type: product.billing_type || 'PIECE',
    grade_id: product.grade_id ?? null,
    pricing_mode: product.pricing_mode ?? undefined,
    grade_rate: product.grade_rate ?? null,
    original_pricing_mode: product.pricing_mode ?? undefined,
    original_grade_id: product.grade_id ?? null,
    discount_percent: product.discount_percent ?? null,
    discount_flat: product.discount_flat ?? null,
    offer_price: product.offer_price ?? null,
    catalog_discount_percent: product.discount_percent ?? null,
    catalog_discount_flat: product.discount_flat ?? null,
    catalog_offer_price: product.offer_price ?? null,
    sku_barcode: product.sku_barcode || null,
    item_code: product.item_code || null,
    brand_manufacturer: product.brand_manufacturer || null,
    original_base_price: Number(product.base_price) || 0,
    is_tier_overridden: false,
    quantity,
  };
}

/**
 * Billing lines for a cart from this PC's products. Lines whose product is not on this PC (not synced yet, deleted)
 * are returned in `missing`; the counter must not guess their price or tax.
 */
export function cartToBillItems(cart: Pick<ScanGoCart, 'items'>, products: Product[]): { items: CartItem[]; missing: ScanGoCartLine[] } {
  const byId = new Map(products.map((p) => [String(p.product_id), p]));
  const items: CartItem[] = [];
  const missing: ScanGoCartLine[] = [];
  for (const line of cart.items) {
    const product = byId.get(String(line.product_id));
    if (product && !Number(product.is_deleted)) items.push(productToBillItem(product, Number(line.quantity) || 1));
    else missing.push(line);
  }
  return { items, missing };
}

const digits = (value: string | null | undefined) => String(value ?? '').replace(/\D/g, '');

/**
 * The phone to put on the bill: the shop's own record of this customer when there is one (so loyalty points land on
 * that account), else the number the customer signed in with.
 */
export function billPhoneFor(cart: Pick<ScanGoCart, 'customer_phone' | 'customer_id'>, localCustomers: { customer_id: string; phone: string | null }[]): string {
  const last10 = digits(cart.customer_phone).slice(-10);
  const byId = cart.customer_id ? localCustomers.find((c) => c.customer_id === cart.customer_id && c.phone) : undefined;
  const byPhone = localCustomers.find((c) => c.phone && digits(c.phone).slice(-10) === last10);
  return (byId?.phone || byPhone?.phone || cart.customer_phone).trim();
}
