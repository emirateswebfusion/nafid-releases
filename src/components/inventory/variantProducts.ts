import { v4 as uuidv4 } from 'uuid';
import { listProducts, getProductPricing, createProduct, updateProduct, setProductPricing, type Product, type ProductWritePayload } from '../../data/products';

export interface ProductVariantItem {
  id: string;
  product_id?: string;
  originalProduct?: Product;
  variant_name: string;
  sku_barcode: string;
  purchase_price: number | string;
  base_price: number | string;
  offer_price: number | string;
  discount_percent?: number | string;
  discount_flat?: number | string;
  current_stock: number | string;
  reorder_level?: number | string;
  paper_purchase_price?: number | string;
  paper_mrp?: number | string;
  paper_stock?: number | string;
  tierPrices: Record<string, string>;
  domain_attributes?: Record<string, unknown>;
  uom?: string;
}

export function variantAttributes(raw: unknown): Record<string, unknown> {
  try {
    const parsed: unknown = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch { return {}; }
}

export async function loadVariantCatalog(tenantId: string): Promise<Product[]> {
  const products: Product[] = [];
  const limit = 500;
  for (let offset = 0; ; offset += limit) {
    const page = await listProducts({ tenant_id: tenantId, limit, offset, sortBy: 'name', sortDir: 'asc' });
    if (!Array.isArray(page)) throw new Error('Could not load the product catalog. Please retry.');
    products.push(...page);
    if (page.length < limit) return products;
  }
}

export function validateVariants(variants: ProductVariantItem[], parentBarcode = ''): string | null {
  const names = new Set<string>();
  const barcodes = new Set<string>(parentBarcode.trim() ? [parentBarcode.trim()] : []);
  for (const variant of variants) {
    const name = variant.variant_name.trim().toLowerCase();
    if (!name) return 'Enter a name for every variant.';
    if (names.has(name)) return 'Variant names must be unique within a product.';
    names.add(name);
    const barcode = variant.sku_barcode.trim();
    if (barcode && barcodes.has(barcode)) return 'The product and each variant need different barcodes.';
    if (barcode) barcodes.add(barcode);
    for (const value of [variant.purchase_price, variant.base_price, variant.offer_price, variant.discount_percent, variant.discount_flat, variant.paper_mrp, variant.paper_purchase_price, ...Object.values(variant.tierPrices)]) {
      if (value !== '' && value !== undefined && (!Number.isFinite(Number(value)) || Number(value) < 0)) return 'Variant prices must be valid non-negative numbers.';
    }
    for (const value of [variant.current_stock, variant.paper_stock, variant.reorder_level]) {
      if (value !== '' && value !== undefined && !Number.isFinite(Number(value))) return 'Variant stock must be a valid number.';
    }
  }
  return null;
}

export async function loadProductVariants(tenantId: string, parentId: string): Promise<ProductVariantItem[]> {
  const [products, prices] = await Promise.all([loadVariantCatalog(tenantId), getProductPricing(tenantId)]);
  if (!Array.isArray(prices)) throw new Error('Could not load variant tier prices. Please retry.');
  return products.filter(product => variantAttributes(product.domain_attributes).parent_product_id === parentId).map(product => {
    const attributes = variantAttributes(product.domain_attributes);
    const scalar = (value: unknown): string | number => typeof value === 'number' || typeof value === 'string' ? value : '';
    return { originalProduct: product, id: product.product_id, product_id: product.product_id,
      variant_name: String(attributes.variant_name || product.name), sku_barcode: product.sku_barcode || '',
      purchase_price: product.purchase_price ?? '', base_price: product.base_price ?? '', offer_price: product.offer_price ?? '',
      discount_percent: product.discount_percent ?? '', discount_flat: product.discount_flat ?? '',
      current_stock: product.current_stock ?? 0, reorder_level: product.reorder_level ?? '', uom: product.uom || undefined,
      paper_stock: product.paper_stock ?? scalar(attributes.paper_stock), paper_mrp: scalar(attributes.paper_mrp),
      paper_purchase_price: scalar(attributes.paper_purchase_price ?? attributes.gst_purchase_price), domain_attributes: attributes,
      tierPrices: Object.fromEntries(prices.filter(price => price.product_id === product.product_id && !price.is_deleted && price.price != null).map(price => [price.pricing_tier_id, String(price.price)])),
    };
  });
}

export async function saveProductVariants(parent: ProductWritePayload, variants: ProductVariantItem[], onCreated: (draftId: string, productId: string) => void): Promise<void> {
  for (const variant of variants) {
    const productId = variant.product_id || uuidv4();
    const optional = (value: string | number | undefined) => value === '' || value === undefined ? undefined : Number(value);
    const attributes = { ...variant.domain_attributes, parent_product_id: parent.product_id, variant_name: variant.variant_name.trim(),
      paper_stock: optional(variant.paper_stock), paper_mrp: optional(variant.paper_mrp), paper_base_price: optional(variant.paper_mrp),
      paper_purchase_price: optional(variant.paper_purchase_price), gst_purchase_price: optional(variant.paper_purchase_price) };
    const payload = { ...variant.originalProduct, product_id: productId, tenant_id: parent.tenant_id,
      name: `${String(parent.name)} (${variant.variant_name.trim()})`, sku_barcode: variant.sku_barcode.trim(),
      item_code: parent.item_code, category: parent.category, brand_manufacturer: parent.brand_manufacturer,
      uom: variant.uom || parent.uom, purchase_price: optional(variant.purchase_price) ?? Number(parent.purchase_price),
      base_price: optional(variant.base_price) ?? Number(parent.base_price), offer_price: optional(variant.offer_price) ?? null,
      discount_percent: variant.discount_percent === undefined ? variant.originalProduct?.discount_percent : optional(variant.discount_percent) ?? null,
      discount_flat: variant.discount_flat === undefined ? variant.originalProduct?.discount_flat : optional(variant.discount_flat) ?? null,
      current_stock: Number(variant.current_stock) || 0, reorder_level: optional(variant.reorder_level) ?? Number(parent.reorder_level),
      is_gst_applicable: parent.is_gst_applicable, hsn_sac_code: parent.hsn_sac_code, tax_rate_percent: parent.tax_rate_percent,
      domain_attributes: JSON.stringify(attributes), pricing_mode: variant.originalProduct?.pricing_mode || 'FIXED_PRICE' };
    const result = await (variant.product_id ? updateProduct(payload) : createProduct(payload));
    if (!result.success) throw new Error(result.error || `Could not save variant ${variant.variant_name}`);
    onCreated(variant.id, productId);
    const pricing = Object.entries(variant.tierPrices).map(([pricing_tier_id, price]) => ({ pricing_tier_id, price: price === '' ? null : Number(price) }));
    if (pricing.length) {
      const result = await setProductPricing({ tenant_id: String(parent.tenant_id), product_id: productId, pricing });
      if (!result.success) throw new Error(result.error || 'Could not save variant tier prices.');
    }
  }
}
