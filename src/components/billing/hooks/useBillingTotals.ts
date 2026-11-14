import { totalReturnLines } from '../../../utils/pricing/returnPricing';
import type { CartItem } from '../../../store/cartStore';
import type { Dispatch, SetStateAction } from 'react';
import { useTabStore, type Tab } from '../../../store/tabStore';

export interface UseBillingTotalsContext {
  activeTab: Tab | undefined;
  editingInvoiceId?: string | null;
  setPointsToRedeem: Dispatch<SetStateAction<number>>;
  extraBonus: number;
  grandTotal: number;
  isLoyaltyModuleEnabled: boolean;
  isReturnMode: boolean;
  isScrapMode: boolean;
  items: CartItem[];
  loyaltyCustomerData: { customerId: string | null; pointsBalance: number; };
  loyaltyRedemptionRate: number;
  pointsToRedeem: number;
  receivedAmount: number;
  scrapTotal: number;
  storeReturnDeduction: number;
  storeScrapDeduction: number;
}

/** Bill totals for the current cart and mode: deductions, return refund, loyalty points discount, displayed grand total and balance. */
export function useBillingTotals(ctx: UseBillingTotalsContext) {
  const { activeTab, extraBonus, grandTotal, isLoyaltyModuleEnabled, isReturnMode, isScrapMode, items, loyaltyCustomerData, loyaltyRedemptionRate, pointsToRedeem, receivedAmount, scrapTotal, storeReturnDeduction, storeScrapDeduction } = ctx;
  const totalDeductions = (storeScrapDeduction || 0) + (storeReturnDeduction || 0);

  // Return credit is consumed first (up to the bill total); its leftover stays as
  // pending ADJUST_BILL credit for a future bill (not cash-refunded). Only scrap
  // credit excess is refunded as cash (existing behavior).
  const returnConsumed = Math.min(storeReturnDeduction || 0, grandTotal);

  const refundAmount = !isScrapMode ? Math.max(0, totalDeductions - grandTotal) : 0;

  const returned = totalReturnLines(items);
  const returnTotal = returned.subtotal;
  const originalReturnTotal = returned.original;
  const returnDiscountTotal = returned.discount;

  const rawDisplayGrandTotal = isScrapMode
    ? scrapTotal + extraBonus
    : isReturnMode
      ? returned.total
      : Math.max(0, grandTotal - (storeScrapDeduction || 0) - (storeReturnDeduction || 0));

  const saved = activeTab?.savedRedemption;
  const savedRedemption = saved && saved.invoiceId === ctx.editingInvoiceId ? saved : undefined;
  const customerPointsBalance = Math.max(0, (Number(loyaltyCustomerData?.pointsBalance) || 0) + (savedRedemption?.points || 0));
  const requestedPoints = savedRedemption?.draftPoints ?? savedRedemption?.points ?? pointsToRedeem;
  const unchanged = savedRedemption && (savedRedemption.draftPoints == null || savedRedemption.draftPoints === savedRedemption.points);
  const pointsRedeemedCalc = unchanged ? savedRedemption.points : (isLoyaltyModuleEnabled
    ? Math.min(Math.max(0, requestedPoints), customerPointsBalance)
    : 0);
  const pointsRedeemedDiscountCalc = unchanged ? savedRedemption.discount : pointsRedeemedCalc * loyaltyRedemptionRate;

  const isGrandTotalOverridden = !isScrapMode && !isReturnMode && activeTab?.manualTotalOverride != null && activeTab.manualTotalOverride > 0;

  const displayGrandTotal = Math.max(
    0,
    (isGrandTotalOverridden ? activeTab.manualTotalOverride! : rawDisplayGrandTotal) - pointsRedeemedDiscountCalc
  );

  const balanceAmount = receivedAmount - displayGrandTotal;

  const setBillPointsToRedeem: Dispatch<SetStateAction<number>> = value => {
    if (savedRedemption) {
      const draftPoints = typeof value === 'function' ? value(pointsRedeemedCalc) : value;
      useTabStore.getState().updateActiveTab({ savedRedemption: { ...savedRedemption, draftPoints } });
    } else {
      ctx.setPointsToRedeem(value);
    }
  };
  return { setBillPointsToRedeem, savedRedemption, returnConsumed, refundAmount, returnTotal, originalReturnTotal, returnDiscountTotal, rawDisplayGrandTotal, customerPointsBalance, pointsRedeemedCalc, pointsRedeemedDiscountCalc, isGrandTotalOverridden, displayGrandTotal, balanceAmount };
}
