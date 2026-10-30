import { localizeTaxText } from '../../../utils/localization/storeProfile';
import React from 'react';
import clsx from 'clsx';
import { Package } from 'lucide-react';
import { formatCurrency } from '../../../utils/pricing/money';
import { Skeleton } from '../../ui/Skeleton';
import type { StockReportState } from '../hooks/useStockReportState';
import type { EnrichedProduct, MaskedValuation, Product } from '../stockReportTypes';

export interface StockTableProps {
  sr: StockReportState;
  groupedByCategory: Record<string, EnrichedProduct[]>;
  filteredProducts: Product[];
  canViewCost: boolean;
  shouldMask: boolean;
  totalStock: number;
  maskedPurchaseValue: MaskedValuation;
  maskedMrpValue: MaskedValuation;
  maskedStockValue: MaskedValuation;
}

/** Product-wise stock details table grouped by category, with totals and the per-tab GST / estimate columns. */
export function StockTable({
  sr, groupedByCategory, filteredProducts, canViewCost, shouldMask, totalStock, maskedPurchaseValue,
  maskedMrpValue, maskedStockValue,
}: StockTableProps) {
  const { billQuantities, enableRealPaperStock, loading, maskingConfig, products, viewMode } = sr;
  return (
    <div className="bg-card border border-border rounded-[28px] overflow-hidden shadow-sm bg-card border border-border rounded-[28px] shadow-sm overflow-hidden select-none">
      <div className="px-5 py-4.5 border-b border-border bg-muted/20 dark:bg-muted/10">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
            <Package className="w-3.5 h-3.5" />
          </div>
          <span className="text-xs font-black uppercase tracking-wider text-primary">Product-wise Stock Details</span>
          <span className="text-xs text-muted-foreground ml-auto font-semibold">{loading ? <Skeleton className="h-3 w-16 inline-block" /> : `${products.length} products`}</span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/30 border-b border-border">
              <th className="text-left px-4 py-2.5 font-bold text-[10px] uppercase text-muted-foreground tracking-wider">Product</th>
              <th className="text-left px-4 py-2.5 font-bold text-[10px] uppercase text-muted-foreground tracking-wider">Category</th>
              <th className="text-left px-4 py-2.5 font-bold text-[10px] uppercase text-muted-foreground tracking-wider">Grade</th>
              <th className="text-right px-4 py-2.5 font-bold text-[10px] uppercase text-muted-foreground tracking-wider">Stock</th>
              {viewMode !== 'estimate' && <th className="text-right px-4 py-2.5 font-bold text-[10px] uppercase text-muted-foreground tracking-wider">{localizeTaxText("GST")} Qty</th>}
              {viewMode !== 'estimate' && enableRealPaperStock && <th className="text-right px-4 py-2.5 font-bold text-[10px] uppercase text-muted-foreground tracking-wider">{localizeTaxText("GST")} Paper Stock</th>}
              {viewMode !== 'gst' && <th className="text-right px-4 py-2.5 font-bold text-[10px] uppercase text-muted-foreground tracking-wider">Est Qty</th>}
              <th className="text-right px-4 py-2.5 font-bold text-[10px] uppercase text-muted-foreground tracking-wider">Weight</th>
              <th className="text-right px-4 py-2.5 font-bold text-[10px] uppercase text-muted-foreground tracking-wider">Purchase</th>
              <th className="text-right px-4 py-2.5 font-bold text-[10px] uppercase text-muted-foreground tracking-wider">MRP</th>
              <th className="text-right px-4 py-2.5 font-bold text-[10px] uppercase text-muted-foreground tracking-wider">Selling</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  <td className="px-4 py-3" colSpan={viewMode === 'combined' ? (enableRealPaperStock ? 11 : 10) : viewMode === 'gst' ? (enableRealPaperStock ? 10 : 9) : 9}><Skeleton className="h-5 w-full rounded" /></td>
                </tr>
              ))
            ) : Object.entries(groupedByCategory).length === 0 ? (
              <tr>
                <td colSpan={viewMode === 'combined' ? (enableRealPaperStock ? 11 : 10) : viewMode === 'gst' ? (enableRealPaperStock ? 10 : 9) : 9} className="px-4 py-8 text-center text-sm text-muted-foreground">No products found matching your filters</td>
              </tr>
              ) : (
              Object.entries(groupedByCategory).map(([cat, items]) => {
                const catTotalStock = items.reduce((s, p) => s + Number(p.current_stock), 0);
                return (
                  <React.Fragment key={cat}>
                    <tr className="bg-primary/5">
                      <td colSpan={viewMode === 'combined' ? (enableRealPaperStock ? 11 : 10) : viewMode === 'gst' ? (enableRealPaperStock ? 10 : 9) : 9} className="px-4 py-2 text-xs font-bold text-primary uppercase tracking-wider border-b border-border/30">
                        <div className="flex items-center gap-2">
                          <span>{cat}</span>
                          <span className="text-[10px] text-muted-foreground font-semibold">
                            ({items.length} items &middot; {catTotalStock.toFixed(0)} stock)
                          </span>
                        </div>
                      </td>
                    </tr>
                    {items.map(p => (
                      <tr key={p.product_id} className={clsx('hover:bg-muted/20 transition-colors', (p.isOutOfStock || p.isLowStock) && 'bg-amber-500/[0.02]')}>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <div className={clsx('w-2 h-2 rounded-full shrink-0', p.isOutOfStock ? 'bg-red-500' : p.isLowStock ? 'bg-amber-500' : 'bg-emerald-500')} />
                            <span className="font-bold text-sm text-foreground">{p.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-sm text-muted-foreground">{p.category || '-'}</td>
                        <td className="px-4 py-2.5 text-sm text-muted-foreground">{p.gradeName}</td>
                        <td className={clsx('px-4 py-2.5 text-right font-bold text-sm', p.isOutOfStock ? 'text-red-500' : p.isLowStock ? 'text-amber-500' : 'text-foreground')}>{Number(p.current_stock).toFixed(0)}</td>
                        {viewMode !== 'estimate' && <td className="px-4 py-2.5 text-right text-sm text-muted-foreground">{p.gstQty.toFixed(0)}</td>}
                        {viewMode !== 'estimate' && enableRealPaperStock && <td className="px-4 py-2.5 text-right text-sm font-bold text-sky-600 dark:text-sky-400 tabular-nums">{p.gstPaperStock.toFixed(0)}</td>}
                        {viewMode !== 'gst' && <td className="px-4 py-2.5 text-right text-sm text-amber-600 dark:text-amber-400">{p.estimateQty.toFixed(0)}</td>}
                        <td className="px-4 py-2.5 text-right text-sm text-muted-foreground">{p.totalWeight > 0 ? p.totalWeight.toFixed(2) + ' KG' + (p.totalPcs > 0 ? ' (' + p.totalPcs + ' pcs)' : '') : '-'}</td>
                        <td className="px-4 py-2.5 text-right text-sm text-foreground">{!canViewCost ? '•••' : formatCurrency(Number(p.purchase_price) || 0)}</td>
                        <td className="px-4 py-2.5 text-right text-sm text-foreground">{formatCurrency(p.rate)}</td>
                        <td className="px-4 py-2.5 text-right text-sm font-bold text-emerald-500">{formatCurrency(p.finalSellingPrice)}</td>
                      </tr>
                    ))}
                  </React.Fragment>
                );
              })
            )}
            {!loading && (
              <tr className="bg-muted/30 border-t-2 border-border">
                <td colSpan={3} className="px-4 py-3 text-sm font-black text-foreground">Grand Total</td>
                <td className="px-4 py-3 text-right font-black text-sm text-foreground">{(shouldMask && maskingConfig.stock_mask_total_qty) ? '••••' : totalStock.toFixed(0)}</td>
                {viewMode !== 'estimate' && <td className="px-4 py-3 text-right font-bold text-sm text-muted-foreground">{billQuantities.reduce((s, b) => s + Number(b.gst_qty), 0).toFixed(0)}</td>}
                {viewMode !== 'estimate' && enableRealPaperStock && <td className="px-4 py-3 text-right font-black text-sm text-sky-500 tabular-nums">{filteredProducts.reduce((s, p) => s + (p.paper_stock ?? 0), 0).toFixed(0)}</td>}
                {viewMode !== 'gst' && <td className="px-4 py-3 text-right font-bold text-sm text-amber-500">{billQuantities.reduce((s, b) => s + Number(b.estimate_qty), 0).toFixed(0)}</td>}
                <td className="px-4 py-3 text-right"></td>
                <td className="px-4 py-3 text-right font-bold text-sm text-rose-500">{!canViewCost || maskedPurchaseValue.isHidden ? '••••••••' : formatCurrency(maskedPurchaseValue.displayAmount)}</td>
                <td className="px-4 py-3 text-right font-bold text-sm text-sky-500">{maskedMrpValue.isHidden ? '••••••••' : formatCurrency(maskedMrpValue.displayAmount)}</td>
                <td className="px-4 py-3 text-right font-bold text-sm text-emerald-500">{maskedStockValue.isHidden ? '••••••••' : formatCurrency(maskedStockValue.displayAmount)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
