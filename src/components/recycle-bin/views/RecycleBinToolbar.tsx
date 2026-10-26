import clsx from 'clsx';
import { Search, X, LayoutGrid, List } from 'lucide-react';
import { type RecycleBinCategory } from '../recycleBinTypes';
import type { RecycleBinState } from '../hooks/useRecycleBinState';

export interface RecycleBinToolbarProps {
  activeCategory: RecycleBinCategory;
  rb: RecycleBinState;
}

/** Toolbar with the search box, the bill-type sub-filter and the cards / table view toggle. */
export function RecycleBinToolbar({ activeCategory, rb }: RecycleBinToolbarProps) {
  const { billTypeFilter, search, setBillTypeFilter, setSearch, setViewMode, viewMode } = rb;
  return (
      <div className="px-6 py-3 border-b border-border/80 bg-card/60 flex items-center justify-between gap-4 flex-wrap shrink-0">
        <div className="flex items-center gap-3 flex-1 min-w-[280px]">
          {/* Search Box */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={
                activeCategory === 'SALES_BILLS'
                  ? 'Search deleted bills by invoice #, customer name, mobile...'
                  : activeCategory === 'PRODUCTS'
                  ? 'Search by product name, barcode, category...'
                  : 'Search by name, phone, or details...'
              }
              className="w-full h-8.5 pl-8.5 pr-8 text-xs rounded-xl border border-border/80 bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-rose-500 transition-all font-medium"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Sales Bill Specific Sub-Filter */}
          {activeCategory === 'SALES_BILLS' && (
            <div className="flex items-center bg-muted/50 p-0.5 rounded-xl border border-border/60 gap-1 text-[11px] font-bold">
              <button
                onClick={() => setBillTypeFilter('ALL')}
                className={clsx(
                  'px-2.5 py-1 rounded-lg transition-all',
                  billTypeFilter === 'ALL' ? 'bg-card text-foreground shadow-2xs' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                All Bills
              </button>
              <button
                onClick={() => setBillTypeFilter('GST')}
                className={clsx(
                  'px-2.5 py-1 rounded-lg transition-all',
                  billTypeFilter === 'GST' ? 'bg-card text-foreground shadow-2xs' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                GST
              </button>
              <button
                onClick={() => setBillTypeFilter('BILL_OF_SUPPLY')}
                className={clsx(
                  'px-2.5 py-1 rounded-lg transition-all',
                  billTypeFilter === 'BILL_OF_SUPPLY' ? 'bg-card text-foreground shadow-2xs' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                Bill of Supply
              </button>
            </div>
          )}
        </div>

        {/* View Mode Toggle: Cards vs Table */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-muted/50 p-1 rounded-xl border border-border/60 gap-1">
            <button
              onClick={() => setViewMode('cards')}
              title="Card Grid View"
              className={clsx(
                'p-1.5 rounded-lg transition-all cursor-pointer',
                viewMode === 'cards' ? 'bg-card text-foreground shadow-2xs' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode('table')}
              title="Table View"
              className={clsx(
                'p-1.5 rounded-lg transition-all cursor-pointer',
                viewMode === 'table' ? 'bg-card text-foreground shadow-2xs' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <List className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
  );
}
