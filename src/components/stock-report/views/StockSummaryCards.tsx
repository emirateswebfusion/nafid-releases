import { Activity, Package, Percent, ShoppingCart, Tag, TrendingUp } from 'lucide-react';
import clsx from 'clsx';
import { formatCurrency } from '../../../utils/pricing/money';
import { Skeleton } from '../../ui/Skeleton';
import type { StockReportState } from '../hooks/useStockReportState';
import type { MaskedValuation } from '../stockReportTypes';

export interface StockSummaryCardsProps {
  sr: StockReportState;
  isStaff: boolean;
  shouldMask: boolean;
  canViewCost: boolean;
  totalProducts: number;
  outOfStockCount: number;
  totalStock: number;
  totalSellingValue: number;
  totalPurchaseValue: number;
  maskedStockValue: MaskedValuation;
  maskedMrpValue: MaskedValuation;
  maskedPurchaseValue: MaskedValuation;
}

/** Stock report summary cards: product count, stock / purchase / MRP value, stock health and potential margin. */
export function StockSummaryCards({
  sr, isStaff, shouldMask, canViewCost, totalProducts, outOfStockCount, totalStock, totalSellingValue,
  totalPurchaseValue, maskedStockValue, maskedMrpValue, maskedPurchaseValue,
}: StockSummaryCardsProps) {
  const { loading, maskingConfig, products } = sr;
  return (
    <div className="grid grid-cols-3 gap-5 select-none">
      <div className="bg-card border border-border p-5 rounded-[24px] flex items-center gap-4 hover:border-primary/25 hover:shadow-md transition-all duration-300 group select-none">
        <div className="p-3 bg-gradient-to-br from-blue-500/10 to-blue-500/5 text-blue-600 dark:text-blue-400 rounded-xl shrink-0 shadow-inner group-hover:scale-105 transition-transform">
          <Package className="w-5 h-5" />
        </div>
        <div className="leading-tight text-left min-w-0 flex-1">
          <p className="text-2xl font-black text-foreground font-mono truncate">{loading ? <Skeleton className="h-7 w-20" /> : totalProducts.toLocaleString('en-IN')}</p>
          <p className="text-[9px] text-muted-foreground/80 font-bold uppercase tracking-wider mt-0.5">Total Products</p>
          <p className="text-[10px] text-muted-foreground/60 mt-0.5">{loading ? <Skeleton className="h-3 w-24" /> : `${products.length} total in system`}</p>
        </div>
      </div>

      <div className="bg-card border border-border p-5 rounded-[24px] flex items-center gap-4 hover:border-primary/25 hover:shadow-md transition-all duration-300 group select-none">
        <div className="p-3 bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 text-emerald-600 dark:text-emerald-400 rounded-xl shrink-0 shadow-inner group-hover:scale-105 transition-transform">
          <TrendingUp className="w-5 h-5" />
        </div>
        <div className="leading-tight text-left min-w-0 flex-1">
          <p className="text-2xl font-black text-foreground font-mono truncate">
            {loading ? (
              <Skeleton className="h-7 w-28" />
            ) : maskedStockValue.isHidden ? (
              '••••••••'
            ) : (
              formatCurrency(maskedStockValue.displayAmount)
            )}
          </p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <p className="text-[9px] text-muted-foreground/80 font-bold uppercase tracking-wider">Stock Value</p>
            {maskedStockValue.isMasked && !isStaff && (
              <span className="text-[8px] bg-primary/10 text-primary px-1.5 py-0.2 rounded font-bold">Real View</span>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground/60 mt-0.5">At selling price</p>
        </div>
      </div>

      <div className="bg-card border border-border p-5 rounded-[24px] flex items-center gap-4 hover:border-primary/25 hover:shadow-md transition-all duration-300 group select-none">
        <div className={clsx(
          "p-3 rounded-xl shrink-0 shadow-inner group-hover:scale-105 transition-transform bg-gradient-to-br",
          loading ? "from-gray-500/10 to-gray-500/5 text-gray-500" : outOfStockCount > 0 ? "from-amber-500/10 to-amber-500/5 text-amber-600 dark:text-amber-400" : "from-emerald-500/10 to-emerald-500/5 text-emerald-600 dark:text-emerald-400"
        )}>
          <Activity className="w-5 h-5" />
        </div>
        <div className="leading-tight text-left min-w-0 flex-1">
          <p className={clsx(
            "text-2xl font-black font-mono truncate",
            loading ? "text-foreground" : outOfStockCount > 0 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"
          )}>
            {loading ? (
              <Skeleton className="h-7 w-16" />
            ) : (shouldMask && maskingConfig.stock_mask_total_qty) ? (
              '••••'
            ) : (
              totalStock.toFixed(0)
            )}
          </p>
          <p className="text-[9px] text-muted-foreground/80 font-bold uppercase tracking-wider mt-0.5">Stock Health</p>
          <p className="text-[10px] text-muted-foreground/60 mt-0.5">{loading ? <Skeleton className="h-3 w-28" /> : (outOfStockCount > 0 ? `${outOfStockCount} out of stock` : 'All in stock')}</p>
        </div>
      </div>

      <div className="bg-card border border-border p-5 rounded-[24px] flex items-center gap-4 hover:border-primary/25 hover:shadow-md transition-all duration-300 group select-none">
        <div className="p-3 bg-gradient-to-br from-violet-500/10 to-violet-500/5 text-violet-600 dark:text-violet-400 rounded-xl shrink-0 shadow-inner group-hover:scale-105 transition-transform">
          <ShoppingCart className="w-5 h-5" />
        </div>
        <div className="leading-tight text-left min-w-0 flex-1">
          <p className="text-2xl font-black text-foreground font-mono truncate">
            {loading ? (
              <Skeleton className="h-7 w-28" />
            ) : !canViewCost ? (
              '••••••••'
            ) : maskedPurchaseValue.isHidden ? (
              '••••••••'
            ) : (
              formatCurrency(maskedPurchaseValue.displayAmount)
            )}
          </p>
          <p className="text-[9px] text-muted-foreground/80 font-bold uppercase tracking-wider mt-0.5">Purchase Value</p>
          <p className="text-[10px] text-muted-foreground/60 mt-0.5">At purchase price</p>
        </div>
      </div>

      <div className="bg-card border border-border p-5 rounded-[24px] flex items-center gap-4 hover:border-primary/25 hover:shadow-md transition-all duration-300 group select-none">
        <div className="p-3 bg-gradient-to-br from-sky-500/10 to-sky-500/5 text-sky-600 dark:text-sky-400 rounded-xl shrink-0 shadow-inner group-hover:scale-105 transition-transform">
          <Tag className="w-5 h-5" />
        </div>
        <div className="leading-tight text-left min-w-0 flex-1">
          <p className="text-2xl font-black text-foreground font-mono truncate">
            {loading ? (
              <Skeleton className="h-7 w-28" />
            ) : maskedMrpValue.isHidden ? (
              '••••••••'
            ) : (
              formatCurrency(maskedMrpValue.displayAmount)
            )}
          </p>
          <p className="text-[9px] text-muted-foreground/80 font-bold uppercase tracking-wider mt-0.5">MRP Value</p>
          <p className="text-[10px] text-muted-foreground/60 mt-0.5">At max retail price</p>
        </div>
      </div>

      <div className="bg-card border border-border p-5 rounded-[24px] flex items-center gap-4 hover:border-primary/25 hover:shadow-md transition-all duration-300 group select-none">
        <div className="p-3 bg-gradient-to-br from-rose-500/10 to-rose-500/5 text-rose-600 dark:text-rose-400 rounded-xl shrink-0 shadow-inner group-hover:scale-105 transition-transform">
          <Percent className="w-5 h-5" />
        </div>
        <div className="leading-tight text-left min-w-0 flex-1">
          <p className={clsx(
            "text-2xl font-black font-mono truncate",
            totalSellingValue - totalPurchaseValue >= 0 ? "text-foreground" : "text-rose-600 dark:text-rose-400"
          )}>
            {loading ? (
              <Skeleton className="h-7 w-28" />
            ) : !canViewCost ? (
              '••••••••'
            ) : (
              formatCurrency(totalSellingValue - totalPurchaseValue)
            )}
          </p>
          <p className="text-[9px] text-muted-foreground/80 font-bold uppercase tracking-wider mt-0.5">Potential Margin</p>
          <p className="text-[10px] text-muted-foreground/60 mt-0.5">Selling − purchase</p>
        </div>
      </div>
    </div>
  );
}
