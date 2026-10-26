import type * as B from '../billingTypes';
import React from 'react';
import clsx from 'clsx';
import { Skeleton } from '../../ui/Skeleton';
import { useCartStore, type CartItem } from '../../../store/cartStore';
import { useTabStore } from '../../../store/tabStore';
import type { BillingUIConfig } from '../../../store/billingUIStore';
import { CartItemRow } from './cart/CartItemRow';
import { CartScrapRow } from './cart/CartScrapRow';
import { CartReturnRow } from './cart/CartReturnRow';
import { CartServiceRow } from './cart/CartServiceRow';

type NumericMap = Record<string, number>;
type StringMap = Record<string, string>;
type InputRefMap = React.MutableRefObject<Record<string, HTMLInputElement | null>>;

export interface BillingCartViewProps {
  uiConfig: BillingUIConfig;
  isLoadingEditBill: boolean;
  productPricingMap: Record<string, Record<string, number>>;
  pricingTiers: B.Tier[];
  searchBarSection: React.ReactNode;
  customerDetailsSection: React.ReactNode;
  localKgStr: StringMap;
  setLocalKgStr: React.Dispatch<React.SetStateAction<StringMap>>;
  localPcsStr: StringMap;
  setLocalPcsStr: React.Dispatch<React.SetStateAction<StringMap>>;
  localDiscPcts: NumericMap;
  setLocalDiscPcts: React.Dispatch<React.SetStateAction<NumericMap>>;
  localDiscFlats: NumericMap;
  setLocalDiscFlats: React.Dispatch<React.SetStateAction<NumericMap>>;
  itemRefs: React.MutableRefObject<Record<string, HTMLDivElement | null>>;
  qtyRefs: InputRefMap;
  pcsRefs: InputRefMap;
  kRefs: InputRefMap;
  rateKgRefs: InputRefMap;
  ratePcRefs: InputRefMap;
  discRefs: InputRefMap;
  discFlatRefs: InputRefMap;
  totalInputRefs: InputRefMap;
  pendingFocusProductIdRef: React.MutableRefObject<string | null>;
  activeCartProductIdRef: React.MutableRefObject<string | null>;
  setFocusedRowProductId: (id: string | null) => void;
  focusNextCartField: (currentField: string, productId: string) => void;
  focusPrevCartField: (currentField: string, productId: string) => void;
  handleRateUpDown: (productId: string, direction: 'up' | 'down') => void;
  handleEditProduct: (item: CartItem) => void;
  handleQtyKeyDown: (e: React.KeyboardEvent, productId: string) => void;
  handlePcsKeyDown: (e: React.KeyboardEvent, productId: string) => void;
  handleDiscKeyDown: (e: React.KeyboardEvent, productId: string) => void;
  handleDiscFlatKeyDown: (e: React.KeyboardEvent, productId: string) => void;
  handleTotalInputKeyDown: (e: React.KeyboardEvent, productId: string) => void;
  guardScannerInput: (
    e: React.KeyboardEvent,
    productId: string,
    currentValue: number | string,
    restore: (v: number | string) => void
  ) => void;
  sanitizeQtyText: (raw: string) => string;
}

