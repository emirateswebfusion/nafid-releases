import { getCurrencyPrefix, getCurrencyDecimals } from '../../../utils/localization/storeProfile';
import React from 'react';
import { Search, Plus, Package } from 'lucide-react';
import clsx from 'clsx';
import { PurchaseProductFormModal } from './PurchaseProductFormModal';
import type { Product } from '../purchaseTypes';
import type { PricingTier } from '../../../data/pricingTiers';
import type { PurchaseProductFormState } from '../hooks/usePurchaseProductFormState';

export interface PurchaseProductSearchProps {
  activePricingTiers: PricingTier[];
  addProductToBill: (product: Product) => Promise<void>;
  autoGenerateBarcode: () => Promise<void>;
  enableRealPaperStock: boolean;
  handleCreateAndAddProduct: (retries?: number) => Promise<void>;
  handleDiscountFlatChange: (val: string) => void;
  handleDiscountPercentChange: (val: string) => void;
  handleFormKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  handleOfferPriceChange: (val: string) => void;
  handlePurchasePriceChange: (val: string) => void;
  handleTaxRateChange: (val: string) => void;
  highlightedProductIndex: number;
  isSearchingProducts: boolean;
  productItemRefs: React.RefObject<(HTMLButtonElement | null)[]>;
  products: Product[];
  productSearch: string;
  productSearchInputRef: React.RefObject<HTMLInputElement | null>;
  resetProductForm: () => void;
  searchDropdownPos: { top: number; left: number; width: number; } | null;
  searchProducts: (q: string) => Promise<void>;
  searchRef: React.RefObject<HTMLDivElement | null>;
  setHighlightedProductIndex: React.Dispatch<React.SetStateAction<number>>;
  setProducts: React.Dispatch<React.SetStateAction<Product[]>>;
  setProductSearch: React.Dispatch<React.SetStateAction<string>>;
  type: "GST" | "ESTIMATE";
  productForm: PurchaseProductFormState;
}

