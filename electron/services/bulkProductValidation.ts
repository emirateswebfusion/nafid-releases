import type { ProductInput } from './typesA.js';

/** Validate the whole batch before opening its transaction; never partly import a bad file. */
export function validateBulkProducts(products: ProductInput[]): void {
  const tenant = products[0]?.tenant_id;
  const seen = new Set<string>();
  for (const [index, p] of products.entries()) {
    const fail = (reason: string): never => { throw new Error(`Product row ${index + 1}: ${reason}`); };
    if (!tenant || p.tenant_id !== tenant) fail('all products must belong to the same shop');
    if (!String(p.name ?? '').trim()) fail('name is required');
    for (const [key, value] of Object.entries({ base_price: p.base_price, purchase_price: p.purchase_price,
      current_stock: p.current_stock, reorder_level: p.reorder_level, tax_rate_percent: p.tax_rate_percent,
      discount_percent: p.discount_percent, discount_flat: p.discount_flat, offer_price: p.offer_price })) {
      if (value == null && key !== 'base_price') continue;
      if (typeof value !== 'number' || !Number.isFinite(value)) fail(`${key} must be a finite number`);
      if (key !== 'current_stock' && Number(value) < 0) fail(`${key} cannot be negative`);
      if (key === 'base_price' && Number(value) <= 0) fail('MRP must be greater than zero');
      if (['discount_percent', 'tax_rate_percent'].includes(key) && Number(value) > 100) fail(`${key} cannot exceed 100`);
    }
    for (const [name, value] of Object.entries(p.tier_prices ?? {})) {
      if (!name.trim() || typeof value !== 'number' || !Number.isFinite(value) || value < 0) fail('invalid tier price');
    }
    for (const identity of [p.sku_barcode ? `barcode:${String(p.sku_barcode).trim()}` : '',
      p.item_code ? `code:${String(p.item_code).trim()}` : '',
      `name:${p.name.trim().toLowerCase()}|${String(p.brand_manufacturer ?? '').trim().toLowerCase()}`].filter(Boolean)) {
      if (seen.has(identity)) fail('duplicate product identity in this file');
      seen.add(identity);
    }
  }
}
