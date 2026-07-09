import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuthStore } from '../store/authStore';
import { Package, TrendingUp, Search, X, Printer, FileText, RefreshCw } from 'lucide-react';
import { Skeleton } from './ui/Skeleton';
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

const CACHE_TTL = 5 * 60 * 1000;
const reportCache = new Map<string, { products: Product[]; grades: any[]; timestamp: number }>();

export function StockReport({ onClose }: { onClose: () => void }) {
  const { shopName, tenantId } = useAuthStore();
  const [products, setProducts] = useState<Product[]>([]);
  const [grades, setGrades] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [stockFilter, setStockFilter] = useState<'all' | 'in_stock' | 'low_stock' | 'out_of_stock'>('all');

  const cacheKey = tenantId || 'global';

  const loadData = useCallback(async (forceRefresh = false) => {
    const cached = reportCache.get(cacheKey);
    if (!forceRefresh && cached && Date.now() - cached.timestamp < CACHE_TTL) {
      setProducts(cached.products);
      setGrades(cached.grades);
      setLastUpdated(new Date(cached.timestamp));
      setLoading(false);
      return;
    }

    if (forceRefresh) setRefreshing(true);
    else setLoading(true);

    if (window.electronAPI) {
      const [prodRes, gradeRes] = await Promise.all([
        window.electronAPI.dbGetProducts({ tenant_id: cacheKey, limit: 100000 }),
        window.electronAPI.dbGetGrades(cacheKey),
      ]);
      if (Array.isArray(prodRes) && Array.isArray(gradeRes)) {
        setProducts(prodRes);
        setGrades(gradeRes);
        reportCache.set(cacheKey, { products: prodRes, grades: gradeRes, timestamp: Date.now() });
        setLastUpdated(new Date());
      }
    }

    setLoading(false);
    setRefreshing(false);
  }, [cacheKey]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const formatCurrency = (amount: number) => `\u20B9${amount.toFixed(2)}`;

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

  const totalStock = filteredProducts.reduce((sum, p) => sum + Number(p.current_stock), 0);
  const totalPurchaseValue = filteredProducts.reduce((sum, p) => sum + (Number(p.purchase_price) * Number(p.current_stock)), 0);
  const totalMrpValue = filteredProducts.reduce((sum, p) => sum + (calcMrp(p) * Number(p.current_stock)), 0);
  const totalSellingValue = filteredProducts.reduce((sum, p) => sum + (calcSellingPrice(p) * Number(p.current_stock)), 0);
  const totalProducts = filteredProducts.length;
  const outOfStockCount = filteredProducts.filter(p => Number(p.current_stock) <= 0).length;

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
    const pct = totalStock > 0 ? (catStock / totalStock) * 100 : 0;
    return { name: cat, stock: catStock, purchase: catPurchase, mrp: catMrp, selling: catSelling, pct, count: items.length };
  }).sort((a, b) => b.stock - a.stock);

  const maxPct = Math.max(...categoryStats.map(c => c.pct), 1);
  const lowStockItems = filteredProducts.filter(p => Number(p.current_stock) <= Number(p.reorder_level) && Number(p.reorder_level) > 0);

  const handlePrint = async () => {
    const repGroupedByCategory = filteredProducts.reduce<Record<string, typeof filteredProducts>>((acc, p) => {
      const cat = p.category || 'Uncategorized';
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(p);
      return acc;
    }, {});

    const totalStockVal = filteredProducts.reduce((sum, p) => sum + Number(p.current_stock), 0);
    const totalValueVal = filteredProducts.reduce((sum, p) => {
      const rate = calcMrp(p);
      return sum + (rate * Number(p.current_stock));
    }, 0);
    const totalProductsVal = filteredProducts.length;
    const outOfStockVal = filteredProducts.filter(p => Number(p.current_stock) <= 0).length;

    const categoryRows = Object.entries(repGroupedByCategory).map(([cat, items]) => {
      const detailRows = items.map(p => {
        const gr = p.grade_id ? grades.find(g => g.grade_id === p.grade_id) : null;
        const grRate = gr ? Number(gr.rate) : null;
        const rate = grRate !== null && p.pricing_mode === 'GRADE_RATE' ? Number(p.base_price) + grRate : Number(p.base_price);
        const value = rate * Number(p.current_stock);
        return `<tr>\n          <td style="padding:6px;border:1px solid #ddd;">${p.name}</td>\n          <td style="padding:6px;border:1px solid #ddd;color:#666;">${p.category || '-'}</td>\n          <td style="padding:6px;border:1px solid #ddd;color:#666;">${gr?.grade_name || '-'}</td>\n          <td style="padding:6px;border:1px solid #ddd;text-align:right;font-weight:bold;">${Number(p.current_stock).toFixed(0)}</td>\n          <td style="padding:6px;border:1px solid #ddd;text-align:right;">${formatCurrency(rate)}</td>\n          <td style="padding:6px;border:1px solid #ddd;text-align:right;font-weight:bold;">${formatCurrency(value)}</td>\n        </tr>`;
      }).join('');
      return `<tr style="background:#e8f0fe;font-weight:bold;">\n        <td colspan="6" style="padding:8px 6px;border:1px solid #ddd;color:#2563eb;">${cat}</td>\n      </tr>${detailRows}`;
    }).join('');

    const html = `<!DOCTYPE html>
      <html>
        <head>
          <title>Stock Report - ${shopName}</title>
          <style>
            @page { size: A4 landscape; margin: 10mm; }
            body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; color: #1a1a1a; padding: 20px; margin: 0; }
            .header { text-align: center; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 3px solid #2563eb; }
            .header h1 { font-size: 24px; margin: 0; color: #1a1a1a; }
            .header p { font-size: 12px; color: #666; margin: 3px 0; }
            .summary-row { display: flex; gap: 12px; margin-bottom: 20px; }
            .summary-card { flex: 1; padding: 10px 14px; border: 1px solid #e5e7eb; border-radius: 8px; text-align: center; }
            .summary-card .value { font-size: 20px; font-weight: 800; }
            .summary-card .label { font-size: 9px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 2px; }
            table { width: 100%; border-collapse: collapse; font-size: 10px; }
            th { background: #f3f4f6; text-align: left; padding: 7px 6px; border: 1px solid #d1d5db; font-size: 9px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; }
            td { padding: 5px 6px; border: 1px solid #e5e7eb; }
            .cat-header { background: #eff6ff; font-weight: 700; font-size: 11px; color: #2563eb; }
            .cat-header td { padding: 7px 6px; }
            .total-row { background: #f9fafb; font-weight: 800; }
            .total-row td { padding: 8px 6px; border-top: 2px solid #d1d5db; }
            .text-right { text-align: right; }
            .footer { text-align: center; font-size: 9px; color: #9ca3af; margin-top: 20px; padding-top: 10px; border-top: 1px solid #e5e7eb; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>${shopName || 'Shop'}</h1>
            <p>Stock Report &mdash; ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
            <p style="font-size:10px;color:#888;">Generated at ${new Date().toLocaleTimeString('en-IN')}</p>
          </div>\n\n          <div class="summary-row">
            <div class="summary-card"><div class="value">${totalProductsVal}</div><div class="label">Total Products</div></div>
            <div class="summary-card"><div class="value">${totalStockVal.toFixed(0)}</div><div class="label">Total Stock</div></div>
            <div class="summary-card"><div class="value" style="color:#059669;">${formatCurrency(totalValueVal)}</div><div class="label">Stock Value</div></div>
            <div class="summary-card"><div class="value" style="color:${outOfStockVal > 0 ? '#d97706' : '#059669'};">${outOfStockVal}</div><div class="label">Out of Stock</div></div>
          </div>\n\n          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Category</th>
                <th>Grade</th>
                <th class="text-right">Stock</th>
                <th class="text-right">Rate</th>
                <th class="text-right">Value</th>
              </tr>
            </thead>
            <tbody>
              ${categoryRows}
              <tr class="total-row">
                <td colspan="3">Grand Total</td>
                <td class="text-right">${totalStockVal.toFixed(0)}</td>
                <td class="text-right"></td>
                <td class="text-right"></td>
                <td class="text-right" style="color:#059669;">${formatCurrency(totalValueVal)}</td>
              </tr>
            </tbody>
          </table>\n\n          <div class="footer">
            Generated by Vendora POS &mdash; ${new Date().toLocaleString('en-IN')} &middot; Showing all ${totalProductsVal} products
          </div>
        </body>
      </html>`;

    if (window.electronAPI) {
      const printResult = await window.electronAPI.printA4Html(tenantId || 'global', html);
      if (!printResult.success && printResult.useDefaultDialog) {
        const pw = window.open('', '_blank');
        if (pw) { pw.document.write(html); pw.document.close(); setTimeout(() => pw.print(), 500); }
      }
    } else {
      const pw = window.open('', '_blank');
      if (pw) { pw.document.write(html); pw.document.close(); setTimeout(() => pw.print(), 500); }
    }
  };

  if (loading && products.length === 0) {
    return (
      <div className="flex-1 flex flex-col bg-background overflow-hidden">
        <header className="flex items-center justify-between px-6 py-3 border-b border-border bg-card shrink-0 gap-4 shadow-sm z-30">
          <div className="flex items-center gap-3">
            <Skeleton className="w-10 h-10 rounded-xl" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-9 w-28 rounded-xl" />
            <Skeleton className="h-9 w-9 rounded-xl" />
          </div>
        </header>
        <div className="flex-1 overflow-y-auto px-4 py-6">
          <div className="space-y-6">
            <div className="grid grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="bg-card border border-border/80 border-l-4 rounded-xl p-4 shadow-sm space-y-3">
                  <Skeleton className="h-4 w-4 rounded" />
                  <Skeleton className="h-7 w-24" />
                  <Skeleton className="h-3 w-20" />
                </div>
              ))}
            </div>
            <div className="bg-card border border-border/80 rounded-xl p-3 shadow-sm">
              <div className="flex items-center gap-3">
                <Skeleton className="h-9 flex-1 max-w-xs rounded-lg" />
                <Skeleton className="h-9 w-32 rounded-lg" />
                <Skeleton className="h-9 w-28 rounded-lg" />
              </div>
            </div>
            <div className="bg-card border border-border/80 rounded-xl shadow-sm overflow-hidden">
              <div className="px-4 py-2.5 bg-muted/20 border-b border-border/60">
                <Skeleton className="h-4 w-40" />
              </div>
              <div className="p-4 space-y-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-4 w-16" />
                    </div>
                    <div className="flex items-center gap-4">
                      <Skeleton className="h-3 w-28" />
                      <Skeleton className="h-3 w-24" />
                      <Skeleton className="h-3 w-28" />
                    </div>
                    <Skeleton className="h-2 w-full rounded-full" />
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-card border border-border/80 rounded-xl shadow-sm overflow-hidden">
              <div className="px-4 py-2.5 bg-muted/20 border-b border-border/60">
                <Skeleton className="h-4 w-44" />
              </div>
              <div className="p-1">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/30 border-b border-border/60">
                        {['Product', 'Category', 'Grade', 'Stock', 'Weight', 'Purchase', 'MRP', 'Selling'].map((_h, i) => (
                          <th key={i} className="px-4 py-2.5">
                            <Skeleton className={clsx('h-3', i < 3 ? 'w-14' : 'w-12')} />
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {Array.from({ length: 6 }).map((_, i) => (
                        <tr key={i}>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2">
                              <Skeleton className="h-3 w-3 rounded-full" />
                              <Skeleton className="h-4 w-32" />
                            </div>
                          </td>
                          <td className="px-4 py-2.5"><Skeleton className="h-4 w-20" /></td>
                          <td className="px-4 py-2.5"><Skeleton className="h-4 w-16" /></td>
                          <td className="px-4 py-2.5"><Skeleton className="h-4 w-10 ml-auto" /></td>
                          <td className="px-4 py-2.5"><Skeleton className="h-4 w-14 ml-auto" /></td>
                          <td className="px-4 py-2.5"><Skeleton className="h-4 w-14 ml-auto" /></td>
                          <td className="px-4 py-2.5"><Skeleton className="h-4 w-14 ml-auto" /></td>
                          <td className="px-4 py-2.5"><Skeleton className="h-4 w-14 ml-auto" /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-background overflow-hidden">
      {/* ── Header ── */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-border bg-card shrink-0 gap-4 shadow-sm z-30">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2.5 rounded-xl bg-primary/10 text-primary shadow-inner">
            <FileText className="w-5 h-5" />
          </div>
          <div className="min-w-0 leading-tight">
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold text-foreground truncate">Stock Report</h1>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" title="Active" />
            </div>
            <p className="text-xs text-muted-foreground font-semibold mt-0.5">
              {products.length} products
              {lastUpdated && (
                <span className="ml-2 font-normal text-muted-foreground/60">&middot; {lastUpdated.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => loadData(true)}
            disabled={refreshing}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-all active:scale-95 cursor-pointer disabled:opacity-50 border border-border/60"
            title="Refresh data"
          >
            <RefreshCw className={clsx('w-4 h-4', refreshing && 'animate-spin')} />
          </button>
          <button onClick={handlePrint} className="px-3.5 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm border border-primary/10 active:scale-95 cursor-pointer">
            <Printer className="w-3.5 h-3.5" /> Print Report
          </button>
          <button onClick={onClose} className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-all duration-200 active:scale-95 cursor-pointer border border-destructive/30" title="Close">
            <X className="w-4 h-4 text-destructive" />
          </button>
        </div>
      </header>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Total Products', value: totalProducts.toLocaleString('en-IN'), accent: 'border-l-blue-500', iconBg: 'bg-blue-500/10 text-blue-500' },
              { label: 'Total Stock (Qty)', value: totalStock.toFixed(0), accent: 'border-l-violet-500', iconBg: 'bg-violet-500/10 text-violet-500' },
              { label: 'Out of Stock', value: outOfStockCount.toLocaleString('en-IN'), accent: outOfStockCount > 0 ? 'border-l-amber-500' : 'border-l-emerald-500', iconBg: outOfStockCount > 0 ? 'bg-amber-500/10 text-amber-500' : 'bg-emerald-500/10 text-emerald-500' },
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

          {/* Filters */}
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
                  className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-all active:scale-95"
                  title="Clear filters"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Category Breakdown */}
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

          {/* Low Stock Alerts */}
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

          {/* Detailed Table */}
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
                      <>
                        <tr className="bg-primary/5" key={cat}>
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
                      </>
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

          <div className="text-center text-xs text-muted-foreground py-2">
            Generated by Vendora POS &mdash; {new Date().toLocaleString('en-IN')} &middot; {totalProducts} products &middot; {Object.keys(groupedByCategory).length} categories
          </div>
        </div>
      </div>
    </div>
  );
}
