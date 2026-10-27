import { describe, expect, it } from 'vitest';
import { listRate, resolveLinePrice, type PricedLine } from '../../src/utils/pricing/linePricing';

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

  it('handles boundary and extreme values (0, negative, 100% discount, large values)', () => {
    // 0 rate
    expect(resolveLinePrice({}, 0).unitRate).toBe(0);
    // Negative rate clamped to 0
    expect(resolveLinePrice({}, -50).unitRate).toBe(0);
    // 100% discount
    expect(resolveLinePrice({ discount_percent: 100 }, 250).unitRate).toBe(0);
    // > 100% discount clamped to 0
    expect(resolveLinePrice({ discount_percent: 150 }, 250).unitRate).toBe(0);
    // Offer price 0
    expect(resolveLinePrice({ offer_price: 0 }, 100)).toEqual({ catalogRate: 100, unitRate: 0, adjustment: 'offer' });
    // Negative offer price clamped to 0
    expect(resolveLinePrice({ offer_price: -10 }, 100)).toEqual({ catalogRate: 100, unitRate: 0, adjustment: 'offer' });
    // Large values
    expect(resolveLinePrice({ catalog_offer_price: 1_000_000 }, 1_200_000).unitRate).toBe(1_000_000);
  });

  it('respects precedence order among competing adjustments', () => {
    // Catalog precedence: offer > flat > percent
    const allCatalog: PricedLine = {
      catalog_offer_price: 80,
      catalog_discount_flat: 10,
      catalog_discount_percent: 50,
    };
    expect(resolveLinePrice(allCatalog, 100).catalogRate).toBe(80);

    const catalogFlatAndPct: PricedLine = {
      catalog_discount_flat: 15,
      catalog_discount_percent: 50,
    };
    expect(resolveLinePrice(catalogFlatAndPct, 100).catalogRate).toBe(85);

    // Ad-hoc precedence: offer > flat > percent
    const allAdHoc: PricedLine = {
      offer_price: 60,
      discount_flat: 20,
      discount_percent: 10,
    };
    expect(resolveLinePrice(allAdHoc, 100)).toEqual({
      catalogRate: 100,
      unitRate: 60,
      adjustment: 'offer',
    });

    const adHocFlatAndPct: PricedLine = {
      discount_flat: 25,
      discount_percent: 10,
    };
    expect(resolveLinePrice(adHocFlatAndPct, 100)).toEqual({
      catalogRate: 100,
      unitRate: 75,
      adjustment: 'flat',
    });
  });

  it('inverts flat and percent discounts for scrap purchases', () => {
    // Flat discount adds to unitRate for scrap
    expect(resolveLinePrice({ discount_flat: 20 }, 100, 'scrap')).toEqual({
      catalogRate: 100,
      unitRate: 120,
      adjustment: 'flat',
    });
    // Catalog flat discount adds to catalogRate for scrap
    expect(resolveLinePrice({ catalog_discount_flat: 15 }, 100, 'scrap')).toEqual({
      catalogRate: 115,
      unitRate: 115,
      adjustment: null,
    });
    // Offer price overrides directly without addition
    expect(resolveLinePrice({ offer_price: 140 }, 100, 'scrap')).toEqual({
      catalogRate: 100,
      unitRate: 140,
      adjustment: 'offer',
    });
  });
});

describe('listRate', () => {
  it('uses a positive grade rate for GRADE_RATE products', () => {
    expect(listRate({ pricing_mode: 'GRADE_RATE', grade_rate: 50, base_price: 40 })).toBe(50);
    expect(listRate({ pricing_mode: 'GRADE_RATE', grade_rate: 0, base_price: 40 })).toBe(40);
    expect(listRate({ base_price: '12.5' })).toBe(12.5);
  });

  it('falls back to base_price on negative or non-GRADE_RATE mode', () => {
    expect(listRate({ pricing_mode: 'GRADE_RATE', grade_rate: -5, base_price: 40 })).toBe(40);
    expect(listRate({ pricing_mode: 'STANDARD', grade_rate: 100, base_price: 40 })).toBe(40);
    expect(listRate({ base_price: null })).toBe(0);
    expect(listRate({ base_price: undefined })).toBe(0);
    expect(listRate({})).toBe(0);
  });
});
