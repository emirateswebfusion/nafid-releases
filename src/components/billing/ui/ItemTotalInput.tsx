import React, { useState, useEffect } from 'react';
import clsx from 'clsx';

export interface ItemTotalInputProps {
  productId: string;
  total: number;
  rate: number;
  qty: number;
  hasDiscount: boolean;
  isScrap?: boolean;
  onUpdateOfferPrice: (productId: string, unitPrice: number) => void;
  onRemoveDiscount: (productId: string) => void;
  onClearLocalDiscounts: (productId: string) => void;
  syncActiveSnapshot: () => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onKeyDownNext?: () => void;
  onKeyDownBack?: () => void;
  onFocus?: (e: React.FocusEvent<HTMLInputElement>) => void;
  inputRef?: (el: HTMLInputElement | null) => void;
}

export function ItemTotalInput({
  productId,
  total,
  rate,
  qty,
  hasDiscount,
  isScrap = false,
  onUpdateOfferPrice,
  onRemoveDiscount,
  onClearLocalDiscounts,
  syncActiveSnapshot,
  onKeyDown,
  onKeyDownNext,
  onKeyDownBack,
  onFocus,
  inputRef,
}: ItemTotalInputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [localVal, setLocalVal] = useState<string>(() => (total > 0 ? (Number.isInteger(total) ? String(total) : total.toFixed(2)) : ''));

  useEffect(() => {
    if (!isFocused) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- total and isFocused refresh the draft only while blurred, so active typing remains untouched.
      setLocalVal(total > 0 ? (Number.isInteger(total) ? String(total) : total.toFixed(2)) : (total === 0 ? '0' : ''));
      setIsDirty(false);
    }
  }, [total, isFocused]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setIsDirty(true);
    const raw = e.target.value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1');
    setLocalVal(raw);

    if (raw === '' || isNaN(parseFloat(raw))) {
      return;
    }

    const newTotal = parseFloat(raw);
    if (newTotal < 0) {
      return;
    }

    const effectiveQty = qty > 0 ? qty : 1;
    const newUnitPrice = newTotal / effectiveQty;
    if (Math.abs(newUnitPrice - rate) < 0.001) {
      onRemoveDiscount(productId);
    } else {
      onUpdateOfferPrice(productId, newUnitPrice);
    }
    onClearLocalDiscounts(productId);
    syncActiveSnapshot();
  };

  const handleBlur = () => {
    setIsFocused(false);
    if (!isDirty) {
      setLocalVal(total > 0 ? (Number.isInteger(total) ? String(total) : total.toFixed(2)) : (total === 0 ? '0' : ''));
      return;
    }
    setIsDirty(false);
    const parsed = parseFloat(localVal);

    if (localVal === '' || isNaN(parsed) || parsed < 0) {
      onRemoveDiscount(productId);
      onClearLocalDiscounts(productId);
      const effectiveQty = qty > 0 ? qty : 1;
      const defaultTotal = rate * effectiveQty;
      setLocalVal(defaultTotal > 0 ? (Number.isInteger(defaultTotal) ? String(defaultTotal) : defaultTotal.toFixed(2)) : '');
      syncActiveSnapshot();
    } else {
      const effectiveQty = qty > 0 ? qty : 1;
      const newUnitPrice = parsed / effectiveQty;
      if (Math.abs(newUnitPrice - rate) < 0.001) {
        onRemoveDiscount(productId);
      } else {
        onUpdateOfferPrice(productId, newUnitPrice);
      }
      setLocalVal(Number.isInteger(parsed) ? String(parsed) : parsed.toFixed(2));
      onClearLocalDiscounts(productId);
      syncActiveSnapshot();
    }
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    setIsFocused(true);
    e.target.select();
    onFocus?.(e);
  };

  const handleKeyDownInternal = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === 'ArrowRight') {
      handleBlur();
      if (onKeyDownNext) {
        e.preventDefault();
        onKeyDownNext();
        return;
      }
    } else if (e.key === 'ArrowLeft') {
      handleBlur();
      if (onKeyDownBack) {
        e.preventDefault();
        onKeyDownBack();
        return;
      }
    }
    onKeyDown?.(e);
  };

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="decimal"
      className={clsx(
        "w-20 text-right bg-transparent border-0 font-black text-sm focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
        isScrap
          ? (hasDiscount ? "text-emerald-500" : "text-orange-600 dark:text-orange-400")
          : (hasDiscount ? "text-emerald-500" : "text-foreground")
      )}
      value={localVal}
      onChange={handleChange}
      onBlur={handleBlur}
      onFocus={handleFocus}
      onKeyDown={handleKeyDownInternal}
    />
  );
}

