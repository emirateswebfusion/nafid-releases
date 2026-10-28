import { priceReturnLine } from '../../../../utils/pricing/returnPricing';
import React from 'react';
import clsx from 'clsx';
import { Minus, Pencil, Plus, Trash } from 'lucide-react';
import { type CartItem } from '../../../../store/cartStore';
import { formatCurrency } from '../../BillingConstants';
import type { BillingCartViewProps } from '../BillingCartView';

export interface CartReturnRowProps {
  guardScannerInput: BillingCartViewProps['guardScannerInput'];
  handleEditProduct: BillingCartViewProps['handleEditProduct'];
  handleQtyKeyDown: BillingCartViewProps['handleQtyKeyDown'];
  isLastAdded: boolean;
  isReturnMode: boolean;
  item: CartItem;
  itemRefs: BillingCartViewProps['itemRefs'];
  localKgStr: BillingCartViewProps['localKgStr'];
  localPcsStr: BillingCartViewProps['localPcsStr'];
  pendingFocusProductIdRef: BillingCartViewProps['pendingFocusProductIdRef'];
  qtyRefs: BillingCartViewProps['qtyRefs'];
  removeItem: (productId: string) => void;
  sanitizeQtyText: BillingCartViewProps['sanitizeQtyText'];
  setLocalKgStr: BillingCartViewProps['setLocalKgStr'];
  setLocalPcsStr: BillingCartViewProps['setLocalPcsStr'];
  updatePiecesOverride: (productId: string, pieces: number | undefined) => void;
  updateQuantity: (productId: string, quantity: number | string) => void;
}

/** A return cart line (return mode): returned quantity against what is still returnable. */
export const CartReturnRow: React.FC<CartReturnRowProps> = ({
  guardScannerInput, handleEditProduct, handleQtyKeyDown, isLastAdded, isReturnMode, item, itemRefs: itemElementsRef,
  localKgStr, localPcsStr, pendingFocusProductIdRef, qtyRefs: qtyInputsRef, removeItem, sanitizeQtyText,
  setLocalKgStr, setLocalPcsStr, updatePiecesOverride, updateQuantity,
}) => {
  if (!isReturnMode) return null;
  const rate = Number(item.originalUnitPrice) || 0;
  const rawRate = Number(item.rawUnitPrice) || rate;
  const qtyText = Number(item.quantity) || 0;
  const total = priceReturnLine(item).total;
  const rawTotal = rawRate * qtyText;
  const avail = item.availableToReturn ?? 0;

  const weightUoms = ['Kgs', 'Grams', 'Mtrs', 'Ltrs', 'kg', 'kgs', 'gram', 'grams', 'mtr', 'mtrs', 'ltr', 'ltrs'];
  const isPiecesWeight = item.billing_type === 'WEIGHT' || weightUoms.includes((item.uom || '').toLowerCase());
  const pieces = item.pieces_override ?? 1;

  return (
    <div
      key={item.product_id}
      ref={el => { itemElementsRef.current[item.product_id] = el; }}
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
                qtyInputsRef.current[item.product_id] = el;
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
                const num = Number(raw);
                if (!isNaN(num) && num >= 0) {
                  updateQuantity(item.product_id, Math.min(avail, +num.toFixed(3)));
                }
              }}
              onBlur={() => {
                const val = Number(item.quantity);
                const validVal = (!val || isNaN(val) || val <= 0) ? 0 : Math.min(avail, val);
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
          <button onClick={() => { const q = Number(item.quantity); if (q > 0) updateQuantity(item.product_id, q - 1); }}
            className="w-7 h-7 flex items-center justify-center bg-background text-muted-foreground hover:bg-muted hover:text-foreground transition-all active:scale-90 cursor-pointer font-bold"
          ><Minus className="w-3 h-3" /></button>
          <input type="text" inputMode="numeric"
            ref={(el) => {
              qtyInputsRef.current[item.product_id] = el;
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
              const validVal = (!e.target.value || isNaN(num) || num <= 0) ? 0 : Math.min(avail, num);
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
};
