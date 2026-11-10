import { listRate, resolveLinePrice } from '../../utils/pricing/linePricing';
import type { AiRow } from './types';

/** Adapt catalog fields to the existing POS pricing rule; retain explicit zero offers. */
export function catalogSellingRate(product: AiRow): number {
  return resolveLinePrice({
    ...product,
    catalog_offer_price: product.offer_price,
    catalog_discount_flat: product.discount_flat,
    catalog_discount_percent: product.discount_percent,
  }, listRate({ ...product, base_price: product.base_price ?? product.selling_price })).unitRate;
}
