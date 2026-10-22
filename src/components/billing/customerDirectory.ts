import type { Party } from '../../data/parties';

/**
 * Customer lookup rules for the billing customer fields: which parties, customers and staff are offered as
 * suggestions, and which party a typed name/phone refers to. Pure functions over already-loaded lists.
 * In billing, suppliers are never offered and staff only when staff credit billing is enabled.
 */

/**
 * A row from parties, customers, the customer search or the staff list. The bridge returns these untyped and their
 * shapes differ, so fields are read loosely; this is the single place that debt lives. Replace with domain types.
 */
export type DirectoryRow = Record<string, any>;

/** One entry of the customer dropdown: a customer, a party or (when staff credit is on) a staff member. */
export interface CustomerSuggestion {
  name: string;
  phone?: string | null;
  address?: string | null;
  customer_id?: string | null;
  party_id?: string | null;
  balance?: number | string | null;
  current_points_balance?: number | string | null;
  is_staff?: boolean;
  staff_id?: string | null;
  staff_code?: string | null;
  role_designation?: string | null;
  gstin?: string | null;
  customer_gstin?: string | null;
}

/** A party (or customer) matched by name/phone, with the matching customer's id and loyalty points. */
export type MatchedParty = Partial<Party> & DirectoryRow;

export interface DirectoryLists {
  parties: DirectoryRow[];
  customers: DirectoryRow[];
  searchResults: DirectoryRow[];
  staff: DirectoryRow[];
  staffEnabled: boolean;
}

/** Party lookup by normalised name, phone and `name|phone`. */
export function buildPartyMap(parties: DirectoryRow[], staffEnabled: boolean): Map<string, DirectoryRow> {
  const map = new Map<string, DirectoryRow>();
  (parties || []).forEach((p) => {
    if (!p || !p.name) return;
    const pType = String(p.party_type || '').toUpperCase();
    // In billing page, strictly NO suppliers!
    if (pType === 'SUPPLIER') return;
    // Staff only when ON in settings
    if (pType === 'STAFF' && !staffEnabled) return;

    const pName = (p.name || '').trim().replace(/\s+/g, ' ').toLowerCase();
    const pPhone = (p.phone || '').trim();
    if (pName) map.set(pName, p);
    if (pPhone) map.set(pPhone, p);
    if (pName && pPhone) map.set(`${pName}|${pPhone}`, p);
  });
  return map;
}

/** Parties as suggestion rows, enriched with the matching customer's id and loyalty points. */
export function buildPartyCustomers(parties: DirectoryRow[], customers: DirectoryRow[], staffEnabled: boolean): DirectoryRow[] {
  return (parties || [])
    .filter((p) => {
      if (!p || !p.name) return false;
      const pType = String(p.party_type || '').toUpperCase();
      // In billing page, strictly NO suppliers!
      if (pType === 'SUPPLIER') return false;
      // Staff only when ON in settings
      if (pType === 'STAFF' && !staffEnabled) return false;
      return true;
    })
    .map((p) => {
      const pPhone = (p.phone || '').trim();
      const pNormName = (p.name || '').trim().toLowerCase();
      const cust = (customers || []).find((c) => {
        if (!c) return false;
        const cPhone = String(c.phone || '').trim();
        const cName = String(c.name || '').trim().toLowerCase();
        return (pPhone && cPhone === pPhone) || (pNormName && cName === pNormName);
      });
      return {
        name: p.name,
        phone: p.phone,
        address: p.address,
        gstin: p.gstin,
        customer_gstin: p.gstin,
        party_id: p.party_id,
        customer_id: cust?.customer_id || p.customer_id || undefined,
        current_points_balance: cust ? Number(cust.current_points_balance) || 0 : undefined,
        balance: p.balance,
        party_type: p.party_type,
        is_staff: String(p.party_type || '').toUpperCase() === 'STAFF',
      };
    });
}

/**
 * Up to 15 de-duplicated suggestions whose name or phone contains the typed text.
 * Order of precedence: staff, parties, live search results, all customers.
 */
