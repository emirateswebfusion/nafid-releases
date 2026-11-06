import { localizeCurrencyText } from '../../../../utils/localization/storeProfile';
import React from 'react';
import clsx from 'clsx';
import { Minus, Pencil, Plus, Trash } from 'lucide-react';
import { ItemRateInput } from '../../ui/ItemRateInput';
import { ItemTotalInput } from '../../ui/ItemTotalInput';
import { type CartItem } from '../../../../store/cartStore';
import { formatCurrency } from '../../BillingConstants';
import { listRate, resolveLinePrice } from '../../../../utils/pricing/linePricing';
import type { BillingCartViewProps } from '../BillingCartView';

export interface CartItemRowProps {
  activeCartProductIdRef: BillingCartViewProps['activeCartProductIdRef'];
  discFlatRefs: BillingCartViewProps['discFlatRefs'];
  discRefs: BillingCartViewProps['discRefs'];
  focusNextCartField: BillingCartViewProps['focusNextCartField'];
  focusPrevCartField: BillingCartViewProps['focusPrevCartField'];
  guardScannerInput: BillingCartViewProps['guardScannerInput'];
  handleDiscFlatKeyDown: BillingCartViewProps['handleDiscFlatKeyDown'];
  handleDiscKeyDown: BillingCartViewProps['handleDiscKeyDown'];
  handleEditProduct: BillingCartViewProps['handleEditProduct'];
  handlePcsKeyDown: BillingCartViewProps['handlePcsKeyDown'];
  handleQtyKeyDown: BillingCartViewProps['handleQtyKeyDown'];
  handleRateUpDown: BillingCartViewProps['handleRateUpDown'];
  handleTotalInputKeyDown: BillingCartViewProps['handleTotalInputKeyDown'];
  idx: number;
  isLastAdded: boolean;
  item: CartItem;
  itemRefs: BillingCartViewProps['itemRefs'];
  kRefs: BillingCartViewProps['kRefs'];
  localDiscFlats: BillingCartViewProps['localDiscFlats'];
  localDiscPcts: BillingCartViewProps['localDiscPcts'];
  localKgStr: BillingCartViewProps['localKgStr'];
  localPcsStr: BillingCartViewProps['localPcsStr'];
  pcsRefs: BillingCartViewProps['pcsRefs'];
  pendingFocusProductIdRef: BillingCartViewProps['pendingFocusProductIdRef'];
  pricingTiers: BillingCartViewProps['pricingTiers'];
  productPricingMap: BillingCartViewProps['productPricingMap'];
  qtyRefs: BillingCartViewProps['qtyRefs'];
  rateKgRefs: BillingCartViewProps['rateKgRefs'];
  ratePcRefs: BillingCartViewProps['ratePcRefs'];
  removeItem: (productId: string) => void;
  removeItemDiscount: (productId: string) => void;
  sanitizeQtyText: BillingCartViewProps['sanitizeQtyText'];
  setFocusedRowProductId: BillingCartViewProps['setFocusedRowProductId'];
  setLocalDiscFlats: BillingCartViewProps['setLocalDiscFlats'];
  setLocalDiscPcts: BillingCartViewProps['setLocalDiscPcts'];
  setLocalKgStr: BillingCartViewProps['setLocalKgStr'];
  setLocalPcsStr: BillingCartViewProps['setLocalPcsStr'];
  syncActiveSnapshot: () => void;
  totalInputRefs: BillingCartViewProps['totalInputRefs'];
  uiConfig: BillingCartViewProps['uiConfig'];
  updateItemDiscount: (productId: string, type: "PERCENT" | "FLAT", value: number) => void;
  updateItemOfferPrice: (productId: string, price: number | null) => void;
  updateItemPricingTier: (productId: string, tierId: string | null, tierName: string | null, newPrice: number) => void;
  updatePiecesOverride: (productId: string, pieces: number | undefined) => void;
  updateQuantity: (productId: string, quantity: number | string) => void;
}

