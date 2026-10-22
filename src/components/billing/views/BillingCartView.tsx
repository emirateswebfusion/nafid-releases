import React from 'react';
import clsx from 'clsx';
import { Minus, Pencil, Plus, Trash } from 'lucide-react';
import { Skeleton } from '../../ui/Skeleton';
import { ItemRateInput } from '../ui/ItemRateInput';
import { ItemTotalInput } from '../ui/ItemTotalInput';
import { useCartStore, type CartItem } from '../../../store/cartStore';
import { useTabStore } from '../../../store/tabStore';
import { formatCurrency } from '../BillingConstants';
import type { BillingUIConfig } from '../../../store/billingUIStore';
import { listRate, resolveLinePrice } from '../../../utils/linePricing';

type NumericMap = Record<string, number>;
type StringMap = Record<string, string>;
type InputRefMap = React.MutableRefObject<Record<string, HTMLInputElement | null>>;

export interface BillingCartViewProps {
  uiConfig: BillingUIConfig;
  isLoadingEditBill: boolean;
  productPricingMap: Record<string, Record<string, number>>;
  pricingTiers: any[];
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
              const serviceAmount = Number(item.offer_price ?? item.base_price) || 0;
              return (
                <div
                  key={item.product_id}
                  ref={el => { itemRefs.current[item.product_id] = el; }}
                  className={clsx(
                    "flex items-center gap-3 px-3 py-2 rounded-xl transition-all duration-200 hover:shadow-sm group",
                    isLastAdded
                      ? "ring-2 ring-violet-500 bg-violet-500/15 border-violet-500 shadow-md scale-[1.01]"
                      : "bg-violet-500/5 border border-violet-500/30 hover:border-violet-500/50"
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-foreground truncate">{item.name}</span>
                      <span className="text-[9px] font-bold text-violet-600 bg-violet-500/15 px-1.5 py-0.5 rounded uppercase shrink-0 leading-none">Service</span>
                    </div>
                    <div className="text-[10px] text-muted-foreground/70 mt-0.5">
                      <span className="text-violet-600 font-semibold">Enter amount</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-0.5 bg-violet-500/10 border border-violet-500/30 rounded-lg py-0.5 shrink-0">
                    <span className="text-[10px] text-muted-foreground font-black uppercase pl-2">₹</span>
                    <input type="number" step="any" min="0"
                      className="w-24 text-center h-7 bg-transparent border-0 text-sm font-black text-foreground focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      value={serviceAmount || ''}
                      ref={(el) => {
                        qtyRefs.current[item.product_id] = el;
                        if (el && pendingFocusProductIdRef.current === item.product_id) {
                          el.focus();
                          el.select();
                          pendingFocusProductIdRef.current = null;
                        }
                      }}
                      onChange={e => updateItemOfferPrice(item.product_id, e.target.value === '' ? 0 : Number(e.target.value))}
                      onKeyDown={e => {
                        guardScannerInput(e, item.product_id, serviceAmount || '', v => updateItemOfferPrice(item.product_id, v === '' ? 0 : Number(v)));
                        handleQtyKeyDown(e, item.product_id);
                      }}
                      onFocus={e => e.target.select()}
                      placeholder="0"
                    />
                  </div>
                  <div className="font-black text-sm text-violet-600 dark:text-violet-400 shrink-0 min-w-[65px] text-right">{formatCurrency(serviceAmount)}</div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => handleEditProduct(item)} className="p-1 rounded-lg text-muted-foreground/30 hover:text-primary hover:bg-primary/10 transition-colors cursor-pointer shrink-0 opacity-0 group-hover:opacity-100" title="Edit Item">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => removeItem(item.product_id)} className="p-1 rounded-lg text-muted-foreground/30 hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer shrink-0 opacity-0 group-hover:opacity-100" title="Remove Item">
                      <Trash className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            }

