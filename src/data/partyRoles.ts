/**
 * Canonical party role definitions and helper functions.
 * Parties can have one or more roles (e.g. 'CUSTOMER', 'SUPPLIER', or both).
 */

export type PartyRole = 'CUSTOMER' | 'SUPPLIER' | 'STAFF' | 'CUSTOM';

export const ALL_PARTY_ROLES: readonly PartyRole[] = ['CUSTOMER', 'SUPPLIER', 'STAFF', 'CUSTOM'] as const;

/**
 * Parses party_type string into an array of uppercase roles.
 * e.g. "CUSTOMER,SUPPLIER" -> ['CUSTOMER', 'SUPPLIER']
 * null or empty string defaults to ['CUSTOMER']
 */
export function parsePartyRoles(partyType: string | null | undefined): PartyRole[] {
  if (!partyType || !partyType.trim()) return ['CUSTOMER'];
  const parts = partyType
    .toUpperCase()
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is PartyRole => ALL_PARTY_ROLES.includes(s as PartyRole));
  return parts.length > 0 ? parts : ['CUSTOMER'];
}

/**
 * Checks whether a party_type contains a specific role.
 */
export function hasPartyRole(partyType: string | null | undefined, role: PartyRole): boolean {
  const roles = parsePartyRoles(partyType);
  return roles.includes(role);
}

/**
 * Checks if a party should appear in the POS customer billing directory.
 * Rules:
 * - A party appears in billing if it has the 'CUSTOMER' role.
 * - Or if it has 'STAFF' role and staff billing is enabled.
 * - Or if it has 'CUSTOM' role and NOT purely 'SUPPLIER'.
 * - Pure suppliers (only 'SUPPLIER', without 'CUSTOMER') are strictly hidden.
 */
export function isAllowedInBilling(partyType: string | null | undefined, staffEnabled = false): boolean {
  const roles = parsePartyRoles(partyType);
  if (roles.includes('CUSTOMER')) return true;
  if (roles.includes('STAFF') && staffEnabled) return true;
  if (roles.includes('CUSTOM') && !roles.includes('SUPPLIER')) return true;
  return false;
}

/**
 * Checks if a party should appear in purchase bills (as a supplier).
 * Rules:
 * - A party appears in purchase bills if it has the 'SUPPLIER' role.
 */
export function isAllowedInPurchase(partyType: string | null | undefined): boolean {
  const roles = parsePartyRoles(partyType);
  return roles.includes('SUPPLIER');
}

/**
 * Formats roles array into a canonical comma-separated string for saving.
 * e.g. ['CUSTOMER', 'SUPPLIER'] -> "CUSTOMER,SUPPLIER"
 */
export function formatPartyRoles(roles: (PartyRole | string)[]): string {
  const unique = Array.from(new Set(roles.map((r) => r.toUpperCase().trim()).filter(Boolean)));
  return unique.length > 0 ? unique.join(',') : 'CUSTOMER';
}
