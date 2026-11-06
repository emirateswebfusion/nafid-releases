import { PRODUCT_HEADER_MAP, resolveDynamicTierName, type ParsedRow } from './dataUploadTypes';

/** Reject malformed numbers rather than silently truncating them or replacing them with zero. */
export function importNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
  const text = String(value ?? '').trim().replace(/^(?:₹|\$|€|£|AED\s*|INR\s*)/i, '').trim();
  if (!/^[+-]?(?:\d+|\d{1,3}(?:,\d{3})+|\d{1,2}(?:,\d{2})*,\d{3})(?:\.\d+)?$/.test(text)) return NaN;
  return Number(text.replace(/,/g, ''));
}

export function parseProductRows(rows: Record<string, unknown>[], tiers: Array<{ name: string }>): ParsedRow[] {
  const seen = new Map<string, number>();
  return rows.filter(row => Object.values(row).some(v => String(v ?? '').trim())).map((row, index) => {
    const fields: Record<string, unknown> = {};
    const errors: string[] = [];
    for (const [header, value] of Object.entries(row)) {
      const key = header.replace(/^\uFEFF/, '').trim().toLowerCase().replace(/_/g, ' ');
      const field = PRODUCT_HEADER_MAP[key];
      if (field) fields[field] = value;
    }
    const text = (key: string, fallback = '') => String(fields[key] ?? fallback).trim();
    const number = (key: string, label: string, fallback: number, min = 0, max = Infinity) => {
      const raw = String(fields[key] ?? '').trim();
      const value = raw === '' ? fallback : importNumber(key.endsWith('percent') ? raw.replace(/%$/, '').trim() : fields[key]);
      if (!Number.isFinite(value)) errors.push(`${label} must be a valid number`);
      else if (value < min || value > max) errors.push(max === Infinity ? `${label} must be at least ${min}` : `${label} must be between ${min} and ${max}`);
      return value;
    };
    const name = text('name');
    if (!name) errors.push('Name is required');
    const base_price = number('base_price', 'MRP', NaN);
    if (base_price === 0) errors.push('MRP must be greater than 0');
    const tier_prices: Record<string, number> = {};
    for (const [header, value] of Object.entries(row)) {
      const normalized = header.trim().toLowerCase().replace(/_/g, ' ');
      if (PRODUCT_HEADER_MAP[normalized] || String(value ?? '').trim() === '') continue;
      const tier = resolveDynamicTierName(header, tiers);
      if (!tier) continue;
      const price = importNumber(value);
      if (!Number.isFinite(price) || price < 0) errors.push(`${header}: tier price must be a non-negative number`);
      else tier_prices[tier] = price;
    }
    const hsn_sac_code = text('hsn_sac_code');
    const tax_rate_percent = number('tax_rate_percent', 'Tax rate', 0, 0, 100);
    const gst = text('is_gst_applicable').toUpperCase();
    if (gst && !['YES', 'NO', 'TRUE', 'FALSE', '1', '0'].includes(gst)) errors.push('GST applicable must be YES or NO');
    const billingType = text('billing_type').toUpperCase();
    if (billingType && !['PIECE', 'WEIGHT'].includes(billingType)) errors.push('Billing type must be PIECE or WEIGHT');
    const data = {
      name, base_price, purchase_price: number('purchase_price', 'Purchase price', 0),
      current_stock: number('current_stock', 'Stock', 0, -Infinity),
      reorder_level: number('reorder_level', 'Low stock', 0), tax_rate_percent,
      sku_barcode: text('sku_barcode'), item_code: text('item_code'), category: text('category'),
      brand_manufacturer: text('brand_manufacturer'), uom: text('uom', 'Pcs') || 'Pcs', hsn_sac_code,
      is_gst_applicable: hsn_sac_code || ['YES', 'TRUE', '1'].includes(gst) || (!gst && tax_rate_percent > 0) ? 1 : 0,
      discount_percent: number('discount_percent', 'Discount %', 0, 0, 100),
      discount_flat: number('discount_flat', 'Discount amount', 0),
      offer_price: text('offer_price') === '' ? null : number('offer_price', 'Offer price', 0),
      tier_prices, billing_type: billingType || undefined,
      paper_stock: text('paper_stock') === '' ? undefined : number('paper_stock', 'Paper stock', 0, -Infinity),
      gst_purchase_price: text('gst_purchase_price') === '' ? undefined : number('gst_purchase_price', 'Paper purchase', 0),
      paper_mrp: text('paper_mrp') === '' ? undefined : number('paper_mrp', 'Paper MRP', 0),
    };
    for (const key of [data.sku_barcode ? `barcode:${data.sku_barcode}` : '', data.item_code ? `code:${data.item_code}` : '',
      `name:${name.toLowerCase()}|${data.brand_manufacturer.toLowerCase()}`].filter(Boolean)) {
      const previous = seen.get(key);
      if (previous !== undefined) errors.push(`Duplicate product identity; also used in data row ${previous + 1}`);
      else seen.set(key, index);
    }
    return { id: String(index), data, errors, isValid: errors.length === 0 };
  });
}
