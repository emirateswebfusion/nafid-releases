import React from 'react';
import { Loader2, Search, X, Plus, Clock } from 'lucide-react';
import clsx from 'clsx';
import { formatCurrency } from '../BillingConstants';
import { parseUTCDate } from '../../../utils/print/receiptGenerator';
import { getStoreTimezone } from '../../../utils/time/timezoneHelper';
import type { BillingUIConfig } from '../../../store/billingUIStore';
import type { InvoiceType } from '../../../store/cartStore';
import type { Invoice } from '../../../data/invoices';
import type { ProductSearchResult, ScrapCategoryResult } from '../productSearch';
import type { ProductSearchState } from '../hooks/useProductSearchState';

export interface BillingSearchBarProps {
  getTierPriceForProduct: (product: ProductSearchResult) => number | undefined;
  handleSearchKey: (e: React.KeyboardEvent) => Promise<void>;
  handleSelectPastBill: (invoice: Invoice) => Promise<void>;
  handleSelectProduct: (product: ProductSearchResult) => void;
  handleSelectReturnInvoice: (inv: Invoice) => Promise<void>;
  handleSelectScrapItem: (cat: ScrapCategoryResult) => void;
  invoiceType: InvoiceType;
  isQuotationActive: boolean;
  isQuotationMode: boolean;
  isReturnMode: boolean;
  isScrapActive: boolean;
  isScrapMode: boolean;
  productSearch: ProductSearchState;
  searchRef: React.RefObject<HTMLInputElement | null>;
  setIsScrapMode: (isScrapMode: boolean) => void;
  setNewProductName: React.Dispatch<React.SetStateAction<string>>;
  setQuotationMode: (isQuotationMode: boolean) => void;
  setReturnMode: (isReturnMode: boolean) => void;
  setShowProductCreateForm: React.Dispatch<React.SetStateAction<boolean>>;
  showProductCreateForm: boolean;
  uiConfig: BillingUIConfig;
}

