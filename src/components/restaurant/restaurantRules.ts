import type { CartItem } from '../../store/cartStore';
import type { Product } from '../../data/products';
import { listRate, resolveLinePrice } from '../../utils/pricing/linePricing';
import { lineModifiers, type ModifierGroup, type Modifier, type OrderLine, type OrderType, type RestaurantOrder,
  parseTextList } from '../../data/restaurant';

/**
 * Restaurant mode rules (docs/architecture/restaurant-mode-design.md §6, §9): order-time menu price, service charge,
 * add-on choice limits and the mapping of an order to billing cart lines. Money and VAT stay with checkout: these
 * lines go through the normal cart, so `cartStore` / `checkoutLines` compute tax exactly as for any sale.
 */

/** Whole minutes since an ISO instant (0 for a bad value), for order and ticket ages. */
export function minutesSince(iso: string): number {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? Math.max(0, Math.floor((Date.now() - t) / 60000)) : 0;
}

/** Void / cancel reasons offered on screen (free text is allowed too); `MOVED` is reserved for moves. */
export const VOID_REASONS = ['Customer changed mind', 'Wrong item entered', 'Kitchen mistake', 'Item not available', 'Quality complaint', 'Other'];

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Unit price of a menu item at order time: the canonical line rule with the catalog offer / discount applied. */
export function menuUnitPrice(product: Pick<Product, 'base_price' | 'pricing_mode' | 'grade_rate' | 'discount_percent' | 'discount_flat' | 'offer_price'>): number {
  const line = {
    base_price: product.base_price,
    pricing_mode: product.pricing_mode,
    grade_rate: product.grade_rate,
    catalog_discount_percent: product.discount_percent ?? null,
    catalog_discount_flat: product.discount_flat ?? null,
    catalog_offer_price: product.offer_price ?? null,
  };
  return round2(resolveLinePrice(line, listRate(line)).unitRate);
}

export interface ServiceChargeSetting {
  enabled: boolean;
  percent: number;
  orderTypes: OrderType[];
  label: string;
}

export const SERVICE_CHARGE_SETTING_KEY = 'restaurant_service_charge';
export const DEFAULT_SERVICE_CHARGE: ServiceChargeSetting = { enabled: false, percent: 10, orderTypes: ['DINE_IN'], label: 'Service charge' };

export function parseServiceChargeSetting(value: unknown): ServiceChargeSetting {
  let v = value;
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch { return { ...DEFAULT_SERVICE_CHARGE }; } }
  if (!v || typeof v !== 'object') return { ...DEFAULT_SERVICE_CHARGE };
  const o = v as Record<string, unknown>;
  const percent = Number(o.percent);
  const types = Array.isArray(o.orderTypes)
    ? o.orderTypes.filter((t): t is OrderType => t === 'DINE_IN' || t === 'TAKEAWAY' || t === 'DELIVERY')
    : DEFAULT_SERVICE_CHARGE.orderTypes;
  return {
    enabled: o.enabled === true,
    percent: Number.isFinite(percent) && percent >= 0 && percent <= 100 ? percent : DEFAULT_SERVICE_CHARGE.percent,
    orderTypes: types,
    label: typeof o.label === 'string' && o.label.trim() ? o.label.trim() : DEFAULT_SERVICE_CHARGE.label,
  };
}

/** Service charge on `base` (items + priced add-ons, same price basis as the menu), 0 when it does not apply. */
export function serviceChargeAmount(base: number, setting: ServiceChargeSetting, orderType: OrderType): number {
  if (!setting.enabled || setting.percent <= 0 || !setting.orderTypes.includes(orderType) || base <= 0) return 0;
  return round2(base * setting.percent / 100);
}

/** Modifier groups offered for a product: listed by product id, or by the product's category. */
export function groupsForProduct(product: Pick<Product, 'product_id' | 'category'>, groups: ModifierGroup[]): ModifierGroup[] {
  const category = (product.category ?? '').trim().toLowerCase();
  return groups.filter(g => parseTextList(g.product_ids).includes(product.product_id)
    || (category !== '' && parseTextList(g.categories).some(c => c.trim().toLowerCase() === category)));
}

