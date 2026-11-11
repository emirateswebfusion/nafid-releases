import { getCurrencyDecimals } from '../../../utils/localization/storeProfile';
import { getCurrencyPrefix } from '../../../utils/localization/storeProfile';
import React, { useEffect } from 'react';
import { type SplitDetails } from '../../../store/tabStore';
import type { Tab } from '../../../store/tabStore';

export interface UseBillingQuickActionsContext {
  displayGrandTotal: number;
  isPastBillMode: boolean;
  isReturnMode: boolean;
  isScrapMode: boolean;
  setInfoToast: React.Dispatch<React.SetStateAction<string | null>>;
  setNewProductName: React.Dispatch<React.SetStateAction<string>>;
  setShowProductCreateForm: React.Dispatch<React.SetStateAction<boolean>>;
  showProductCreateForm: boolean;
  splitDetails: SplitDetails;
  updateActiveTab: (updates: Partial<Omit<Tab, "id" | "snapshot">>) => void;
}

/** Space key opens the quick product-create form (outside inputs, normal billing only); fillRestForField puts the
 * remaining amount into one split-payment field. */
export function useBillingQuickActions(ctx: UseBillingQuickActionsContext) {
  const { displayGrandTotal, isPastBillMode, isReturnMode, isScrapMode, setInfoToast, setNewProductName, setShowProductCreateForm, showProductCreateForm, splitDetails, updateActiveTab } = ctx;
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (e.key === ' ' && !showProductCreateForm && !isScrapMode && !isReturnMode && !isPastBillMode) {
        const tag = (document.activeElement?.tagName || '').toLowerCase();
        const isEditable = (document.activeElement as HTMLElement)?.isContentEditable;
        if (tag !== 'input' && tag !== 'textarea' && tag !== 'select' && !isEditable) {
          e.preventDefault();
          setShowProductCreateForm(true);
          setNewProductName('');
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [showProductCreateForm, isScrapMode, isReturnMode, isPastBillMode, setNewProductName, setShowProductCreateForm]);

  const fillRestForField = (field: 'CASH' | 'CARD' | 'UPI' | 'CHEQUE' | 'CREDIT') => {
    const cash = field === 'CASH' ? 0 : (Number(splitDetails.cash) || 0);
    const card = field === 'CARD' ? 0 : (Number(splitDetails.card) || 0);
    const upi = field === 'UPI' ? 0 : (Number(splitDetails.upi) || 0);
    const cheque = field === 'CHEQUE' ? 0 : (Number(splitDetails.cheque) || 0);
    const credit = field === 'CREDIT' ? 0 : (Number(splitDetails.credit) || 0);
    const bankTransfer = Number(splitDetails.bank_transfer) || 0;

    const otherSum = cash + card + upi + cheque + credit + bankTransfer;
    const rem = Math.max(0, Number((displayGrandTotal - otherSum).toFixed(getCurrencyDecimals())));

    const nextDetails: SplitDetails = {
      ...splitDetails,
      [field.toLowerCase()]: rem,
    };

    const nextRec = (Number(nextDetails.cash) || 0) + (Number(nextDetails.card) || 0) + (Number(nextDetails.upi) || 0) + (Number(nextDetails.cheque) || 0) + (Number(nextDetails.bank_transfer) || 0);

    updateActiveTab({ splitDetails: nextDetails, receivedAmount: nextRec });
    setInfoToast(`Filled Rest: ${getCurrencyPrefix()}${rem} into ${field}`);
    setTimeout(() => setInfoToast(null), 1500);
  };

  return { fillRestForField };
}
