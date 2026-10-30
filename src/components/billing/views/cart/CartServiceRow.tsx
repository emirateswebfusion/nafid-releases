import { getCurrencyPrefix } from '../../../../utils/localization/storeProfile';
import React from 'react';
import clsx from 'clsx';
import { Pencil, Trash } from 'lucide-react';
import { type CartItem } from '../../../../store/cartStore';
import { formatCurrency } from '../../BillingConstants';
import type { BillingCartViewProps } from '../BillingCartView';

export interface CartServiceRowProps {
  guardScannerInput: BillingCartViewProps['guardScannerInput'];
  handleEditProduct: BillingCartViewProps['handleEditProduct'];
  handleQtyKeyDown: BillingCartViewProps['handleQtyKeyDown'];
  isLastAdded: boolean;
  item: CartItem;
  itemRefs: BillingCartViewProps['itemRefs'];
  pendingFocusProductIdRef: BillingCartViewProps['pendingFocusProductIdRef'];
  qtyRefs: BillingCartViewProps['qtyRefs'];
  removeItem: (productId: string) => void;
  updateItemOfferPrice: (productId: string, price: number | null) => void;
}

/** A service line: service amount and remove. */
export const CartServiceRow: React.FC<CartServiceRowProps> = ({
  guardScannerInput, handleEditProduct, handleQtyKeyDown, isLastAdded, item, itemRefs: itemElementsRef,
  pendingFocusProductIdRef, qtyRefs: qtyInputsRef, removeItem, updateItemOfferPrice,
}) => {
  const serviceAmount = Number(item.offer_price ?? item.base_price) || 0;
  return (
    <div
      key={item.product_id}
      ref={el => { itemElementsRef.current[item.product_id] = el; }}
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
        <span className="text-[10px] text-muted-foreground font-black uppercase pl-2">{getCurrencyPrefix()}</span>
        <input type="number" step="any" min="0"
          className="w-24 text-center h-7 bg-transparent border-0 text-sm font-black text-foreground focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          value={serviceAmount || ''}
          ref={(el) => {
            qtyInputsRef.current[item.product_id] = el;
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
};
