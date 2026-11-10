/**
 * Line pricing — the single rule for the unit rate of a cart/bill line.
 *
 * Order of precedence:
 *   1. list rate (grade rate for GRADE_RATE products, else base price) — callers pass it in;
 *   2. catalog offer price / catalog flat discount / catalog percent discount;
 *   3. an ad-hoc cashier adjustment (offer price, flat, percent) that differs from the catalog value.
 * The result is never negative.
 *
 * Sales lower the rate with discounts. Scrap lines are purchases from the customer, so the same
 * "discount" fields RAISE the rate (kind = 'scrap').
 */
import { parseAmount } from './money';

export interface PricedLine {
  base_price?: number | string | null;
  pricing_mode?: string | null;
  grade_rate?: number | string | null;
  catalog_offer_price?: number | null;
  catalog_discount_flat?: number | null;
  catalog_discount_percent?: number | null;
  offer_price?: number | null;
  discount_flat?: number | null;
  discount_percent?: number | null;
}

export type PriceAdjustment = 'offer' | 'flat' | 'percent' | null;

export interface LinePrice {
  /** Rate after catalog offers/discounts, before ad-hoc adjustments. */
  catalogRate: number;
  /** Final unit rate (>= 0). */
  unitRate: number;
  /** Which ad-hoc adjustment applied, if any. */
  adjustment: PriceAdjustment;
}

/** Grade rate for GRADE_RATE products (when positive), otherwise the base price. */
export function listRate(item: PricedLine): number {
  const grade = parseAmount(item.grade_rate) ?? 0;
  return item.pricing_mode === 'GRADE_RATE' && item.grade_rate != null && grade > 0 ? grade : (parseAmount(item.base_price) ?? 0);
}

export function resolveLinePrice(item: PricedLine, rate: number, kind: 'sale' | 'scrap' = 'sale'): LinePrice {
  const dir = kind === 'scrap' ? 1 : -1;
  const catalogRate = item.catalog_offer_price != null ? Number(item.catalog_offer_price)
    : item.catalog_discount_flat != null ? rate + dir * Number(item.catalog_discount_flat)
    : item.catalog_discount_percent != null ? rate * (1 + dir * Number(item.catalog_discount_percent) / 100)
    : rate;

  let adjustment: PriceAdjustment = null;
  let unitRate = catalogRate;
  if (item.offer_price != null && item.offer_price !== item.catalog_offer_price) {
    adjustment = 'offer';
    unitRate = Number(item.offer_price);
  } else if (item.discount_flat != null && item.discount_flat !== item.catalog_discount_flat) {
    adjustment = 'flat';
    unitRate = catalogRate + dir * Number(item.discount_flat);
  } else if (item.discount_percent != null && item.discount_percent !== item.catalog_discount_percent) {
    adjustment = 'percent';
    unitRate = catalogRate * (1 + dir * Number(item.discount_percent) / 100);
  }
  return { catalogRate, unitRate: Math.max(unitRate, 0), adjustment };
}
