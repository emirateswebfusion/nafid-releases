import type { Customer, Party } from './customerTypes';

export function findMatchingPartyForCustomer(cust: Customer | null | undefined, partyList: Party[]): Party | null {
  if (!cust) return null;
  const custDigits = (cust.phone || '').replace(/\D/g, '');
  const cleanName = (cust.name || '').trim().toLowerCase();

  return partyList.find(p => {
    if (!p) return false;
    if (p.party_id === cust.customer_id) return true;
    const pDigits = (p.phone || '').replace(/\D/g, '');
    if (custDigits && pDigits) {
      if (custDigits === pDigits) return true;
      if (custDigits.length >= 7 && pDigits.length >= 7 && custDigits.slice(-10) === pDigits.slice(-10)) return true;
    }
    if (cleanName && p.name && p.name.trim().toLowerCase() === cleanName) return true;
    return false;
  }) || null;
}
