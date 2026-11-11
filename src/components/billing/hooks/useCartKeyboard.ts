import { moneyMinorUnit } from '../../../utils/pricing/moneyRounding';
import type React from 'react';
import { useCartStore } from '../../../store/cartStore';
import { detectScannerBurst } from '../BillingConstants';
import type { CartItem } from '../../../store/cartStore';
import type { PaymentMethod, SplitDetails, Tab } from '../../../store/tabStore';

export interface UseCartKeyboardContext {
  discFlatRefs: React.RefObject<Record<string, HTMLInputElement | null>>;
  discountRef: React.RefObject<HTMLInputElement | null>;
  discRefs: React.RefObject<Record<string, HTMLInputElement | null>>;
  displayGrandTotal: number;
  fillRestForField: (field: "CASH" | "CARD" | "UPI" | "CHEQUE" | "CREDIT") => void;
  focusDescriptionOrDiscount: () => void;
  focusNextCartField: (currentField: string, productId: string) => void;
  focusPrevCartField: (currentField: string, productId: string) => void;
  items: CartItem[];
  lastAddedProductId: string | null;
  paymentMethod: PaymentMethod;
  paymentOptionRefs: React.RefObject<Record<string, HTMLButtonElement | null>>;
  pcsRefs: React.RefObject<Record<string, HTMLInputElement | null>>;
  qtyKeyTimesRef: React.RefObject<Record<string, number>>;
  qtyRefs: React.RefObject<Record<string, HTMLInputElement | null>>;
  qtySnapshotsRef: React.RefObject<Record<string, string | number>>;
  receivedInputRef: React.RefObject<HTMLInputElement | null>;
  removeItem: (productId: string) => void;
  searchRef: React.RefObject<HTMLInputElement | null>;
  setInfoToast: React.Dispatch<React.SetStateAction<string | null>>;
  splitCardInputRef: React.RefObject<HTMLInputElement | null>;
  splitCashInputRef: React.RefObject<HTMLInputElement | null>;
  splitChequeInputRef: React.RefObject<HTMLInputElement | null>;
  splitCreditInputRef: React.RefObject<HTMLInputElement | null>;
  splitDetails: SplitDetails;
  splitUpiInputRef: React.RefObject<HTMLInputElement | null>;
  totalInputRefs: React.RefObject<Record<string, HTMLInputElement | null>>;
  updateActiveTab: (updates: Partial<Omit<Tab, "id" | "snapshot">>) => void;
}

/**
 * Keyboard handling inside the cart and payment inputs: Enter/arrow movement between qty, pcs, rate, discount and
 * line-total fields, scanner-burst protection for quantity fields, split-payment inputs, and jumps to payment.
 */