export function filterCustomerSuggestions(
  query: { name: string; phone: string },
  lists: Pick<DirectoryLists, 'staff' | 'searchResults' | 'customers' | 'staffEnabled'>,
  partyCustomers: DirectoryRow[],
  partyMap: Map<string, DirectoryRow>,
): CustomerSuggestion[] {
  const qName = query.name.trim().replace(/\s+/g, ' ').toLowerCase();
  const qPhone = query.phone.trim();
  if (!qName && !qPhone) return [];

  const isStaffEnabled = lists.staffEnabled;
  const staffItems = (isStaffEnabled && Array.isArray(lists.staff)) ? lists.staff.map(s => ({
    customer_id: s.staff_id,
    staff_id: s.staff_id,
    is_staff: true,
    name: s.name,
    phone: s.phone || '',
    staff_code: s.staff_code,
    role_designation: s.role_designation,
    balance: s.current_balance,
  })) : [];

  const combined: DirectoryRow[] = [...staffItems, ...partyCustomers, ...lists.searchResults, ...lists.customers];
  const seen = new Set<string>();
  const matched: CustomerSuggestion[] = [];

  for (const c of combined) {
    if (!c || !c.name) continue;
    const pType = String(c.party_type || '').toUpperCase();
    // In billing page, strictly NO suppliers!
    if (pType === 'SUPPLIER') continue;

    const isStaff = Boolean(c.is_staff || pType === 'STAFF');
    // Staff only when ON in settings
    if (isStaff && !isStaffEnabled) continue;

    const cNormName = c.name.trim().replace(/\s+/g, ' ').toLowerCase();
    const cPhone = (c.phone || '').trim();
    const key = isStaff ? `staff|${c.staff_id || c.name}` : `${cNormName}|${cPhone}`;
    if (seen.has(key)) continue;

    const matchesName = qName ? cNormName.includes(qName) : false;
    const matchesPhone = qPhone ? cPhone.includes(qPhone) : false;

    if (matchesName || matchesPhone) {
      seen.add(key);
      const pMatch = isStaff ? null : (partyMap.get(key) || partyMap.get(cNormName) || (cPhone ? partyMap.get(cPhone) : null));
      const mergedBal = c.balance ?? (pMatch ? pMatch.balance : undefined);
      // `c.name` is checked above, so every entry is a CustomerSuggestion.
      matched.push({
        ...c,
        is_staff: isStaff,
        balance: mergedBal,
      } as CustomerSuggestion);
      if (matched.length >= 15) break;
    }
  }
  return matched;
}

/**
 * The party (or customer) a typed name/phone refers to: exact phone, exact name, or name equal after leading dots
 * and spaces. Adds the customer id and loyalty points of the matching customer. `null` when nothing matches.
 */
export function findMatchingParty(
  lists: Pick<DirectoryLists, 'parties' | 'customers' | 'searchResults' | 'staffEnabled'>,
  name?: string,
  phone?: string,
): MatchedParty | null {
  const cleanName = (name || '').trim().toLowerCase();
  const cleanPhone = (phone || '').trim();
  if (!cleanName && !cleanPhone) return null;
  const isStaffEnabled = lists.staffEnabled;
  const combinedList = [
    ...(lists.parties || []).filter((p) => {
      if (!p) return false;
      const pType = String(p.party_type || '').toUpperCase();
      if (pType === 'SUPPLIER') return false;
      if (pType === 'STAFF' && !isStaffEnabled) return false;
      return true;
    }),
    ...(lists.customers || []).filter((c) => String(c?.party_type || '').toUpperCase() !== 'SUPPLIER'),
    ...(lists.searchResults || []).filter((c) => String(c?.party_type || '').toUpperCase() !== 'SUPPLIER'),
  ];
  const match = combinedList.find((c) => {
    if (!c) return false;
    const cName = (c.name || '').trim().toLowerCase();
    const cPhone = String(c.phone || '').trim();
    const matchName = cleanName && cName && (
      cName === cleanName ||
      cName.replace(/^[.\s]+/, '') === cleanName.replace(/^[.\s]+/, '')
    );
    const matchPhone = cleanPhone && cPhone && cPhone === cleanPhone;
    return Boolean(matchName || matchPhone);
  }) || null;

  if (match) {
    const cust = (lists.customers || []).find((c) => {
      if (!c) return false;
      const cp = String(c.phone || '').trim();
      const cn = String(c.name || '').trim().toLowerCase();
      return (cleanPhone && cp && cp === cleanPhone) || (cleanName && cn && cn === cleanName);
    });
    return {
      ...match,
      customer_id: match.customer_id || cust?.customer_id,
      current_points_balance: match.current_points_balance ?? (cust ? Number(cust.current_points_balance) || 0 : undefined),
    };
  }
  return null;
}
