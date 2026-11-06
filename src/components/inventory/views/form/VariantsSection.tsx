import { Plus, Trash2 } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { useAuthStore } from '../../../../store/authStore';
import { hasPermission } from '../../../../utils/security/permissions';
import { PricingSection } from './PricingSection';
import type { InventoryFormViewProps } from '../InventoryFormView';
import type { ProductVariantItem } from '../../variantProducts';
export type { ProductVariantItem } from '../../variantProducts';

type Props = Pick<InventoryFormViewProps, 'variants' | 'setVariants' | 'enableRealPaperStock' | 'formData' | 'activePricingTiers' | 'onAddPricingTier'>;

/** Each variant uses the same pricing editor as the parent product. */
export function VariantsSection({ variants, setVariants, formData, ...pricing }: Props) {
  const user = useAuthStore();
  const canCreate = hasPermission(user, 'products.create');
  const update = (index: number, changes: Partial<ProductVariantItem>) => {
    setVariants(previous => previous.map((variant, i) => i === index ? { ...variant, ...changes } : variant));
  };
  return <div className="space-y-3">
    {variants.map((variant, index) => {
      const variantForm = { ...formData, grade_id: '',
        purchase_price: variant.purchase_price, base_price: variant.base_price,
        current_stock: variant.current_stock, reorder_level: variant.reorder_level ?? '',
        uom: variant.uom || formData.uom, gst_purchase_price: variant.paper_purchase_price ?? '',
        gst_purchase_quantity: variant.paper_stock ?? '',
        domain_attributes: { ...variant.domain_attributes, paper_mrp: variant.paper_mrp ?? '' },
      };
      return <div key={variant.id} className="rounded-[28px] border border-border bg-card p-3 space-y-3" role="group" aria-label={`Variant ${index + 1}`}>
        <div className="flex flex-wrap items-end gap-3 px-3 pt-2">
          <label className="flex-1 text-xs font-bold text-muted-foreground">Variant name / size
            <input aria-label={`Variant ${index + 1} name`} value={variant.variant_name} placeholder="e.g. S, XL, 500g"
              onChange={event => update(index, { variant_name: event.target.value })}
              className="block w-full mt-1 bg-background border border-border rounded-xl p-2.5 text-sm text-foreground" />
          </label>
          <label className="flex-1 text-xs font-bold text-muted-foreground">Barcode / SKU
            <input aria-label={`Variant ${index + 1} barcode`} value={variant.sku_barcode}
              onChange={event => update(index, { sku_barcode: event.target.value })}
              className="block w-full mt-1 bg-background border border-border rounded-xl p-2.5 text-sm text-foreground" />
          </label>
          {!variant.product_id && <button type="button" aria-label={`Remove variant ${index + 1}`} onClick={() => setVariants(previous => previous.filter((_, i) => i !== index))}
            className="p-2.5 rounded-xl text-destructive hover:bg-destructive/10 cursor-pointer"><Trash2 className="w-4 h-4" /></button>}
        </div>
        {variant.product_id && <p className="px-3 text-xs text-muted-foreground">Saved variants can be deleted from Product Variants.</p>}
        <PricingSection {...pricing} title={variant.variant_name ? `${variant.variant_name} — Inventory & Pricing` : `Variant ${index + 1} — Inventory & Pricing`} formData={variantForm}
          handleInputChange={(field, value) => update(index, { [field === 'gst_purchase_price' ? 'paper_purchase_price' : field === 'gst_purchase_quantity' ? 'paper_stock' : field]: value })}
          handleDomainAttrChange={(field, value) => update(index, field === 'paper_mrp' ? { paper_mrp: String(value ?? '') } : { domain_attributes: { ...variant.domain_attributes, [field]: value } })}
          tierPrices={variant.tierPrices}
          setTierPrices={action => update(index, { tierPrices: typeof action === 'function' ? action(variant.tierPrices) : action })} />
        <label className="block px-3 pb-3 text-xs font-bold text-muted-foreground">Offer / selling price
          <input type="number" min="0" step="0.01" aria-label={`Variant ${index + 1} selling price`} value={variant.offer_price}
            onChange={event => update(index, { offer_price: event.target.value })}
            className="block w-full mt-1 bg-background border border-border rounded-xl p-2.5 text-sm text-foreground" />
        </label>
      </div>;
    })}
    {canCreate && <button type="button" onClick={() => setVariants(previous => [...previous, {
      id: uuidv4(), variant_name: '', sku_barcode: `SKU-${uuidv4()}`,
      purchase_price: formData.purchase_price, base_price: formData.base_price,
      offer_price: '', current_stock: '0', reorder_level: formData.reorder_level,
      paper_purchase_price: formData.gst_purchase_price, paper_mrp: formData.domain_attributes.paper_mrp ?? '',
      paper_stock: '0', tierPrices: {}, uom: formData.uom,
    }])} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 cursor-pointer">
      <Plus className="w-3.5 h-3.5" />Add Variant
    </button>}
  </div>;
}
