import { useFeatureFlagsStore } from '../../../config/featureFlags';
import { localizeTaxText } from '../../../utils/localization/storeProfile';
import { getCurrencyPrefix } from '../../../utils/localization/storeProfile';
import { moneyFixed } from '../../../utils/pricing/moneyRounding';
import React, { Fragment } from 'react';
import { RefreshCw, AlertTriangle, Plus, Minus, Pencil, Trash, Printer, X, Package, PackagePlus, AlertCircle } from 'lucide-react';
import clsx from 'clsx';
import { Skeleton } from '../../ui/Skeleton';
import { ScrollText } from '../../ui/ScrollText';
import { type Product } from '../inventoryUtils';

export interface InventoryTableViewProps {
  view: 'list' | 'add' | 'edit';
  isAllSelected: boolean;
  isSomeSelected: boolean;
  handleToggleSelectAll: () => void;
  showZeroPaperStock: boolean;
  showProductGstBadge: boolean;
  showPriceTiersInInventory: boolean;
  activePricingTiers: import('../hooks/useInventoryState').InventoryState['pricingTiers'];
  listScrollRef: React.RefObject<HTMLDivElement | null>;
  handleListScroll: (e: React.UIEvent<HTMLDivElement>) => void;
  products: Product[];
  filtered: Product[];
  groupedByDate: Record<string, Product[]>;
  offset: number;
  highlightedProductId: string | null;
  selectedProductIds: Set<string>;
  toggleSelectProduct: (productId: string, e?: React.MouseEvent) => void;
  enableRealPaperStock: boolean;
  grades: import('../hooks/useInventoryState').InventoryState['grades'];
  allProductPricingMap: Record<string, Record<string, number>>;
  adjustingStockId: string | null;
  applyStockAdjust: (product: Product, delta: number, pcsDelta?: number) => Promise<boolean>;
  openAdjustDialog: (product: Product, mode: 'add' | 'reduce') => void;
  openEdit: (product: Product) => void;
  handleDelete: (product: Product) => void;
  setPrintModalProduct: (p: Product) => void;
  setPrintQuantity: (q: number | string) => void;
  setPrintPrice: (p: boolean) => void;
  sentinelRef: React.RefObject<HTMLDivElement | null>;
  isFetching: boolean;
  hasMore: boolean;
  totalCount: number | null;
  showLowStockAlert: boolean;
  setShowLowStockAlert: (v: boolean) => void;
  stockFilter: string;
  setStockFilter: (filter: import('../hooks/useInventoryState').InventoryState['stockFilter']) => void;
}

