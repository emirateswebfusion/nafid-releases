import { useCallback, useEffect, useMemo, useState } from 'react';
import { hasBridge, isDesktopRuntime } from '../../../data/client';
import { customersApi } from '../../../data/customers';
import { staffApi } from '../../../data/staff';
import {
  buildPartyCustomers,
  buildPartyMap,
  filterCustomerSuggestions,
  findMatchingParty as matchParty,
  type DirectoryRow,
} from '../customerDirectory';

export interface CustomerDirectoryInput {
  tenantId: string | null;
  /** `featureFlags?.staff_credit_billing` */
  staffCreditBilling: boolean | undefined;
  /** Parties loaded for pricing tiers (suppliers are filtered out here). */
  parties: DirectoryRow[];
  customerName: string;
  customerPhone: string;
}

/**
 * Customers, staff and parties the billing customer fields can match against, plus the suggestions for what is
 * typed. Loads all customers (and active staff when staff credit billing is on) once per tenant and runs a debounced
 * lookup for the typed name/phone.
 */
export function useCustomerDirectory({ tenantId, staffCreditBilling, parties, customerName, customerPhone }: CustomerDirectoryInput) {
  const [customerSearchResults, setCustomerSearchResults] = useState<DirectoryRow[]>([]);
  const [allCustomersList, setAllCustomersList] = useState<DirectoryRow[]>([]);
  const [allStaffList, setAllStaffList] = useState<DirectoryRow[]>([]);

  // Load all existing customers for fast autocomplete
  useEffect(() => {
    if (hasBridge('dbGetCustomers')) {
      customersApi.getCustomers({ tenant_id: tenantId || 'global' })
        .then((data: unknown) => {
          if (Array.isArray(data)) {
            setAllCustomersList(data);
          }
        })
        .catch(() => {});
    }
  }, [tenantId]);

  // Load all active staff when staff credit billing feature flag is enabled
  useEffect(() => {
    if (staffCreditBilling && hasBridge('dbGetStaff')) {
      staffApi.getStaff({ tenant_id: tenantId || 'global', status: 'ACTIVE' })
        .then((data: unknown) => {
          if (Array.isArray(data)) {
            setAllStaffList(data);
          }
        })
        .catch(() => {});
    } else {
      setAllStaffList([]);
    }
  }, [staffCreditBilling, tenantId]);

  // Customer autofill search by name or phone
  useEffect(() => {
    const nameQuery = customerName.trim();
    const phoneQuery = customerPhone.trim();
    if ((!nameQuery && !phoneQuery) || !isDesktopRuntime()) {
      setCustomerSearchResults([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const results = await customersApi.findCustomers({
          tenant_id: tenantId || 'global',
          name: nameQuery || undefined,
          phone: phoneQuery || undefined,
        });
        if (Array.isArray(results)) {
          setCustomerSearchResults(results);
        }
      } catch {}
    }, 150);
    return () => clearTimeout(t);
  }, [customerName, customerPhone, tenantId]);

  // Memoize party map and party customer list so they are not rebuilt on every keystroke
  const cachedPartyMap = useMemo(
    () => buildPartyMap(parties, Boolean(staffCreditBilling)),
    [parties, staffCreditBilling],
  );

  const cachedPartyCustomers = useMemo(
    () => buildPartyCustomers(parties, allCustomersList, Boolean(staffCreditBilling)),
    [parties, allCustomersList, staffCreditBilling],
  );

  // Compute filtered & deduplicated customer suggestions (including staff if enabled)
  const filteredCustomerSuggestions = useMemo(
    () => filterCustomerSuggestions(
      { name: customerName, phone: customerPhone },
      { staff: allStaffList, searchResults: customerSearchResults, customers: allCustomersList, staffEnabled: Boolean(staffCreditBilling) },
      cachedPartyCustomers,
      cachedPartyMap,
    ),
    [customerName, customerPhone, customerSearchResults, allCustomersList, allStaffList, staffCreditBilling, cachedPartyCustomers, cachedPartyMap],
  );

  const findMatchingParty = useCallback(
    (name?: string, phone?: string) => matchParty(
      { parties, customers: allCustomersList, searchResults: customerSearchResults, staffEnabled: Boolean(staffCreditBilling) },
      name,
      phone,
    ),
    [parties, allCustomersList, customerSearchResults, staffCreditBilling],
  );

  return { allCustomersList, filteredCustomerSuggestions, findMatchingParty, setCustomerSearchResults };
}
