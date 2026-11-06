import type { Product } from '../../data/products';
import { variantAttributes } from '../inventory/variantProducts';

export interface VariantCatalogRow {
  product: Product;
  parent?: Product;
  name: string;
}

/** Keep unlinked children visible so catalog issues cannot hide sellable stock. */
export function buildVariantRows(products: Product[]): VariantCatalogRow[] {
  const byId = new Map(products.map(product => [product.product_id, product]));
  return products.flatMap(product => {
    const attributes = variantAttributes(product.domain_attributes);
    if (typeof attributes.parent_product_id !== 'string' || !attributes.parent_product_id) return [];
    return [{ product, parent: byId.get(attributes.parent_product_id), name: String(attributes.variant_name || product.name) }];
  }).sort((a, b) => (a.parent?.name || a.product.name).localeCompare(b.parent?.name || b.product.name, undefined, { numeric: true }) || a.name.localeCompare(b.name, undefined, { numeric: true }));
}

export function filterVariantRows(rows: VariantCatalogRow[], search: string, category: string, variant: string, productId: string): VariantCatalogRow[] {
  const query = search.trim().toLowerCase();
  return rows.filter(row => (!category || (row.parent?.category || row.product.category) === category) &&
    (!variant || row.name.toLowerCase() === variant) && (!productId || row.parent?.product_id === productId) &&
    `${row.parent?.name || ''} ${row.name} ${row.product.name} ${row.product.sku_barcode || ''} ${row.parent?.sku_barcode || ''}`.toLowerCase().includes(query));
}
