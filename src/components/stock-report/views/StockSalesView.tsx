import { getStoreLocale, localizeTaxText } from '../../../utils/localization/storeProfile';
import { ArrowLeft, BarChart3, Search, X } from 'lucide-react';
import { Skeleton } from '../../ui/Skeleton';
import type { StockReportState } from '../hooks/useStockReportState';
import type { StockSalesSummaryRow, StockSalesTotals } from '../stockReportTypes';

export interface StockSalesViewProps {
  sr: StockReportState;
  salesTotals: StockSalesTotals;
  filteredSalesSummary: StockSalesSummaryRow[];
}

/** Product sales summary tab: GST vs Bill of Supply quantities sold per product. */
export function StockSalesView({ sr, salesTotals, filteredSalesSummary }: StockSalesViewProps) {
  const {
    salesFilter, salesLoading, salesSearch, setReportTab, setSalesFilter, setSalesSearch, setSalesSummary,
  } = sr;
  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-background">
      <header className="shrink-0 z-30 border-b border-border bg-card shadow-sm">
        <div className="flex items-center justify-between gap-4 px-5 py-3 select-none">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-xl bg-primary/10 text-primary shadow-inner shrink-0">
              <BarChart3 className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0 text-left">
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-bold text-foreground truncate">Product Sales Summary</h1>
                <span className="w-1.5 h-1.5 rounded-full bg-violet-500 animate-pulse shrink-0" />
              </div>
              <p className="text-[11px] text-muted-foreground font-medium leading-none mt-0.5">
                {localizeTaxText("GST")} vs {localizeTaxText("Bill of Supply")} quantities sold per product
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => { setSalesSummary([]); setReportTab('stock'); }}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-xs font-bold transition-all shadow-sm active:scale-95 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Stock
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto bg-muted/[0.02]">
        <div className="w-full px-4 sm:px-6 py-6 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 select-none">
          <div className="bg-card border border-border p-5 rounded-[24px] flex flex-col !items-start gap-1 hover:border-primary/25 hover:shadow-md transition-all duration-300 group select-none">
            <p className="text-2xl font-black text-foreground leading-none font-mono">{salesLoading ? <Skeleton className="h-7 w-16" /> : salesTotals.products.toLocaleString(getStoreLocale())}</p>
            <p className="text-[9px] uppercase tracking-wider font-extrabold text-muted-foreground mt-1">Products Sold</p>
          </div>
          <div className="bg-card border border-border p-5 rounded-[24px] flex flex-col !items-start gap-1 hover:border-primary/25 hover:shadow-md transition-all duration-300 group select-none">
            <p className="text-2xl font-black text-sky-600 dark:text-sky-400 leading-none font-mono">{salesLoading ? <Skeleton className="h-7 w-16" /> : salesTotals.gst.toFixed(0)}</p>
            <p className="text-[9px] uppercase tracking-wider font-extrabold text-sky-500 mt-1">Sold as {localizeTaxText("GST")}</p>
          </div>
          <div className="bg-card border border-border p-5 rounded-[24px] flex flex-col !items-start gap-1 hover:border-primary/25 hover:shadow-md transition-all duration-300 group select-none">
            <p className="text-2xl font-black text-amber-600 dark:text-amber-400 leading-none font-mono">{salesLoading ? <Skeleton className="h-7 w-16" /> : salesTotals.bos.toFixed(0)}</p>
            <p className="text-[9px] uppercase tracking-wider font-extrabold text-amber-500 mt-1">Sold as BoS</p>
          </div>
          <div className="bg-card border border-border p-5 rounded-[24px] flex flex-col !items-start gap-1 hover:border-primary/25 hover:shadow-md transition-all duration-300 group select-none">
            <p className="text-2xl font-black text-foreground leading-none font-mono">{salesLoading ? <Skeleton className="h-7 w-16" /> : salesTotals.bosProducts.toLocaleString(getStoreLocale())}</p>
            <p className="text-[9px] uppercase tracking-wider font-extrabold text-muted-foreground mt-1">Sold as BoS (Ever)</p>
          </div>
        </div>

        <div className="bg-card border border-border rounded-3xl p-6 shadow-sm hover:shadow-md hover:border-primary/20 transition-all duration-300 flex flex-col justify-between group relative p-5 select-none">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative w-full sm:max-w-xs !max-w-xs">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/45 pointer-events-none" />
              <input
                type="text"
                placeholder="Search product..."
                value={salesSearch}
                onChange={e => setSalesSearch(e.target.value)}
                className="w-full pl-10 pr-8 py-2.5 text-xs bg-background/50 border border-border rounded-xl focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 focus:bg-background transition-all placeholder:text-muted-foreground/40 font-semibold text-foreground"
              />
              {salesSearch && (
                <button onClick={() => setSalesSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-full text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <select
              value={salesFilter}
              onChange={e => setSalesFilter(e.target.value as typeof salesFilter)}
              className="bg-background border border-border rounded-xl py-2.5 px-3 pr-8 text-sm text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 appearance-none transition-all cursor-pointer"
            >
              <option value="all">All Products</option>
              <option value="bos">Only BoS Sales</option>
              <option value="gst">Only {localizeTaxText("GST")} Sales</option>
            </select>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-3 py-2.5 text-[10px] font-black uppercase tracking-wider text-muted-foreground">Product</th>
                  <th className="text-right px-3 py-2.5 text-[10px] font-black uppercase tracking-wider text-sky-600 dark:text-sky-400">Sold as {localizeTaxText("GST")}</th>
                  <th className="text-right px-3 py-2.5 text-[10px] font-black uppercase tracking-wider text-amber-600 dark:text-amber-400">Sold as BoS</th>
                  <th className="text-right px-3 py-2.5 text-[10px] font-black uppercase tracking-wider text-muted-foreground">Total Sold</th>
                </tr>
              </thead>
              <tbody>
                {salesLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b border-border/60">
                      <td className="px-3 py-3"><Skeleton className="h-4 w-40" /></td>
                      <td className="px-3 py-3"><Skeleton className="h-4 w-12 ml-auto" /></td>
                      <td className="px-3 py-3"><Skeleton className="h-4 w-12 ml-auto" /></td>
                      <td className="px-3 py-3"><Skeleton className="h-4 w-12 ml-auto" /></td>
                    </tr>
                  ))
                ) : filteredSalesSummary.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-10 text-center text-xs text-muted-foreground">
                      No sales found
                    </td>
                  </tr>
                ) : (
                  filteredSalesSummary.map(r => (
                    <tr key={r.product_id} className="border-b border-border/60 hover:bg-muted/30 transition-colors">
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-foreground">{r.name}</span>
                          {Number(r.bos_qty) > 0 && (
                            <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[9px] font-black">BoS</span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right text-xs font-bold text-sky-600 dark:text-sky-400 tabular-nums">{Number(r.gst_qty).toFixed(0)}</td>
                      <td className="px-3 py-3 text-right text-xs font-bold text-amber-600 dark:text-amber-400 tabular-nums">{Number(r.bos_qty).toFixed(0)}</td>
                      <td className="px-3 py-3 text-right text-xs font-black text-foreground tabular-nums">{Number(r.total_qty).toFixed(0)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
    </div>
  );
}
