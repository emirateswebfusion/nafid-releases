import { Grid, List, Search, X } from 'lucide-react';
import clsx from 'clsx';
import type { ComboManagerState } from '../hooks/useComboManagerState';

export interface ComboToolbarProps {
  cm: ComboManagerState;
}

/** Action controls: search box, status filter tabs and grid / table layout switcher. */
export function ComboToolbar({ cm }: ComboToolbarProps) {
  const { searchQuery, setSearchQuery, activeFilter, setActiveFilter, viewLayout, setViewLayout } = cm;
  return (
        <div className="flex flex-col sm:flex-row gap-4 items-center justify-between bg-card border border-border/80 p-4 rounded-2xl shadow-xs">
          
          {/* Search Input */}
          <div className="relative w-full sm:max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50 pointer-events-none" />
            <input
              type="text"
              placeholder="Search combos by name or barcode..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-9 py-2 text-xs bg-background border border-border rounded-xl focus:outline-none focus:border-purple-500 focus:ring-4 focus:ring-purple-500/10 transition-all font-semibold text-foreground placeholder:text-muted-foreground/40"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Filter Tabs & Layout Switcher */}
          <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
            
            {/* Filter Tabs */}
            <div className="flex bg-muted/60 p-1 rounded-xl border border-border/60">
              {(['ALL', 'ACTIVE', 'INACTIVE'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveFilter(tab)}
                  className={clsx(
                    "px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer capitalize",
                    activeFilter === tab
                      ? "bg-card text-foreground shadow-xs border border-border/40 font-black"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {tab.toLowerCase()}
                </button>
              ))}
            </div>

            {/* Layout Toggle */}
            <div className="flex bg-muted/60 p-1 rounded-xl border border-border/60">
              <button
                onClick={() => setViewLayout('grid')}
                className={clsx(
                  "p-1.5 rounded-lg transition-all cursor-pointer",
                  viewLayout === 'grid' ? "bg-card text-purple-600 shadow-xs" : "text-muted-foreground hover:text-foreground"
                )}
                title="Grid View"
              >
                <Grid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewLayout('table')}
                className={clsx(
                  "p-1.5 rounded-lg transition-all cursor-pointer",
                  viewLayout === 'table' ? "bg-card text-purple-600 shadow-xs" : "text-muted-foreground hover:text-foreground"
                )}
                title="Table View"
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
  );
}