export function useCartKeyboard(ctx: UseCartKeyboardContext) {
  const { discFlatRefs, discountRef, discRefs, displayGrandTotal, fillRestForField, focusDescriptionOrDiscount, focusNextCartField, focusPrevCartField, items, lastAddedProductId, paymentMethod, paymentOptionRefs, pcsRefs, qtyKeyTimesRef, qtyRefs, qtySnapshotsRef, receivedInputRef, removeItem, searchRef, setInfoToast, splitCardInputRef, splitCashInputRef, splitChequeInputRef, splitCreditInputRef, splitDetails, splitUpiInputRef, totalInputRefs, updateActiveTab } = ctx;
  const handleQtyKeyDown = (e: React.KeyboardEvent, productId: string) => {
    if (e.key === 'Enter' || e.key === 'ArrowRight') {
      e.preventDefault();
      focusNextCartField('qty', productId);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      focusPrevCartField('qty', productId);
    } else if (e.key === 'ArrowDown') {
      const idx = items.findIndex(i => i.product_id === productId);
      if (idx !== -1 && idx < items.length - 1) {
        e.preventDefault();
        const nextId = items[idx + 1].product_id;
        qtyRefs.current[nextId]?.focus();
        qtyRefs.current[nextId]?.select();
      } else {
        e.preventDefault();
        if (discountRef.current) {
          discountRef.current.focus();
          discountRef.current.select();
        } else if (receivedInputRef.current && (paymentMethod === 'CASH' || paymentMethod === 'CREDIT')) {
          receivedInputRef.current.focus();
          receivedInputRef.current.select();
        }
      }
    } else if (e.key === 'ArrowUp') {
      const idx = items.findIndex(i => i.product_id === productId);
      if (idx > 0) {
        e.preventDefault();
        const prevId = items[idx - 1].product_id;
        qtyRefs.current[prevId]?.focus();
        qtyRefs.current[prevId]?.select();
      } else {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    } else if (e.ctrlKey && (e.key === 'Delete' || e.key === 'Backspace')) {
      e.preventDefault();
      const idx = items.findIndex(i => i.product_id === productId);
      removeItem(productId);
      setTimeout(() => {
        const remaining = useCartStore.getState().items;
        if (remaining.length > 0) {
          const targetItem = remaining[Math.min(idx, remaining.length - 1)];
          if (pcsRefs.current[targetItem.product_id]) {
            pcsRefs.current[targetItem.product_id]?.focus();
            pcsRefs.current[targetItem.product_id]?.select();
          } else {
            qtyRefs.current[targetItem.product_id]?.focus();
            qtyRefs.current[targetItem.product_id]?.select();
          }
        } else {
          searchRef.current?.focus();
          searchRef.current?.select();
        }
      }, 50);
    }
  };

  const focusCartItemQuantityOrPcs = () => {
    if (items.length === 0) return;
    const targetId = lastAddedProductId || items[items.length - 1].product_id;
    if (pcsRefs.current[targetId]) {
      pcsRefs.current[targetId]?.focus();
      pcsRefs.current[targetId]?.select();
      return;
    }
    if (qtyRefs.current[targetId]) {
      qtyRefs.current[targetId]?.focus();
      qtyRefs.current[targetId]?.select();
      return;
    }
    for (const item of items) {
      if (pcsRefs.current[item.product_id]) {
        pcsRefs.current[item.product_id]?.focus();
        pcsRefs.current[item.product_id]?.select();
        return;
      }
      if (qtyRefs.current[item.product_id]) {
        qtyRefs.current[item.product_id]?.focus();
        qtyRefs.current[item.product_id]?.select();
        return;
      }
    }
  };

  const handlePcsKeyDown = (e: React.KeyboardEvent, productId: string) => {
    if (e.key === 'Enter' || e.key === 'ArrowRight') {
      e.preventDefault();
      focusNextCartField('pcs', productId);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      focusPrevCartField('pcs', productId);
    } else if (e.key === 'ArrowDown') {
      const idx = items.findIndex(i => i.product_id === productId);
      if (idx !== -1 && idx < items.length - 1) {
        e.preventDefault();
        const nextId = items[idx + 1].product_id;
        if (pcsRefs.current[nextId]) {
          pcsRefs.current[nextId]?.focus();
          pcsRefs.current[nextId]?.select();
        } else {
          qtyRefs.current[nextId]?.focus();
          qtyRefs.current[nextId]?.select();
        }
      } else {
        e.preventDefault();
        if (discountRef.current) {
          discountRef.current.focus();
          discountRef.current.select();
        }
      }
    } else if (e.key === 'ArrowUp') {
      const idx = items.findIndex(i => i.product_id === productId);
      if (idx > 0) {
        e.preventDefault();
        const prevId = items[idx - 1].product_id;
        if (pcsRefs.current[prevId]) {
          pcsRefs.current[prevId]?.focus();
          pcsRefs.current[prevId]?.select();
        } else {
          qtyRefs.current[prevId]?.focus();
          qtyRefs.current[prevId]?.select();
        }
      } else {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      searchRef.current?.focus();
      searchRef.current?.select();
    } else if (e.ctrlKey && (e.key === 'Delete' || e.key === 'Backspace')) {
      e.preventDefault();
      const idx = items.findIndex(i => i.product_id === productId);
      removeItem(productId);
      setTimeout(() => {
        const remaining = useCartStore.getState().items;
        if (remaining.length > 0) {
          const targetItem = remaining[Math.min(idx, remaining.length - 1)];
          if (pcsRefs.current[targetItem.product_id]) {
            pcsRefs.current[targetItem.product_id]?.focus();
            pcsRefs.current[targetItem.product_id]?.select();
          } else {
            qtyRefs.current[targetItem.product_id]?.focus();
            qtyRefs.current[targetItem.product_id]?.select();
          }
        } else {
          searchRef.current?.focus();
          searchRef.current?.select();
        }
      }, 50);
    }
  };

  const handleSplitInputKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    currentField: 'CASH' | 'CARD' | 'UPI' | 'CHEQUE' | 'CREDIT'
  ) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      updateActiveTab({ paymentMethod: 'CASH' });
      setInfoToast('Split Payment Closed (Switched to Cash)');
      setTimeout(() => setInfoToast(null), 2000);
      setTimeout(() => paymentOptionRefs.current['CASH']?.focus(), 50);
    } else if (e.key === 'f' || e.key === 'F') {
      e.preventDefault();
      fillRestForField(currentField);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const currentSplitTotal = (Number(splitDetails.cash) || 0) + (Number(splitDetails.card) || 0) + (Number(splitDetails.upi) || 0) + (Number(splitDetails.cheque) || 0) + (Number(splitDetails.credit) || 0);
      if (currentField === 'CREDIT' || (Math.abs(currentSplitTotal - displayGrandTotal) < moneyMinorUnit() && displayGrandTotal > 0)) {
        focusDescriptionOrDiscount();
      } else {
        if (currentField === 'CASH') splitCardInputRef.current?.focus();
        else if (currentField === 'CARD') splitUpiInputRef.current?.focus();
        else if (currentField === 'UPI') splitChequeInputRef.current?.focus();
        else if (currentField === 'CHEQUE') splitCreditInputRef.current?.focus();
        else focusDescriptionOrDiscount();
      }
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      e.preventDefault();
      if (currentField === 'CASH') splitCardInputRef.current?.focus();
      else if (currentField === 'CARD') splitUpiInputRef.current?.focus();
      else if (currentField === 'UPI') splitChequeInputRef.current?.focus();
      else if (currentField === 'CHEQUE') splitCreditInputRef.current?.focus();
      else splitCashInputRef.current?.focus();
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      e.preventDefault();
      if (currentField === 'CREDIT') splitChequeInputRef.current?.focus();
      else if (currentField === 'CHEQUE') splitUpiInputRef.current?.focus();
      else if (currentField === 'UPI') splitCardInputRef.current?.focus();
      else if (currentField === 'CARD') splitCashInputRef.current?.focus();
      else splitCreditInputRef.current?.focus();
    }
  };

  const sanitizeQtyText = (raw: string) => {
    const cleaned = raw.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1');
    return cleaned === '' ? '' : cleaned.replace(/^\./, '0.');
  };

  const guardScannerInput = (e: React.KeyboardEvent, productId: string, currentValue: number | string, restore: (v: number | string) => void) => {
    if (e.key.length !== 1 || e.ctrlKey || e.altKey || e.metaKey) return;
    if (detectScannerBurst(qtyKeyTimesRef.current, qtySnapshotsRef.current, productId, currentValue, restore)) {
      e.preventDefault();
    }
  };

  const handleDiscKeyDown = (e: React.KeyboardEvent, productId: string) => {
    if (e.key === 'Enter' || e.key === 'ArrowRight') {
      e.preventDefault();
      focusNextCartField('discount', productId);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      focusPrevCartField('discount', productId);
    } else if (e.key === 'ArrowDown') {
      const idx = items.findIndex(i => i.product_id === productId);
      if (idx !== -1 && idx < items.length - 1) {
        e.preventDefault();
        const nextId = items[idx + 1].product_id;
        discRefs.current[nextId]?.focus();
        discRefs.current[nextId]?.select();
      }
    } else if (e.key === 'ArrowUp') {
      const idx = items.findIndex(i => i.product_id === productId);
      if (idx > 0) {
        e.preventDefault();
        const prevId = items[idx - 1].product_id;
        discRefs.current[prevId]?.focus();
        discRefs.current[prevId]?.select();
      } else {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    }
  };

  const handleDiscFlatKeyDown = (e: React.KeyboardEvent, productId: string) => {
    if (e.key === 'Enter' || e.key === 'ArrowRight') {
      e.preventDefault();
      focusNextCartField('discountFlat', productId);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      focusPrevCartField('discountFlat', productId);
    } else if (e.key === 'ArrowDown') {
      const idx = items.findIndex(i => i.product_id === productId);
      if (idx !== -1 && idx < items.length - 1) {
        e.preventDefault();
        const nextId = items[idx + 1].product_id;
        discFlatRefs.current[nextId]?.focus();
        discFlatRefs.current[nextId]?.select();
      }
    } else if (e.key === 'ArrowUp') {
      const idx = items.findIndex(i => i.product_id === productId);
      if (idx > 0) {
        e.preventDefault();
        const prevId = items[idx - 1].product_id;
        discFlatRefs.current[prevId]?.focus();
        discFlatRefs.current[prevId]?.select();
      } else {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    }
  };

  const handleTotalInputKeyDown = (e: React.KeyboardEvent, productId: string) => {
    if (e.key === 'Enter' || e.key === 'ArrowRight') {
      e.preventDefault();
      focusNextCartField('grandTotal', productId);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      focusPrevCartField('grandTotal', productId);
    } else if (e.key === 'ArrowDown') {
      const idx = items.findIndex(i => i.product_id === productId);
      if (idx !== -1 && idx < items.length - 1) {
        e.preventDefault();
        const nextId = items[idx + 1].product_id;
        totalInputRefs.current[nextId]?.focus();
        totalInputRefs.current[nextId]?.select();
      }
    } else if (e.key === 'ArrowUp') {
      const idx = items.findIndex(i => i.product_id === productId);
      if (idx > 0) {
        e.preventDefault();
        const prevId = items[idx - 1].product_id;
        totalInputRefs.current[prevId]?.focus();
        totalInputRefs.current[prevId]?.select();
      } else {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    }
  };

  return { handleQtyKeyDown, focusCartItemQuantityOrPcs, handlePcsKeyDown, handleSplitInputKeyDown, sanitizeQtyText, guardScannerInput, handleDiscKeyDown, handleDiscFlatKeyDown, handleTotalInputKeyDown };
}
