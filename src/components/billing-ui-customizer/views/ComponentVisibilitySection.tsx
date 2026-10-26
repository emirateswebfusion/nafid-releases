import type { BillingUIConfig } from '../../../store/billingUIStore';

export interface ComponentVisibilitySectionProps {
  config: BillingUIConfig;
  handleUpdate: (partial: Partial<BillingUIConfig>) => void;
}

/** Billing page controls: show / hide billing components and cart navigation toggles. */
export function ComponentVisibilitySection({
  config, handleUpdate,
}: ComponentVisibilitySectionProps) {
  return (
    <div className="space-y-3 col-span-1 md:col-span-3">
      <label className="text-xs font-bold text-foreground uppercase tracking-wider block">
        Additional Workspace & Cart Navigation Controls
      </label>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* 1. Header Button Navigation Cart Preservation */}
        <label className="flex items-start gap-3 p-3.5 bg-background border border-border rounded-xl cursor-pointer hover:bg-muted/50 transition-colors">
          <input
            type="checkbox"
            checked={config.preserveCartOnHeaderNavigation ?? true}
            onChange={(e) => handleUpdate({ preserveCartOnHeaderNavigation: e.target.checked })}
            className="w-4 h-4 mt-0.5 rounded text-primary focus:ring-primary cursor-pointer shrink-0"
          />
          <div className="flex flex-col">
            <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
              <span>Preserve Cart on Header Button Navigation</span>
            </span>
            <span className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
              When enabled (ON), opening pages via header buttons (Ledger, Customers, Inventory, etc.) will keep your active cart items and open tabs intact without clearing them.
            </span>
          </div>
        </label>

        {/* 2. Exit Billing Page Cart Preservation */}
        <label className="flex items-start gap-3 p-3.5 bg-background border border-border rounded-xl cursor-pointer hover:bg-muted/50 transition-colors">
          <input
            type="checkbox"
            checked={config.preserveCartOnPageExit ?? true}
            onChange={(e) => handleUpdate({ preserveCartOnPageExit: e.target.checked })}
            className="w-4 h-4 mt-0.5 rounded text-primary focus:ring-primary cursor-pointer shrink-0"
          />
          <div className="flex flex-col">
            <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
              <span>Preserve Cart on Exiting Billing Page</span>
            </span>
            <span className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
              When enabled (ON), exiting the Billing page to Dashboard or switching sidebar views will keep your active cart items and open tabs intact without clearing them.
            </span>
          </div>
        </label>

        <label className="flex items-center gap-3 p-3.5 bg-background border border-border rounded-xl cursor-pointer hover:bg-muted/50 transition-colors">
          <input
            type="checkbox"
            checked={config.showScaleButton}
            onChange={(e) => handleUpdate({ showScaleButton: e.target.checked })}
            className="w-4 h-4 rounded text-primary focus:ring-primary cursor-pointer"
          />
          <span className="text-xs font-bold text-foreground">Weighing Scale Read Button</span>
        </label>

        <label className="flex items-start gap-3 p-3.5 bg-background border border-border rounded-xl cursor-pointer hover:bg-muted/50 transition-colors">
          <input
            type="checkbox"
            checked={config.showPurchasePriceInPOS ?? false}
            onChange={(e) => handleUpdate({ showPurchasePriceInPOS: e.target.checked })}
            className="w-4 h-4 mt-0.5 rounded text-primary focus:ring-primary cursor-pointer"
          />
          <div className="flex flex-col">
            <span className="text-xs font-bold text-foreground">Show Product Purchase Cost in Price Override Menu</span>
            <span className="text-[10px] text-muted-foreground mt-0.5">Displays purchase cost in price tier/override dropdown for reference (View Only, non-selectable).</span>
          </div>
        </label>
      </div>
    </div>
  );
}