export function BillingSearchBar({ getTierPriceForProduct, handleSearchKey, handleSelectPastBill, handleSelectProduct, handleSelectReturnInvoice, handleSelectScrapItem, invoiceType, isQuotationActive, isQuotationMode, isReturnMode, isScrapActive, isScrapMode, productSearch, searchRef, setIsScrapMode, setNewProductName, setQuotationMode, setReturnMode, setShowProductCreateForm, showProductCreateForm, uiConfig }: BillingSearchBarProps) {
  const { searchQuery, setSearchQuery, isProductSearching, results, setResults, selectedIndex, setSelectedIndex, isPastBillMode, setIsPastBillMode, pastBillResults, setPastBillResults, returnSearchResults, setReturnSearchResults, scrapSearchResults, setScrapSearchResults, searchResultListRef, searchContainerRef } = productSearch;
  return (
    <div className="p-3 pb-2.5 bg-card border-b border-border">
      <div ref={searchContainerRef} className="relative">
        <div className="flex gap-2">
          <div className="relative flex-1">
            {isProductSearching ? (
              <Loader2 className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-primary animate-spin" />
            ) : (
              <Search className={clsx(
                "absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 transition-colors duration-300",
                isScrapActive ? "text-orange-500" :
                isReturnMode ? "text-rose-500" :
                isQuotationActive ? "text-blue-500" :
                isPastBillMode ? "text-teal-500" :
                "text-muted-foreground"
              )} />
            )}
            <input
              ref={searchRef}
              type="text"
              autoFocus={uiConfig.entryFocusOrder !== 'customer-first'}
              placeholder={isScrapActive ? "Search scrap categories... (Scrap Mode)" : isReturnMode ? "Search invoices for return... (Return Mode)" : isQuotationActive ? "Search products... (Quotation Mode)" : isPastBillMode ? "Search past bills by invoice number..." : invoiceType === 'GST' ? "Search GST products or scan barcode... (Press F2)" : "Search products or scan barcode... (Press F2)"}
              value={searchQuery}
              onChange={e => {
                const val = e.target.value;
                setSearchQuery(val);
                if (!val.trim()) {
                  setResults([]);
                  setScrapSearchResults([]);
                  setReturnSearchResults([]);
                  setPastBillResults([]);
                }
              }}
              onKeyDown={handleSearchKey}
              className="search-dynamic w-full pl-10 pr-9 py-2.5 bg-background rounded-xl text-sm font-medium text-foreground transition-all duration-300 placeholder:text-muted-foreground/50 focus:outline-none"
              style={{
                borderWidth: '1px',
                borderStyle: 'solid',
                borderColor: isScrapActive
                  ? 'rgb(249,115,22)'
                  : isReturnMode
                  ? 'rgb(244,63,94)'
                  : isQuotationActive
                  ? 'rgb(59,130,246)'
                  : isPastBillMode
                  ? 'rgb(20,184,166)'
                  : 'hsl(var(--border))',
                boxShadow: isScrapActive
                  ? '0 0 0 3px rgba(249,115,22,0.15)'
                  : isReturnMode
                  ? '0 0 0 3px rgba(244,63,94,0.15)'
                  : isQuotationActive
                  ? '0 0 0 3px rgba(59,130,246,0.15)'
                  : isPastBillMode
                  ? '0 0 0 3px rgba(20,184,166,0.15)'
                  : undefined,
              } as React.CSSProperties}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setResults([]);
                  setScrapSearchResults([]);
                  setReturnSearchResults([]);
                  setPastBillResults([]);
                  searchRef.current?.focus();
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => { setShowProductCreateForm(true); setNewProductName(searchQuery); }}
            className="flex items-center gap-1 px-3 py-2.5 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 rounded-xl text-xs font-bold transition-all shrink-0 active:scale-95 cursor-pointer shadow-2xs"
            title="Create product (Press Space when search empty)"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add</span>
          </button>

          {/* Past Bill Mode Toggle */}
          <button
            type="button"
            onClick={async () => {
              const next = !isPastBillMode;
              setIsPastBillMode(next);
              if (next && isScrapMode) setIsScrapMode(false);
              if (next && isReturnMode) setReturnMode(false);
              if (next && isQuotationMode) setQuotationMode(false);
              setPastBillResults([]);
              if (next) setTimeout(() => searchRef.current?.focus(), 100);
            }}
            className={clsx(
              "flex items-center gap-1 px-3 py-2.5 rounded-xl text-xs font-bold transition-all shrink-0 active:scale-95 cursor-pointer border",
              isPastBillMode
                ? "bg-teal-500/15 text-teal-600 dark:text-teal-400 border-teal-500/40 shadow-xs"
                : "bg-muted/60 text-muted-foreground hover:text-foreground hover:bg-muted border-border/40"
            )}
            title="Past Bill Lookup Mode"
          >
            <Clock className={clsx("w-3.5 h-3.5", isPastBillMode ? "text-teal-500" : "text-muted-foreground")} />
            <span>Past Bill</span>
          </button>
        </div>

        {/* Floating Search Dropdown */}
        {isPastBillMode && searchQuery.trim().length > 0 && pastBillResults.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-2 bg-card border border-border rounded-2xl shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="px-4 py-2.5 bg-teal-500/10 border-b border-border flex items-center justify-between text-xs font-semibold select-none">
              <div className="flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
                <span className="font-extrabold tracking-tight text-teal-700 dark:text-teal-300 uppercase text-[11px]">Past Bills</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-500/15 text-teal-700 dark:text-teal-300 border border-teal-500/30">
                  {pastBillResults.length} Found
                </span>
              </div>
              <span className="text-[11px] text-muted-foreground font-medium">Select bill to load details</span>
            </div>
            <div ref={searchResultListRef} className="max-h-[400px] overflow-y-auto custom-scrollbar divide-y divide-border">
              {pastBillResults.map((inv, i: number) => (
                <button
                  key={inv.invoice_id || inv.invoice_number}
                  data-search-index={i}
                  onClick={() => {
                    handleSelectPastBill(inv);
                  }}
                  onMouseEnter={() => setSelectedIndex(i)}
                  className={clsx(
                    "w-full text-left px-4 py-3 transition-all duration-150 flex items-center justify-between cursor-pointer group border-l-4",
                    selectedIndex === i
                      ? "bg-teal-500/10 border-l-teal-500 font-bold"
                      : "hover:bg-muted/50 border-l-transparent text-foreground"
                  )}
                >
                  <div className="flex-1 min-w-0 pr-3">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-foreground group-hover:text-teal-600 transition-colors">{inv.invoice_number}</span>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-muted text-muted-foreground border border-border uppercase">{inv.payment_method}</span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-1">
                      {inv.customer_name || 'Walk-in Customer'} {inv.customer_phone ? `(${inv.customer_phone})` : ''}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-sm font-mono font-black text-foreground block">{formatCurrency(inv.grand_total)}</span>
                    <span className="text-[10px] text-muted-foreground mt-0.5 block">{parseUTCDate(inv.created_at).toLocaleDateString('en-IN', { timeZone: getStoreTimezone() })}</span>
                  </div>
                </button>
              ))}
            </div>
            <div className="px-4 py-2 bg-muted/60 border-t border-border flex items-center justify-between text-[11px] text-muted-foreground font-medium select-none">
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 text-[10px] font-mono font-bold bg-background border border-border rounded text-foreground shadow-2xs">↑</kbd>
                  <kbd className="px-1.5 py-0.5 text-[10px] font-mono font-bold bg-background border border-border rounded text-foreground shadow-2xs">↓</kbd>
                  <span>Navigate</span>
                </span>
                <span className="inline-flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 text-[10px] font-mono font-bold bg-background border border-border rounded text-foreground shadow-2xs">↵ Enter</kbd>
                  <span>View Bill</span>
                </span>
              </div>
              <span className="inline-flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 text-[10px] font-mono font-bold bg-background border border-border rounded text-foreground shadow-2xs">Esc</kbd>
                <span>Close</span>
              </span>
            </div>
          </div>
        )}

        {!isPastBillMode && searchQuery.trim().length > 0 && (isScrapMode ? scrapSearchResults.length > 0 : isReturnMode ? returnSearchResults.length > 0 : results.length > 0) && (
          <div className="absolute top-full left-0 right-0 mt-2 bg-card border border-border rounded-2xl shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
            {/* Header Bar */}
            <div className="px-4 py-2.5 bg-muted/80 border-b border-border flex items-center justify-between text-xs font-semibold select-none">
              <div className="flex items-center gap-2">
                <Search className="w-3.5 h-3.5 text-primary shrink-0" />
                <span className="font-extrabold tracking-tight text-foreground uppercase text-[11px]">
                  {isScrapMode ? 'Scrap Categories' : isReturnMode ? 'Returnable Invoices' : 'Search Results'}
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/10 text-primary border border-primary/20">
                  {isScrapMode ? scrapSearchResults.length : isReturnMode ? returnSearchResults.length : results.length} Found
                </span>
              </div>
              {searchQuery && (
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground font-medium">
                  <span>Matching:</span>
                  <span className="px-2 py-0.5 rounded bg-background border border-border text-foreground font-mono font-bold text-xs">"{searchQuery}"</span>
                </div>
              )}
            </div>

            {/* Results List */}
            <div ref={searchResultListRef} className="max-h-[420px] overflow-y-auto custom-scrollbar divide-y divide-border">
              {isScrapMode ? (
                scrapSearchResults.map((cat, i: number) => {
                  const rate = Number(cat.purchase_price ?? cat.rate ?? cat.selling_price) || 0;
                  return (
                    <button
                      key={cat.scrap_category_id}
                      data-search-index={i}
                      onClick={() => handleSelectScrapItem(cat)}
                      className={clsx(
                        "w-full text-left px-4 py-3 transition-all duration-150 flex items-center justify-between cursor-pointer group border-l-4",
                        selectedIndex === i
                          ? "bg-orange-500/10 border-l-orange-500 font-bold"
                          : "hover:bg-muted/50 border-l-transparent text-foreground"
                      )}
                    >
                      <div className="flex-1 min-w-0 pr-3">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-foreground group-hover:text-orange-600 transition-colors">{cat.name}</span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-orange-500/10 text-orange-600 border border-orange-500/20 uppercase">Scrap</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="font-mono font-black text-orange-600 dark:text-orange-400 text-sm">
                          {formatCurrency(rate)}/{cat.unit || 'Kg'}
                        </span>
                      </div>
                    </button>
                  );
                })
              ) : isReturnMode ? (
                returnSearchResults.map((inv, i: number) => (
                  <button
                    key={inv.invoice_id}
                    data-search-index={i}
                    onClick={() => handleSelectReturnInvoice(inv)}
                    className={clsx(
                      "w-full text-left px-4 py-3 transition-all duration-150 flex items-center justify-between cursor-pointer group border-l-4",
                      selectedIndex === i
                        ? "bg-rose-500/10 border-l-rose-500 font-bold"
                        : "hover:bg-muted/50 border-l-transparent text-foreground"
                    )}
                  >
                    <div className="flex-1 min-w-0 pr-3">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-foreground group-hover:text-rose-600 transition-colors">{inv.invoice_number}</span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-1">
                        {inv.customer_name || 'Walk-in Customer'} {inv.customer_phone ? `(${inv.customer_phone})` : ''}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="font-mono font-black text-rose-600 dark:text-rose-400 text-sm block">
                        {formatCurrency(inv.grand_total)}
                      </span>
                    </div>
                  </button>
                ))
              ) : (
                results.map((p, i) => {
                  const basePrice = getTierPriceForProduct(p) ?? Number(p.base_price || 0);

                  let finalPrice: number | null = null;
                  if (p.offer_price != null && Number(p.offer_price) > 0) {
                    finalPrice = Number(p.offer_price);
                  } else if (p.discount_flat != null && Number(p.discount_flat) > 0) {
                    finalPrice = Math.max(0, basePrice - Number(p.discount_flat));
                  } else if (p.discount_percent != null && Number(p.discount_percent) > 0) {
                    finalPrice = Math.max(0, basePrice * (1 - Number(p.discount_percent) / 100));
                  }

                  const hasDiscount = finalPrice !== null && finalPrice < basePrice;
                  const displayPrice = hasDiscount ? finalPrice! : basePrice;
                  const weightUoms = ['kgs', 'grams', 'mtrs', 'ltrs', 'kg', 'gram', 'mtr', 'ltr'];
                  const isWeightProduct = p.billing_type === 'WEIGHT' || weightUoms.includes(String(p.uom || '').toLowerCase());
                  let piecesPerKg = Number(p.pieces_per_kg) || 0;
                  if (isWeightProduct && piecesPerKg <= 0 && p.domain_attributes) {
                    try {
                      const attrs = typeof p.domain_attributes === 'string' ? JSON.parse(p.domain_attributes) : p.domain_attributes;
                      const storedPcsPerKg = Number(attrs?.pcs_per_kg) || 0;
                      const totalPcs = Number(attrs?.pcs) || 0;
                      const stockKg = Number(p.current_stock) || 0;
                      piecesPerKg = storedPcsPerKg > 0 ? storedPcsPerKg : (totalPcs > 0 ? (stockKg > 0 ? totalPcs / stockKg : totalPcs) : 0);
                    } catch { /* ignore */ }
                  }
                  const unitPriceRows = isWeightProduct
                    ? [
                        ...(piecesPerKg > 0 ? [{ label: '/pc', base: basePrice / piecesPerKg, current: displayPrice / piecesPerKg }] : []),
                        { label: '/kg', base: basePrice, current: displayPrice },
                      ]
                    : [{ label: '/pc', base: basePrice, current: displayPrice }];

                  return (
                    <button
                      key={p.product_id}
                      data-search-index={i}
                      onClick={() => handleSelectProduct(p)}
                      className={clsx(
                        "w-full text-left px-4 py-3 transition-all duration-150 flex items-center justify-between cursor-pointer group select-none border-l-4",
                        selectedIndex === i
                          ? "bg-primary/10 border-l-primary shadow-xs font-semibold text-foreground"
                          : "hover:bg-muted/60 border-l-transparent text-foreground"
                      )}
                    >
                      <div className="flex-1 min-w-0 pr-3">
                        <div className="flex items-center flex-wrap gap-2 mb-1">
                          <span className={clsx(
                            "font-bold text-sm text-foreground transition-colors truncate",
                            selectedIndex === i ? "text-primary" : "group-hover:text-primary"
                          )}>
                            {p.name}
                          </span>
                          {p.isCombo && (
                            <span className="text-[9px] font-black text-purple-600 dark:text-purple-400 bg-purple-500/10 border border-purple-500/20 px-1.5 py-0.5 rounded-full uppercase tracking-wider">
                              COMBO
                            </span>
                          )}
                          {p.sku_barcode && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-mono font-semibold text-foreground bg-muted px-2 py-0.5 rounded border border-border">
                              <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-sans">SKU</span>
                              {p.sku_barcode}
                            </span>
                          )}
                          {p.item_code && p.item_code !== p.sku_barcode && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-mono font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/20">
                              <span className="text-[9px] uppercase tracking-wider text-primary/80 font-sans font-normal">CODE</span>
                              {p.item_code}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          {p.brand_manufacturer && (
                            <span className="flex items-center gap-1">
                              <span className="font-semibold text-muted-foreground">Brand:</span>
                              <span className="font-bold text-foreground">{p.brand_manufacturer}</span>
                            </span>
                          )}
                          {p.category && (
                            <span className="flex items-center gap-1">
                              <span className="font-semibold text-muted-foreground">Cat:</span>
                              <span className="text-foreground">{p.category}</span>
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0 flex flex-col items-end justify-center pl-2">
                        {hasDiscount ? (
                          <div className="flex flex-col items-end">
                            {unitPriceRows.map(row => (
                              <div key={row.label} className="flex items-center gap-1.5">
                                {row.current < row.base - 0.005 && (
                                  <span className="font-mono text-xs font-semibold text-muted-foreground/70 line-through">
                                    {formatCurrency(row.base)}{row.label}
                                  </span>
                                )}
                                <span className="font-mono font-black text-base text-emerald-600 dark:text-emerald-400 tracking-tight group-hover:scale-105 transition-transform">
                                  {formatCurrency(row.current)}{row.label}
                                </span>
                              </div>
                            ))}
                            <div className="flex items-center gap-1.5 mt-1">
                              <span className="text-[9px] font-extrabold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.2 rounded uppercase">
                                {p.offer_price ? 'OFFER' : p.discount_percent ? `${p.discount_percent}% OFF` : 'DISCOUNT'}
                              </span>
                              {Number(p.current_stock) <= 0 ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-destructive/10 text-destructive border border-destructive/20">
                                  Out of Stock
                                </span>
                              ) : Number(p.current_stock) <= 5 ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                                  Stock: {p.current_stock} {p.uom || 'Pcs'}
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                  Stock: {p.current_stock} {p.uom || 'Pcs'}
                                </span>
                              )}
                            </div>
                          </div>
                        ) : (
                          <>
                            {unitPriceRows.map(row => (
                              <div key={row.label} className="font-mono font-black text-base text-foreground tracking-tight group-hover:scale-105 transition-transform">
                                {formatCurrency(row.current)}{row.label}
                              </div>
                            ))}
                            <div className="mt-1">
                              {Number(p.current_stock) <= 0 ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-destructive/10 text-destructive border border-destructive/20">
                                  Out of Stock
                                </span>
                              ) : Number(p.current_stock) <= 5 ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                                  Stock: {p.current_stock} {p.uom || 'Pcs'}
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                  Stock: {p.current_stock} {p.uom || 'Pcs'}
                                </span>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            {/* Footer Navigation Hints */}
            <div className="px-4 py-2 bg-muted/60 border-t border-border flex items-center justify-between text-[11px] text-muted-foreground font-medium select-none">
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 text-[10px] font-mono font-bold bg-background border border-border rounded text-foreground shadow-2xs">↑</kbd>
                  <kbd className="px-1.5 py-0.5 text-[10px] font-mono font-bold bg-background border border-border rounded text-foreground shadow-2xs">↓</kbd>
                  <span>Navigate</span>
                </span>
                <span className="inline-flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 text-[10px] font-mono font-bold bg-background border border-border rounded text-foreground shadow-2xs">↵ Enter</kbd>
                  <span>Select Item</span>
                </span>
              </div>
              <span className="inline-flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 text-[10px] font-mono font-bold bg-background border border-border rounded text-foreground shadow-2xs">Esc</kbd>
                <span>Close</span>
              </span>
            </div>
          </div>
        )}

        {!isPastBillMode && !isScrapMode && !isReturnMode && searchQuery.trim().length >= 2 && results.length === 0 && !showProductCreateForm && (
          <div className="absolute top-full left-0 right-0 mt-2 bg-card/95 backdrop-blur-xl border border-border/80 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.25)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.6)] z-50 animate-in fade-in slide-in-from-top-2 duration-200 overflow-hidden">
            <button
              type="button"
              onClick={() => { setShowProductCreateForm(true); setNewProductName(searchQuery); }}
              className="w-full text-left p-4 flex items-center justify-between hover:bg-primary/5 transition-all cursor-pointer group"
            >
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-primary/10 text-primary group-hover:scale-110 transition-transform">
                  <Plus className="w-5 h-5 shrink-0" />
                </div>
                <div>
                  <p className="text-sm font-bold text-foreground group-hover:text-primary transition-colors flex items-center gap-2">
                    Create "<span className="text-primary font-extrabold">{searchQuery}</span>"
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">Item not found. Click or press Enter to add to inventory</p>
                </div>
              </div>
              <span className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-primary text-primary-foreground shadow-sm">
                + Add Product
              </span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
