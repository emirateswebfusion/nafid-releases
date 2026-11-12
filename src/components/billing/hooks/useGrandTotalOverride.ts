import { roundMoney } from '../../../utils/pricing/moneyRounding';
import { getCurrencyPrefix, getCurrencyDecimals } from '../../../utils/localization/storeProfile';
import React, { useCallback } from 'react';
import type { CartItem } from '../../../store/cartStore';
import type { Tab } from '../../../store/tabStore';

export interface UseGrandTotalOverrideContext {
  discount: number;
  displayGrandTotal: number;
  isReturnMode: boolean;
  isScrapMode: boolean;
  items: CartItem[];
  overrideTotalInput: string;
  setDiscount: (value: number, type: "FIXED" | "PERCENTAGE") => void;
  setInfoToast: React.Dispatch<React.SetStateAction<string | null>>;
  setIsEditingTotal: React.Dispatch<React.SetStateAction<boolean>>;
  setOverrideTotalInput: React.Dispatch<React.SetStateAction<string>>;
  storeReturnDeduction: number;
  storeScrapDeduction: number;
  subtotal: number;
  totalOverrideInputRef: React.RefObject<HTMLInputElement | null>;
  totalTax: number;
  updateActiveTab: (updates: Partial<Omit<Tab, "id" | "snapshot">>) => void;
}

/** Grand-total override: start editing, reset, and commit a new total (spread as a discount). */
export function useGrandTotalOverride(ctx: UseGrandTotalOverrideContext) {
  const { discount, displayGrandTotal, isReturnMode, isScrapMode, items, overrideTotalInput, setDiscount, setInfoToast, setIsEditingTotal, setOverrideTotalInput, storeReturnDeduction, storeScrapDeduction, subtotal, totalOverrideInputRef, totalTax, updateActiveTab } = ctx;
  const startEditingTotal = useCallback(() => {
    if (isScrapMode || isReturnMode || items.length === 0) return;
    setOverrideTotalInput(String(displayGrandTotal || ''));
    setIsEditingTotal(true);
    setTimeout(() => {
      totalOverrideInputRef.current?.focus();
      totalOverrideInputRef.current?.select();
    }, 40);
  }, [isScrapMode, isReturnMode, items.length, displayGrandTotal, setIsEditingTotal, setOverrideTotalInput, totalOverrideInputRef]);

  const handleResetGrandTotalOverride = useCallback(() => {
    setDiscount(0, 'FIXED');
    updateActiveTab({ manualTotalOverride: null });
    setIsEditingTotal(false);
    setOverrideTotalInput('');
  }, [setDiscount, updateActiveTab, setIsEditingTotal, setOverrideTotalInput]);

  const commitTotalOverride = useCallback(() => {
    if (!overrideTotalInput || overrideTotalInput.trim() === '') {
      handleResetGrandTotalOverride();
      return;
    }
    const targetVal = parseFloat(overrideTotalInput);
    if (isNaN(targetVal) || targetVal < 0) {
      setIsEditingTotal(false);
      return;
    }

    const effectiveTaxRate = (subtotal > 0 && totalTax > 0) ? (totalTax / Math.max(1, subtotal - (discount || 0))) : 0;
    const deductions = (storeScrapDeduction || 0) + (storeReturnDeduction || 0);
    const basePayableBeforeDiscount = Math.max(0, (subtotal * (1 + effectiveTaxRate)) - deductions);

    if (targetVal < basePayableBeforeDiscount) {
      const shortfall = basePayableBeforeDiscount - targetVal;
      const neededDisc = effectiveTaxRate > 0 ? shortfall / (1 + effectiveTaxRate) : shortfall;
      const roundedDisc = roundMoney(neededDisc);
      setDiscount(roundedDisc, 'FIXED');
    } else {
      setDiscount(0, 'FIXED');
    }

    updateActiveTab({ manualTotalOverride: targetVal });
    setIsEditingTotal(false);
    setInfoToast(`Grand Total overridden to ${getCurrencyPrefix()}${targetVal.toFixed(getCurrencyDecimals())}`);
    setTimeout(() => setInfoToast(null), 2500);
  }, [overrideTotalInput, subtotal, totalTax, discount, storeScrapDeduction, storeReturnDeduction, setDiscount, updateActiveTab, handleResetGrandTotalOverride, setInfoToast, setIsEditingTotal]);

  return { startEditingTotal, handleResetGrandTotalOverride, commitTotalOverride };
}
