/** Restaurant mode pure rules: KOT routing / text, order-time price, service charge, add-ons, order → cart, guest check. */
import { afterEach, describe, expect, it } from 'vitest';
import { buildKotText, routeToStations, stationForCategory, type KotStation } from '../../electron/services/restaurantKot';
import { deliveryChannels, groupsForProduct, menuUnitPrice, serviceChargeMode, modifierChoiceError, orderToCartItems, orderValue, parseServiceChargeSetting,
  serviceChargeAmount, DEFAULT_SERVICE_CHARGE } from '../../src/components/restaurant/restaurantRules';
import { guestCheckTotals } from '../../src/components/restaurant/guestCheck';
import { buildCheckoutLines } from '../../src/utils/pricing/checkoutLines';
import { setStoreCountry, setStoreVatInclusive } from '../../src/utils/localization/storeProfile';
import type { ModifierGroup, OrderLine } from '../../src/data/restaurant';

afterEach(() => { setStoreCountry('IN'); setStoreVatInclusive(false); });

const stations: KotStation[] = [
  { station_id: 'g', name: 'Grill', categories: ['Grill', 'Shawarma'], is_default: false },
  { station_id: 'j', name: 'Juice bar', categories: ['juices'], is_default: false },
  { station_id: 'k', name: 'Kitchen', categories: [], is_default: true },
];