/** First problem with a modifier choice ("Spice level: choose 1"), or null when every group's limits are met. */
export function modifierChoiceError(groups: ModifierGroup[], chosen: Pick<Modifier, 'group_id'>[]): string | null {
  for (const group of groups) {
    const count = chosen.filter(m => m.group_id === group.group_id).length;
    if (count < group.min_select) return `${group.name}: choose ${group.min_select === group.max_select ? group.min_select : `at least ${group.min_select}`}`;
    if (count > group.max_select) return `${group.name}: choose up to ${group.max_select}`;
  }
  return null;
}

/** Order value on the menu price basis: active items and their priced add-ons. */
export function orderValue(lines: OrderLine[]): number {
  return round2(lines.filter(l => l.status === 'ACTIVE').reduce((sum, l) =>
    sum + l.quantity * l.unit_price + l.quantity * lineModifiers(l).reduce((s, m) => s + m.price, 0), 0));
}

export interface OrderToCartContext {
  products: Record<string, Pick<Product, 'product_id' | 'name' | 'purchase_price' | 'billing_type' | 'uom' | 'hsn_sac_code' | 'tax_rate_percent' | 'sku_barcode'>>;
  serviceCharge: ServiceChargeSetting;
  /** VAT / tax rate of service charge and delivery fee lines (UAE: 5% standard rate). */
  serviceTaxRate: number;
}

/**
 * Billing cart lines for an order. The cart keeps one line per product id, so: items of one product become one line
 * with the summed quantity at the quantity-weighted order-time price (the money is exact); priced add-ons become
 * service lines per add-on (`+ Extra cheese × 3`); then the service charge and the delivery fee. Free add-ons and
 * notes are kitchen information only.
 */
export function orderToCartItems(order: Pick<RestaurantOrder, 'order_type' | 'delivery_fee'>, lines: OrderLine[], ctx: OrderToCartContext): CartItem[] {
  const active = lines.filter(l => l.status === 'ACTIVE');
  const items = new Map<string, { name: string; quantity: number; value: number; taxRate: number }>();
  const addOns = new Map<string, { name: string; quantity: number; value: number; taxRate: number }>();
  for (const line of active) {
    const item = items.get(line.product_id) ?? { name: line.name, quantity: 0, value: 0, taxRate: line.tax_rate };
    item.quantity += line.quantity;
    item.value += line.quantity * line.unit_price;
    items.set(line.product_id, item);
    for (const m of lineModifiers(line)) {
      if (!(m.price > 0)) continue;
      const addOn = addOns.get(m.modifier_id) ?? { name: m.name, quantity: 0, value: 0, taxRate: m.tax_rate };
      addOn.quantity += line.quantity;
      addOn.value += line.quantity * m.price;
      addOns.set(m.modifier_id, addOn);
    }
  }
  const cart: CartItem[] = [];
  for (const [productId, item] of items) {
    const p = ctx.products[productId];
    const qty = Math.round(item.quantity * 1000) / 1000;
    cart.push({
      product_id: productId,
      name: p?.name ?? item.name,
      base_price: qty > 0 ? item.value / qty : 0,
      purchase_price: Number(p?.purchase_price ?? 0),
      tax_rate_percent: Number(p?.tax_rate_percent ?? item.taxRate ?? 0),
      quantity: qty,
      billing_type: p?.billing_type ?? 'PIECE',
      uom: p?.uom ?? undefined,
      pricing_mode: 'FIXED',
      hsn_sac_code: p?.hsn_sac_code ?? null,
      sku_barcode: p?.sku_barcode ?? null,
    });
  }
  const service = (id: string, name: string, amount: number, taxRate: number): CartItem => ({
    product_id: id, name, base_price: round2(amount), purchase_price: 0, tax_rate_percent: taxRate, quantity: 1,
    isServiceItem: true, pricing_mode: 'FIXED',
  });
  for (const [modifierId, addOn] of addOns) {
    const qty = Math.round(addOn.quantity * 1000) / 1000;
    cart.push(service(`rst-mod-${modifierId}`, `+ ${addOn.name} × ${qty}`, addOn.value, addOn.taxRate));
  }
  const charge = serviceChargeAmount(orderValue(active), ctx.serviceCharge, order.order_type);
  if (charge > 0) cart.push(service('rst-service-charge', `${ctx.serviceCharge.label} ${ctx.serviceCharge.percent}%`, charge, ctx.serviceTaxRate));
  if (order.delivery_fee > 0) cart.push(service('rst-delivery-fee', 'Delivery fee', order.delivery_fee, ctx.serviceTaxRate));
  return cart;
}
