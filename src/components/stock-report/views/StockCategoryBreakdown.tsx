import { Package } from 'lucide-react';
import { formatCurrency } from '../../../utils/pricing/money';
import { Skeleton } from '../../ui/Skeleton';
import type { StockReportState } from '../hooks/useStockReportState';
import type { StockCategoryStat } from '../stockReportTypes';

export interface StockCategoryBreakdownProps {
  sr: StockReportState;
  categoryStats: StockCategoryStat[];
  maxPct: number;
}

/** Category breakdown of the stock report: per-category stock, purchase, MRP and selling totals. */
export function StockCategoryBreakdown({ sr, categoryStats, maxPct }: StockCategoryBreakdownProps) {
  const { loading } = sr;
  return (
    <div className="bg-card border border-border rounded-3xl p-6 shadow-sm hover:shadow-md hover:border-primary/20 transition-all duration-300 flex flex-col justify-between group relative p-5 select-none">
      <div className="flex items-center gap-2.5 mb-4 pb-3 border-b border-border">
        <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
          <Package className="w-4 h-4" />
        </div>
        <span className="text-xs font-black uppercase tracking-wider text-primary">Category Breakdown</span>
      </div>
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="space-y-2">
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-12" />
              </div>
              <Skeleton className="h-3 w-60" />
              <Skeleton className="h-2 w-full rounded-full" />
            </div>
          ))}
        </div>
      ) : categoryStats.length > 0 ? (
        <div className="space-y-3">
          {categoryStats.map(cat => (
            <div key={cat.name} className="group">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm font-bold text-foreground truncate">{cat.name}</span>
                  <span className="text-xs text-muted-foreground font-semibold shrink-0">({cat.count} items)</span>
                </div>
                <div className="flex items-center gap-3 text-xs font-semibold shrink-0">
                  <span className="text-foreground">{cat.stock.toFixed(0)} pcs</span>
                </div>
              </div>
              <div className="flex items-center gap-4 text-xs text-muted-foreground mb-1.5">
                <span>Purchase: <span className="font-bold text-foreground">{formatCurrency(cat.purchase)}</span></span>
                <span>MRP: <span className="font-bold text-foreground">{formatCurrency(cat.mrp)}</span></span>
                <span>Selling: <span className="font-bold text-emerald-500">{formatCurrency(cat.selling)}</span></span>
              </div>
              <div className="relative h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-primary/60 transition-all duration-500"
                  style={{ width: `${(cat.pct / maxPct) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground text-center py-4">No category data available</p>
      )}
    </div>
  );
}
