import React, { useEffect } from 'react';
import { hasBridge } from '../../../data/client';
import { customersApi } from '../../../data/customers';
import type { MatchedParty, DirectoryRow } from '../customerDirectory';
import type { Tab } from '../../../store/tabStore';

export interface UseCustomerAutoMatchContext {
  activeTab: Tab | undefined;
  allCustomersList: DirectoryRow[];
  applyPartyTier: (name: string, phone: string) => void;
  customerName: string;
  customerPhone: string;
  findMatchingParty: (name?: string, phone?: string) => MatchedParty | null;
  loyaltyCustomerData: { customerId: string | null; pointsBalance: number; };
  pointsToRedeem: number;
  setLoyaltyCustomerData: React.Dispatch<React.SetStateAction<{ customerId: string | null; pointsBalance: number; }>>;
  setPointsToRedeem: React.Dispatch<React.SetStateAction<number>>;
  setShowLoyaltyRedemption: React.Dispatch<React.SetStateAction<boolean>>;
  showLoyaltyRedemption: boolean;
  tenantId: string | null;
  updateActiveTab: (updates: Partial<Omit<Tab, "id" | "snapshot">>) => void;
}

/**
 * While the customer name / phone is typed (debounced): apply the matched party's pricing tier and match the loyalty
 * customer; keeps the points to redeem within the customer's balance.
 */
export function useCustomerAutoMatch(ctx: UseCustomerAutoMatchContext) {
  const { activeTab, allCustomersList, applyPartyTier, customerName, customerPhone, findMatchingParty, loyaltyCustomerData, pointsToRedeem, setLoyaltyCustomerData, setPointsToRedeem, setShowLoyaltyRedemption, showLoyaltyRedemption, tenantId, updateActiveTab } = ctx;
  // Debounce party tier application & loyalty customer auto-matching during customer typing so typing is never blocked
  useEffect(() => {
    const cleanName = customerName.trim().toLowerCase();
    const cleanPhone = customerPhone.trim();
    if (!cleanName && !cleanPhone) {
      if (loyaltyCustomerData.customerId) {
        setLoyaltyCustomerData({ customerId: null, pointsBalance: 0 });
        setPointsToRedeem(0);
        setShowLoyaltyRedemption(false);
      }
      return;
    }
    const timer = setTimeout(() => {
      applyPartyTier(customerName, customerPhone);
      const matched = findMatchingParty(customerName, customerPhone);
      const custMatch = (allCustomersList || []).find((c) => {
        if (!c) return false;
        const cp = String(c.phone || '').trim();
        const cn = String(c.name || '').trim().toLowerCase();
        if (cleanPhone && cp && cp === cleanPhone) return true;
        if (cleanName && cn && cn === cleanName) return true;
        return false;
      });

      const resolvedCustId = (matched && matched.customer_id) || custMatch?.customer_id;
      const resolvedPoints = custMatch?.current_points_balance !== undefined
        ? Number(custMatch.current_points_balance) || 0
        : (matched?.current_points_balance !== undefined ? Number(matched.current_points_balance) || 0 : 0);

      if (resolvedCustId) {
        setLoyaltyCustomerData({
          customerId: resolvedCustId,
          pointsBalance: Number(resolvedPoints) || 0,
        });
        if (!activeTab?.customerId) {
          updateActiveTab({ customerId: resolvedCustId });
        }
      } else if (cleanPhone || cleanName) {
        // Query backend directly if not loaded in memory yet
        if (hasBridge('dbFindCustomers')) {
          customersApi.findCustomers({
            tenant_id: tenantId || 'global',
            phone: cleanPhone || undefined,
            name: cleanName || undefined,
          }).then((res) => {
            const list = Array.isArray(res) ? res : [];
            const found = list.find((c) =>
              (cleanPhone && String(c.phone || '').trim() === cleanPhone) ||
              (cleanName && String(c.name || '').trim().toLowerCase() === cleanName)
            ) || list[0];
            if (found && found.customer_id) {
              setLoyaltyCustomerData({
                customerId: found.customer_id,
                pointsBalance: Number(found.current_points_balance) || 0,
              });
              if (!activeTab?.customerId) {
                updateActiveTab({ customerId: found.customer_id });
              }
            }
          }).catch(() => {});
        }
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [customerName, customerPhone, findMatchingParty, allCustomersList, tenantId]);

  // Ensure redeemed points does not exceed active customer balance
  useEffect(() => {
    const bal = Number(loyaltyCustomerData?.pointsBalance) || 0;
    if (!loyaltyCustomerData.customerId || bal <= 0) {
      if (pointsToRedeem > 0) setPointsToRedeem(0);
      if (showLoyaltyRedemption) setShowLoyaltyRedemption(false);
    } else if (pointsToRedeem > bal) {
      setPointsToRedeem(bal);
    }
  }, [loyaltyCustomerData.customerId, loyaltyCustomerData.pointsBalance]);

}