            if (item.isReturnItem) {
              if (!isReturnMode) return null;
              const rate = Number(item.originalUnitPrice) || 0;
              const rawRate = Number(item.rawUnitPrice) || rate;
              const qtyText = Number(item.quantity) || 0;
              const total = rate * qtyText;
              const rawTotal = rawRate * qtyText;
              const avail = item.availableToReturn ?? 0;

              const weightUoms = ['Kgs', 'Grams', 'Mtrs', 'Ltrs', 'kg', 'kgs', 'gram', 'grams', 'mtr', 'mtrs', 'ltr', 'ltrs'];
              const isPiecesWeight = item.billing_type === 'WEIGHT' || weightUoms.includes((item.uom || '').toLowerCase());
              const pieces = item.pieces_override ?? 1;

              return (
                <div
                  key={item.product_id}
                  ref={el => { itemRefs.current[item.product_id] = el; }}
                  className={clsx(
                    "flex items-center gap-3 px-3 py-2 rounded-xl transition-all duration-200 hover:shadow-sm group",
                    isLastAdded
                      ? "ring-2 ring-rose-500 bg-rose-500/15 border-rose-500 shadow-md scale-[1.01]"
                      : "bg-rose-500/5 border border-rose-500/30 hover:border-rose-500/50"
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-foreground truncate">{item.name}</span>
                      <span className="text-[9px] font-bold text-rose-600 bg-rose-500/15 px-1.5 py-0.5 rounded uppercase shrink-0 leading-none">Return</span>
                    </div>
                    <div className="text-[10px] text-muted-foreground/70 mt-0.5 flex items-center gap-1 flex-wrap">
                      <span className="font-semibold">
                        {isPiecesWeight ? (
                          `${formatCurrency(rate)}/Kg`
                        ) : (
                          `${formatCurrency(rate)}/unit`
                        )}
                      </span>
                      {rawRate > rate + 0.005 && (
                        <span className="text-[9px] text-muted-foreground/50 line-through font-mono">
                          {formatCurrency(rawRate)}
                        </span>
                      )}
                      <span className="mx-0.5">&middot;</span>
                      <span>Avail: {avail} {isPiecesWeight ? 'Kg' : ''}</span>
                      {(item.alreadyReturned ?? 0) > 0 && (
                        <><span className="mx-0.5">&middot;</span><span>Ret: {item.alreadyReturned} {isPiecesWeight ? 'Kg' : ''}</span></>
                      )}
                      {item.returnSourceInvoiceNumber && (
                        <><span className="mx-0.5">&middot;</span><span className="text-[9px]">Inv: {item.returnSourceInvoiceNumber}</span></>
                      )}
                    </div>
                  </div>

                  {isPiecesWeight ? (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <div className="flex items-center gap-0.5 bg-rose-500/10 border border-rose-500/30 rounded-lg px-1.5 py-0.5">
                        <span className="text-[8px] text-rose-600 dark:text-rose-400 font-bold uppercase">Pcs</span>
                        <input
                          type="text" inputMode="numeric"
                          className="w-9 text-center h-7 bg-transparent border-0 text-xs font-black text-foreground focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          value={localPcsStr[item.product_id] ?? String(pieces)}
                          onFocus={e => e.target.select()}
                          onChange={e => {
                            const raw = e.target.value.replace(/[^\d]/g, '');
                            setLocalPcsStr(p => ({ ...p, [item.product_id]: raw }));
                            const pcsVal = parseInt(raw, 10);
                            if (!isNaN(pcsVal) && pcsVal >= 0) {
                              updatePiecesOverride(item.product_id, pcsVal);
                            }
                          }}
                          onBlur={() => {
                            if (!localPcsStr[item.product_id] || parseInt(localPcsStr[item.product_id], 10) <= 0) {
                              updatePiecesOverride(item.product_id, 1);
                              setLocalPcsStr(p => ({ ...p, [item.product_id]: '1' }));
                            }
                          }}
                        />
                      </div>
                      <div className="flex items-center gap-0.5 bg-rose-500/10 border border-rose-500/30 rounded-lg px-1.5 py-0.5">
                        <span className="text-[8px] text-rose-600 dark:text-rose-400 font-bold uppercase">Kgs</span>
                        <input
                          type="text" inputMode="decimal"
                          ref={(el) => {
                            qtyRefs.current[item.product_id] = el;
                            if (el && pendingFocusProductIdRef.current === item.product_id) {
                              el.focus();
                              el.select();
                              pendingFocusProductIdRef.current = null;
                            }
                          }}
                          className="w-14 text-center h-7 bg-transparent border-0 text-xs font-black text-foreground focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          value={localKgStr[item.product_id] ?? String(item.quantity ?? '')}
                          onFocus={e => e.target.select()}
                          onChange={e => {
                            const raw = sanitizeQtyText(e.target.value);
                            setLocalKgStr(p => ({ ...p, [item.product_id]: raw }));
                            const num = parseFloat(raw);
                            if (!isNaN(num) && num > 0) {
                              updateQuantity(item.product_id, Math.min(avail, +num.toFixed(3)));
                            }
                          }}
                          onBlur={() => {
                            const val = Number(item.quantity);
                            const validVal = (!val || isNaN(val) || val <= 0) ? 0.1 : Math.min(avail, val);
                            updateQuantity(item.product_id, validVal);
                            setLocalKgStr(p => ({ ...p, [item.product_id]: String(validVal) }));
                          }}
                          onKeyDown={e => {
                            guardScannerInput(e, item.product_id, qtyText, v => updateQuantity(item.product_id, Math.min(avail, Number(v))));
                            handleQtyKeyDown(e, item.product_id);
                          }}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-0.5 bg-rose-500/10 border border-rose-500/30 rounded-lg py-0.5 shrink-0">
                      <button onClick={() => { const q = Number(item.quantity); if (q > 1) updateQuantity(item.product_id, q - 1); }}
                        className="w-7 h-7 flex items-center justify-center bg-background text-muted-foreground hover:bg-muted hover:text-foreground transition-all active:scale-90 cursor-pointer font-bold"
                      ><Minus className="w-3 h-3" /></button>
                      <input type="text" inputMode="numeric"
                        ref={(el) => {
                          qtyRefs.current[item.product_id] = el;
                          if (el && pendingFocusProductIdRef.current === item.product_id) {
                            el.focus();
                            el.select();
                            pendingFocusProductIdRef.current = null;
                          }
                        }}
                        className="w-12 text-center h-7 bg-transparent border-0 text-sm font-black text-foreground focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        value={item.quantity === '' ? '' : (item.quantity ?? qtyText)}
                        onFocus={e => e.target.select()}
                        onBlur={e => {
                          const num = Number(e.target.value);
                          const validVal = (!e.target.value || isNaN(num) || num <= 0) ? 1 : Math.min(avail, num);
                          updateQuantity(item.product_id, validVal);
                        }}
                        onChange={e => {
                          const raw = e.target.value.replace(/[^\d]/g, '');
                          if (raw === '') {
                            updateQuantity(item.product_id, '');
                          } else {
                            const num = parseInt(raw, 10);
                            updateQuantity(item.product_id, isNaN(num) ? '' : Math.min(avail, Math.max(0, num)));
                          }
                        }}
                        onKeyDown={e => { guardScannerInput(e, item.product_id, qtyText, v => updateQuantity(item.product_id, v)); handleQtyKeyDown(e, item.product_id); }}
                      />
                      <button onClick={() => { const q = Number(item.quantity); if (q < avail) updateQuantity(item.product_id, q + 1); }}
                        className="w-7 h-7 flex items-center justify-center bg-background text-muted-foreground hover:bg-muted hover:text-foreground transition-all active:scale-90 cursor-pointer font-bold"
                      ><Plus className="w-3 h-3" /></button>
                    </div>
                  )}
                  <div className="text-right shrink-0 min-w-[80px]">
                    {rawTotal > total + 0.005 && (
                      <div className="text-[10px] text-muted-foreground/50 line-through font-semibold font-mono">
                        {formatCurrency(rawTotal)}
                      </div>
                    )}
                    <div className="font-black text-sm text-rose-600 dark:text-rose-400 font-mono">{formatCurrency(total)}</div>
                    {item.originalQuantity && (
                      <div className="text-[9px] text-muted-foreground/50">Sold: {item.originalQuantity}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => handleEditProduct(item)} className="p-1 rounded-lg text-muted-foreground/30 hover:text-primary hover:bg-primary/10 transition-colors cursor-pointer shrink-0 opacity-0 group-hover:opacity-100" title="Edit Item">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => removeItem(item.product_id)} className="p-1 rounded-lg text-muted-foreground/30 hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer shrink-0 opacity-0 group-hover:opacity-100" title="Remove Item">
                      <Trash className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            }
            if (item.isScrap) {
              const rate = item.base_price;
              const qty = Number(item.quantity) || 0;

              const hasItemBonus = !!(
                (item.offer_price !== null && item.offer_price !== undefined) ||
                (item.discount_flat !== null && item.discount_flat !== undefined) ||
                (item.discount_percent !== null && item.discount_percent !== undefined)
              );

              const hasAdHocBonus = !!(
                (localDiscPcts[item.product_id] !== undefined && localDiscPcts[item.product_id] !== null && localDiscPcts[item.product_id] !== (item.catalog_discount_percent ?? 0)) ||
                (localDiscFlats[item.product_id] !== undefined && localDiscFlats[item.product_id] !== null && localDiscFlats[item.product_id] !== (item.catalog_discount_flat ?? 0)) ||
                (item.discount_percent !== null && item.discount_percent !== undefined && item.discount_percent !== (item.catalog_discount_percent ?? null)) ||
                (item.discount_flat !== null && item.discount_flat !== undefined && item.discount_flat !== (item.catalog_discount_flat ?? null)) ||
                (item.offer_price !== null && item.offer_price !== undefined && item.offer_price !== (item.catalog_offer_price ?? null))
              );

              const effectivePriceInfo = resolveLinePrice(item, rate, 'scrap');
              const effectivePrice = effectivePriceInfo.unitRate;
              const total = effectivePrice * qty;

              return (
                <div
                  key={item.product_id}
                  ref={el => { itemRefs.current[item.product_id] = el; }}
                  className={clsx(
                    "flex items-center gap-3 px-3 py-2 rounded-xl transition-all duration-200 hover:shadow-sm group",
                    isLastAdded
                      ? "ring-2 ring-orange-500 bg-orange-500/15 border-orange-500 shadow-md scale-[1.01]"
                      : "bg-orange-500/5 border border-orange-500/30 hover:border-orange-500/50"
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-foreground truncate">{item.name}</span>
                    </div>
                    <div className="text-[10px] text-muted-foreground/70 mt-0.5">
                      <span className="text-orange-600 font-semibold">{formatCurrency(rate)}/{(item as any).unit || 'Kg'}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-0.5 bg-orange-500/10 border border-orange-500/30 rounded-lg py-0.5 shrink-0">
                    <input type="text" inputMode="decimal"
                      ref={(el) => {
                        qtyRefs.current[item.product_id] = el;
                        if (el && pendingFocusProductIdRef.current === item.product_id) {
                          el.focus();
                          el.select();
                          pendingFocusProductIdRef.current = null;
                        }
                      }}
                      className="w-14 text-center h-7 bg-transparent border-0 text-sm font-black text-foreground focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      value={item.quantity === 0 ? 0 : item.quantity || ''}
                      onFocus={e => e.target.select()}
                      onChange={e => updateQuantity(item.product_id, sanitizeQtyText(e.target.value))}
                      onKeyDown={e => { guardScannerInput(e, item.product_id, qty, v => updateQuantity(item.product_id, v)); handleQtyKeyDown(e, item.product_id); }}
                      placeholder="Kg"
                    />
                    <span className="text-[10px] text-muted-foreground font-black uppercase pr-1.5">Kg</span>
                  </div>

                  <div className="flex items-center shrink-0">
                    <div className="flex items-center border border-emerald-500/30 rounded-lg overflow-hidden focus-within:border-emerald-500/60 transition-all bg-emerald-500/5">
                      <input
                        type="number" min="0" max="100" step="any" inputMode="decimal"
                        ref={el => { discRefs.current[item.product_id] = el; }}
                        className="w-10 h-7 text-center bg-transparent border-0 text-xs font-bold text-foreground focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        value={localDiscPcts[item.product_id] !== undefined
                          ? (localDiscPcts[item.product_id] || '')
                          : (item.discount_percent ?? '')
                        }
                        onChange={e => {
                          const val = e.target.value;
                          const scrapConvPrice = resolveLinePrice(item, rate, 'scrap').catalogRate;
                          if (val === '' || isNaN(parseFloat(val)) || parseFloat(val) <= 0) {
                            setLocalDiscPcts(p => ({ ...p, [item.product_id]: 0 }));
                            setLocalDiscFlats(p => ({ ...p, [item.product_id]: 0 }));
                            removeItemDiscount(item.product_id);
                          } else {
                            const pct = parseFloat(val);
                            const flat = scrapConvPrice > 0 ? Math.round(scrapConvPrice * pct / 100 * 100) / 100 : 0;
                            setLocalDiscPcts(p => ({ ...p, [item.product_id]: pct }));
                            setLocalDiscFlats(p => ({ ...p, [item.product_id]: flat }));
                            updateItemDiscount(item.product_id, 'PERCENT', pct);
                          }
                          syncActiveSnapshot();
                        }}
                        onFocus={e => e.target.select()}
                        onKeyDown={e => {
                          handleDiscKeyDown(e, item.product_id);
                        }}
                        placeholder="+%"
                      />
                      <span className="w-px h-4 bg-emerald-500/30 shrink-0" />
                      <input
                        type="number" min="0" step="any" inputMode="decimal"
                        ref={el => { discFlatRefs.current[item.product_id] = el; }}
                        className="w-10 h-7 text-center bg-transparent border-0 text-xs font-bold text-foreground focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        value={localDiscFlats[item.product_id] !== undefined
                          ? (localDiscFlats[item.product_id] || '')
                          : (item.discount_flat ?? '')
                        }
                        onChange={e => {
                          const val = e.target.value;
                          const scrapConvPrice = resolveLinePrice(item, rate, 'scrap').catalogRate;
                          if (val === '' || isNaN(parseFloat(val)) || parseFloat(val) <= 0) {
                            setLocalDiscPcts(p => ({ ...p, [item.product_id]: 0 }));
                            setLocalDiscFlats(p => ({ ...p, [item.product_id]: 0 }));
                            removeItemDiscount(item.product_id);
                          } else {
                            const flat = parseFloat(val);
                            const pct = scrapConvPrice > 0 ? Math.round(flat / scrapConvPrice * 100 * 100) / 100 : 0;
                            setLocalDiscFlats(p => ({ ...p, [item.product_id]: flat }));
                            setLocalDiscPcts(p => ({ ...p, [item.product_id]: pct }));
                            updateItemDiscount(item.product_id, 'FLAT', flat);
                          }
                          syncActiveSnapshot();
                        }}
                        onFocus={e => e.target.select()}
                        onKeyDown={e => {
                          handleDiscFlatKeyDown(e, item.product_id);
                        }}
                        placeholder="+₹"
                      />
                      {hasAdHocBonus && (
                        <button
                          type="button"
                          onClick={() => {
                            removeItemDiscount(item.product_id);
                            setLocalDiscPcts(p => ({ ...p, [item.product_id]: 0 }));
                            setLocalDiscFlats(p => ({ ...p, [item.product_id]: 0 }));
                            syncActiveSnapshot();
                          }}
                          className="h-7 w-6 flex items-center justify-center text-[9px] font-bold text-destructive/70 hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer shrink-0"
                          title="Clear item extra"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="text-right shrink-0 min-w-[70px]">
                    <ItemTotalInput
                      productId={item.product_id}
                      total={total}
                      rate={rate}
                      qty={qty}
                      hasDiscount={hasItemBonus}
                      isScrap={true}
                      onUpdateOfferPrice={updateItemOfferPrice}
                      onRemoveDiscount={removeItemDiscount}
                      onClearLocalDiscounts={pid => {
                        setLocalDiscPcts(p => ({ ...p, [pid]: 0 }));
                        setLocalDiscFlats(p => ({ ...p, [pid]: 0 }));
                      }}
                      syncActiveSnapshot={syncActiveSnapshot}
                      onKeyDown={e => handleDiscKeyDown(e, item.product_id)}
                    />
                    {hasItemBonus && (
                      <div className="text-[9px] text-muted-foreground/50 line-through font-semibold -mt-0.5 text-right">{formatCurrency(rate * qty)}</div>
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => handleEditProduct(item)} className="p-1 rounded-lg text-muted-foreground/30 hover:text-primary hover:bg-primary/10 transition-colors cursor-pointer shrink-0 opacity-0 group-hover:opacity-100" title="Edit Item">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => removeItem(item.product_id)} className="p-1 rounded-lg text-muted-foreground/30 hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer shrink-0 opacity-0 group-hover:opacity-100" title="Remove Item">
                      <Trash className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            }

            const rate = listRate(item);
            const weightUoms = ['Kgs', 'Grams', 'Mtrs', 'Ltrs', 'kg', 'kgs', 'gram', 'grams', 'mtr', 'mtrs', 'ltr', 'ltrs'];
            const isPiecesWeight = item.billing_type === 'WEIGHT' || weightUoms.includes((item.uom || '').toLowerCase());
            const piecesPerKg = Number(item.pieces_per_kg) || 1;
            const weightKg = Number(item.quantity) || 0;
            const pieces = isPiecesWeight ? (item.pieces_override ?? 1) : 0;
            const qty = weightKg;

            const effectivePriceInfo = resolveLinePrice(item, rate);
            const effectivePrice = effectivePriceInfo.unitRate;
            const pricePerPiece = isPiecesWeight ? effectivePrice / piecesPerKg : null;
            const total = effectivePrice * qty;

            // Explicit discount flag — avoids floating-point comparison bugs
            const hasItemDiscount = (rate * qty > total + 0.005) || !!(
              (item.offer_price !== null && item.offer_price !== undefined) ||
              (item.discount_flat !== null && item.discount_flat !== undefined) ||
              (item.discount_percent !== null && item.discount_percent !== undefined) ||
              (item.catalog_offer_price !== null && item.catalog_offer_price !== undefined) ||
              (item.catalog_discount_flat !== null && item.catalog_discount_flat !== undefined) ||
              (item.catalog_discount_percent !== null && item.catalog_discount_percent !== undefined)
            );

            const hasAdHocDiscount = !!(
              (localDiscPcts[item.product_id] !== undefined && localDiscPcts[item.product_id] !== null && localDiscPcts[item.product_id] !== (item.catalog_discount_percent ?? 0)) ||
              (localDiscFlats[item.product_id] !== undefined && localDiscFlats[item.product_id] !== null && localDiscFlats[item.product_id] !== (item.catalog_discount_flat ?? 0)) ||
              (item.discount_percent !== null && item.discount_percent !== undefined && item.discount_percent !== (item.catalog_discount_percent ?? null)) ||
              (item.discount_flat !== null && item.discount_flat !== undefined && item.discount_flat !== (item.catalog_discount_flat ?? null)) ||
              (item.offer_price !== null && item.offer_price !== undefined && item.offer_price !== (item.catalog_offer_price ?? null))
            );

            // Commit Pcs value to store (entirely independent from Kg)
            const commitPcs = (pcsStr: string, isFinal = false) => {
              const pcsVal = parseInt(pcsStr, 10);
              if (!isNaN(pcsVal) && pcsVal >= 0) {
                updatePiecesOverride(item.product_id, pcsVal);
                setLocalPcsStr(p => ({ ...p, [item.product_id]: String(pcsVal) }));
              } else if (pcsStr === '' && isFinal) {
                updatePiecesOverride(item.product_id, 1);
                setLocalPcsStr(p => ({ ...p, [item.product_id]: '1' }));
              } else if (isFinal) {
                const fallback = item.pieces_override ?? 1;
                setLocalPcsStr(p => ({ ...p, [item.product_id]: String(fallback) }));
              }
            };
            // Commit Kg value to store (entirely independent from Pcs)
            const commitKg = (kgStr: string, isFinal = false) => {
              const cleaned = sanitizeQtyText(kgStr);
              const kgVal = parseFloat(cleaned);
              if (!isNaN(kgVal) && kgVal > 0) {
                updateQuantity(item.product_id, +kgVal.toFixed(3));
              } else if (isFinal) {
                // Restore display on blur/final if empty or invalid
                setLocalKgStr(p => ({ ...p, [item.product_id]: String(item.quantity ?? '') }));
              }
            };

            return (
              <div
                key={item.product_id}
                ref={el => { itemRefs.current[item.product_id] = el; }}
                className={clsx(
                  "flex items-center gap-3 px-3.5 py-2.5 my-0.5 rounded-xl transition-all duration-200 hover:shadow-md group min-h-[52px]",
                  isLastAdded
                    ? "ring-2 ring-primary bg-primary/10 border-primary shadow-md scale-[1.005]"
                    : "bg-card border border-border/80 hover:border-primary/40"
                )}
              >
                {/* Serial Number Badge */}
                <span className="text-xs font-black text-primary/80 dark:text-primary-foreground/90 bg-primary/10 border border-primary/20 rounded-lg px-2 py-1 flex items-center justify-center shrink-0 min-w-[2.25rem] h-8 select-none shadow-2xs">
                  #{idx + 1}
                </span>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-foreground truncate flex items-center gap-1.5">
                      <span>{item.name.replace(/\s*\((GST|EST|Estimate)\)$/i, '')}</span>
                      {/\s*\((GST|EST|Estimate)\)$/i.test(item.name) && (
                        <span className={clsx(
                          "text-[8px] px-1.2 py-0.2 rounded font-black tracking-wide border uppercase select-none leading-none",
                          item.name.match(/\s*\((GST|EST|Estimate)\)$/i)?.[1].toUpperCase() === 'GST'
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                            : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
                        )}>
                          {item.name.match(/\s*\((GST|EST|Estimate)\)$/i)?.[1]}
                        </span>
                      )}
                    </span>
                    {item.isCombo && (
                      <span className="text-[9px] font-bold text-purple-600 bg-purple-500/15 border border-purple-500/30 px-1.5 py-0.5 rounded uppercase shrink-0 leading-none">
                        COMBO OFFER
                      </span>
                    )}
                  </div>
                  {item.isCombo && item.combo_items && (
                    <div className="text-[11px] font-semibold text-purple-600 dark:text-purple-400 mt-0.5">
                      Includes: {item.combo_items.map(ci => `${ci.product_name || 'Product'} (x${ci.quantity})`).join(', ')}
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground/60 mt-0.5 flex-wrap">
                    {item.sku_barcode ? (
                      <span className="font-mono px-1.5 py-0.2 rounded bg-muted text-foreground font-semibold border border-border">
                        {item.sku_barcode}
                      </span>
                    ) : item.item_code ? (
                      <span className="font-mono px-1.5 py-0.2 rounded bg-muted text-foreground font-semibold border border-border">
                        Code: {item.item_code}
                      </span>
                    ) : (
                      <span className="italic">No barcode</span>
                    )}
                    {pricePerPiece !== null && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 font-mono font-bold">
                        {formatCurrency(pricePerPiece)}/pc
                      </span>
                    )}
                    {item.brand_manufacturer && (
                      <span className="font-medium">&middot; {item.brand_manufacturer}</span>
                    )}
                  </div>
                </div>

                {/* Quantity Controls (First) */}
                {isPiecesWeight ? (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <div className="flex items-center gap-0.5 bg-muted/40 border border-border/80 rounded-lg px-1.5 py-0.5">
                      <span className="text-[8px] text-muted-foreground font-bold uppercase">Pcs</span>
                      <input
                        type="text" inputMode="numeric"
                        ref={(el) => {
                          pcsRefs.current[item.product_id] = el;
                          if (el && pendingFocusProductIdRef.current === item.product_id) {
                            el.focus();
                            el.select();
                            pendingFocusProductIdRef.current = null;
                          }
                        }}
                        className="w-9 text-center h-7 bg-transparent border-0 text-xs font-black text-foreground focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        value={localPcsStr[item.product_id] ?? String(pieces)}
                        onFocus={e => {
                          e.target.select();
                          activeCartProductIdRef.current = item.product_id;
                          setFocusedRowProductId(item.product_id);
                        }}
                        onChange={e => {
                          const raw = e.target.value.replace(/[^\d]/g, '');
                          setLocalPcsStr(p => ({ ...p, [item.product_id]: raw }));
                          commitPcs(raw, false);
                        }}
                        onBlur={e => commitPcs(e.target.value, true)}
                        onKeyDown={e => {
                          guardScannerInput(e, item.product_id, pieces, v => {
                            const pcsStr = String(Math.round(Number(v)));
                            setLocalPcsStr(p => ({ ...p, [item.product_id]: pcsStr }));
                            commitPcs(pcsStr, true);
                          });
                          if (e.key === 'Enter') {
                            commitPcs(e.currentTarget.value, true);
                          }
                          handlePcsKeyDown(e, item.product_id);
                        }}
                      />
                    </div>
                    <div className="flex items-center gap-0.5 bg-muted/40 border border-border/80 rounded-lg px-1.5 py-0.5">
                      <span className="text-[8px] text-muted-foreground font-bold uppercase">Kgs</span>
                      <input type="text" inputMode="decimal"
                        ref={(el) => {
                          qtyRefs.current[item.product_id] = el;
                          kRefs.current[item.product_id] = el;
                          if (el && !pcsRefs.current[item.product_id] && pendingFocusProductIdRef.current === item.product_id) {
                            el.focus();
                            el.select();
                            pendingFocusProductIdRef.current = null;
                          }
                        }}
                        className="w-16 text-center h-7 bg-transparent border-0 text-xs font-black text-foreground focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        value={localKgStr[item.product_id] ?? String(item.quantity ?? '')}
                        onFocus={e => {
                          e.target.select();
                          activeCartProductIdRef.current = item.product_id;
                          setFocusedRowProductId(item.product_id);
                        }}
                        onChange={e => {
                          const raw = sanitizeQtyText(e.target.value);
                          setLocalKgStr(p => ({ ...p, [item.product_id]: raw }));
                          commitKg(raw, false);
                        }}
                        onBlur={e => commitKg(e.target.value, true)}
                        onKeyDown={e => {
                          guardScannerInput(e, item.product_id, weightKg, v => {
                            const kgStr = String(v);
                            setLocalKgStr(p => ({ ...p, [item.product_id]: kgStr }));
                            commitKg(kgStr, true);
                          });
                          if (e.key === 'Enter') {
                            commitKg(e.currentTarget.value, true);
                          }
                          handleQtyKeyDown(e, item.product_id);
                        }}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-0.5 shrink-0 bg-muted/40 border border-border/80 rounded-lg overflow-hidden">
                    <button onClick={() => { const q = Number(item.quantity); const step = item.billing_type === 'WEIGHT' ? 0.1 : 1; if (q > step) updateQuantity(item.product_id, +(q - step).toFixed(3)); else removeItem(item.product_id); }}
                      className="w-7 h-7 flex items-center justify-center bg-background text-muted-foreground hover:bg-muted hover:text-foreground transition-all active:scale-90 cursor-pointer font-bold"
                    ><Minus className="w-3 h-3" /></button>
                    <input type="text" inputMode="decimal"
                      ref={(el) => {
                        qtyRefs.current[item.product_id] = el;
                        if (el && pendingFocusProductIdRef.current === item.product_id) {
                          el.focus();
                          el.select();
                          pendingFocusProductIdRef.current = null;
                        }
                      }}
                      className={clsx(
                        "text-center h-7 bg-transparent border-0 text-sm font-black text-foreground focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
                        (item.billing_type === 'WEIGHT' || item.isScrap) ? "w-20 min-w-[5rem]" : "w-12"
                      )}
                      value={item.quantity}
                      onFocus={e => {
                        e.target.select();
                        activeCartProductIdRef.current = item.product_id;
                        setFocusedRowProductId(item.product_id);
                      }}
                      onBlur={e => {
                        const val = Number(e.target.value);
                        if (!e.target.value || isNaN(val) || val <= 0) {
                          updateQuantity(item.product_id, item.billing_type === 'WEIGHT' ? 0.1 : 1);
                        }
                      }}
                      onChange={e => updateQuantity(item.product_id, sanitizeQtyText(e.target.value))}
                      onKeyDown={e => { guardScannerInput(e, item.product_id, item.quantity, v => updateQuantity(item.product_id, v)); handleQtyKeyDown(e, item.product_id); }}
                    />
                    <button onClick={() => { const step = item.billing_type === 'WEIGHT' ? 0.1 : 1; updateQuantity(item.product_id, +((Number(item.quantity) || 0) + step).toFixed(3)); }}
                      className="w-7 h-7 flex items-center justify-center bg-background text-muted-foreground hover:bg-muted hover:text-foreground transition-all active:scale-90 cursor-pointer font-bold"
                    ><Plus className="w-3 h-3" /></button>
                    <span className="text-[10px] text-muted-foreground font-black uppercase pr-1.5">{item.billing_type === 'WEIGHT' ? 'Kg' : 'Pcs'}</span>
                  </div>
                )}

                {/* Rate Edit Inputs Column (Second - After Qty) */}
                <div className="flex items-center gap-1 shrink-0">
                  {item.billing_type === 'WEIGHT' ? (
                    <ItemRateInput
                      productId={item.product_id}
                      rate={effectivePrice}
                      qty={qty}
                      unitLabel="/Kg"
                      placeholder="Rate/Kg"
                      title="Edit rate per Kg"
                      purchasePrice={item.purchase_price}
                      showPurchasePrice={uiConfig?.showPurchasePriceInPOS ?? false}
                      tierPricesMap={productPricingMap[item.product_id]}
                      pricingTiers={pricingTiers}
                      basePrice={item.original_base_price ?? item.base_price}
                      selectedTierId={item.pricing_tier_id}
                      onSelectTier={(pid, tid, tname, price) => {
                        updateItemPricingTier(pid, tid, tname, price);
                        syncActiveSnapshot();
                      }}
                      onUpdateOfferPrice={(pid, price) => {
                        updateItemOfferPrice(pid, price);
                      }}
                      syncActiveSnapshot={syncActiveSnapshot}
                      inputRef={(el) => {
                        rateKgRefs.current[item.product_id] = el;
                        if (el && !pcsRefs.current[item.product_id] && !qtyRefs.current[item.product_id] && pendingFocusProductIdRef.current === item.product_id) {
                          el.focus();
                          el.select();
                          pendingFocusProductIdRef.current = null;
                        }
                      }}
                      onKeyDownNext={() => focusNextCartField('rate', item.product_id)}
                      onKeyDownBack={() => focusPrevCartField('rate', item.product_id)}
                      onKeyDownDown={() => handleRateUpDown(item.product_id, 'down')}
                      onKeyDownUp={() => handleRateUpDown(item.product_id, 'up')}
                      onFocus={() => {
                        activeCartProductIdRef.current = item.product_id;
                        setFocusedRowProductId(item.product_id);
                      }}
                    />
                  ) : (
                    <ItemRateInput
                      productId={item.product_id}
                      rate={effectivePrice}
                      qty={qty}
                      unitLabel="/Pc"
                      placeholder="Rate/Pc"
                      title="Edit rate per Piece"
                      purchasePrice={item.purchase_price}
                      showPurchasePrice={uiConfig?.showPurchasePriceInPOS ?? false}
                      tierPricesMap={productPricingMap[item.product_id]}
                      pricingTiers={pricingTiers}
                      basePrice={item.original_base_price ?? item.base_price}
                      selectedTierId={item.pricing_tier_id}
                      onSelectTier={(pid, tid, tname, price) => {
                        updateItemPricingTier(pid, tid, tname, price);
                        syncActiveSnapshot();
                      }}
                      onUpdateOfferPrice={(pid, price) => {
                        updateItemOfferPrice(pid, price);
                      }}
                      syncActiveSnapshot={syncActiveSnapshot}
                      inputRef={(el) => {
                        ratePcRefs.current[item.product_id] = el;
                        if (el && !pcsRefs.current[item.product_id] && !qtyRefs.current[item.product_id] && pendingFocusProductIdRef.current === item.product_id) {
                          el.focus();
                          el.select();
                          pendingFocusProductIdRef.current = null;
                        }
                      }}
                      onKeyDownNext={() => focusNextCartField('rate', item.product_id)}
                      onKeyDownBack={() => focusPrevCartField('rate', item.product_id)}
                      onKeyDownDown={() => handleRateUpDown(item.product_id, 'down')}
                      onKeyDownUp={() => handleRateUpDown(item.product_id, 'up')}
                      onFocus={() => {
                        activeCartProductIdRef.current = item.product_id;
                        setFocusedRowProductId(item.product_id);
                      }}
                    />
                  )}
                </div>

                <div className="flex items-center shrink-0">
                  <div className="flex items-center border border-border/60 rounded-lg overflow-hidden focus-within:border-primary/60 transition-all bg-muted/10">
                    <input
                      type="number" min="0" max="100" step="any" inputMode="decimal"
                      ref={el => { discRefs.current[item.product_id] = el; }}
                      className="w-10 h-7 text-center bg-transparent border-0 text-xs font-bold text-foreground focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      value={localDiscPcts[item.product_id] !== undefined
                        ? (localDiscPcts[item.product_id] || '')
                        : (item.discount_percent ?? '')
                      }
                      onChange={e => {
                        const val = e.target.value;
                        const convCatalogPrice = resolveLinePrice(item, rate).catalogRate;
                        if (val === '' || isNaN(parseFloat(val)) || parseFloat(val) <= 0) {
                          setLocalDiscPcts(p => ({ ...p, [item.product_id]: 0 }));
                          setLocalDiscFlats(p => ({ ...p, [item.product_id]: 0 }));
                          removeItemDiscount(item.product_id);
                        } else {
                          const pct = parseFloat(val);
                          const flat = convCatalogPrice > 0 ? Math.round(convCatalogPrice * pct / 100 * 100) / 100 : 0;
                          setLocalDiscPcts(p => ({ ...p, [item.product_id]: pct }));
                          setLocalDiscFlats(p => ({ ...p, [item.product_id]: flat }));
                          updateItemDiscount(item.product_id, 'PERCENT', pct);
                        }
                        syncActiveSnapshot();
                      }}
                      onFocus={e => {
                        e.target.select();
                        activeCartProductIdRef.current = item.product_id;
                        setFocusedRowProductId(item.product_id);
                      }}
                      onKeyDown={e => {
                        handleDiscKeyDown(e, item.product_id);
                      }}
                      placeholder="%"
                    />
                    <span className="w-px h-4 bg-border/40 shrink-0" />
                    <input
                      type="number" min="0" step="any" inputMode="decimal"
                      ref={el => { discFlatRefs.current[item.product_id] = el; }}
                      className="w-10 h-7 text-center bg-transparent border-0 text-xs font-bold text-foreground focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      value={localDiscFlats[item.product_id] !== undefined
                        ? (localDiscFlats[item.product_id] || '')
                        : (item.discount_flat ?? '')
                      }
                      onChange={e => {
                        const val = e.target.value;
                        const convCatalogPrice = resolveLinePrice(item, rate).catalogRate;
                        if (val === '' || isNaN(parseFloat(val)) || parseFloat(val) <= 0) {
                          setLocalDiscPcts(p => ({ ...p, [item.product_id]: 0 }));
                          setLocalDiscFlats(p => ({ ...p, [item.product_id]: 0 }));
                          removeItemDiscount(item.product_id);
                        } else {
                          const flat = parseFloat(val);
                          const pct = convCatalogPrice > 0 ? Math.round(flat / convCatalogPrice * 100 * 100) / 100 : 0;
                          setLocalDiscFlats(p => ({ ...p, [item.product_id]: flat }));
                          setLocalDiscPcts(p => ({ ...p, [item.product_id]: pct }));
                          updateItemDiscount(item.product_id, 'FLAT', flat);
                        }
                        syncActiveSnapshot();
                      }}
                      onFocus={e => {
                        e.target.select();
                        activeCartProductIdRef.current = item.product_id;
                        setFocusedRowProductId(item.product_id);
                      }}
                      onKeyDown={e => {
                        handleDiscFlatKeyDown(e, item.product_id);
                      }}
                      placeholder="₹"
                    />
                    {hasAdHocDiscount && (
                      <button
                        type="button"
                        onClick={() => {
                          removeItemDiscount(item.product_id);
                          setLocalDiscPcts(p => ({ ...p, [item.product_id]: 0 }));
                          setLocalDiscFlats(p => ({ ...p, [item.product_id]: 0 }));
                          syncActiveSnapshot();
                        }}
                        className="h-7 w-6 flex items-center justify-center text-[9px] font-bold text-destructive/70 hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer shrink-0"
                        title="Clear ad-hoc billing discount"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>

                <div className="text-right shrink-0 min-w-[70px]">
                  <ItemTotalInput
                    productId={item.product_id}
                    total={total}
                    rate={rate}
                    qty={qty}
                    hasDiscount={hasItemDiscount}
                    inputRef={el => { totalInputRefs.current[item.product_id] = el; }}
                    onUpdateOfferPrice={updateItemOfferPrice}
                    onRemoveDiscount={removeItemDiscount}
                    onClearLocalDiscounts={pid => {
                      setLocalDiscPcts(p => ({ ...p, [pid]: 0 }));
                      setLocalDiscFlats(p => ({ ...p, [pid]: 0 }));
                    }}
                    syncActiveSnapshot={syncActiveSnapshot}
                    onKeyDown={e => handleTotalInputKeyDown(e, item.product_id)}
                    onKeyDownNext={() => focusNextCartField('grandTotal', item.product_id)}
                    onKeyDownBack={() => focusPrevCartField('grandTotal', item.product_id)}
                    onFocus={() => {
                      activeCartProductIdRef.current = item.product_id;
                      setFocusedRowProductId(item.product_id);
                    }}
                  />
                  {(hasItemDiscount || rate * qty > total + 0.005) && rate * qty > total + 0.005 && (
                    <div className="text-[9px] text-muted-foreground/50 line-through font-semibold -mt-0.5 text-right">{formatCurrency(rate * qty)}</div>
                  )}
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => handleEditProduct(item)} className="p-1 rounded-lg text-muted-foreground/30 hover:text-primary hover:bg-primary/10 transition-colors cursor-pointer shrink-0 opacity-0 group-hover:opacity-100" title="Edit Product">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => removeItem(item.product_id)} className="p-1 rounded-lg text-muted-foreground/30 hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer shrink-0 opacity-0 group-hover:opacity-100" title="Remove Item">
                    <Trash className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
