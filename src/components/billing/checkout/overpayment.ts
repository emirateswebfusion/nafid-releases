const money = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * Cash received beyond the bill that stays on the customer's account. It follows what the billing screen shows: a
 * customer with a balance, or a Credit bill, sees the new due / advance (`tracksPartyBalance`), so the excess is kept;
 * anyone else sees change, so the excess was handed back. Staff bills and non-cash methods keep nothing.
 */
export function onAccountExcess(params: {
  paymentMethod: string;
  grandTotal: number;
  received: number;
  hasParty: boolean;
  isStaff: boolean;
  partyOldBalance: number;
}): number {
  const { paymentMethod, grandTotal, received, hasParty, isStaff, partyOldBalance } = params;
  if (!hasParty || isStaff) return 0;
  const tracksPartyBalance = paymentMethod === 'CREDIT' || (paymentMethod === 'CASH' && partyOldBalance !== 0);
  if (!tracksPartyBalance) return 0;
  return Math.max(0, money(received - grandTotal));
}
