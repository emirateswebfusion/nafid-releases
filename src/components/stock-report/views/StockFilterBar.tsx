import { Building2, Search, X } from 'lucide-react';
import type { StockReportState } from '../hooks/useStockReportState';

export interface StockFilterBarProps {
  sr: StockReportState;
  categories: string[];
}

/** Filter bar of the stock report: search, category, stock status and supplier filters with active filter chips. */
export function StockFilterBar({ sr, categories }: StockFilterBarProps) {
  const {
    categoryFilter, parties, partyFilter, searchQuery, setCategoryFilter, setPartyFilter, setSearchQuery,
    setStockFilter, stockFilter, viewMode,
  } = sr;
  return (
    <div className="bg-card border border-border rounded-3xl p-6 shadow-sm hover:shadow-md hover:border-primary/20 transition-all duration-300 flex flex-col justify-between group relative p-5 select-none">
      <div className="flex items-center gap-3">
        <div className="relative w-full sm:max-w-xs flex-1 !max-w-xs">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/45 pointer-events-none" />
          <input
            type="text"
            placeholder="Search name, barcode, code..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-8 py-2.5 text-xs bg-background/50 border border-border rounded-xl focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 focus:bg-background transition-all placeholder:text-muted-foreground/40 font-semibold text-foreground"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-full text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <select
          value={categoryFilter}
          onChange={e => setCategoryFilter(e.target.value)}
          className="bg-background border border-border rounded-xl py-2.5 px-3 pr-8 text-sm text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 appearance-none transition-all cursor-pointer"
        >
          <option value="">All Categories</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select
          value={stockFilter}
          onChange={e => setStockFilter(e.target.value as typeof stockFilter)}
          className="bg-background border border-border rounded-xl py-2.5 px-3 pr-8 text-sm text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 appearance-none transition-all cursor-pointer"
        >
          <option value="all">All Stock</option>
          <option value="in_stock">In Stock</option>
          <option value="low_stock">Low Stock</option>
          <option value="out_of_stock">Out of Stock</option>
          {(viewMode === 'gst' || viewMode === 'combined') && (
            <option value="dummy_gst">Dummy GST Stock Only</option>
          )}
        </select>
        <select
          value={partyFilter}
          onChange={e => setPartyFilter(e.target.value)}
          className="bg-background border border-border rounded-xl py-2.5 px-3 pr-8 text-sm text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 appearance-none transition-all cursor-pointer min-w-[160px]"
        >
          <option value="">All Suppliers</option>
          {parties.filter(p => p.name).map(p => (
            <option key={p.party_id} value={p.name}>{p.name}</option>
          ))}
        </select>
      </div>
      {searchQuery || categoryFilter || stockFilter !== 'all' || partyFilter ? (
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border">
          <div className="flex items-center gap-1.5 flex-wrap flex-1 min-w-0">
            {searchQuery && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary/10 text-primary text-[11px] font-bold">
                Search: "{searchQuery}"
                <button onClick={() => setSearchQuery('')} className="hover:bg-primary/20 rounded p-0.5 transition-colors cursor-pointer"><X className="w-3 h-3" /></button>
              </span>
            )}
            {categoryFilter && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400 text-[11px] font-bold">
                {categoryFilter}
                <button onClick={() => setCategoryFilter('')} className="hover:bg-sky-500/20 rounded p-0.5 transition-colors cursor-pointer"><X className="w-3 h-3" /></button>
              </span>
            )}
            {stockFilter !== 'all' && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[11px] font-bold">
                {stockFilter === 'in_stock' ? 'In Stock' : stockFilter === 'low_stock' ? 'Low Stock' : stockFilter === 'out_of_stock' ? 'Out of Stock' : 'Dummy GST Stock'}
                <button onClick={() => setStockFilter('all')} className="hover:bg-amber-500/20 rounded p-0.5 transition-colors cursor-pointer"><X className="w-3 h-3" /></button>
              </span>
            )}
            {partyFilter && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400 text-[11px] font-bold">
                <Building2 className="w-3 h-3" />
                {partyFilter}
                <button onClick={() => setPartyFilter('')} className="hover:bg-violet-500/20 rounded p-0.5 transition-colors cursor-pointer"><X className="w-3 h-3" /></button>
              </span>
            )}
          </div>
          <button
            onClick={() => { setSearchQuery(''); setCategoryFilter(''); setStockFilter('all'); setPartyFilter(''); }}
            className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-bold text-destructive hover:bg-destructive/10 rounded-lg transition-all active:scale-95 cursor-pointer shrink-0"
          >
            <X className="w-3.5 h-3.5" /> Clear all
          </button>
        </div>
      ) : null}
    </div>
  );
}
