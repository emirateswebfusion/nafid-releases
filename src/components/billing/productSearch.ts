import { getComboStock } from '../../utils/pricing/comboStock';
import type * as B from './billingTypes';
import type { Product } from '../../data/products';
import { sortProductsBySearchPriority, cleanSearchText } from '../../utils/pricing/productSort';

/** A product search row. Combos are mapped into the same list with `isCombo`. */
export type ProductSearchResult = Product & { isCombo?: boolean; combo_id?: string; pieces_per_kg?: number | null };

/** A row from the scrap category search (the channel is untyped in `global.d.ts`). */
export interface ScrapCategoryResult {
  scrap_category_id: string;
  name: string;
  unit?: string | null;
  purchase_price?: number | null;
  rate?: number | null;
  selling_price?: number | null;
}

export interface ProductSearchOptions {
  invoiceType: string;
  /** Paper-only products (marked PAPER, no stock, no shop price) are hidden unless this is on... */
  enableRealPaperStock: boolean;
  /** ...and the per-invoice-type setting allows them. */
  showPaperInGstSetting: boolean;
  showPaperInEstSetting: boolean;
}

/**
 * The billing search dropdown: in-stock combos and products first, then out-of-stock items, at most 50 rows.
 * A product matches when barcode, item code, name, brand, category or HSN contain the whole query (as typed,
 * without spaces, or without special characters), or when every query word matches. Only one service-charge row.
 */
export function buildProductSearchResults(
  products: unknown,
  combos: unknown,
  trimmed: string,
  { invoiceType, enableRealPaperStock, showPaperInGstSetting, showPaperInEstSetting }: ProductSearchOptions,
): ProductSearchResult[] {
  const comboResults = (Array.isArray(combos) ? combos : []).map((c) => ({
    product_id: c.combo_id,
    name: c.name,
    sku_barcode: c.sku_barcode || '',
    item_code: c.sku_barcode || '',
    base_price: c.combo_price,
    purchase_price: 0,
    current_stock: getComboStock(c.items),
    uom: 'Combo',
    billing_type: 'PIECE',
    isCombo: true,
    combo_id: c.combo_id,
    combo_price: c.combo_price,
    combo_items: c.items,
    description: c.description,
  }));

  const rawProducts = Array.isArray(products) ? products : [];
  const sortedProds = sortProductsBySearchPriority(rawProducts, trimmed);

  const filteredProds = sortedProds.filter(p => {
    const isPaperOnlyProduct = (() => {
      try {
        const da = typeof p.domain_attributes === 'string' ? JSON.parse(p.domain_attributes) : p.domain_attributes;
        const isMarkedPaper = Boolean(da && da.gst_type === 'PAPER');
        const hasRealStock = Number(p.current_stock || 0) > 0;
        const hasRealPricing = (Number(p.base_price || 0) > 0) || (Number(p.purchase_price || 0) > 0);
        // A product is only paper-only if it is marked PAPER and has neither real stock nor real shop pricing.
        // If it has real shop pricing or real stock, it is a real product in the shop (even if currently Out of Stock).
        return isMarkedPaper && !hasRealStock && !hasRealPricing;
      } catch { return false; }
    })();

    if (isPaperOnlyProduct) {
      if (!enableRealPaperStock) return false;
      if (invoiceType === 'GST' && !showPaperInGstSetting) {
        return false;
      }
      if (invoiceType !== 'GST' && !showPaperInEstSetting) {
        return false;
      }
    }

    const q = trimmed.toLowerCase();
    if (!q) return false;
    const qNoSpace = q.replace(/\s+/g, '');
    const qClean = cleanSearchText(q);
    const qWords = q.split(/[^\p{L}\p{N}]+/gu).filter(w => w.length > 0);

    const rawFields = [
      String(p.sku_barcode || '').toLowerCase(),
      String(p.item_code || '').toLowerCase(),
      String(p.name || '').toLowerCase(),
      String(p.brand_manufacturer || '').toLowerCase(),
      String(p.category || '').toLowerCase(),
      String(p.hsn_sac_code || '').toLowerCase(),
    ];

    const fieldsData = rawFields.map(val => ({
      raw: val,
      noSpace: val.replace(/\s+/g, ''),
      clean: cleanSearchText(val),
    }));

    const combinedRaw = rawFields.join(' ');
    const combinedNoSpace = combinedRaw.replace(/\s+/g, '');
    const combinedClean = cleanSearchText(combinedRaw);

    // 1. Direct full query matches (raw, no-space, or special-char-clean)
    if (
      combinedRaw.includes(q) ||
      (qNoSpace.length > 0 && combinedNoSpace.includes(qNoSpace)) ||
      (qClean.length > 0 && combinedClean.includes(qClean))
    ) {
      return true;
    }

    // 2. All query words match across product fields
    const isWordMatch = (w: string) => {
      const wLower = w.toLowerCase();
      const wNoSpace = wLower.replace(/\s+/g, '');
      const wClean = cleanSearchText(wLower);
      return fieldsData.some(f =>
        f.raw.includes(wLower) ||
        (wNoSpace.length > 0 && f.noSpace.includes(wNoSpace)) ||
        (wClean.length > 0 && f.clean.includes(wClean))
      ) ||
      combinedRaw.includes(wLower) ||
      (wNoSpace.length > 0 && combinedNoSpace.includes(wNoSpace)) ||
      (wClean.length > 0 && combinedClean.includes(wClean));
    };

    return qWords.length > 0 && qWords.every(isWordMatch);
  });

  const deduped: ProductSearchResult[] = [];
  let serviceFound = false;
  for (const p of filteredProds) {
    const isServiceCharge = Number(p.is_service_item) === 1 || String(p.name || '').trim().toLowerCase() === 'service charge';
    if (isServiceCharge) {
      if (serviceFound) continue;
      serviceFound = true;
    }
    deduped.push(p);
  }

  const isStocked = (item: { current_stock?: number | null; is_service_item?: number | null; name?: string | null }) =>
    Number(item.is_service_item) === 1 ||
    String(item.name || '').trim().toLowerCase() === 'service charge' ||
    Number(item.current_stock || 0) > 0;

  const inStockCombos = comboResults.filter(isStocked);
  const inStockProducts = deduped.filter(isStocked);
  const outOfStockCombos = comboResults.filter(c => !isStocked(c));
  const outOfStockProducts = deduped.filter(p => !isStocked(p));

  return [...inStockCombos, ...inStockProducts, ...outOfStockCombos, ...outOfStockProducts].slice(0, 50) as ProductSearchResult[];
}

/** A product row of the most-sold strip, as the most-sold IPC returns it (untyped). */
export type MostSoldProductRow = B.MostSoldRow;
