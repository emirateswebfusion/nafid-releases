import { describe, expect, it } from 'vitest';
import { listRate, resolveLinePrice, type PricedLine } from '../../src/utils/linePricing';

/** The rule as it was copy-pasted across BillingPage/BillingCartView/cartStore before consolidation. */
function legacy(item: PricedLine, rate: number, scrap: boolean): number {
  const catalogPrice = item.catalog_offer_price != null ? Number(item.catalog_offer_price)
    : item.catalog_discount_flat != null ? (scrap ? rate + Number(item.catalog_discount_flat) : rate - Number(item.catalog_discount_flat))
    : item.catalog_discount_percent != null ? (scrap ? rate * (1 + Number(item.catalog_discount_percent) / 100) : rate * (1 - Number(item.catalog_discount_percent) / 100))
    : rate;
  const isAdhocOffer = item.offer_price != null && item.offer_price !== item.catalog_offer_price;
  const isAdhocDiscFlat = item.discount_flat != null && (item.catalog_discount_flat == null || item.discount_flat !== item.catalog_discount_flat);
  const isAdhocDiscPct = item.discount_percent != null && (item.catalog_discount_percent == null || item.discount_percent !== item.catalog_discount_percent);
  let effective = catalogPrice;
  if (isAdhocOffer) effective = Number(item.offer_price);
  else if (isAdhocDiscFlat) effective = scrap ? catalogPrice + Number(item.discount_flat) : catalogPrice - Number(item.discount_flat);
  else if (isAdhocDiscPct) effective = scrap ? catalogPrice * (1 + Number(item.discount_percent) / 100) : catalogPrice * (1 - Number(item.discount_percent) / 100);
  return Math.max(effective, 0);
}

describe('resolveLinePrice', () => {
  it('applies catalog offers then ad-hoc adjustments', () => {
    expect(resolveLinePrice({ catalog_discount_percent: 10 }, 200).unitRate).toBe(180);
    expect(resolveLinePrice({ catalog_offer_price: 150, discount_flat: 20 }, 200)).toEqual({ catalogRate: 150, unitRate: 130, adjustment: 'flat' });
    expect(resolveLinePrice({ offer_price: 99, catalog_offer_price: 99 }, 120)).toEqual({ catalogRate: 99, unitRate: 99, adjustment: null });
  });
  it('never returns a negative rate', () => {
    expect(resolveLinePrice({ discount_flat: 500 }, 100).unitRate).toBe(0);
  });
  it('raises the rate for scrap purchases', () => {
    expect(resolveLinePrice({ discount_percent: 10 }, 100, 'scrap').unitRate).toBeCloseTo(110);
  });
  it('matches the legacy copy-pasted rule bit-for-bit on random inputs', () => {
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const maybe = (v: number) => (rnd() < 0.5 ? null : Math.round(v * 100) / 100);
    for (let i = 0; i < 5000; i++) {
      const item: PricedLine = {
        catalog_offer_price: rnd() < 0.2 ? maybe(rnd() * 500) : null,
        catalog_discount_flat: maybe(rnd() * 50),
        catalog_discount_percent: maybe(rnd() * 30),
        offer_price: rnd() < 0.3 ? maybe(rnd() * 500) : null,
        discount_flat: maybe(rnd() * 50),
        discount_percent: maybe(rnd() * 30),
      };
      const rate = Math.round(rnd() * 100000) / 100;
      for (const scrap of [false, true]) {
        expect(resolveLinePrice(item, rate, scrap ? 'scrap' : 'sale').unitRate).toBe(legacy(item, rate, scrap));
      }
    }
  });
});

describe('listRate', () => {
  it('uses a positive grade rate for GRADE_RATE products', () => {
    expect(listRate({ pricing_mode: 'GRADE_RATE', grade_rate: 50, base_price: 40 })).toBe(50);
    expect(listRate({ pricing_mode: 'GRADE_RATE', grade_rate: 0, base_price: 40 })).toBe(40);
    expect(listRate({ base_price: '12.5' })).toBe(12.5);
  });
});