/** A regular cart line: quantity / weight-and-pieces controls, rate edit, discounts and remove. */
export const CartItemRow: React.FC<CartItemRowProps> = ({
  activeCartProductIdRef, discFlatRefs: discFlatInputsRef, discRefs: discInputsRef, focusNextCartField,
  focusPrevCartField, guardScannerInput, handleDiscFlatKeyDown, handleDiscKeyDown, handleEditProduct,
  handlePcsKeyDown, handleQtyKeyDown, handleRateUpDown, handleTotalInputKeyDown, idx, isLastAdded, item,
  itemRefs: itemElementsRef, kRefs: kInputsRef, localDiscFlats, localDiscPcts, localKgStr, localPcsStr,
  pcsRefs: pcsInputsRef, pendingFocusProductIdRef, pricingTiers, productPricingMap, qtyRefs: qtyInputsRef,
  rateKgRefs: rateKgInputsRef, ratePcRefs: ratePcInputsRef, removeItem, removeItemDiscount, sanitizeQtyText,
  setFocusedRowProductId, setLocalDiscFlats, setLocalDiscPcts, setLocalKgStr, setLocalPcsStr, syncActiveSnapshot,
  totalInputRefs: totalInputsRef, uiConfig, updateItemDiscount, updateItemOfferPrice, updateItemPricingTier,
  updatePiecesOverride, updateQuantity,
}) => {
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
      ref={el => { itemElementsRef.current[item.product_id] = el; }}
      className={clsx(
        "flex flex-wrap items-center gap-x-3 gap-y-2 px-3.5 py-2.5 my-0.5 rounded-xl transition-all duration-200 hover:shadow-md group min-h-[52px]",
        isLastAdded
          ? "ring-2 ring-primary bg-primary/10 border-primary shadow-md scale-[1.005]"
          : "bg-card border border-border/80 hover:border-primary/40"
      )}
    >
      <div className="flex grow shrink-0 w-max min-w-0 max-w-full items-center gap-3">
        <span className="text-xs font-black text-primary/80 dark:text-primary-foreground/90 bg-primary/10 border border-primary/20 rounded-lg px-2 py-1 flex items-center justify-center shrink-0 min-w-[2.25rem] h-8 select-none shadow-2xs">
          #{idx + 1}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="min-w-0 font-bold text-sm leading-snug text-foreground [overflow-wrap:anywhere]">
              <span>{item.name.replace(/\s*\((GST|EST|Estimate)\)$/i, '')}</span>
              {/\s*\((GST|EST|Estimate)\)$/i.test(item.name) && (
                <span className={clsx(
                  "inline-block align-middle ml-1.5 text-[8px] px-1.2 py-0.2 rounded font-black tracking-wide border uppercase select-none leading-none",
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
      </div>
      <div className="ml-auto flex max-w-full shrink-0 flex-wrap items-center justify-end gap-x-3 gap-y-2">
        {isPiecesWeight ? (
          <div className="flex items-center gap-1.5 shrink-0">
            <div className="flex items-center gap-0.5 bg-muted/40 border border-border/80 rounded-lg px-1.5 py-0.5">
              <span className="text-[8px] text-muted-foreground font-bold uppercase">Pcs</span>
              <input
                type="text" inputMode="numeric"
                ref={(el) => {
                  pcsInputsRef.current[item.product_id] = el;
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
                  qtyInputsRef.current[item.product_id] = el;
                  kInputsRef.current[item.product_id] = el;
                  if (el && !pcsInputsRef.current[item.product_id] && pendingFocusProductIdRef.current === item.product_id) {
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
                qtyInputsRef.current[item.product_id] = el;
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
                rateKgInputsRef.current[item.product_id] = el;
                if (el && !pcsInputsRef.current[item.product_id] && !qtyInputsRef.current[item.product_id] && pendingFocusProductIdRef.current === item.product_id) {
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
                ratePcInputsRef.current[item.product_id] = el;
                if (el && !pcsInputsRef.current[item.product_id] && !qtyInputsRef.current[item.product_id] && pendingFocusProductIdRef.current === item.product_id) {
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
              ref={el => { discInputsRef.current[item.product_id] = el; }}
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
              ref={el => { discFlatInputsRef.current[item.product_id] = el; }}
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
              placeholder={localizeCurrencyText("₹")}
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
            inputRef={el => { totalInputsRef.current[item.product_id] = el; }}
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
    </div>
  );
};
