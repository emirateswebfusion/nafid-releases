import { X } from 'lucide-react';
import { getStoreProfile } from '../../../utils/localization/storeProfile';
import { formatCurrency } from '../../../utils/pricing/money';
import { fusionCartService } from '../../../services/fusionCartService';
import type { EcommerceState } from '../hooks/useEcommerceState';
import type { EcommerceProductItem } from '../../../services/fusionCartService';

export interface EditCatalogProductDialogProps {
  currentTenantId: string;
  /** Rendered only while a product is being edited. */
  loadProducts: () => Promise<void>;
  /** Rendered only while it is set. */
  editingProduct: EcommerceProductItem;
  ec: EcommerceState;
}

/** Edit an online catalog product's listing (price, stock, visibility, description). */
export function EditCatalogProductDialog({
  editingProduct, currentTenantId, loadProducts, ec,
}: EditCatalogProductDialogProps) {
  const { setEditingProduct } = ec;
  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-md rounded-2xl border border-border/80 bg-card p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between border-b border-border/60 pb-3">
          <div>
            <h3 className="text-sm font-bold text-foreground">Marketplace Product Overrides</h3>
            <span className="text-xs text-muted-foreground font-mono">{editingProduct.name}</span>
          </div>
          <button
            onClick={() => setEditingProduct(null)}
            className="p-1 rounded-xl hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3.5 text-xs">
          <div>
            <label className="font-semibold block mb-1 text-foreground">Online Title Override (Optional)</label>
            <input
              type="text"
              placeholder={editingProduct.name}
              defaultValue={editingProduct.online_title_override || ''}
              id="modal-online-title"
              className="w-full px-3.5 py-2 rounded-xl border border-border/80 bg-background text-xs text-foreground focus:outline-none focus:border-primary shadow-2xs"
            />
          </div>

          <div>
            <label className="font-semibold block mb-1 text-foreground">Online Price Override ({getStoreProfile().currency})</label>
            <input
              type="number"
              step="any"
              placeholder={`POS Counter Price: ${formatCurrency(editingProduct.base_price)}`}
              defaultValue={editingProduct.online_price_override !== null && editingProduct.online_price_override !== undefined ? editingProduct.online_price_override : ''}
              id="modal-online-price"
              className="w-full px-3.5 py-2 rounded-xl border border-border/80 bg-background font-mono text-xs text-foreground focus:outline-none focus:border-primary shadow-2xs"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Leave blank to inherit POS billing price ({formatCurrency(editingProduct.base_price)}).
            </p>
          </div>

          <div>
            <label className="font-semibold block mb-1 text-foreground">Online Description</label>
            <textarea
              rows={3}
              placeholder="Custom online description for web portal..."
              defaultValue={editingProduct.online_description_override || ''}
              id="modal-online-desc"
              className="w-full px-3.5 py-2 rounded-xl border border-border/80 bg-background text-xs text-foreground focus:outline-none focus:border-primary shadow-2xs"
            />
          </div>

          <div className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              id="modal-online-enable"
              defaultChecked={editingProduct.is_online_enabled === 1}
              className="rounded border-border text-primary cursor-pointer w-4 h-4"
            />
            <label htmlFor="modal-online-enable" className="font-semibold text-foreground cursor-pointer text-xs">
              Publish this product onto the FusionCart online marketplace
            </label>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-border/70">
          <button
            onClick={() => setEditingProduct(null)}
            className="px-4 py-2 rounded-xl border border-border/80 text-xs font-semibold hover:bg-muted text-foreground cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={async () => {
              const titleInput = document.getElementById('modal-online-title') as HTMLInputElement;
              const priceInput = document.getElementById('modal-online-price') as HTMLInputElement;
              const descInput = document.getElementById('modal-online-desc') as HTMLTextAreaElement;
              const enableCheck = document.getElementById('modal-online-enable') as HTMLInputElement;

              const titleVal = titleInput?.value?.trim() || null;
              const priceVal = priceInput?.value ? Number(priceInput.value) : null;
              const descVal = descInput?.value?.trim() || null;
              const enabledVal = enableCheck?.checked || false;

              await fusionCartService.updateMapping(currentTenantId, editingProduct.product_id, {
                is_online_enabled: enabledVal,
                online_title_override: titleVal,
                online_price_override: priceVal,
                online_description_override: descVal,
              });

              setEditingProduct(null);
              await loadProducts();
            }}
            className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/95 cursor-pointer shadow-xs"
          >
            Save Overrides
          </button>
        </div>
      </div>
    </div>
  );
}
