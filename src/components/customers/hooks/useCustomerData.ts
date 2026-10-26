import React, { useCallback } from 'react';
import { isDesktopRuntime } from '../../../data/client';
import { customersApi } from '../../../data/customers';
import { partiesApi } from '../../../data/parties';
import { type Customer } from '../customerTypes';
import type { Party, LoyaltyTx, InvoiceRecord, View, DetailTab } from '../customerTypes';

export interface UseCustomerDataContext {
  customers: Customer[];
  debouncedSearchQuery: string;
  filterActive: boolean;
  filterCredit: "all" | "credit" | "no-credit";
  filterOverdue: boolean;
  filterPricingTier: string;
  findMatchingPartyForCustomer: (cust: Customer | null | undefined, partyList: Party[]) => Party | null;
  lastInteractedCustomerIdRef: React.RefObject<string | null>;
  listScrollRef: React.RefObject<HTMLDivElement | null>;
  parties: Party[];
  partiesRef: React.RefObject<Party[]>;
  savedScrollTopRef: React.RefObject<number>;
  setBillFilterEnd: React.Dispatch<React.SetStateAction<string>>;
  setBillFilterStart: React.Dispatch<React.SetStateAction<string>>;
  setCustomers: React.Dispatch<React.SetStateAction<Customer[]>>;
  setDetailTab: React.Dispatch<React.SetStateAction<DetailTab>>;
  setFilterLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setInvoices: React.Dispatch<React.SetStateAction<InvoiceRecord[]>>;
  setInvoicesLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setLoyaltyTxs: React.Dispatch<React.SetStateAction<LoyaltyTx[]>>;
  setLoyaltyTxsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setMatchedParty: React.Dispatch<React.SetStateAction<Party | null>>;
  setParties: React.Dispatch<React.SetStateAction<Party[]>>;
  setSelectedCustomer: React.Dispatch<React.SetStateAction<Customer | null>>;
  setView: React.Dispatch<React.SetStateAction<View>>;
  setVisibleCount: React.Dispatch<React.SetStateAction<number>>;
  showStatus: (text: string, type: "success" | "error") => void;
  tenantId: string | null;
  visibleCount: number;
}

/** Loads the customer list (`loadCustomers`, paged / filtered) and one customer's purchases and points (`loadCustomerDetails`). */
export function useCustomerData(ctx: UseCustomerDataContext) {
  const { customers, debouncedSearchQuery, filterActive, filterCredit, filterOverdue, filterPricingTier, findMatchingPartyForCustomer, lastInteractedCustomerIdRef, listScrollRef, parties, partiesRef, savedScrollTopRef, setBillFilterEnd, setBillFilterStart, setCustomers, setDetailTab, setFilterLoading, setInvoices, setInvoicesLoading, setLoading, setLoyaltyTxs, setLoyaltyTxsLoading, setMatchedParty, setParties, setSelectedCustomer, setView, setVisibleCount, showStatus, tenantId, visibleCount } = ctx;
  const loadCustomers = useCallback(async (isInitialLoad = false) => {
    if (!tenantId || !isDesktopRuntime()) return;
    if (isInitialLoad) {
      setLoading(true);
    } else {
      setFilterLoading(true);
    }
    try {
      const custPromise = customersApi.getCustomers({
        tenant_id: tenantId,
        search: debouncedSearchQuery || undefined,
        active: filterActive || undefined,
        credit: filterCredit === 'credit' ? true : filterCredit === 'no-credit' ? false : undefined,
        pricing_tier_id: filterPricingTier || undefined,
        overdue: filterOverdue || undefined,
      });

      const partyPromise = (isInitialLoad || partiesRef.current.length === 0)
        ? partiesApi.getParties(tenantId).catch(() => [])
        : Promise.resolve(null);

      const [custData, partyData] = await Promise.all([custPromise, partyPromise]);

      const cleanCusts: Customer[] = [];
      if (Array.isArray(custData)) {
        const seen = new Set<string>();
        for (const c of custData) {
          if (!c.customer_id || seen.has(c.customer_id)) continue;
          seen.add(c.customer_id);
          cleanCusts.push(c);
        }
      }

      setCustomers(cleanCusts);
      if (partyData !== null && Array.isArray(partyData)) {
        setParties(partyData);
        partiesRef.current = partyData;
      }
    } catch {
      showStatus('Failed to load customers', 'error');
    } finally {
      setLoading(false);
      setFilterLoading(false);
    }
  }, [tenantId, debouncedSearchQuery, filterActive, filterCredit, filterPricingTier, filterOverdue, partiesRef, setCustomers, setFilterLoading, setLoading, setParties, showStatus]);

  const loadCustomerDetails = async (customer: Customer) => {
    lastInteractedCustomerIdRef.current = customer.customer_id;
    if (listScrollRef.current) {
      savedScrollTopRef.current = listScrollRef.current.scrollTop;
    }
    const idx = customers.findIndex(c => c.customer_id === customer.customer_id);
    if (idx >= 0 && idx >= visibleCount) {
      setVisibleCount(Math.ceil((idx + 1) / 50) * 50);
    }
    setSelectedCustomer(customer);

    // Match customer to Party by ID, phone (normalized) or name
    const pMatch = findMatchingPartyForCustomer(customer, parties);
    setMatchedParty(pMatch || null);

    setView('detail');
    setDetailTab('purchases');
    setBillFilterStart('');
    setBillFilterEnd('');
    setInvoicesLoading(true);
    setLoyaltyTxsLoading(true);

    if (!isDesktopRuntime()) return;
    try {
      const [invData, loyaltyData] = await Promise.all([
        customersApi.getCustomerInvoices({
          customer_id: customer.customer_id,
          tenant_id: tenantId as string,
          phone: customer.phone,
          name: customer.name,
        }),
        customersApi.getCustomerLoyaltyTransactions({ customer_id: customer.customer_id, tenant_id: tenantId as string }),
      ]);
      setInvoices(Array.isArray(invData) ? invData : []);
      setLoyaltyTxs(Array.isArray(loyaltyData) ? loyaltyData : []);
    } catch {
      showStatus('Failed to load customer details', 'error');
    } finally {
      setInvoicesLoading(false);
      setLoyaltyTxsLoading(false);
    }
  };

  return { loadCustomers, loadCustomerDetails };
}