/** Product search of the purchase bill form: search box with keyboard navigation and the results dropdown (add to bill, edit, create new). */
export function PurchaseProductSearch({
  activePricingTiers, addProductToBill, autoGenerateBarcode, enableRealPaperStock, handleCreateAndAddProduct,
  handleDiscountFlatChange, handleDiscountPercentChange, handleFormKeyDown, handleOfferPriceChange,
  handlePurchasePriceChange, handleTaxRateChange, highlightedProductIndex, isSearchingProducts, productItemRefs,
  products, productSearch, productSearchInputRef, resetProductForm, searchDropdownPos, searchProducts, searchRef,
  setHighlightedProductIndex, setProducts, setProductSearch, type, productForm,
}: PurchaseProductSearchProps) {
  const { setNewProductName, setShowProductCreateForm, showProductCreateForm } = productForm;
  return (
    <div ref={searchRef} className="relative mb-4">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            ref={productSearchInputRef}
            type="text"
            placeholder="Search products... (F2)"
            value={productSearch}
            onChange={e => searchProducts(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (products.length > 0) {
                  setHighlightedProductIndex(prev => (prev + 1) % products.length);
                }
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (products.length > 0) {
                  setHighlightedProductIndex(prev => (prev - 1 + products.length) % products.length);
                }
              } else if (e.key === 'Enter') {
                e.preventDefault();
                if (products.length > 0 && products[highlightedProductIndex]) {
                  addProductToBill(products[highlightedProductIndex]);
                  setProducts([]);
                  setProductSearch('');
                } else if (!isSearchingProducts && productSearch.length >= 2) {
                  setShowProductCreateForm(true);
                  setNewProductName(productSearch);
                }
              } else if (e.key === 'Escape') {
                setProducts([]);
                setProductSearch('');
              } else if (e.key === ' ' && productSearch.trim() === '') {
                e.preventDefault();
                setShowProductCreateForm(true);
                setNewProductName('');
              }
            }}
            className="w-full bg-background/50 border border-border rounded-xl py-2.5 pl-9 pr-3 text-xs font-semibold text-foreground placeholder:text-muted-foreground/40 focus:border-primary focus:ring-4 focus:ring-primary/10 focus:bg-background transition-all"
          />
        </div>
        <button
          type="button"
          onClick={() => { setShowProductCreateForm(true); setNewProductName(''); }}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl transition-all text-xs font-bold shrink-0 cursor-pointer active:scale-95 border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 shadow-sm"
          title="Add new product"
        >
          <Plus className="w-4 h-4" />
          <span>Add</span>
        </button>
      </div>
      {searchDropdownPos && products.length > 0 && !showProductCreateForm && (
        <div style={{ position: 'fixed', top: searchDropdownPos.top, left: searchDropdownPos.left, width: searchDropdownPos.width, zIndex: 50 }} className="bg-card border border-border/80 rounded-xl shadow-xl max-h-80 overflow-y-auto">
          {products.map((p, idx) => {
            const isSelected = idx === highlightedProductIndex;
            return (
              <button
                key={p.product_id} type="button"
                ref={el => { productItemRefs.current[idx] = el; }}
                onMouseDown={() => addProductToBill(p)}
                onMouseEnter={() => setHighlightedProductIndex(idx)}
                className={clsx(
                  "w-full text-left px-3 py-2.5 flex items-center gap-2.5 border-b border-border/40 last:border-0 transition-colors cursor-pointer",
                  isSelected ? "bg-primary/15 border-primary/30 text-primary font-bold shadow-xs" : "hover:bg-muted text-foreground"
                )}
              >
                <Package className={clsx("w-3.5 h-3.5 shrink-0", isSelected ? "text-primary" : "text-muted-foreground")} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold truncate flex items-center gap-1.5">
                    <span>{p.name.replace(/\s*\((GST|EST|Estimate)\)$/i, '')}</span>
                    {/\s*\((GST|EST|Estimate)\)$/i.test(p.name) && (
                      <span className={clsx(
                        "text-[8px] px-1.2 py-0.2 rounded font-black tracking-wide border uppercase select-none leading-none",
                        p.name.match(/\s*\((GST|EST|Estimate)\)$/i)?.[1].toUpperCase() === 'GST'
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                          : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
                      )}>
                        {p.name.match(/\s*\((GST|EST|Estimate)\)$/i)?.[1]}
                      </span>
                    )}
                  </p>
                  <p className="text-[11px] text-muted-foreground font-mono">{p.sku_barcode}</p>
                </div>
                <div className="text-right text-[11px] shrink-0">
                  <div className="font-semibold text-foreground">Stock: {Number(p.current_stock).toFixed(0)}</div>
                  <div className="text-muted-foreground">{getCurrencyPrefix()}{Number(p.base_price).toFixed(getCurrencyDecimals())}</div>
                </div>
              </button>
            );
          })}
        </div>
      )}
      {searchDropdownPos && productSearch.length >= 2 && products.length === 0 && !isSearchingProducts && !showProductCreateForm && (
        <div style={{ position: 'fixed', top: searchDropdownPos.top, left: searchDropdownPos.left, width: searchDropdownPos.width, zIndex: 50 }} className="bg-card border border-border/80 rounded-xl shadow-xl overflow-hidden">
          <button
            type="button"
            onMouseDown={() => { setShowProductCreateForm(true); setNewProductName(productSearch); }}
            className="w-full text-left px-3 py-2.5 flex items-center gap-2.5 hover:bg-muted transition-colors cursor-pointer border-0"
          >
            <Plus className="w-3.5 h-3.5 shrink-0 text-primary" />
            <div>
              <p className="text-sm font-bold text-primary">Create "{productSearch}"</p>
              <p className="text-[11px] text-muted-foreground">Add as a new product</p>
            </div>
          </button>
        </div>
      )}
      {showProductCreateForm && (
        <>
          <PurchaseProductFormModal
            activePricingTiers={activePricingTiers} autoGenerateBarcode={autoGenerateBarcode}
            enableRealPaperStock={enableRealPaperStock} handleCreateAndAddProduct={handleCreateAndAddProduct}
            handleDiscountFlatChange={handleDiscountFlatChange}
            handleDiscountPercentChange={handleDiscountPercentChange} handleFormKeyDown={handleFormKeyDown}
            handleOfferPriceChange={handleOfferPriceChange} handlePurchasePriceChange={handlePurchasePriceChange}
            handleTaxRateChange={handleTaxRateChange} resetProductForm={resetProductForm} type={type}
            productForm={productForm}
          />
        </>
      )}
    </div>
  );
}
