import { getCurrencyPrefix } from '../../../utils/localization/storeProfile';
import React from 'react';
import { Search, Recycle, ShoppingCart, Minus, Plus, X, Loader2 } from 'lucide-react';
import { CurrencyIcon } from '../../ui/CurrencyIcon';
import clsx from 'clsx';
import { formatStock, formatCurrency } from '../scrapFormat';
import type { ScrapCategory } from '../scrapTypes';

export interface ScrapSellingViewProps {
  fieldCls: "w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:ring-2 focus:ring-primary/15 focus:outline-none transition-all duration-200 shadow-sm";
  handleAddToSellingCart: (cat: ScrapCategory) => void;
  handleFormKeyDown: (e: React.KeyboardEvent<HTMLElement>) => void;
  handleRecordSales: () => Promise<void>;
  sellingProcessing: boolean;
  sellingResults: ScrapCategory[];
  sellingSearch: string;
  sellingSelected: { category: ScrapCategory; qty: number; rate: number; }[];
  setSellingResults: React.Dispatch<React.SetStateAction<ScrapCategory[]>>;
  setSellingSearch: React.Dispatch<React.SetStateAction<string>>;
  setSellingSelected: React.Dispatch<React.SetStateAction<{ category: ScrapCategory; qty: number; rate: number; }[]>>;
}

/** Sell scrap stock: pick categories, quantities and rates, then record the sale. */
export function ScrapSellingView({
  fieldCls, handleAddToSellingCart, handleFormKeyDown, handleRecordSales, sellingProcessing, sellingResults,
  sellingSearch, sellingSelected, setSellingResults, setSellingSearch, setSellingSelected,
}: ScrapSellingViewProps) {
  return (
    <div className="flex flex-col flex-1 min-h-0 bg-background">
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4" onKeyDown={handleFormKeyDown} data-enter-nav>
        <section className="bg-card border border-border rounded-2xl p-5 shadow-sm">
          <div className="flex items-center gap-2.5 mb-4 pb-3 border-b border-border">
            <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500">
              <Search className="w-4 h-4" />
            </div>
            <span className="text-xs font-black text-emerald-500 uppercase tracking-wider">1. Search & Select Scrap Items</span>
          </div>
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={sellingSearch}
              onChange={e => setSellingSearch(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && sellingResults.length > 0) { handleAddToSellingCart(sellingResults[0]); e.preventDefault(); }
                if (e.key === 'Escape') { setSellingSearch(''); setSellingResults([]); }
              }}
              placeholder="Search scrap categories to sell..."
              autoFocus
              className={clsx(fieldCls, 'pl-10')}
            />
            {sellingResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1.5 bg-card border border-border rounded-xl shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-200">
                <div className="max-h-[240px] overflow-y-auto">
                  {sellingResults.map((s) => (
                    <button
                      key={s.scrap_category_id}
                      onClick={() => handleAddToSellingCart(s)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-emerald-500/5 border-b border-border last:border-0 cursor-pointer"
                    >
                      <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-500 shrink-0">
                        <Recycle className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-sm text-foreground truncate">{s.name}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          Stock: <span className="font-semibold">{formatStock(s.current_stock)} {s.unit} · {getCurrencyPrefix()}{Number(s.selling_price).toFixed(2)}/{s.unit}</span>
                        </div>
                      </div>
                      <div className="text-xs font-bold text-emerald-500 bg-emerald-500/10 px-2 py-1 rounded-lg">
                        + Add
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="bg-card border border-border rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between gap-2 mb-4 pb-3 border-b border-border">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-500">
                <ShoppingCart className="w-4 h-4" />
              </div>
              <span className="text-xs font-black text-indigo-500 uppercase tracking-wider">2. Sale Items ({sellingSelected.length})</span>
            </div>
            {sellingSelected.length > 0 && (
              <button onClick={() => setSellingSelected([])} className="text-xs font-bold text-destructive hover:bg-destructive/10 px-2 py-1 rounded-lg transition-colors cursor-pointer">
                Clear All
              </button>
            )}
          </div>

          {sellingSelected.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <ShoppingCart className="w-10 h-10 mb-3 text-muted-foreground/30" />
              <p className="font-medium text-foreground">No items selected</p>
              <p className="text-sm mt-1">Search and add scrap categories above</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {sellingSelected.map((entry, idx) => {
                const stockNum = Number(entry.category.current_stock);
                return (
                  <div key={entry.category.scrap_category_id} className="flex items-center gap-3 p-3 bg-muted/20 border border-border rounded-xl group hover:border-indigo-500/30 transition-all duration-150">
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-sm text-foreground truncate">{entry.category.name}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        Stock: <span className={clsx('font-semibold', stockNum <= 0 ? 'text-destructive' : 'text-emerald-500')}>{formatStock(stockNum)} {entry.category.unit}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-0.5 bg-background border border-border rounded-lg p-0.5 shadow-sm">
                        <button
                          onClick={() => setSellingSelected(prev => prev.map((s, i) => i === idx ? { ...s, qty: Math.max(0.1, s.qty - 0.1) } : s))}
                          className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted transition-all active:scale-90 cursor-pointer"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <input
                          type="number"
                          min="0.1"
                          step="0.1"
                          value={entry.qty}
                          onChange={e => { const val = e.target.value === '' ? 0.1 : Number(e.target.value); setSellingSelected(prev => prev.map((s, i) => i === idx ? { ...s, qty: val } : s)); }}
                          className="w-14 text-center h-7 bg-transparent border-0 text-sm font-black text-foreground focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                        <button
                          onClick={() => setSellingSelected(prev => prev.map((s, i) => i === idx ? { ...s, qty: s.qty + 0.1 } : s))}
                          className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted transition-all active:scale-90 cursor-pointer"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>

                      <div className="relative w-20">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{getCurrencyPrefix()}</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={entry.rate}
                          onChange={e => { const val = e.target.value === '' ? 0 : Number(e.target.value); setSellingSelected(prev => prev.map((s, i) => i === idx ? { ...s, rate: val } : s)); }}
                          className="w-full bg-background border border-border rounded-lg pl-6 pr-2 py-1.5 text-sm font-bold text-right text-foreground focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                      </div>

                      <div className="text-right min-w-[70px]">
                        <div className="font-black text-sm text-indigo-500">{getCurrencyPrefix()}{(entry.qty * entry.rate).toFixed(2)}</div>
                      </div>

                      <button
                        onClick={() => setSellingSelected(prev => prev.filter((_, i) => i !== idx))}
                        className="p-1.5 text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="bg-card border border-border rounded-2xl p-5 shadow-sm">
          <div className="flex items-center gap-2.5 mb-4 pb-3 border-b border-border">
            <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-500">
              <CurrencyIcon className="w-4 h-4" />
            </div>
            <span className="text-xs font-black text-amber-500 uppercase tracking-wider">3. Sale Summary</span>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Total Sale Amount</span>
              <div className="text-2xl font-black text-foreground mt-0.5">
                {formatCurrency(sellingSelected.reduce((sum, s) => sum + s.qty * s.rate, 0))}
              </div>
            </div>
            <div className="flex items-center justify-end">
              <button
                onClick={handleRecordSales}
                disabled={sellingSelected.length === 0 || sellingProcessing}
                className="px-6 py-2.5 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl text-sm font-bold flex items-center gap-2 transition-all shadow-sm border border-indigo-500/20 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                {sellingProcessing ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Processing...</>
                ) : (
                  <><ShoppingCart className="w-4 h-4" /> Complete Sale</>
                )}
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
