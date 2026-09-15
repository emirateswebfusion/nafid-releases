import { Fragment, useState, useMemo } from 'react';
import { Package, TrendingUp, Search, X } from 'lucide-react';
import clsx from 'clsx';

interface Product {
  product_id: string;
  tenant_id: string;
  name: string;
  item_code: string;
  sku_barcode: string;
  category: string;
  brand_manufacturer: string;
  uom: string;
  purchase_price: number;
  base_price: number;
  current_stock: number;
  reorder_level: number;
  is_gst_applicable: number;
  hsn_sac_code: string;
  tax_rate_percent: number;
  domain_attributes: string;
  discount_percent?: number | null;
  discount_flat?: number | null;
  offer_price?: number | null;
  billing_type?: string;
  grade_id?: string;
  pricing_mode?: string;
  sync_status: string;
  created_at?: string;
  updated_at?: string;
}

interface ReportViewProps {
  products: Product[];
  grades: any[];
}

export function ReportView({ products, grades }: ReportViewProps) {
  const formatCurrency = (amount: number) => `\u20B9${amount.toFixed(2)}`;

  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [stockFilter, setStockFilter] = useState<'all' | 'in_stock' | 'low_stock' | 'out_of_stock'>('all');

  const categories = useMemo(() =>
    Array.from(new Set(products.filter(p => p.category).map(p => p.category))).sort(),
    [products]
  );

  const filteredProducts = useMemo(() =>
    products.filter(p => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!p.name.toLowerCase().includes(q) &&
            !p.sku_barcode.toLowerCase().includes(q) &&
            !(p.item_code || '').toLowerCase().includes(q)) return false;
      }
      if (categoryFilter && p.category !== categoryFilter) return false;
      if (stockFilter === 'in_stock' && Number(p.current_stock) <= 0) return false;
      if (stockFilter === 'low_stock' &&
          !(Number(p.current_stock) <= Number(p.reorder_level) && Number(p.reorder_level) > 0 && Number(p.current_stock) > 0)) return false;
      if (stockFilter === 'out_of_stock' && Number(p.current_stock) > 0) return false;
      return true;
    }),
    [products, searchQuery, categoryFilter, stockFilter]
  );

  const calcMrp = (p: Product) => {
    const gr = p.grade_id ? grades.find(g => g.grade_id === p.grade_id) : null;
    const grRate = gr ? Number(gr.rate) : null;
    return grRate !== null && p.pricing_mode === 'GRADE_RATE' ? grRate : Number(p.base_price);
  };
  const calcSellingPrice = (p: Product) => {
    const rate = calcMrp(p);
    let finalPrice = rate;
    if (p.offer_price) finalPrice = Number(p.offer_price);
    else if (p.discount_flat) finalPrice = rate - Number(p.discount_flat);
    else if (p.discount_percent) finalPrice = rate * (1 - Number(p.discount_percent) / 100);
    return Math.max(finalPrice, 0);
  };

  const totalStock = filteredProducts.reduce((sum, p) => sum + Number(p.current_stock), 0);
  const totalPurchaseValue = filteredProducts.reduce((sum, p) => sum + (Number(p.purchase_price) * Number(p.current_stock)), 0);
  const totalMrpValue = filteredProducts.reduce((sum, p) => sum + (calcMrp(p) * Number(p.current_stock)), 0);
  const totalSellingValue = filteredProducts.reduce((sum, p) => sum + (calcSellingPrice(p) * Number(p.current_stock)), 0);
  const totalProducts = filteredProducts.length;
  const outOfStock = filteredProducts.filter(p => Number(p.current_stock) <= 0).length;

  const groupedByCategory = filteredProducts.reduce<Record<string, typeof filteredProducts>>((acc, p) => {
    const cat = p.category || 'Uncategorized';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(p);
    return acc;
  }, {});

  const categoryStats = Object.entries(groupedByCategory).map(([cat, items]) => {
    const catStock = items.reduce((sum, p) => sum + Number(p.current_stock), 0);
    const catPurchase = items.reduce((sum, p) => sum + (Number(p.purchase_price) * Number(p.current_stock)), 0);
    const catMrp = items.reduce((sum, p) => sum + (calcMrp(p) * Number(p.current_stock)), 0);
    const catSelling = items.reduce((sum, p) => sum + (calcSellingPrice(p) * Number(p.current_stock)), 0);
    const pctOfTotal = totalStock > 0 ? (catStock / totalStock) * 100 : 0;
    return { name: cat, stock: catStock, purchase: catPurchase, mrp: catMrp, selling: catSelling, pct: pctOfTotal, count: items.length };
  }).sort((a, b) => b.stock - a.stock);

  const maxPct = Math.max(...categoryStats.map(c => c.pct), 1);
  const lowStockItems = filteredProducts.filter(p => Number(p.current_stock) <= Number(p.reorder_level) && Number(p.reorder_level) > 0);

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-background">
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="space-y-6">

          {/* ── Summary Cards ── */}
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Total Products', value: totalProducts.toLocaleString('en-IN'), accent: 'border-l-blue-500', iconBg: 'bg-blue-500/10 text-blue-500' },
              { label: 'Total Stock (Qty)', value: totalStock.toFixed(0), accent: 'border-l-violet-500', iconBg: 'bg-violet-500/10 text-violet-500' },
              { label: 'Out of Stock', value: outOfStock.toLocaleString('en-IN'), accent: outOfStock > 0 ? 'border-l-amber-500' : 'border-l-emerald-500', iconBg: outOfStock > 0 ? 'bg-amber-500/10 text-amber-500' : 'bg-emerald-500/10 text-emerald-500' },
              { label: 'Stock Value (Purchase)', value: formatCurrency(totalPurchaseValue), accent: 'border-l-rose-500', iconBg: 'bg-rose-500/10 text-rose-500' },
              { label: 'Stock Value (MRP)', value: formatCurrency(totalMrpValue), accent: 'border-l-sky-500', iconBg: 'bg-sky-500/10 text-sky-500' },
              { label: 'Stock Value (Selling)', value: formatCurrency(totalSellingValue), accent: 'border-l-emerald-500', iconBg: 'bg-emerald-500/10 text-emerald-500' },
            ].map((card, i) => (
              <div key={i} className={`bg-card border border-border/80 ${card.accent} border-l-4 rounded-xl p-4 shadow-sm`}>
                <div className="flex items-center justify-between mb-2">
                  <div className={`p-1.5 rounded-lg ${card.iconBg}`}>
                    {i < 3 ? <Package className="w-4 h-4" /> : <TrendingUp className="w-4 h-4" />}
                  </div>
                </div>
                <div className="text-2xl font-black tracking-tight text-foreground">{card.value}</div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mt-0.5">{card.label}</div>
              </div>
            ))}
          </div>

          {/* ── Filter Bar ── */}
          <div className="bg-card border border-border/80 rounded-xl p-3 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="relative flex-1 max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search name, barcode, code..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full bg-background border border-border/80 rounded-lg py-2 pl-9 pr-3 text-sm text-foreground focus:border-primary focus:ring-1 focus:ring-primary/10 transition-all placeholder:text-muted-foreground/50"
                />
              </div>
              <select
                value={categoryFilter}
                onChange={e => setCategoryFilter(e.target.value)}
                className="bg-background border border-border/80 rounded-lg py-2 px-3 pr-8 text-sm text-foreground focus:border-primary focus:ring-1 focus:ring-primary/10 appearance-none transition-all"
              >
                <option value="">All Categories</option>
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <select
                value={stockFilter}
                onChange={e => setStockFilter(e.target.value as any)}
                className="bg-background border border-border/80 rounded-lg py-2 px-3 pr-8 text-sm text-foreground focus:border-primary focus:ring-1 focus:ring-primary/10 appearance-none transition-all"
              >
                <option value="all">All Stock</option>
                <option value="in_stock">In Stock</option>
                <option value="low_stock">Low Stock</option>
                <option value="out_of_stock">Out of Stock</option>
              </select>
              {(searchQuery || categoryFilter || stockFilter !== 'all') && (
                <button
                  onClick={() => { setSearchQuery(''); setCategoryFilter(''); setStockFilter('all'); }}
                  className="p-2 text-destructive hover:bg-destructive/10 border border-destructive/30 rounded-lg transition-all active:scale-95 cursor-pointer"
                  title="Clear filters"
                >
                  <X className="w-4 h-4 text-destructive" />
                </button>
              )}
            </div>
            {(searchQuery || categoryFilter || stockFilter !== 'all') && (
              <div className="mt-2 text-xs text-muted-foreground font-semibold">
                Showing {filteredProducts.length} of {products.length} products
                {searchQuery && <> &middot; Search: &quot;{searchQuery}&quot;</>}
                {categoryFilter && <> &middot; Category: {categoryFilter}</>}
                {stockFilter !== 'all' && <> &middot; Stock: {stockFilter.replace('_', ' ')}</>}
              </div>
            )}
          </div>

          {/* ── Category Breakdown ── */}
          {categoryStats.length > 0 && (
            <div className="bg-card border border-border/80 rounded-xl shadow-sm overflow-hidden">
              <div className="px-4 py-2.5 bg-muted/20 border-b border-border/60">
                <div className="flex items-center gap-2">
                  <div className="p-1 rounded-md bg-primary/10 text-primary">
                    <Package className="w-3.5 h-3.5" />
                  </div>
                  <h3 className="text-xs font-black text-foreground uppercase tracking-widest">Category Breakdown</h3>
                </div>
              </div>
              <div className="p-4 space-y-3">
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
            </div>
          )}

          {/* ── Low Stock Alerts ── */}
          {lowStockItems.length > 0 && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
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
                  <div className="col-span-2 text-center text-xs text-muted-foreground pt-1">
                    +{lowStockItems.length - 6} more low stock item{lowStockItems.length - 6 > 1 ? 's' : ''}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Detailed Report Table ── */}
          <div className="bg-card border border-border/80 rounded-xl shadow-sm overflow-hidden">
            <div className="px-4 py-2.5 bg-muted/20 border-b border-border/60">
              <div className="flex items-center gap-2">
                <div className="p-1 rounded-md bg-primary/10 text-primary">
                  <Package className="w-3.5 h-3.5" />
                </div>
                <h3 className="text-xs font-black text-foreground uppercase tracking-widest">Product-wise Stock Details</h3>
                <span className="text-xs text-muted-foreground ml-auto font-semibold">{products.length} products</span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/30 border-b border-border/60">
                    <th className="text-left px-4 py-2.5 font-bold text-[10px] uppercase text-muted-foreground tracking-wider">Product</th>
                    <th className="text-left px-4 py-2.5 font-bold text-[10px] uppercase text-muted-foreground tracking-wider">Category</th>
                    <th className="text-left px-4 py-2.5 font-bold text-[10px] uppercase text-muted-foreground tracking-wider">Grade</th>
                    <th className="text-right px-4 py-2.5 font-bold text-[10px] uppercase text-muted-foreground tracking-wider">Stock</th>
                    <th className="text-right px-4 py-2.5 font-bold text-[10px] uppercase text-muted-foreground tracking-wider">Weight</th>
                    <th className="text-right px-4 py-2.5 font-bold text-[10px] uppercase text-muted-foreground tracking-wider">Purchase</th>
                    <th className="text-right px-4 py-2.5 font-bold text-[10px] uppercase text-muted-foreground tracking-wider">MRP</th>
                    <th className="text-right px-4 py-2.5 font-bold text-[10px] uppercase text-muted-foreground tracking-wider">Selling</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {Object.entries(groupedByCategory).map(([cat, items]) => {
                    const catTotalStock = items.reduce((s, p) => s + Number(p.current_stock), 0);
                    return (
                      <Fragment key={cat}>
                        <tr className="bg-primary/5">
                          <td colSpan={8} className="px-4 py-2 text-xs font-bold text-primary uppercase tracking-wider border-b border-border/30">
                            <div className="flex items-center gap-2">
                              <span>{cat}</span>
                              <span className="text-[10px] text-muted-foreground font-semibold">
                                ({items.length} items &middot; {catTotalStock.toFixed(0)} stock)
                              </span>
                            </div>
                          </td>
                        </tr>
                        {items.map(p => {
                          const isLowStock = Number(p.current_stock) <= Number(p.reorder_level) && Number(p.reorder_level) > 0;
                          const isOutOfStock = Number(p.current_stock) <= 0;
                          const gr = p.grade_id ? grades.find(g => g.grade_id === p.grade_id) : null;
                          const rate = calcMrp(p);
                          const finalSellingPrice = calcSellingPrice(p);
                          const da = (() => { try { return JSON.parse(p.domain_attributes || '{}'); } catch { return {}; } })();
                          const unitWeightGrams = Number(da?.weight_grams) || 0;
                          const totalWeight = p.billing_type === 'WEIGHT' ? Number(p.current_stock) : unitWeightGrams > 0 ? (unitWeightGrams / 1000) * Number(p.current_stock) : 0;
                          return (
                            <tr key={p.product_id} className={clsx('hover:bg-muted/20 transition-colors', (isOutOfStock || isLowStock) && 'bg-amber-500/[0.02]')}>
                              <td className="px-4 py-2.5">
                                <div className="flex items-center gap-2">
                                  <div className={clsx('w-2 h-2 rounded-full shrink-0', isOutOfStock ? 'bg-red-500' : isLowStock ? 'bg-amber-500' : 'bg-emerald-500')} />
                                  <span className="font-bold text-sm text-foreground">{p.name}</span>
                                </div>
                              </td>
                              <td className="px-4 py-2.5 text-sm text-muted-foreground">{p.category || '-'}</td>
                              <td className="px-4 py-2.5 text-sm text-muted-foreground">{gr?.grade_name || '-'}</td>
                              <td className={clsx('px-4 py-2.5 text-right font-bold text-sm', isOutOfStock ? 'text-red-500' : isLowStock ? 'text-amber-500' : 'text-foreground')}>{Number(p.current_stock).toFixed(0)}</td>
                              <td className="px-4 py-2.5 text-right text-sm text-muted-foreground">{totalWeight > 0 ? totalWeight.toFixed(2) + ' KG' : '-'}</td>
                              <td className="px-4 py-2.5 text-right text-sm text-foreground">{formatCurrency(Number(p.purchase_price) || 0)}</td>
                              <td className="px-4 py-2.5 text-right text-sm text-foreground">{formatCurrency(rate)}</td>
                              <td className="px-4 py-2.5 text-right text-sm font-bold text-emerald-500">{formatCurrency(finalSellingPrice)}</td>
                            </tr>
                          );
                        })}
                      </Fragment>
                    );
                  })}
                  <tr className="bg-muted/30 border-t-2 border-border/70">
                    <td colSpan={3} className="px-4 py-3 text-sm font-black text-foreground">Grand Total</td>
                    <td className="px-4 py-3 text-right font-black text-sm text-foreground">{totalStock.toFixed(0)}</td>
                    <td className="px-4 py-3 text-right"></td>
                    <td className="px-4 py-3 text-right font-bold text-sm text-rose-500">{formatCurrency(totalPurchaseValue)}</td>
                    <td className="px-4 py-3 text-right font-bold text-sm text-sky-500">{formatCurrency(totalMrpValue)}</td>
                    <td className="px-4 py-3 text-right font-bold text-sm text-emerald-500">{formatCurrency(totalSellingValue)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Footer note ── */}
          <div className="text-center text-xs text-muted-foreground py-2">
            Generated by Nafid POS &mdash; {new Date().toLocaleString('en-IN')} &middot; {totalProducts} products &middot; {Object.keys(groupedByCategory).length} categories
          </div>

        </div>
      </div>
    </div>
  );
}
