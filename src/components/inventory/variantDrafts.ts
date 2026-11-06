import { v4 as uuidv4 } from 'uuid';
import type { Product } from '../../data/products';
import { DEFAULT_FORM } from './inventoryUtils';
import { variantAttributes, type ProductVariantItem } from './variantProducts';

export function variantParentForm(product: Product): typeof DEFAULT_FORM {
  const attributes = variantAttributes(product.domain_attributes);
  return { ...DEFAULT_FORM, name: product.name, purchase_price: product.purchase_price ?? '',
    base_price: product.base_price ?? '', reorder_level: product.reorder_level ?? '', uom: product.uom || 'Pcs',
    domain_attributes: attributes, gst_purchase_price: Number(attributes.paper_purchase_price ?? attributes.gst_purchase_price) || '',
    is_gst_applicable: Boolean(product.is_gst_applicable), tax_rate_percent: product.tax_rate_percent ?? 0 };
}

export function createVariantDraft(form: typeof DEFAULT_FORM): ProductVariantItem {
  return { id: uuidv4(), variant_name: '', sku_barcode: uuidv4().replaceAll('-', '').slice(0, 12).toUpperCase(),
    purchase_price: form.purchase_price, base_price: form.base_price, offer_price: '', discount_percent: '', discount_flat: '',
    current_stock: '0', reorder_level: form.reorder_level, paper_purchase_price: form.gst_purchase_price,
    paper_mrp: form.domain_attributes.paper_mrp ?? '', paper_stock: '0', tierPrices: {}, uom: form.uom };
}
