import { type RefObject } from 'react';
import { Search, X, Filter, ChevronDown, Tags } from 'lucide-react';
import { Skeleton } from '../../ui/Skeleton';
import type { PricingTier } from '../../../utils/pricing/pricingTierHelper';
import type { Product } from '../pricingTiersTypes';
import type { PricingTiersState } from '../hooks/usePricingTiersState';
import { MatrixRow } from './MatrixRow';

export interface PriceMatrixViewProps {
  activeTiers: PricingTier[];
  displayedProducts: Product[];
  filteredProducts: Product[];
  handlePriceChange: (productId: string, tierId: string, value: string) => void;
  handleScroll: () => void;
  matrixTiers: PricingTier[];
  pt: PricingTiersState;
  saveProductRow: (productId: string) => Promise<void>;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
}

/** Price matrix tab: search and tier filter toolbar, sticky tier columns, virtualized product price rows and footer. */
export function PriceMatrixView({
  activeTiers, displayedProducts, filteredProducts, handlePriceChange, handleScroll, matrixTiers, pt, saveProductRow,
  scrollContainerRef,
}: PriceMatrixViewProps) {
  const {
    initialPricingMap, loading, operating, pricingMap, searchQuery, setSearchQuery, setTierFilter, setView, tierFilter,
    visibleCount,
  } = pt;
  return (
    <div className="flex-1 flex flex-col min-h-0">

      {/* Toolbar */}
      <div className="w-full px-4 sm:px-6 pt-4 shrink-0">
        <div className="flex flex-col lg:flex-row gap-3 items-center justify-between bg-card border border-border p-4 rounded-[28px] shadow-sm px-6 py-3.5 select-none">
          {/* Search */}
          <div className="relative w-full lg:max-w-xs flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/45 pointer-events-none" />
            <input
              type="text"
              placeholder="Search by name, barcode, or category..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-8 py-2.5 text-xs bg-background/50 border border-border rounded-xl focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 focus:bg-background transition-all placeholder:text-muted-foreground/40 font-semibold text-foreground"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground p-1 hover:bg-muted rounded-lg cursor-pointer"
              >
                <X className="w-3.5 h-3.5 text-destructive" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto justify-end">
            {/* Tier Filter Dropdown */}
            <div className="relative shrink-0">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/60 pointer-events-none z-10" />
              <select
                value={tierFilter}
                onChange={e => setTierFilter(e.target.value)}
                className="pl-8 pr-8 py-2 text-xs font-bold bg-background border border-border rounded-xl focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all text-foreground cursor-pointer appearance-none shadow-sm"
              >
                <option value="all">All Tiers ({activeTiers.length})</option>
                {activeTiers.map(t => (
                  <option key={t.pricing_tier_id} value={t.pricing_tier_id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/60 pointer-events-none" />
            </div>
          </div>
        </div>
      </div>

      {/* Product Price Table */}
      <div className="w-full px-4 sm:px-6 pb-6 pt-3 flex flex-col flex-1 min-h-0">
        <div className="bg-card border border-border rounded-[28px] overflow-hidden shadow-sm flex-1 flex flex-col min-h-0">

          {/* Synchronized Scrollable Container (Horizontal & Vertical) */}
          <div
            ref={scrollContainerRef}
            onScroll={handleScroll}
            className="flex-1 overflow-auto relative"
          >
            <div className="min-w-max w-full divide-y divide-border">

              {/* Sticky Column Header (Scrolls horizontally with rows, stays pinned on vertical scroll) */}
              <div className="sticky top-0 z-20 flex items-center px-6 py-3.5 bg-card/95 backdrop-blur border-b border-border select-none gap-4 shadow-sm">
                <div className="w-12 text-center text-[10px] font-black text-muted-foreground uppercase tracking-widest shrink-0">Sl. No.</div>
                <div className="flex-1 min-w-[240px] sm:min-w-[280px] text-[10px] font-black text-muted-foreground uppercase tracking-widest">Product</div>
                <div className="w-28 text-center text-[10px] font-black text-muted-foreground uppercase tracking-widest shrink-0">Base MRP</div>
                {matrixTiers.map(t => (
                  <div key={t.pricing_tier_id} className="w-36 text-center text-[10px] font-black text-primary uppercase tracking-widest shrink-0 truncate px-1" title={t.name}>
                    {t.name}
                  </div>
                ))}
                <div className="w-14 text-center text-[10px] font-black text-muted-foreground uppercase tracking-widest shrink-0">Save</div>
              </div>

              {/* Rows */}
              {loading ? (
                [1, 2, 3, 4, 5].map(i => (
                  <div key={i} className="flex items-center gap-4 px-6 py-3 border-b border-border/50">
                    <Skeleton className="w-12 h-4 rounded" />
                    <div className="flex-1 space-y-1">
                      <Skeleton className="h-4 w-40 rounded" />
                      <Skeleton className="h-3 w-20 rounded" />
                    </div>
                    <Skeleton className="w-28 h-4 rounded ml-auto" />
                    <Skeleton className="w-36 h-8 rounded-xl" />
                    <Skeleton className="w-14 h-8 rounded-lg" />
                  </div>
                ))
              ) : matrixTiers.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full py-16 text-muted-foreground">
                  <Tags className="w-10 h-10 mb-3 opacity-30" />
                  <p className="text-sm font-bold text-foreground">No active tiers to display</p>
                  <p className="text-xs mt-1">
                    Enable tiers from the{' '}
                    <button onClick={() => setView('list')} className="text-primary underline cursor-pointer">Tiers</button>
                    {' '}tab
                  </p>
                </div>
              ) : filteredProducts.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full py-16 text-muted-foreground">
                  <p className="text-sm font-bold text-foreground">No products found</p>
                  <p className="text-xs mt-1">Try a different search term</p>
                </div>
              ) : (
                <>
                  {displayedProducts.map((p, idx) => (
                    <MatrixRow
                      key={p.product_id}
                      index={idx}
                      product={p}
                      matrixTiers={matrixTiers}
                      rowPrices={pricingMap[p.product_id] || {}}
                      initPrices={initialPricingMap[p.product_id] || {}}
                      operating={operating}
                      onPriceChange={handlePriceChange}
                      onSaveRow={saveProductRow}
                    />
                  ))}
                  {visibleCount < filteredProducts.length && (
                    <div className="py-4 text-center text-xs font-bold text-muted-foreground/60 bg-muted/10">
                      Scroll down to load more products ({displayedProducts.length} of {filteredProducts.length} loaded)…
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Footer */}
          {filteredProducts.length > 0 && (
            <div className="shrink-0 border-t border-border bg-muted/20 px-6 py-3 text-center text-xs font-bold text-muted-foreground">
              Showing {displayedProducts.length} of {filteredProducts.length} product{filteredProducts.length !== 1 ? 's' : ''} · blank fields fallback to Base MRP
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
