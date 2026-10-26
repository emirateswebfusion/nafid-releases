import clsx from 'clsx';
import type { StockReportState } from '../hooks/useStockReportState';
import type { EnrichedProduct } from '../stockReportTypes';

export interface StockLowStockAlertsProps {
  sr: StockReportState;
  lowStockItems: EnrichedProduct[];
}

/** Low stock alerts strip: up to six low / out of stock products and a shortcut to the low stock filter. */
export function StockLowStockAlerts({ sr, lowStockItems }: StockLowStockAlertsProps) {
  const { setStockFilter } = sr;
  return (
    <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5">
      <div className="flex items-center gap-2 mb-3">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse shrink-0" />
        <h3 className="text-xs font-black text-amber-600 dark:text-amber-400 uppercase tracking-widest">
          Low Stock Alerts &mdash; {lowStockItems.length} item{lowStockItems.length > 1 ? 's' : ''}
        </h3>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {lowStockItems.slice(0, 6).map(p => {
          const isOutOfStock = Number(p.current_stock) <= 0;
          return (
            <div key={p.product_id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <div className="min-w-0">
                <p className="text-sm font-bold text-foreground truncate">{p.name}</p>
                <p className="text-xs text-muted-foreground">{p.category || 'No category'}</p>
              </div>
              <div className="text-right shrink-0 ml-2">
                <span className={clsx('text-sm font-black', isOutOfStock ? 'text-red-500' : 'text-amber-500')}>
                  {isOutOfStock ? 'OUT' : Number(p.current_stock).toFixed(0)}
                </span>
                {!isOutOfStock && <span className="text-xs text-muted-foreground ml-1">/ {Number(p.reorder_level).toFixed(0)}</span>}
              </div>
            </div>
          );
        })}
        {lowStockItems.length > 6 && (
          <button onClick={() => setStockFilter('low_stock')} className="col-span-2 text-center text-xs font-bold text-amber-600 dark:text-amber-400 hover:text-amber-700 pt-1 transition-colors cursor-pointer">
            +{lowStockItems.length - 6} more low stock item{lowStockItems.length - 6 > 1 ? 's' : ''}
          </button>
        )}
      </div>
    </div>
  );
}