export const InventoryTableView: React.FC<InventoryTableViewProps> = ({
  view,
  isAllSelected,
  isSomeSelected,
  handleToggleSelectAll,
  showZeroPaperStock,
  showProductGstBadge,
  showPriceTiersInInventory,
  activePricingTiers,
  listScrollRef,
  handleListScroll,
  products,
  filtered,
  groupedByDate,
  offset,
  highlightedProductId,
  selectedProductIds,
  toggleSelectProduct,
  enableRealPaperStock,
  grades,
  allProductPricingMap,
  adjustingStockId,
  applyStockAdjust,
  openAdjustDialog,
  openEdit,
  handleDelete,
  setPrintModalProduct,
  setPrintQuantity,
  setPrintPrice,
  sentinelRef,
  isFetching,
  hasMore,
  totalCount,
  showLowStockAlert,
  setShowLowStockAlert,
  stockFilter,
  setStockFilter,
}) => {
  const tiersEnabled = useFeatureFlagsStore(s => s.flags?.pricing_tiers === true);
  return (
      <div className={`flex-1 px-4 sm:px-6 pb-6 pt-3 bg-muted/[0.02] w-full select-none flex flex-col min-h-0 bg-background${view !== 'list' ? ' hidden' : ''}`}>
        <div className="bg-card border border-border rounded-[28px] overflow-hidden shadow-sm flex-1 flex flex-col min-h-0">
          {/* Table Header - Fixed at Top */}
          <div className="hidden sm:grid grid-cols-12 gap-3 px-6 py-3.5 bg-muted/20 dark:bg-muted/10 text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60 border-b border-border select-none shrink-0">
            <div className="col-span-3 text-xs font-black text-muted-foreground uppercase tracking-widest flex items-center gap-2.5">
              <input
                type="checkbox"
                checked={isAllSelected}
                ref={el => {
                  if (el) el.indeterminate = isSomeSelected;
                }}
                onChange={handleToggleSelectAll}
                className="w-4 h-4 rounded border-border text-primary focus:ring-primary/20 cursor-pointer accent-primary shrink-0"
                title={isAllSelected ? "Deselect all" : "Select all visible products"}
              />
              <span>Product</span>
            </div>
            <div className="col-span-1 text-right text-xs font-black text-muted-foreground uppercase tracking-widest">Purchase</div>
            <div className="col-span-1 text-right text-xs font-black text-muted-foreground uppercase tracking-widest">MRP</div>
            <div className="col-span-1 text-right text-xs font-black text-emerald-500 uppercase tracking-widest">Final</div>
            <div className="col-span-2 text-center text-xs font-black text-muted-foreground uppercase tracking-widest">Real Stock</div>
            <div className="col-span-2 text-center text-xs font-black text-purple-600 dark:text-purple-400 uppercase tracking-widest">Paper Stock</div>
            <div className="col-span-2 text-center text-xs font-black text-muted-foreground uppercase tracking-widest">Actions</div>
          </div>

          {/* Scrollable Rows Container */}
          <div ref={listScrollRef} onScroll={handleListScroll} className="flex-1 overflow-y-auto divide-y divide-border relative">
            {isFetching && offset === 0 ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={`skel-${i}`} className="grid grid-cols-12 gap-3 px-6 py-4 items-center">
                  <div className="col-span-3">
                    <div className="flex items-center gap-2">
                      <div className="space-y-2 w-full">
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-3 w-1/2" />
                        <div className="flex gap-2 mt-1">
                          <Skeleton className="h-4 w-12" />
                          <Skeleton className="h-4 w-16" />
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="col-span-1 flex justify-end"><Skeleton className="h-4 w-16" /></div>
                  <div className="col-span-1 flex justify-end"><Skeleton className="h-4 w-16" /></div>
                  <div className="col-span-1 flex justify-end"><Skeleton className="h-4 w-12" /></div>
                  <div className="col-span-2 flex justify-center gap-2">
                    <Skeleton className="h-6 w-6 rounded-full" />
                    <Skeleton className="h-5 w-16" />
                    <Skeleton className="h-6 w-6 rounded-full" />
                  </div>
                  <div className="col-span-2 flex justify-center">
                    <Skeleton className="h-5 w-16 rounded-full" />
                  </div>
                  <div className="col-span-2 flex justify-center gap-2">
                    <Skeleton className="h-8 w-8 rounded-lg" />
                    <Skeleton className="h-8 w-8 rounded-lg" />
                    <Skeleton className="h-8 w-8 rounded-lg" />
                  </div>
                </div>
              ))
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-16">
                <PackagePlus className="w-12 h-12 mb-3" />
                <p className="font-medium text-foreground">No products found</p>
                <p className="text-sm mt-1">
                  {stockFilter !== 'all' ? `No products match "${stockFilter === 'low_stock' ? 'Low Stock' : stockFilter === 'out_of_stock' ? 'Out of Stock' : stockFilter === 'no_barcode' ? 'No Barcode' : 'In Stock'}" filter` : 'Click "Add Product" to seed your inventory'}
                </p>
              </div>
            ) : Object.entries(groupedByDate).map(([date, items]) => (
              <Fragment key={date}>
                <div className="sticky top-0 z-10 bg-muted/90 backdrop-blur-xs px-6 py-1.5 text-xs font-black text-primary uppercase tracking-wider border-b border-border shadow-2xs">
                  {date}
                </div>
                {(items as Product[]).map(p => {
                  const isLowStock = (p.current_stock ?? 0) <= (p.reorder_level ?? 0) && (p.reorder_level ?? 0) > 0;
                  
                  let finalPrice: number | null = null;
                  const appliedGrade = p.grade_id ? grades.find(g => g.grade_id === p.grade_id) : null;
                  const gradeRate = appliedGrade ? Number(appliedGrade.rate) : null;
                  const displayMrp = gradeRate !== null && p.pricing_mode === 'GRADE_RATE' 
                    ? gradeRate 
                    : Number(p.base_price);
                  const displayPurchasePrice = appliedGrade && p.pricing_mode === 'GRADE_RATE' && appliedGrade.purchase_price !== undefined
                    ? Number(appliedGrade.purchase_price)
                    : Number(p.purchase_price);

                  if (p.offer_price) {
                    finalPrice = Number(p.offer_price);
                  } else if (p.discount_flat) {
                    finalPrice = displayMrp - Number(p.discount_flat);
                  } else if (p.discount_percent) {
                    finalPrice = displayMrp * (1 - Number(p.discount_percent) / 100);
                  }
                  if (finalPrice !== null && isNaN(finalPrice)) finalPrice = null;

                  const da = (() => { try { return JSON.parse(p.domain_attributes || '{}'); } catch { return {}; } })();
                  const pcsPerKg = Number(da.pcs_per_kg) || 0;
                  const totalPcs = da.pcs_stock !== undefined
                    ? (Number(da.pcs_stock) || 0)
                    : (pcsPerKg > 0 ? Math.round(Number(p.current_stock) * pcsPerKg) : (Number(da.pcs) || 0));
                  const isWeightUom = ['Kgs', 'Grams', 'Mtrs', 'Ltrs'].includes(p.uom ?? '');
                  const formattedStock = isWeightUom 
                    ? `${Number(p.current_stock).toFixed(3)} ${p.uom}`
                    : `${Number(p.current_stock).toFixed(0)} ${p.uom}`;

                  const hasPaperStock = Number(p.paper_stock || da.paper_stock || 0) > 0;
                  const isPaperProduct = Boolean(enableRealPaperStock) && (da.gst_type === 'PAPER' || hasPaperStock);

                  const paperPurPrice = isPaperProduct
                    ? Number(da.paper_purchase_price || (da.gst_type === 'PAPER' ? ((p as Product & { paper_purchase_price?: number }).gst_purchase_price || da.gst_purchase_price) : 0) || (p as Product & { paper_purchase_price?: number }).paper_purchase_price || 0)
                    : 0;
                  const paperMrpPrice = isPaperProduct
                    ? Number((p as Product & { paper_purchase_price?: number }).paper_mrp || da.paper_mrp || da.paper_base_price || 0)
                    : 0;

                  return (
                    <div
                      id={`product-row-${p.product_id}`}
                      key={p.product_id}
                      className={clsx(
                        "border-b border-border last:border-b-0 transition-all duration-300 hover:bg-muted/10 grid grid-cols-12 gap-3 px-6 py-3.5 items-center bg-card group",
                        selectedProductIds.has(p.product_id) && "bg-primary/5 dark:bg-primary/10",
                        highlightedProductId === p.product_id && "ring-2 ring-primary/60 bg-primary/5 dark:bg-primary/10 shadow-sm"
                      )}
                    >
                      <div className="col-span-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <input
                            type="checkbox"
                            checked={selectedProductIds.has(p.product_id)}
                            onChange={() => toggleSelectProduct(p.product_id)}
                            className="w-4 h-4 rounded border-border text-primary focus:ring-primary/20 cursor-pointer accent-primary shrink-0"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <ScrollText text={p.name.replace(/\s*\((GST|EST|Estimate)\)$/i, '')} className="flex-1 text-foreground font-bold text-sm min-w-0" />
                            </div>
                            <p className="text-muted-foreground text-xs font-mono mt-0.5 truncate">
                              {p.item_code && <span className="font-bold mr-2 text-primary">{p.item_code}</span>}
                              {p.sku_barcode}
                            </p>
                            <div className="flex gap-1.5 mt-1 flex-wrap items-center">
                              {enableRealPaperStock && showZeroPaperStock && Number(p.paper_stock ?? da.paper_stock ?? 0) === 0 && (
                                <span className="text-[10px] bg-purple-500/10 text-purple-600 px-1.5 py-0.5 rounded font-semibold">Paper: 0</span>
                              )}
                              {showProductGstBadge && (
                                <span data-product-type-badge className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-semibold">
                                  {enableRealPaperStock ? (isPaperProduct ? 'Paper' : 'Real') : (Number(p.is_gst_applicable) === 1 ? 'GST' : 'Estimate')}
                                </span>
                              )}
                              {p.category && <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded font-semibold">{p.category}</span>}
                              {p.brand_manufacturer && <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded font-semibold">{p.brand_manufacturer}</span>}
                              {tiersEnabled && showPriceTiersInInventory && allProductPricingMap[p.product_id] && Object.entries(allProductPricingMap[p.product_id]).map(([tid, tPrice]) => {
                                const tier = activePricingTiers.find(t => t.pricing_tier_id === tid);
                                if (!tier) return null;
                                return (
                                  <span key={tid} className="text-[10px] bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200/80 dark:border-indigo-800/80 px-1.5 py-0.5 rounded font-bold">
                                    {tier.name}: {getCurrencyPrefix()}{tPrice}
                                  </span>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="col-span-1 text-right text-muted-foreground text-sm font-semibold flex flex-col items-end justify-center">
                        <span>{getCurrencyPrefix()}{moneyFixed(displayPurchasePrice)}</span>
                        {appliedGrade && p.pricing_mode === 'GRADE_RATE' && appliedGrade.purchase_price !== undefined && (
                          <span className="text-[9px] text-indigo-500 font-semibold leading-tight mt-0.5">Grade Purchase</span>
                        )}
                        {paperPurPrice > 0 && (
                          <span className="text-[10px] text-purple-600 dark:text-purple-400 font-bold leading-tight mt-0.5" title="Paper Purchase Price">
                            Paper: {getCurrencyPrefix()}{moneyFixed(paperPurPrice)}
                          </span>
                        )}
                      </div>
                      <div className="col-span-1 flex flex-col items-end justify-center text-right">
                        <span className={clsx("text-sm", finalPrice !== null ? 'line-through text-muted-foreground/60' : 'text-primary font-bold')}>
                          {getCurrencyPrefix()}{moneyFixed(displayMrp)}
                        </span>
                        {gradeRate !== null && p.pricing_mode === 'GRADE_RATE' && (
                          <span className="text-[10px] text-indigo-500 font-semibold leading-tight mt-0.5 text-right">
                            Grade Rate: {getCurrencyPrefix()}{gradeRate}
                          </span>
                        )}
                        {paperMrpPrice > 0 && (
                          <span className="text-[10px] text-purple-600 dark:text-purple-400 font-bold leading-tight mt-0.5" title="Paper MRP">
                            Paper: {getCurrencyPrefix()}{moneyFixed(paperMrpPrice)}
                          </span>
                        )}
                      </div>
                      <div className="col-span-1 text-right text-emerald-500 font-bold text-sm">
                        {finalPrice !== null ? `${getCurrencyPrefix()}${moneyFixed(finalPrice)}` : '-'}
                      </div>

                      {/* Real Stock with +/- */}
                      <div className="col-span-2 flex items-center justify-center gap-1">
                        <button 
                          onClick={() => { if (['Kgs', 'Grams', 'Mtrs', 'Ltrs'].includes(p.uom ?? '')) openAdjustDialog(p, 'reduce'); else applyStockAdjust(p, -1); }} 
                          disabled={adjustingStockId === p.product_id}
                          className="w-7 h-7 flex items-center justify-center rounded-md bg-background border border-border text-muted-foreground hover:bg-muted hover:text-destructive transition-all active:scale-90 disabled:opacity-50 cursor-pointer"
                          title="Reduce Real Stock"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className={clsx('text-sm font-black flex flex-col items-center justify-center leading-tight min-w-[62px]', isLowStock ? 'text-amber-500' : (p.current_stock ?? 0) <= 0 ? 'text-red-500' : 'text-foreground')}>
                          {adjustingStockId === p.product_id ? (
                             <RefreshCw className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                          ) : (
                             <>
                               <span>{formattedStock}</span>
                               {totalPcs > 0 && <span className="text-[10px] text-muted-foreground/50 font-medium">{totalPcs} pcs</span>}
                               {(p.current_stock ?? 0) <= 0 ? (
                                 <span className="flex items-center gap-0.5 text-[10px] text-red-500 font-bold mt-0.5">
                                   <AlertCircle className="w-2.5 h-2.5" /> Out of Stock
                                 </span>
                               ) : isLowStock ? (
                                 <span className="flex items-center gap-0.5 text-[10px] text-amber-500 font-bold mt-0.5">
                                   <AlertTriangle className="w-2.5 h-2.5" /> Low
                                 </span>
                               ) : null}
                             </>
                          )}
                        </span>
                        <button 
                          onClick={() => { if (['Kgs', 'Grams', 'Mtrs', 'Ltrs'].includes(p.uom ?? '')) openAdjustDialog(p, 'add'); else applyStockAdjust(p, 1); }} 
                          disabled={adjustingStockId === p.product_id}
                          className="w-7 h-7 flex items-center justify-center rounded-md bg-background border border-border text-muted-foreground hover:bg-muted hover:text-emerald-500 transition-all active:scale-90 disabled:opacity-50 cursor-pointer"
                          title="Add Real Stock"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>

                      {/* Paper Stock */}
                      <div className="col-span-2 flex flex-col items-center justify-center text-center">
                        {(() => {
                          const displayPaperStock = Number(p.paper_stock !== undefined && p.paper_stock !== null ? p.paper_stock : (da.paper_stock || 0));
                          return displayPaperStock > 0 ? (
                            <span className="text-xs font-black text-purple-600 dark:text-purple-400 bg-purple-500/10 border border-purple-500/25 px-2.5 py-0.5 rounded-full inline-flex items-center gap-1 shadow-2xs" title={localizeTaxText("Paper Stock from Dummy GST purchases")}>
                              <Package className="w-3 h-3" />
                              {displayPaperStock} {p.uom}
                            </span>
                          ) : (
                            <span className="text-xs font-semibold text-muted-foreground/35">
                              0 {p.uom}
                            </span>
                          );
                        })()}
                      </div>

                      {/* Actions */}
                      <div className="col-span-2 flex items-center justify-center gap-1">
                        <button onClick={() => { setPrintModalProduct(p); setPrintQuantity(1); setPrintPrice(true); }} className="p-1.5 text-muted-foreground hover:text-blue-500 hover:bg-muted rounded-lg transition-colors cursor-pointer" title="Print Barcode">
                          <Printer className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => openEdit(p)} className="p-1.5 text-muted-foreground hover:text-primary hover:bg-muted rounded-lg transition-colors cursor-pointer" title="Edit">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleDelete(p)} className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-muted rounded-lg transition-colors cursor-pointer" title="Delete">
                          <Trash className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </Fragment>
            ))}

            {/* Infinite Scroll Sentinel & Loader */}
            <div ref={sentinelRef} className="w-full shrink-0 min-h-[1px]">
              {isFetching && offset > 0 && (
                <div className="py-6 flex justify-center items-center">
                  <div className="flex gap-2 items-center text-muted-foreground text-sm font-medium">
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Loading next 50 products...</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {!hasMore && products.length > 0 && (
            <div className="shrink-0 border-t border-border bg-muted/20 px-6 py-4 text-center text-sm font-bold text-muted-foreground">
              End of inventory list &middot; {totalCount !== null ? totalCount : products.length} total products
            </div>
          )}
          
          {/* Low Stock summary bar */}
          {showLowStockAlert && products.some(p => (p.current_stock ?? 0) <= (p.reorder_level ?? 0) && (p.reorder_level ?? 0) > 0) && (
            <div className="shrink-0 border-t border-amber-500/30 bg-amber-500/10 px-4 py-2.5 flex items-center gap-2 text-amber-600 dark:text-amber-400 text-sm font-bold">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span className="flex-1">{products.filter(p => (p.current_stock ?? 0) <= (p.reorder_level ?? 0) && (p.reorder_level ?? 0) > 0).length} item(s) at or below Low Stock Alert</span>
              {stockFilter !== 'low_stock' && (
                <button
                  onClick={() => setStockFilter('low_stock')}
                  className="px-2.5 py-1 text-xs font-extrabold rounded-lg bg-amber-500 text-white hover:bg-amber-600 transition-colors cursor-pointer"
                >
                  Filter Low Stock
                </button>
              )}
              <button onClick={() => setShowLowStockAlert(false)} className="p-1 rounded-md border border-amber-500/30 hover:bg-amber-500/15 transition-colors cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
  );
};
