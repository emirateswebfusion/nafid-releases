import { localizeCurrencyText } from '../../../utils/localization/storeProfile';
import { type EntryFieldFlowPreset, ENTRY_FIELD_FLOW_PRESETS, type EntryFieldKey } from '../../../store/billingUIStore';
import clsx from 'clsx';
import { Search, Package, Scale, Tag, Percent, CreditCard, DollarSign } from 'lucide-react';
import type { BillingUIConfig } from '../../../store/billingUIStore';

export interface EntryFieldFlowSectionProps {
  config: BillingUIConfig;
  handleUpdate: (partial: Partial<BillingUIConfig>) => void;
}

/** Billing page controls: entry field navigation flow preset and the custom field order. */
export function EntryFieldFlowSection({
  config, handleUpdate,
}: EntryFieldFlowSectionProps) {
  return (
    <div className="space-y-3 col-span-1 md:col-span-3 bg-muted/20 border border-border p-4 rounded-xl">
      <label className="text-xs font-bold text-foreground uppercase tracking-wider block">
        Entry Field Navigation Flow (Tab/Enter Order)
      </label>
      <p className="text-xs text-muted-foreground mb-3">
        Define the sequence of fields when pressing Enter during item entry. 
        <code className="bg-muted px-1.5 py-0.5 rounded text-[10px] font-mono">Weight</code> field only appears for weight-based items.
      </p>
      
      {/* Preset Options */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 mb-4">
        {[
          { preset: 'full', label: 'Full Flow', desc: 'Qty → Rate → Discount → Flat → Grand Total → Search' },
          { preset: 'noDiscount', label: 'No Discount', desc: 'Qty → Rate → Search' },
          { preset: 'noGrandTotal', label: 'No Grand Total', desc: 'Qty → Rate → Discount → Flat → Search' },
          { preset: 'minimal', label: 'Minimal', desc: 'Qty → Search' },
        ].map(({ preset, label, desc }) => {
          const isActive = config.entryFieldFlowPreset === preset && config.entryFieldFlowPreset !== 'custom';
          return (
            <button
              key={preset}
              type="button"
              onClick={() => handleUpdate({ entryFieldFlowPreset: preset as EntryFieldFlowPreset, entryFieldFlowCustom: undefined })}
              className={clsx(
                "p-3 rounded-xl border text-left space-y-1 transition-all cursor-pointer",
                isActive
                  ? "border-primary bg-primary/10 text-primary font-black shadow-xs"
                  : "border-border hover:bg-muted text-foreground bg-background"
              )}
            >
              <div className="text-xs font-bold flex items-center gap-2">
                <Search className="w-3.5 h-3.5" />
                <span>{label}</span>
              </div>
              <div className="text-[10px] text-muted-foreground leading-tight">{desc}</div>
            </button>
          );
        })}
      </div>
      
      {/* Custom Flow Builder */}
      <div className="border-t border-border/60 pt-4">
        <div className="flex items-center justify-between mb-3">
          <label className="text-xs font-bold text-foreground uppercase tracking-wider">
            Custom Flow (Drag to Reorder, Click to Toggle)
          </label>
          <button
            type="button"
            onClick={() => handleUpdate({ entryFieldFlowPreset: 'custom', entryFieldFlowCustom: [...(config.entryFieldFlowCustom || ENTRY_FIELD_FLOW_PRESETS.full)] })}
            className={clsx(
              "px-3 py-1.5 text-xs font-bold rounded-lg transition-all",
              config.entryFieldFlowPreset === 'custom'
                ? "bg-primary text-white shadow-xs"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            )}
          >
            {config.entryFieldFlowPreset === 'custom' ? 'Custom Active' : 'Enable Custom'}
          </button>
        </div>
        
        {config.entryFieldFlowPreset === 'custom' && (
          <div className="space-y-2">
            {[
              { key: 'search', label: 'Product Search', icon: Search, required: true, desc: 'Search bar (always first)' },
              { key: 'qty', label: 'Quantity / Pcs', icon: Package, required: false, desc: 'Qty or Pcs input' },
              { key: 'weight', label: 'Weight (Kgs)', icon: Scale, required: false, desc: 'Kgs input (weight items only)' },
              { key: 'rate', label: 'Rate / Price', icon: Tag, required: false, desc: 'Rate per unit' },
              { key: 'discount', label: 'Discount %', icon: Percent, required: false, desc: 'Percentage discount' },
              { key: 'discountFlat', label: localizeCurrencyText('Discount ₹'), icon: CreditCard, required: false, desc: 'Flat amount discount' },
              { key: 'grandTotal', label: 'Grand Total', icon: DollarSign, required: false, desc: 'Override grand total' },
            ].map((field) => {
              const customFlow = config.entryFieldFlowCustom || ENTRY_FIELD_FLOW_PRESETS.full;
              const isInFlow = customFlow.includes(field.key as EntryFieldKey);
              const index = customFlow.indexOf(field.key as EntryFieldKey);
              
              return (
                <div 
                  key={field.key}
                  className={clsx(
                    "flex items-center gap-3 p-3 rounded-xl border transition-all",
                    isInFlow 
                      ? "bg-card border-primary/30 shadow-xs" 
                      : "bg-muted/30 border-border opacity-60"
                  )}
                >
                  <span className={clsx(
                    "w-6 text-center font-mono font-bold text-xs",
                    isInFlow ? "text-primary" : "text-muted-foreground"
                  )}>
                    {isInFlow ? index + 1 : '—'}
                  </span>
                  <div className={clsx("p-2 rounded-lg shrink-0", field.icon === Search ? "bg-primary/10" : field.icon === Package ? "bg-emerald-500/10" : field.icon === Scale ? "bg-amber-500/10" : field.icon === Tag ? "bg-blue-500/10" : field.icon === Percent ? "bg-rose-500/10" : field.icon === CreditCard ? "bg-orange-500/10" : "bg-purple-500/10")}>
                    <field.icon className={clsx("w-4 h-4", field.icon === Search ? "text-primary" : field.icon === Package ? "text-emerald-600" : field.icon === Scale ? "text-amber-600" : field.icon === Tag ? "text-blue-600" : field.icon === Percent ? "text-rose-600" : field.icon === CreditCard ? "text-orange-600" : "text-purple-600")} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={clsx("text-xs font-bold truncate", isInFlow ? "text-foreground" : "text-muted-foreground")}>
                        {field.label} {field.required && <span className="text-red-500 ml-1">*</span>}
                      </span>
                    </div>
                    <p className="text-[10px] text-muted-foreground">{field.desc}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const newFlow = [...(config.entryFieldFlowCustom || ENTRY_FIELD_FLOW_PRESETS.full)];
                      const idx = newFlow.indexOf(field.key as EntryFieldKey);
                      if (idx >= 0) {
                        newFlow.splice(idx, 1);
                      } else {
                        newFlow.push(field.key as EntryFieldKey);
                      }
                      handleUpdate({ entryFieldFlowPreset: 'custom', entryFieldFlowCustom: newFlow });
                    }}
                    className={clsx(
                      "px-3 py-1.5 text-xs font-bold rounded-lg transition-all shrink-0",
                      isInFlow
                        ? "bg-destructive/10 text-destructive border border-destructive/30 hover:bg-destructive/20"
                        : "bg-muted text-muted-foreground border border-border hover:bg-muted/80"
                    )}
                  >
                    {isInFlow ? 'Remove' : 'Add'}
                  </button>
                </div>
              );
            })}
            <p className="text-[10px] text-muted-foreground italic">
              Click <span className="font-bold">Add</span> to include a field in the flow, <span className="font-bold">Remove</span> to exclude. 
              Order is determined by when you add them (appends to end). Drag-and-drop reordering not yet implemented.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
