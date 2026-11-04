import { Search, X, CheckSquare, RefreshCw, Upload, Square, Package, Tag, Edit2 } from 'lucide-react';
import clsx from 'clsx';
import { formatCurrency } from '../../../utils/pricing/money';
import type { EcommerceProductItem } from '../../../services/fusionCartService';
import type { EcommerceState } from '../hooks/useEcommerceState';

export interface EcomProductsTabProps {
  categoriesList: string[];
  filteredProductsList: EcommerceProductItem[];
  handleBulkPublish: () => Promise<void>;
  handleBulkUnpublish: () => Promise<void>;
  handleSyncProduct: (prod: EcommerceProductItem) => Promise<void>;
  handleUnpublishProduct: (prod: EcommerceProductItem) => Promise<void>;
  isVendorApproved: boolean;
  toggleSelectAll: () => void;
  toggleSelectProduct: (id: string) => void;
  ec: EcommerceState;
}

/** Online catalog tab: products synced to the storefront, filters, sync and edit actions. */
export function EcomProductsTab({
  categoriesList, filteredProductsList, handleBulkPublish, handleBulkUnpublish, handleSyncProduct,
  handleUnpublishProduct, isVendorApproved, toggleSelectAll, toggleSelectProduct, ec,
}: EcomProductsTabProps) {
  const { bulkProcessing, categoryFilter, productFilter, products, productSearch, productsLoading, selectedProductIds, setCategoryFilter, setEditingProduct, setProductFilter, setProductSearch, setSelectedProductIds, setStockFilter, stockFilter, syncingProductId } = ec;
  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      
      {/* Search, Filter & Bulk Actions Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3.5 rounded-2xl border border-border/80 bg-card p-4 shadow-xs">
        
        {/* Left: Search input */}
        <div className="flex items-center gap-2.5 flex-1 min-w-[260px]">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60" />
            <input
              type="text"
              placeholder="Search product name, barcode, SKU or category..."
              value={productSearch}
              onChange={e => setProductSearch(e.target.value)}
              className="w-full pl-9 pr-8 py-2 rounded-xl border border-border/80 bg-background text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all shadow-2xs font-medium"
            />
            {productSearch && (
              <button
                onClick={() => setProductSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Center: Dropdown Filters */}
        <div className="flex flex-wrap items-center gap-2">
          
          {/* Category Selector */}
          {categoriesList.length > 0 && (
            <select
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
              className="px-3 py-2 rounded-xl border border-border/80 bg-background text-xs font-semibold text-foreground cursor-pointer focus:outline-none focus:border-primary shadow-2xs"
            >
              <option value="all">All Categories ({products.length})</option>
              {categoriesList.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          )}

          {/* Stock Filter */}
          <select
            value={stockFilter}
            onChange={e => setStockFilter(e.target.value as 'all' | 'instock' | 'outstock' | 'negative')}
            className="px-3 py-2 rounded-xl border border-border/80 bg-background text-xs font-semibold text-foreground cursor-pointer focus:outline-none focus:border-primary shadow-2xs"
          >
            <option value="all">All Stock Status</option>
            <option value="instock">In Stock (&gt; 0)</option>
            <option value="outstock">Out of Stock (0)</option>
            <option value="negative">Negative Stock (&lt; 0)</option>
          </select>

          {/* Status Pill Switcher */}
          <div className="flex items-center gap-1 p-1 bg-muted/60 dark:bg-muted/20 border border-border/70 rounded-xl shadow-2xs">
            {[
              { key: 'all' as const, label: 'All' },
              { key: 'online' as const, label: 'Published' },
              { key: 'offline' as const, label: 'Draft' },
            ].map(f => (
              <button
                key={f.key}
                onClick={() => setProductFilter(f.key)}
                className={clsx(
                  "px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer",
                  productFilter === f.key
                    ? "bg-card text-foreground shadow-xs border border-border/80"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Bulk Actions Banner (When items are selected) */}
      {selectedProductIds.size > 0 && (
        <div className="flex items-center justify-between p-3.5 rounded-2xl bg-primary/10 border border-primary/20 text-xs animate-in slide-in-from-top-2 duration-150">
          <div className="flex items-center gap-2 font-bold text-foreground">
            <CheckSquare className="h-4 w-4 text-primary" />
            <span>{selectedProductIds.size} products selected</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleBulkPublish}
              disabled={bulkProcessing || !isVendorApproved}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary text-primary-foreground font-bold hover:bg-primary/95 transition-all cursor-pointer disabled:opacity-50 shadow-xs"
            >
              {bulkProcessing ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
              <span>Publish Selected</span>
            </button>

            <button
              onClick={handleBulkUnpublish}
              disabled={bulkProcessing || !isVendorApproved}
              className="px-3 py-1.5 rounded-xl border border-rose-500/30 text-rose-600 hover:bg-rose-500/10 font-bold transition-all cursor-pointer disabled:opacity-50"
            >
              Unpublish Selected
            </button>

            <button
              onClick={() => setSelectedProductIds(new Set())}
              className="px-2 py-1 text-muted-foreground hover:text-foreground cursor-pointer"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Products Data Table */}
      <div className="rounded-2xl border border-border/80 bg-card shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs tabular-nums">
            <thead className="bg-muted/40 border-b border-border/80 text-muted-foreground font-bold sticky top-0 backdrop-blur-xs select-none">
              <tr>
                <th className="w-10 px-3 py-2 text-center">
                  <button
                    onClick={toggleSelectAll}
                    className="text-muted-foreground hover:text-foreground cursor-pointer"
                    title="Select / Deselect All"
                  >
                    {selectedProductIds.size > 0 && selectedProductIds.size === filteredProductsList.length ? (
                      <CheckSquare className="h-4 w-4 text-primary" />
                    ) : (
                      <Square className="h-4 w-4" />
                    )}
                  </button>
                </th>
                <th className="px-3 py-2">Product Name &amp; Barcode</th>
                <th className="px-3 py-2">Category</th>
                <th className="px-3 py-2 text-right">POS Price</th>
                <th className="px-3 py-2 text-right">Marketplace Price</th>
                <th className="px-3 py-2 text-center">Stock Level</th>
                <th className="px-3 py-2 text-center">Storefront</th>
                <th className="px-3 py-2 text-center">Sync State</th>
                <th className="px-3 py-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {productsLoading ? (
                <tr>
                  <td colSpan={9} className="px-3 py-12 text-center text-muted-foreground">
                    <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-primary" />
                    <span className="font-semibold text-xs">Loading catalog items from local database...</span>
                  </td>
                </tr>
              ) : filteredProductsList.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-12 text-center text-muted-foreground">
                    <Package className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
                    <p className="font-bold text-sm text-foreground">No matching products found</p>
                    <p className="text-xs text-muted-foreground mt-1">Try resetting the search keyword or changing status filters.</p>
                  </td>
                </tr>
              ) : (
                filteredProductsList.map(prod => {
                  const isOnline = prod.is_online_enabled === 1;
                  const isSyncing = syncingProductId === prod.product_id;
                  const isSelected = selectedProductIds.has(prod.product_id);

                  return (
                    <tr
                      key={prod.product_id}
                      className={clsx(
                        "transition-colors",
                        isSelected ? "bg-primary/[0.04]" : "hover:bg-muted/30"
                      )}
                    >
                      {/* Checkbox */}
                      <td className="px-3 py-2 text-center">
                        <button
                          onClick={() => toggleSelectProduct(prod.product_id)}
                          className="text-muted-foreground hover:text-foreground cursor-pointer"
                        >
                          {isSelected ? (
                            <CheckSquare className="h-4 w-4 text-primary" />
                          ) : (
                            <Square className="h-4 w-4" />
                          )}
                        </button>
                      </td>

                      {/* Product Name & Barcode */}
                      <td className="px-3 py-2">
                        <div className="font-bold text-foreground text-xs leading-snug">{prod.name}</div>
                        <div className="text-[11px] font-mono text-muted-foreground flex items-center gap-1 mt-0.5">
                          <Tag className="h-3 w-3 text-muted-foreground/60" />
                          <span>{prod.sku_barcode || 'No Barcode'}</span>
                        </div>
                      </td>

                      {/* Category */}
                      <td className="px-3 py-2 text-muted-foreground">
                        <span className="px-2 py-0.5 rounded-md bg-muted/60 text-[10px] font-bold border border-border/60">
                          {prod.category || 'General'}
                        </span>
                      </td>

                      {/* POS Counter Price */}
                      <td className="px-3 py-2 text-right font-mono font-medium text-foreground">
                        {formatCurrency(prod.base_price)}
                      </td>

                      {/* Online Price Override */}
                      <td className="px-3 py-2 text-right font-mono">
                        {prod.online_price_override !== null && prod.online_price_override !== undefined ? (
                          <div className="font-bold text-emerald-600 dark:text-emerald-400">
                            {formatCurrency(prod.online_price_override)}
                            <span className="block text-[9px] font-sans text-muted-foreground font-normal">Custom Override</span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground/60 text-[11px]">
                            {formatCurrency(prod.base_price)} <span className="text-[10px] italic">(POS)</span>
                          </span>
                        )}
                      </td>

                      {/* Stock Level */}
                      <td className="px-3 py-2 text-center">
                        <span className={clsx(
                          "inline-block px-2 py-0.5 rounded-md font-mono text-[11px] font-bold",
                          (prod.current_stock as number) > 0
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                            : (prod.current_stock as number) < 0
                            ? "bg-rose-500/15 text-rose-600 dark:text-rose-400"
                            : "bg-muted text-muted-foreground"
                        )}>
                          {prod.current_stock} {prod.uom || 'Pcs'}
                        </span>
                      </td>

                      {/* Storefront State */}
                      <td className="px-3 py-2 text-center">
                        <span className={clsx(
                          "inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border",
                          isOnline
                            ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                            : "bg-muted text-muted-foreground border-border/60"
                        )}>
                          {isOnline ? 'Online' : 'Draft'}
                        </span>
                      </td>

                      {/* Sync Status */}
                      <td className="px-3 py-2 text-center">
                        <span className={clsx(
                          "inline-block px-2 py-0.5 rounded-md text-[10px] font-bold uppercase",
                          prod.sync_status === 'SYNCED'
                            ? "bg-emerald-500/10 text-emerald-600"
                            : prod.sync_status === 'FAILED'
                            ? "bg-rose-500/10 text-rose-600"
                            : "bg-amber-500/10 text-amber-600"
                        )}>
                          {prod.sync_status}
                        </span>
                      </td>

                      {/* Action */}
                      <td className="px-3 py-2 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setEditingProduct(prod)}
                            className="p-1.5 rounded-xl border border-border/80 hover:bg-muted text-muted-foreground hover:text-foreground transition-all cursor-pointer shadow-2xs"
                            title="Edit marketplace price & description"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>

                          {isOnline ? (
                            <button
                              onClick={() => handleUnpublishProduct(prod)}
                              disabled={isSyncing || !isVendorApproved}
                              className="px-2.5 py-1 rounded-xl border border-border/80 hover:border-rose-500/40 text-muted-foreground hover:text-rose-600 text-[11px] font-bold transition-all cursor-pointer disabled:opacity-40"
                              title="Remove from online store"
                            >
                              Unpublish
                            </button>
                          ) : (
                            <button
                              onClick={() => handleSyncProduct(prod)}
                              disabled={isSyncing || !isVendorApproved}
                              className="flex items-center gap-1 px-3 py-1 rounded-xl border border-primary/30 bg-primary/10 hover:bg-primary text-primary hover:text-primary-foreground text-[11px] font-bold transition-all cursor-pointer disabled:opacity-40 shadow-2xs"
                              title="Publish SKU to FusionCart storefront"
                            >
                              {isSyncing ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                              <span>Publish</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Table Footer Summary */}
        <div className="px-4 py-3 border-t border-border/60 bg-muted/20 flex items-center justify-between text-xs text-muted-foreground">
          <span>Showing <strong>{filteredProductsList.length}</strong> of <strong>{products.length}</strong> items</span>
          <span>Hold Shift to select ranges</span>
        </div>
      </div>
    </div>
  );
}
