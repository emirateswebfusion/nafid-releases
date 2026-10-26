import React from 'react';
import { Recycle, Package, TrendingUp, Search, X, Recycle as RecycleIcon, Plus, Pencil, Trash, ChevronRight } from 'lucide-react';
import { formatStock, formatCurrency, nameToHue, getInitials } from '../scrapFormat';
import { Skeleton } from '../../ui/Skeleton';
import clsx from 'clsx';
import type { View, ScrapCategory } from '../scrapTypes';

export interface ScrapCategoryListProps {
  categories: ScrapCategory[];
  estimatedValue: number;
  filteredCategories: ScrapCategory[];
  handleDeleteCategory: (cat: ScrapCategory) => void;
  isOwner: true;
  loading: false;
  loadTransactions: (categoryId?: string) => Promise<void>;
  search: string;
  setEditingCategory: React.Dispatch<React.SetStateAction<ScrapCategory | null>>;
  setFormData: React.Dispatch<React.SetStateAction<{ name: string; purchase_price: string; selling_price: string; current_stock: string; unit: string; }>>;
  setSearch: React.Dispatch<React.SetStateAction<string>>;
  setSelectedCategory: React.Dispatch<React.SetStateAction<ScrapCategory | null>>;
  setView: React.Dispatch<React.SetStateAction<View>>;
  totalStock: number;
}

