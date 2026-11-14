// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { useBillingTotals, type UseBillingTotalsContext } from '../../src/components/billing/hooks/useBillingTotals';
import type { Tab } from '../../src/store/tabStore';

const activeTab = {
  savedRedemption: { invoiceId: 'bill', points: 20, discount: 10 },
} as Tab;

const context: UseBillingTotalsContext = {
  activeTab,
  setPointsToRedeem: () => {},
  editingInvoiceId: 'bill',
  extraBonus: 0,
  grandTotal: 100,
  isLoyaltyModuleEnabled: false,
  isReturnMode: false,
  isScrapMode: false,
  items: [],
  loyaltyCustomerData: { customerId: 'customer', pointsBalance: 0 },
  loyaltyRedemptionRate: 1,
  pointsToRedeem: 0,
  receivedAmount: 90,
  scrapTotal: 0,
  storeReturnDeduction: 0,
  storeScrapDeduction: 0,
};

describe('saved bill redemption', () => {
  it.each([true, false])('retains the stored discount with loyalty enabled=%s', (isLoyaltyModuleEnabled) => {
    expect(useBillingTotals({ ...context, isLoyaltyModuleEnabled })).toMatchObject({
      pointsRedeemedCalc: 20,
      pointsRedeemedDiscountCalc: 10,
      displayGrandTotal: 90,
      balanceAmount: 0,
    });
  });

  it('allows an explicit redemption change using the restored balance and current rate', () => {
    expect(useBillingTotals({
      ...context,
      isLoyaltyModuleEnabled: true,
      activeTab: { ...activeTab, savedRedemption: { ...activeTab.savedRedemption!, draftPoints: 15 } },
    })).toMatchObject({ pointsRedeemedCalc: 15, pointsRedeemedDiscountCalc: 15, displayGrandTotal: 85 });
  });

  it('ignores another bill’s saved redemption and does not redeem a negative balance', () => {
    expect(useBillingTotals({
      ...context,
      editingInvoiceId: 'another-bill',
      isLoyaltyModuleEnabled: true,
      pointsToRedeem: 10,
      loyaltyCustomerData: { customerId: 'customer', pointsBalance: -5 },
    })).toMatchObject({ pointsRedeemedCalc: 0, pointsRedeemedDiscountCalc: 0, displayGrandTotal: 100 });
  });
});