describe('KOT routing and text', () => {
  it('routes by category (case-insensitive), else the default, else the first station', () => {
    expect(stationForCategory('JUICES', stations)?.name).toBe('Juice bar');
    expect(stationForCategory('Drinks', stations)?.name).toBe('Kitchen');
    expect(stationForCategory(null, stations.slice(0, 2))?.name).toBe('Grill');
    expect(stationForCategory('Grill', [])).toBeNull();
    const groups = routeToStations([{ category: 'Grill', n: 1 }, { category: 'Juices', n: 2 }, { category: 'Shawarma', n: 3 }], stations);
    expect(groups.map(g => [g.station?.name, g.items.map(i => i.n)])).toEqual([['Grill', [1, 3]], ['Juice bar', [2]]]);
  });

  it('prints table, covers, waiter, quantities, add-ons and notes without prices; VOID and REPRINT are marked', () => {
    const header = { kotNo: 'POS1-7', kind: 'NEW' as const, stationName: 'Grill', orderNo: 'POS1-3', orderType: 'DINE_IN', tableLabel: 'T5', covers: 4, waiterName: 'Ali', time: '19:05' };
    const text = buildKotText(header, [{ name: 'Mixed grill platter with extra hummus and bread', quantity: 2, modifiers: [{ name: 'Spicy' }], note: 'no onion', seat: 2 }], 32);
    expect(text).toContain('KOT POS1-7  GRILL');
    expect(text).toContain('TABLE T5  (4 pax)');
    expect(text).toContain('Waiter: Ali');
    expect(text).toContain('+ Spicy');
    expect(text).toContain('* no onion');
    expect(text).not.toMatch(/AED|₹/);
    expect(text.split('\n').every(l => l.length <= 32)).toBe(true);
    expect(buildKotText({ ...header, kind: 'VOID' }, [{ name: 'Tea', quantity: 1, modifiers: [] }])).toMatch(/\*\*\* VOID \*\*\*[\s\S]*-1 x Tea/);
    expect(buildKotText({ ...header, kind: 'REPRINT', orderType: 'DELIVERY', channel: 'TALABAT', channelRef: 'TB-1' }, [])).toMatch(/REPRINT[\s\S]*DELIVERY #POS1-3[\s\S]*TALABAT TB-1/);
  });
});

describe('prices, service charge and add-ons', () => {
  it('captures the order-time price with the catalog offer or discount (canonical line rule)', () => {
    const base = { base_price: 20, pricing_mode: 'FIXED', grade_rate: null, discount_percent: null, discount_flat: null, offer_price: null };
    expect(menuUnitPrice(base)).toBe(20);
    expect(menuUnitPrice({ ...base, offer_price: 15 })).toBe(15);
    expect(menuUnitPrice({ ...base, discount_percent: 10 })).toBe(18);
  });

  it('applies the service charge only when enabled and for the configured order types', () => {
    const setting = parseServiceChargeSetting(JSON.stringify({ enabled: true, percent: 10, orderTypes: ['DINE_IN'] }));
    expect(serviceChargeAmount(123.45, setting, 'DINE_IN')).toBe(12.35);
    expect(serviceChargeAmount(123.45, setting, 'TAKEAWAY')).toBe(0);
    expect(serviceChargeAmount(100, DEFAULT_SERVICE_CHARGE, 'DINE_IN')).toBe(0);
    expect(parseServiceChargeSetting('nonsense')).toEqual(DEFAULT_SERVICE_CHARGE);
    expect(parseServiceChargeSetting({ enabled: true, percent: 500 }).percent).toBe(10);
  });

  it('offers add-on groups by product or category and enforces their limits', () => {
    const groups = [
      { group_id: 'spice', name: 'Spice level', min_select: 1, max_select: 1, categories: '["Shawarma"]', product_ids: '[]' },
      { group_id: 'extra', name: 'Extras', min_select: 0, max_select: 2, categories: '[]', product_ids: '["p1"]' },
    ] as ModifierGroup[];
    expect(groupsForProduct({ product_id: 'p1', category: 'shawarma' }, groups).map(g => g.group_id)).toEqual(['spice', 'extra']);
    expect(groupsForProduct({ product_id: 'p2', category: 'Juices' }, groups)).toEqual([]);
    expect(modifierChoiceError(groups, [])).toBe('Spice level: choose 1');
    expect(modifierChoiceError(groups, [{ group_id: 'spice' }, { group_id: 'extra' }, { group_id: 'extra' }, { group_id: 'extra' }])).toBe('Extras: choose up to 2');
    expect(modifierChoiceError(groups, [{ group_id: 'spice' }])).toBeNull();
  });
});

const line = (over: Partial<OrderLine>): OrderLine => ({
  line_id: Math.random().toString(36), tenant_id: 't', order_id: 'o', product_id: 'p1', name: 'Shawarma', category: 'Shawarma',
  quantity: 1, unit_price: 10, tax_rate: 5, modifiers: '[]', note: null, seat: null, station_id: null, kot_id: 'k', status: 'ACTIVE',
  void_reason: null, voided_by: null, voided_at: null, void_kot_id: null, moved_from_line_id: null, created_by: null, created_at: '', ...over,
});

describe('order → billing cart', () => {
  const ctx = (percent = 10, enabled = true) => ({
    products: { p1: { product_id: 'p1', name: 'Chicken shawarma', purchase_price: 4, billing_type: 'PIECE', uom: 'pcs', hsn_sac_code: null, tax_rate_percent: 5, sku_barcode: null } },
    serviceCharge: { ...DEFAULT_SERVICE_CHARGE, enabled, percent },
  });

  it('sums a product into one line at the quantity-weighted price; add-ons and charges are taxed lines without stock', () => {
    const lines = [
      line({ quantity: 2, unit_price: 10, modifiers: JSON.stringify([{ modifier_id: 'cheese', name: 'Extra cheese', price: 2, tax_rate: 5 }, { modifier_id: 'nog', name: 'No garlic', price: 0, tax_rate: 0 }]) }),
      line({ quantity: 1, unit_price: 11 }),
      line({ quantity: 5, unit_price: 10, status: 'VOIDED', void_reason: 'Wrong item entered' }),
      line({ product_id: 'p9', name: 'Tea', quantity: 1, unit_price: 3, tax_rate: 5 }),
    ];
    expect(orderValue(lines)).toBe(38);
    const cart = orderToCartItems({ order_type: 'DINE_IN', delivery_fee: 0 }, lines, ctx());
    expect(cart.map(i => [i.product_id, i.name, Number(i.quantity), Number(i.base_price.toFixed(4)), Boolean(i.isServiceItem)])).toEqual([
      ['p1', 'Chicken shawarma', 3, 10.3333, false],
      ['p9', 'Tea', 1, 3, false],
      ['rst-mod-cheese', '+ Extra cheese', 2, 2, false],
      ['rst-service-charge', 'Service charge 10%', 1, 3.8, false],
    ]);
    expect(cart.slice(2).map(i => i.tax_rate_percent)).toEqual([5, 5]);
    const p1 = cart[0];
    expect(Number(p1.quantity) * p1.base_price).toBeCloseTo(31, 10);
  });

  it('adds the delivery fee and no service charge on takeaway / delivery by default', () => {
    const cart = orderToCartItems({ order_type: 'DELIVERY', delivery_fee: 7 }, [line({})], ctx());
    expect(cart.map(i => i.product_id)).toEqual(['p1', 'rst-delivery-fee']);
  });

  it('UAE, VAT-inclusive prices: VAT 5% is extracted from items and from the service charge (checkout line rule)', () => {
    setStoreCountry('AE'); setStoreVatInclusive(true);
    const cart = orderToCartItems({ order_type: 'DINE_IN', delivery_fee: 0 }, [line({ quantity: 2, unit_price: 21 })], ctx());
    const lines = buildCheckoutLines(cart, { invoiceType: 'GST', supplyType: 'INTRA', bosTaxRatePercent: 0, bosTaxInclusive: false, pcsSnapshot: {}, newId: () => 'x' });
    expect(lines.map(l => [l.name, l.total, l.tax_amount])).toEqual([['Chicken shawarma', 40, 2], ['Service charge 10%', 4, 0.2]]);
    expect(guestCheckTotals(cart)).toEqual({ net: 44, tax: 2.2, total: 46.2 });
  });

  it('India: GST (CGST + SGST) applies to add-ons, the service charge and the delivery fee, not only to food', () => {
    setStoreCountry('IN');
    const lines = [line({ quantity: 2, unit_price: 100, tax_rate: 5, modifiers: JSON.stringify([{ modifier_id: 'cheese', name: 'Extra cheese', price: 20, tax_rate: 5 }]) })];
    const cart = orderToCartItems({ order_type: 'DINE_IN', delivery_fee: 30 }, lines, ctx());
    const out = buildCheckoutLines(cart, { invoiceType: 'GST', supplyType: 'INTRA', bosTaxRatePercent: 0, bosTaxInclusive: false, pcsSnapshot: {}, newId: () => 'x' });
    const r2 = (n: number) => Math.round(n * 100) / 100; // the line rule keeps tax_amount unrounded; CGST / SGST are rounded
    expect(out.map(l => [l.name, l.quantity, l.total, r2(l.tax_amount), l.cgst_amount, l.sgst_amount])).toEqual([
      ['Chicken shawarma', 2, 200, 10, 5, 5],
      ['+ Extra cheese', 2, 40, 2, 1, 1],
      ['Service charge 10%', 1, 24, 1.2, 0.6, 0.6],
      ['Delivery fee', 1, 30, 1.5, 0.75, 0.75],
    ]);
    expect(guestCheckTotals(cart)).toEqual({ net: 294, tax: 14.7, total: 308.7 });
  });

  it('India asks the guest before a service charge; the UAE adds it; app lists follow the country', () => {
    expect(serviceChargeMode(false)).toBe('ask');
    expect(serviceChargeMode(true)).toBe('automatic');
    const lines = [line({ quantity: 1, unit_price: 100 })];
    expect(orderToCartItems({ order_type: 'DINE_IN', delivery_fee: 0 }, lines, { ...ctx(), applyServiceCharge: false }).map(i => i.product_id)).toEqual(['p1']);
    expect(deliveryChannels(false)).toEqual(['OWN', 'SWIGGY', 'ZOMATO', 'OTHER']);
    expect(deliveryChannels(true)).toContain('TALABAT');
    expect(parseServiceChargeSetting({ enabled: true }).taxRate).toBe(5);
  });

  it('UAE, VAT-exclusive prices: VAT is added on top of items and the service charge', () => {
    setStoreCountry('AE'); setStoreVatInclusive(false);
    const cart = orderToCartItems({ order_type: 'DINE_IN', delivery_fee: 0 }, [line({ quantity: 1, unit_price: 100 })], ctx());
    expect(guestCheckTotals(cart)).toEqual({ net: 110, tax: 5.5, total: 115.5 });
  });
});
