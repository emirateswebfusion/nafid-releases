import { BadgePercent, Layers, Package, X, Loader2, Save } from 'lucide-react';
import clsx from 'clsx';
import type { PricingTier } from '../../../utils/pricing/pricingTierHelper';
import type { Product } from '../pricingTiersTypes';
import type { PricingTiersState } from '../hooks/usePricingTiersState';

export interface PricingTiersHeaderProps {
  activeTiers: PricingTier[];
  filteredProducts: Product[];
  matrixTiers: PricingTier[];
  modifiedProductIds: string[];
  onClose?: () => void;
  resetEdits: () => void;
  saveAllPrices: () => Promise<void>;
  pt: PricingTiersState;
}

/** Screen header: title, view tabs, reset / save-all actions and close. */
export function PricingTiersHeader({
  activeTiers, filteredProducts, matrixTiers, modifiedProductIds, onClose, resetEdits, saveAllPrices, pt,
}: PricingTiersHeaderProps) {
  const { operating, setView, tiers, view } = pt;
  return (
    <header className="shrink-0 z-30 border-b border-border bg-card shadow-sm">
      <div className="flex items-center justify-between gap-4 px-5 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2 rounded-xl bg-primary/10 text-primary shadow-inner shrink-0">
            <BadgePercent className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0 text-left">
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold text-foreground truncate">Pricing Tiers</h1>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
              {view === 'matrix' && modifiedProductIds.length > 0 && (
                <span className="text-[10px] font-black px-1.5 py-0.5 rounded-md bg-amber-500 text-white animate-pulse">
                  {modifiedProductIds.length} unsaved
                </span>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground font-medium leading-none mt-0.5">
              {view === 'list'
                ? `${tiers.length} tier${tiers.length !== 1 ? 's' : ''} · ${activeTiers.length} active`
                : `${filteredProducts.length} products · ${matrixTiers.length} tier column${matrixTiers.length !== 1 ? 's' : ''}`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* View Toggle Tabs */}
          <div className="flex gap-1 p-1 bg-muted/50 border border-border rounded-2xl shadow-inner select-none">
            {([
              { key: 'list' as const, label: 'Tiers', icon: Layers },
              { key: 'matrix' as const, label: 'Price Matrix', icon: Package },
            ]).map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setView(key)}
                className={clsx(
                  'flex items-center gap-1.5 py-1.5 px-3 rounded-xl text-xs font-bold transition-all duration-200 active:scale-95 whitespace-nowrap cursor-pointer border border-transparent shrink-0',
                  view === key
                    ? 'bg-background shadow-md shadow-foreground/[0.03] text-primary border-border/40 font-extrabold'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                )}
              >
                <Icon className={clsx('w-3.5 h-3.5', view === key ? 'text-primary' : '')} />
                <span>{label}</span>
              </button>
            ))}
          </div>

          {view === 'matrix' && (
            <>
              {modifiedProductIds.length > 0 && (
                <button
                  onClick={resetEdits}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-input bg-background text-foreground shadow-sm font-bold hover:bg-secondary transition-all active:scale-95 py-2 px-3.5 cursor-pointer text-xs"
                >
                  Reset
                </button>
              )}
              <button
                onClick={saveAllPrices}
                disabled={operating || modifiedProductIds.length === 0}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary text-primary-foreground shadow-sm font-bold hover:bg-primary/95 transition-all active:scale-95 py-2 px-4 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-xs"
              >
                {operating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Save All ({modifiedProductIds.length})
              </button>
            </>
          )}

          <button
            onClick={onClose}
            className="p-2 rounded-xl border border-destructive/30 hover:bg-muted text-muted-foreground hover:text-foreground transition-all duration-200 active:scale-95 cursor-pointer"
            title="Close"
          >
            <X className="w-4 h-4 text-destructive" />
          </button>
        </div>
      </div>
    </header>
  );
}
