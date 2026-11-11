import { getCurrencyPrefix } from '../../../../utils/localization/storeProfile';
import { Tag } from 'lucide-react';
import type { InventoryFormViewProps } from '../InventoryFormView';

export interface DiscountSectionProps {
  formData: InventoryFormViewProps['formData'];
  handleDiscountFlatChange: (v: string) => void;
  handleDiscountPercentChange: (v: string) => void;
  handleOfferPriceChange: (v: string) => void;
}

/** Product form section 3: discount and offer price. */
export function DiscountSection({
  formData, handleDiscountFlatChange, handleDiscountPercentChange, handleOfferPriceChange,
}: DiscountSectionProps) {
  const hasOffer = formData.offer_price !== '' && formData.offer_price != null;
  return (
    <section className="bg-card border border-border rounded-[28px] p-6 shadow-sm transition-all duration-300">
      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border">
        <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-500">
          <Tag className="w-4 h-4" />
        </div>
        <span className="text-xs font-black text-blue-500 uppercase tracking-wider">3. Discount & Offers</span>
      </div>
      <div className="grid grid-cols-2 gap-6">
        {/* Discount Block */}
        <div className="space-y-3 bg-muted/10 p-4 rounded-xl border border-border">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-foreground">Discount</h4>
            <span className="text-xs text-muted-foreground">Applies to MRP</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Percentage (%)</label>
              <input
                type="number"
                step="any"
                onWheel={e => (e.target as HTMLInputElement).blur()}
                value={formData.discount_percent ?? ''}
                onChange={e => handleDiscountPercentChange(e.target.value)}
                disabled={hasOffer}
                className="w-full bg-background border border-border rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm disabled:opacity-50 no-spinners text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Flat Amount ({getCurrencyPrefix()})</label>
              <input
                type="number"
                step="any"
                onWheel={e => (e.target as HTMLInputElement).blur()}
                value={formData.discount_flat ?? ''}
                onChange={e => handleDiscountFlatChange(e.target.value)}
                disabled={hasOffer}
                className="w-full bg-background border border-border rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm disabled:opacity-50 no-spinners text-sm"
              />
            </div>
          </div>
        </div>

        {/* Offer Block */}
        <div className="space-y-3 bg-muted/10 p-4 rounded-xl border border-border">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-foreground">Offer</h4>
            <span className="text-xs text-muted-foreground">Overrides MRP</span>
          </div>
          <div>                      <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Final Offer Price ({getCurrencyPrefix()})</label>
            <input
              type="number"
              step="any"
              onWheel={e => (e.target as HTMLInputElement).blur()}
              value={formData.offer_price ?? ''}
              onChange={e => handleOfferPriceChange(e.target.value)}
              disabled={!!formData.discount_percent || !!formData.discount_flat}
              className="w-full bg-background border border-border rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm disabled:opacity-50 no-spinners text-sm"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
