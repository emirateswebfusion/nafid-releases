import React from 'react';
import clsx from 'clsx';
import { Pencil, Trash } from 'lucide-react';
import { ItemTotalInput } from '../../ui/ItemTotalInput';
import { type CartItem } from '../../../../store/cartStore';
import { formatCurrency } from '../../BillingConstants';
import { resolveLinePrice } from '../../../../utils/linePricing';
import type { BillingCartViewProps } from '../BillingCartView';

export interface CartScrapRowProps {
  discFlatRefs: BillingCartViewProps['discFlatRefs'];
  discRefs: BillingCartViewProps['discRefs'];
  guardScannerInput: BillingCartViewProps['guardScannerInput'];
  handleDiscFlatKeyDown: BillingCartViewProps['handleDiscFlatKeyDown'];
  handleDiscKeyDown: BillingCartViewProps['handleDiscKeyDown'];
  handleEditProduct: BillingCartViewProps['handleEditProduct'];
  handleQtyKeyDown: BillingCartViewProps['handleQtyKeyDown'];
  isLastAdded: boolean;
  item: CartItem;
  itemRefs: BillingCartViewProps['itemRefs'];
  localDiscFlats: BillingCartViewProps['localDiscFlats'];
  localDiscPcts: BillingCartViewProps['localDiscPcts'];
  pendingFocusProductIdRef: BillingCartViewProps['pendingFocusProductIdRef'];
  qtyRefs: BillingCartViewProps['qtyRefs'];
  removeItem: (productId: string) => void;
  removeItemDiscount: (productId: string) => void;
  sanitizeQtyText: BillingCartViewProps['sanitizeQtyText'];
  setLocalDiscFlats: BillingCartViewProps['setLocalDiscFlats'];
  setLocalDiscPcts: BillingCartViewProps['setLocalDiscPcts'];
  syncActiveSnapshot: () => void;
  updateItemDiscount: (productId: string, type: "PERCENT" | "FLAT", value: number) => void;
  updateItemOfferPrice: (productId: string, price: number | null) => void;
  updateQuantity: (productId: string, quantity: number | string) => void;
}

/** A scrap cart line (scrap mode): quantity, rate and extra bonus. */
export const CartScrapRow: React.FC<CartScrapRowProps> = ({
  discFlatRefs: discFlatInputsRef, discRefs: discInputsRef, guardScannerInput, handleDiscFlatKeyDown,
  handleDiscKeyDown, handleEditProduct, handleQtyKeyDown, isLastAdded, item, itemRefs: itemElementsRef,
  localDiscFlats, localDiscPcts, pendingFocusProductIdRef, qtyRefs: qtyInputsRef, removeItem, removeItemDiscount,
  sanitizeQtyText, setLocalDiscFlats, setLocalDiscPcts, syncActiveSnapshot, updateItemDiscount, updateItemOfferPrice,
  updateQuantity,
}) => {
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
      ref={el => { itemElementsRef.current[item.product_id] = el; }}
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
            qtyInputsRef.current[item.product_id] = el;
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
            ref={el => { discInputsRef.current[item.product_id] = el; }}
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
            ref={el => { discFlatInputsRef.current[item.product_id] = el; }}
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
};
