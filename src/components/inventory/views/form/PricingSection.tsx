import { localizeTaxText } from '../../../../utils/localization/storeProfile';
import { getCurrencyPrefix } from '../../../../utils/localization/storeProfile';
import React from 'react';
import { Tag, ChevronDown, Layers } from 'lucide-react';
import clsx from 'clsx';
import type { InventoryFormViewProps } from '../InventoryFormView';

export interface PricingSectionProps {
  activePricingTiers: InventoryFormViewProps['activePricingTiers'];
  enableRealPaperStock: boolean;
  formData: InventoryFormViewProps['formData'];
  handleDomainAttrChange: InventoryFormViewProps['handleDomainAttrChange'];
  handleInputChange: InventoryFormViewProps['handleInputChange'];
  setTierPrices: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  tierPrices: Record<string, string>;
}

/** Product form section 2: pricing for the real product and, when enabled, the paper product. */
export function PricingSection({
  activePricingTiers, enableRealPaperStock, formData, handleDomainAttrChange, handleInputChange, setTierPrices,
  tierPrices,
}: PricingSectionProps) {
  return (
    <section className="bg-card border border-border rounded-[28px] p-6 shadow-sm transition-all duration-300 space-y-5">
      <div className="flex items-center gap-2 pb-2 border-b border-border">
        <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500">
          <Tag className="w-4 h-4" />
        </div>
        <span className="text-xs font-black text-emerald-500 uppercase tracking-wider">2. Inventory & Pricing</span>
      </div>

      <div className="flex flex-col gap-4">
        {/* Card 1: Real Product */}
        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-4 space-y-3">
          {enableRealPaperStock && (
            <div className="flex items-center justify-between pb-2 border-b border-emerald-500/15">
              <span className="text-xs font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                Real Product (Estimate / Shop)
              </span>
              <span className="text-[10px] font-black bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 px-2.5 py-0.5 rounded-full border border-emerald-500/20 uppercase tracking-wider">
                REAL
              </span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
            <div>
              <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">
                Purchase Price ({getCurrencyPrefix()})
                {formData.grade_id && <span className="text-indigo-500 ml-1 font-normal normal-case">(grade)</span>}
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-bold text-xs">{getCurrencyPrefix()}</span>
                <input
                  type="number" step="0.01"
                  onWheel={e => (e.target as HTMLInputElement).blur()}
                  value={formData.purchase_price}
                  onChange={e => handleInputChange('purchase_price', e.target.value)}
                  className="w-full bg-background border border-border rounded-xl p-2.5 pl-7 text-foreground focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 focus:outline-none transition-all shadow-sm no-spinners text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">
                MRP ({getCurrencyPrefix()})
                {formData.grade_id && <span className="text-indigo-500 ml-1 font-normal normal-case">(grade)</span>}
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-600 dark:text-emerald-400 font-bold text-xs">{getCurrencyPrefix()}</span>
                <input
                  type="number" step="0.01"
                  onWheel={e => (e.target as HTMLInputElement).blur()}
                  value={formData.base_price}
                  onChange={e => handleInputChange('base_price', e.target.value)}
                  className="w-full bg-background border border-border rounded-xl p-2.5 pl-7 text-emerald-600 dark:text-emerald-400 font-bold focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 focus:outline-none transition-all shadow-sm no-spinners text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">
                Stock
              </label>
              <input
                type="number" step="0.01"
                onWheel={e => (e.target as HTMLInputElement).blur()}
                value={formData.current_stock}
                onChange={e => handleInputChange('current_stock', e.target.value)}
                className="w-full bg-background border border-border rounded-xl p-2.5 text-foreground focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 focus:outline-none transition-all shadow-sm no-spinners text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">
                Low Stock Alert
              </label>
              <input
                type="number" step="0.01"
                onWheel={e => (e.target as HTMLInputElement).blur()}
                value={formData.reorder_level}
                onChange={e => handleInputChange('reorder_level', e.target.value)}
                className="w-full bg-background border border-border rounded-xl p-2.5 text-foreground focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 focus:outline-none transition-all shadow-sm no-spinners text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">
                UOM (Unit)
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <select
                    value={formData.uom}
                    onChange={e => handleInputChange('uom', e.target.value)}
                    className="w-full bg-background border border-border rounded-xl p-2.5 pr-8 text-foreground focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 focus:outline-none transition-all shadow-sm text-sm font-medium appearance-none cursor-pointer"
                  >
                    {['Pcs', 'Kgs', 'Grams', 'Mtrs', 'Ltrs', 'Box', 'Dozen'].map(u => (
                      <option key={u} value={u} className="bg-background text-foreground py-1">
                        {u}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 text-muted-foreground absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
                <div className={clsx(
                  "transition-all duration-300 ease-in-out overflow-hidden flex items-center shrink-0",
                  ['Kgs', 'Grams', 'Mtrs', 'Ltrs'].includes(formData.uom)
                    ? "w-20 opacity-100 scale-100 translate-x-0 ml-0"
                    : "w-0 opacity-0 scale-90 translate-x-4 pointer-events-none -ml-2"
                )}>
                  <input
                    type="number" min="1" step="1"
                    value={formData.domain_attributes?.pcs !== undefined ? formData.domain_attributes.pcs : (formData.domain_attributes?.pcs_stock ?? '')}
                    onChange={e => handleDomainAttrChange('pcs', e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-20 bg-background border border-border rounded-xl p-2.5 text-foreground focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 focus:outline-none transition-all shadow-sm no-spinners text-sm font-medium shrink-0"
                    placeholder="Pcs"
                    title="Optional Pcs count"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Card 2: Paper Product */}
        {enableRealPaperStock && (
          <div className="bg-purple-500/5 border border-purple-500/20 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-purple-500/15">
              <span className="text-xs font-black text-purple-600 dark:text-purple-400 uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" />
                Paper Product ({localizeTaxText("GST")} Ledger)
              </span>
              <span className="text-[10px] font-black bg-purple-500/15 text-purple-600 dark:text-purple-400 px-2.5 py-0.5 rounded-full border border-purple-500/20 uppercase tracking-wider">
                PAPER {localizeTaxText("GST")}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">
                  Paper Purchase ({getCurrencyPrefix()})
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-purple-500 font-bold text-xs">{getCurrencyPrefix()}</span>
                  <input
                    type="number" step="0.01"
                    onWheel={e => (e.target as HTMLInputElement).blur()}
                    value={formData.gst_purchase_price}
                    onChange={e => handleInputChange('gst_purchase_price', e.target.value)}
                    className="w-full bg-background border border-border rounded-xl p-2.5 pl-7 text-foreground focus:border-purple-500 focus:ring-2 focus:ring-purple-500/10 focus:outline-none transition-all shadow-sm no-spinners text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1 truncate">
                  Paper MRP ({getCurrencyPrefix()})
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-purple-500 font-bold text-xs">{getCurrencyPrefix()}</span>
                  <input
                    type="number" step="0.01"
                    onWheel={e => (e.target as HTMLInputElement).blur()}
                    value={formData.domain_attributes?.paper_mrp ?? ''}
                    onChange={e => handleDomainAttrChange('paper_mrp', e.target.value)}
                    placeholder={formData.base_price ? `= ${formData.base_price}` : 'MRP'}
                    className="w-full bg-background border border-border rounded-xl p-2.5 pl-7 text-foreground font-bold text-purple-600 dark:text-purple-400 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/10 focus:outline-none transition-all shadow-sm no-spinners text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">
                  Paper Stock ({localizeTaxText("GST")})
                </label>
                <input
                  type="number" step="0.01"
                  onWheel={e => (e.target as HTMLInputElement).blur()}
                  value={formData.gst_purchase_quantity}
                  onChange={e => handleInputChange('gst_purchase_quantity', e.target.value)}
                  className="w-full bg-background border border-border rounded-xl p-2.5 text-foreground font-bold text-purple-600 dark:text-purple-400 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/10 focus:outline-none transition-all shadow-sm no-spinners text-sm"
                />
              </div>
            </div>
          </div>
        )}
      </div>
      {activePricingTiers.length > 0 && (
        <div className="mt-5 pt-4 border-t border-border">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-1.5 rounded-lg bg-violet-500/10 text-violet-500">
              <Layers className="w-4 h-4" />
            </div>
            <span className="text-xs font-black text-violet-500 uppercase tracking-wider">Tier Prices</span>
            <span className="text-[10px] text-muted-foreground font-normal normal-case">(blank = use MRP)</span>
          </div>
          <div className="flex gap-4 flex-wrap">
            {activePricingTiers.map(tier => (
              <div key={tier.pricing_tier_id} className="flex-1 min-w-[140px]">
                <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5 truncate">
                  {tier.name}
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-bold text-sm">{getCurrencyPrefix()}</span>
                  <input
                    type="number" step="0.01"
                    onWheel={e => (e.target as HTMLInputElement).blur()}
                    value={tierPrices[tier.pricing_tier_id] ?? ''}
                    onChange={e => setTierPrices(prev => ({ ...prev, [tier.pricing_tier_id]: e.target.value }))}
                    placeholder={formData.base_price != null && formData.base_price !== '' ? `= ${formData.base_price}` : 'MRP'}
                    className="w-full bg-background border border-border rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm no-spinners text-sm pl-8"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