/** Scrap categories list with stock and value per category. */
export function ScrapCategoryList({
  categories, estimatedValue, filteredCategories, handleDeleteCategory, isOwner, loading, loadTransactions, search,
  setEditingCategory, setFormData, setSearch, setSelectedCategory, setView, totalStock,
}: ScrapCategoryListProps) {
  return (
    <div className="flex-1 flex flex-col min-h-0 bg-background select-none w-full px-4 sm:px-6 py-4 space-y-4">
      {/* Themed stats cards */}
      <div className="grid grid-cols-3 gap-5 select-none shrink-0">
        <div className="bg-card border border-border p-5 rounded-[24px] flex items-center gap-4 hover:border-primary/25 hover:shadow-md transition-all duration-300 group select-none">
          <div className="p-3 bg-gradient-to-br from-orange-500/10 to-orange-500/5 text-orange-600 dark:text-orange-400 rounded-xl shrink-0 shadow-inner group-hover:scale-105 transition-transform">
            <Recycle className="w-5 h-5" />
          </div>
          <div className="leading-tight text-left min-w-0 flex-1">
            <p className="text-2xl font-black text-foreground font-mono truncate">{categories.length}</p>
            <p className="text-[9px] text-muted-foreground/80 font-bold uppercase tracking-wider mt-0.5">Categories</p>
            <p className="text-[10px] text-muted-foreground/60 mt-0.5">Scrap types tracked</p>
          </div>
        </div>

        <div className="bg-card border border-border p-5 rounded-[24px] flex items-center gap-4 hover:border-primary/25 hover:shadow-md transition-all duration-300 group select-none">
          <div className="p-3 bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 text-emerald-600 dark:text-emerald-400 rounded-xl shrink-0 shadow-inner group-hover:scale-105 transition-transform">
            <Package className="w-5 h-5" />
          </div>
          <div className="leading-tight text-left min-w-0 flex-1">
            <p className="text-2xl font-black text-foreground font-mono truncate">{isNaN(totalStock) ? '-' : formatStock(totalStock)}</p>
            <p className="text-[9px] text-muted-foreground/80 font-bold uppercase tracking-wider mt-0.5">Total Stock</p>
            <p className="text-[10px] text-muted-foreground/60 mt-0.5">Units in inventory</p>
          </div>
        </div>

        <div className="bg-card border border-border p-5 rounded-[24px] flex items-center gap-4 hover:border-primary/25 hover:shadow-md transition-all duration-300 group select-none">
          <div className="p-3 bg-gradient-to-br from-blue-500/10 to-blue-500/5 text-blue-600 dark:text-blue-400 rounded-xl shrink-0 shadow-inner group-hover:scale-105 transition-transform">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div className="leading-tight text-left min-w-0 flex-1">
            <p className="text-2xl font-black text-foreground font-mono truncate">{formatCurrency(estimatedValue)}</p>
            <p className="text-[9px] text-muted-foreground/80 font-bold uppercase tracking-wider mt-0.5">Est. Value</p>
            <p className="text-[10px] text-muted-foreground/60 mt-0.5">At purchase rate</p>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between bg-card border border-border p-4 rounded-[28px] shadow-sm px-6 py-3.5 shrink-0 select-none">
        <div className="relative w-full sm:max-w-xs flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/45 pointer-events-none" />
          <input
            type="text"
            placeholder="Search scrap categories..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-8 py-2.5 text-xs bg-background/50 border border-border rounded-xl focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 focus:bg-background transition-all placeholder:text-muted-foreground/40 font-semibold text-foreground"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground p-1 hover:bg-muted rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Category list */}
      <div className="flex-1 overflow-y-auto bg-muted/[0.02]">
        <div className="bg-card border border-border rounded-[28px] overflow-hidden shadow-sm p-6 flex-1 flex flex-col min-h-0">
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-[72px] w-full rounded-xl" />)}
            </div>
          ) : filteredCategories.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
              <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
                <RecycleIcon className="w-8 h-8 text-muted-foreground/50" />
              </div>
              <div>
                <p className="text-base font-bold text-foreground">
                  {search ? 'No results found' : 'No scrap categories yet'}
                </p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {search ? `No categories match "${search}"` : 'Add your first category to start tracking scrap'}
                </p>
              </div>
              {!search && isOwner && (
                <button
                  onClick={() => {
                    setEditingCategory(null);
                    setFormData({
                      name: '',
                      purchase_price: '',
                      selling_price: '',
                      current_stock: '0',
                      unit: 'Kgs',
                    });
                    setView('category_form');
                  }}
                  className="inline-flex items-center gap-1.5 px-4.5 py-2.5 rounded-xl bg-primary text-primary-foreground font-black text-sm hover:bg-primary/95 transition-all shadow-sm cursor-pointer active:scale-95 mt-2"
                >
                  <Plus className="w-4 h-4" /> Add Category
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredCategories.map(cat => {
                const stock = Number(cat.current_stock) || 0;
                const outOfStock = stock <= 0;
                return (
                  <div
                    key={cat.scrap_category_id}
                    onClick={() => {
                      setSelectedCategory(cat);
                      loadTransactions(cat.scrap_category_id);
                      setView('transaction');
                    }}
                    className="flex items-center justify-between p-4.5 rounded-3xl border border-border bg-card hover:border-primary/20 hover:shadow-md transition-all duration-300 shadow-sm cursor-pointer group select-none animate-in fade-in duration-200"
                  >
                    <div className="flex items-center gap-3.5 flex-1 min-w-0">
                      <div
                        className="w-11 h-11 rounded-2xl flex items-center justify-center text-white font-extrabold text-sm shadow-sm shrink-0 select-none group-hover:scale-105 transition-transform"
                        style={{ background: `linear-gradient(135deg, hsl(${nameToHue(cat.name)},60%,50%), hsl(${nameToHue(cat.name)},60%,40%))` }}
                      >
                        {getInitials(cat.name)}
                      </div>
                      <div className="min-w-0 flex-1 leading-tight text-left">
                        <p className="font-extrabold text-foreground truncate text-sm">{cat.name}</p>
                        <div className="flex items-center gap-3 text-[11px] text-muted-foreground/75 font-semibold mt-1 flex-wrap">
                          <span className="flex items-center gap-1">
                            Buy: {formatCurrency(cat.purchase_price)}/{cat.unit || 'Kg'}
                          </span>
                          <span className="w-1.5 h-1.5 rounded-full bg-border" />
                          <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-bold">
                            Sell: {formatCurrency(cat.selling_price)}/{cat.unit || 'Kg'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 shrink-0">
                      <div className="text-right">
                        <span className={clsx(
                          'inline-flex items-center px-2.5 py-1 rounded-xl text-xs font-black border tracking-wide',
                          outOfStock
                            ? 'bg-muted border-border text-muted-foreground'
                            : 'bg-emerald-500/10 dark:bg-emerald-500/20 border-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                        )}>
                          {outOfStock ? 'Out of Stock' : `${formatStock(stock)} ${cat.unit}`}
                        </span>
                      </div>

                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-1" onClick={e => e.stopPropagation()}>
                        {isOwner && (
                          <button
                            onClick={() => {
                              setEditingCategory(cat);
                              setFormData({
                                name: cat.name,
                                purchase_price: (cat.purchase_price ?? 0).toString(),
                                selling_price: (cat.selling_price ?? 0).toString(),
                                current_stock: (cat.current_stock ?? 0).toString(),
                                unit: cat.unit || 'Kgs',
                              });
                              setView('category_form');
                            }}
                            className="p-1.5 rounded-lg text-muted-foreground hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all active:scale-95 cursor-pointer"
                            title="Edit"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {isOwner && (
                          <button
                            onClick={() => handleDeleteCategory(cat)}
                            className="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all active:scale-95 cursor-pointer"
                            title="Delete"
                          >
                            <Trash className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <ChevronRight className="w-4 h-4 text-muted-foreground/40 ml-0.5" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