export const BillingCartView: React.FC<BillingCartViewProps> = ({
  uiConfig,
  isLoadingEditBill,
  productPricingMap,
  pricingTiers,
  searchBarSection,
  customerDetailsSection,
  localKgStr,
  setLocalKgStr,
  localPcsStr,
  setLocalPcsStr,
  localDiscPcts,
  setLocalDiscPcts,
  localDiscFlats,
  setLocalDiscFlats,
  itemRefs,
  qtyRefs,
  pcsRefs,
  kRefs,
  rateKgRefs,
  ratePcRefs,
  discRefs,
  discFlatRefs,
  totalInputRefs,
  pendingFocusProductIdRef,
  activeCartProductIdRef,
  setFocusedRowProductId,
  focusNextCartField,
  focusPrevCartField,
  handleRateUpDown,
  handleEditProduct,
  handleQtyKeyDown,
  handlePcsKeyDown,
  handleDiscKeyDown,
  handleDiscFlatKeyDown,
  handleTotalInputKeyDown,
  guardScannerInput,
  sanitizeQtyText,
}) => {
  const items = useCartStore(s => s.items);
  const lastAddedProductId = useCartStore(s => s.lastAddedProductId);
  const isScrapMode = useCartStore(s => s.isScrapMode);
  const isReturnMode = useCartStore(s => s.isReturnMode);
  const updateQuantity = useCartStore(s => s.updateQuantity);
  const removeItem = useCartStore(s => s.removeItem);
  const updateItemDiscount = useCartStore(s => s.updateItemDiscount);
  const removeItemDiscount = useCartStore(s => s.removeItemDiscount);
  const updateItemOfferPrice = useCartStore(s => s.updateItemOfferPrice);
  const updatePiecesOverride = useCartStore(s => s.updatePiecesOverride);
  const updateItemPricingTier = useCartStore(s => s.updateItemPricingTier);
  const syncActiveSnapshot = useTabStore(s => s.syncActiveSnapshot);

  const emptyIcon = (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8">
      <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
      <line x1="3" y1="6" x2="21" y2="6" />
      <path d="M16 10a4 4 0 0 1-8 0" />
    </svg>
  );

  return (
    <div 
      className={clsx(
        "flex flex-col transition-all duration-300",
        uiConfig.orientation === 'horizontal-stack' ? "w-full flex-1 min-h-[200px] border-b-2 border-border overflow-hidden" :
        (uiConfig.orientation === 'three-column' || uiConfig.showQuickCategoryBar) ? "w-[48%] border-r border-border" :
        uiConfig.splitRatio === '50-50' ? "w-[50%] border-r border-border" :
        uiConfig.splitRatio === '65-35' ? "w-[65%] border-r border-border" :
        uiConfig.splitRatio === '70-30' ? "w-[70%] border-r border-border" : "w-[58%] border-r border-border"
      )}
    >
      
      {uiConfig.entryFocusOrder === 'customer-first' ? (
        <>
          {customerDetailsSection}
          {searchBarSection}
        </>
      ) : (
        <>
          {searchBarSection}
          {customerDetailsSection}
        </>
      )}

      {/* Cart List */}
      <div className="flex-1 overflow-y-auto px-4 py-2 space-y-2">
        {isLoadingEditBill ? (
          <div className="space-y-3 py-3">
            {[1, 2, 3].map(n => (
              <div key={n} className="p-3.5 bg-card border border-border/60 rounded-xl space-y-2.5 shadow-sm">
                <div className="flex items-center justify-between gap-4">
                  <Skeleton className="h-4 w-1/2 rounded-md" />
                  <Skeleton className="h-4 w-1/5 rounded-md" />
                </div>
                <div className="flex items-center justify-between gap-4">
                  <Skeleton className="h-3 w-1/3 rounded-md" />
                  <Skeleton className="h-6 w-1/4 rounded-lg" />
                </div>
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground/60 gap-2 text-center max-w-xs mx-auto">
            <div className="w-12 h-12 rounded-2xl bg-card border border-border flex items-center justify-center text-muted-foreground shadow-sm">
              {emptyIcon}
            </div>
            <div>
              <p className="font-bold text-sm text-foreground/80">Your cart is empty</p>
              <p className="text-xs text-muted-foreground/80 mt-0.5">Search or scan to add items</p>
            </div>
            <div className="flex gap-1.5 mt-1 flex-wrap justify-center">
              <span className="px-2 py-0.5 text-[10px] font-extrabold bg-primary/10 text-primary rounded-full shadow-2xs">F1: Normal</span>
              <span className="px-2 py-0.5 text-[10px] font-extrabold bg-primary/10 text-primary rounded-full shadow-2xs">F2: Search</span>
              <span className="px-2 py-0.5 text-[10px] font-extrabold bg-primary/10 text-primary rounded-full shadow-2xs">F4: Customer</span>
              <span className="px-2 py-0.5 text-[10px] font-extrabold bg-primary/10 text-primary rounded-full shadow-2xs">F8: {isScrapMode ? 'Extra' : 'Discount'}</span>
              <span className="px-2 py-0.5 text-[10px] font-extrabold bg-primary/10 text-primary rounded-full shadow-2xs">F11: Pay Mode</span>
              <span className="px-2 py-0.5 text-[10px] font-extrabold bg-primary/10 text-primary rounded-full shadow-2xs">F12: Print</span>
            </div>
          </div>
        ) : (
          items.map((item, idx) => {
            const isLastAdded = item.product_id === lastAddedProductId;

            if (item.isServiceItem) {
              return (
                <CartServiceRow
                  key={item.product_id} guardScannerInput={guardScannerInput} handleEditProduct={handleEditProduct}
                  handleQtyKeyDown={handleQtyKeyDown} isLastAdded={isLastAdded} item={item} itemRefs={itemRefs}
                  pendingFocusProductIdRef={pendingFocusProductIdRef} qtyRefs={qtyRefs} removeItem={removeItem}
                  updateItemOfferPrice={updateItemOfferPrice}
                />
              );
            }

            if (item.isReturnItem) {
              return (
                <CartReturnRow
                  key={item.product_id} guardScannerInput={guardScannerInput} handleEditProduct={handleEditProduct}
                  handleQtyKeyDown={handleQtyKeyDown} isLastAdded={isLastAdded} isReturnMode={isReturnMode} item={item}
                  itemRefs={itemRefs} localKgStr={localKgStr} localPcsStr={localPcsStr}
                  pendingFocusProductIdRef={pendingFocusProductIdRef} qtyRefs={qtyRefs} removeItem={removeItem}
                  sanitizeQtyText={sanitizeQtyText} setLocalKgStr={setLocalKgStr} setLocalPcsStr={setLocalPcsStr}
                  updatePiecesOverride={updatePiecesOverride} updateQuantity={updateQuantity}
                />
              );
            }
            if (item.isScrap) {
              return (
                <CartScrapRow
                  key={item.product_id} discFlatRefs={discFlatRefs} discRefs={discRefs}
                  guardScannerInput={guardScannerInput} handleDiscFlatKeyDown={handleDiscFlatKeyDown}
                  handleDiscKeyDown={handleDiscKeyDown} handleEditProduct={handleEditProduct}
                  handleQtyKeyDown={handleQtyKeyDown} isLastAdded={isLastAdded} item={item} itemRefs={itemRefs}
                  localDiscFlats={localDiscFlats} localDiscPcts={localDiscPcts}
                  pendingFocusProductIdRef={pendingFocusProductIdRef} qtyRefs={qtyRefs} removeItem={removeItem}
                  removeItemDiscount={removeItemDiscount} sanitizeQtyText={sanitizeQtyText}
                  setLocalDiscFlats={setLocalDiscFlats} setLocalDiscPcts={setLocalDiscPcts}
                  syncActiveSnapshot={syncActiveSnapshot} updateItemDiscount={updateItemDiscount}
                  updateItemOfferPrice={updateItemOfferPrice} updateQuantity={updateQuantity}
                />
              );
            }

            return (
              <CartItemRow
                key={item.product_id} activeCartProductIdRef={activeCartProductIdRef} discFlatRefs={discFlatRefs}
                discRefs={discRefs} focusNextCartField={focusNextCartField} focusPrevCartField={focusPrevCartField}
                guardScannerInput={guardScannerInput} handleDiscFlatKeyDown={handleDiscFlatKeyDown}
                handleDiscKeyDown={handleDiscKeyDown} handleEditProduct={handleEditProduct}
                handlePcsKeyDown={handlePcsKeyDown} handleQtyKeyDown={handleQtyKeyDown}
                handleRateUpDown={handleRateUpDown} handleTotalInputKeyDown={handleTotalInputKeyDown} idx={idx}
                isLastAdded={isLastAdded} item={item} itemRefs={itemRefs} kRefs={kRefs} localDiscFlats={localDiscFlats}
                localDiscPcts={localDiscPcts} localKgStr={localKgStr} localPcsStr={localPcsStr} pcsRefs={pcsRefs}
                pendingFocusProductIdRef={pendingFocusProductIdRef} pricingTiers={pricingTiers}
                productPricingMap={productPricingMap} qtyRefs={qtyRefs} rateKgRefs={rateKgRefs} ratePcRefs={ratePcRefs}
                removeItem={removeItem} removeItemDiscount={removeItemDiscount} sanitizeQtyText={sanitizeQtyText}
                setFocusedRowProductId={setFocusedRowProductId} setLocalDiscFlats={setLocalDiscFlats}
                setLocalDiscPcts={setLocalDiscPcts} setLocalKgStr={setLocalKgStr} setLocalPcsStr={setLocalPcsStr}
                syncActiveSnapshot={syncActiveSnapshot} totalInputRefs={totalInputRefs} uiConfig={uiConfig}
                updateItemDiscount={updateItemDiscount} updateItemOfferPrice={updateItemOfferPrice}
                updateItemPricingTier={updateItemPricingTier} updatePiecesOverride={updatePiecesOverride}
                updateQuantity={updateQuantity}
              />
            );
          })
        )}
      </div>
    </div>
  );
};
