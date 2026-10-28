import React from 'react';
import { hasPartyRole } from '../../../data/partyRoles';
import type { Party } from '../partyTypes';

interface PartyRoleBadgesProps {
  party: Pick<Party, 'party_type' | 'custom_category'>;
}

export const PartyRoleBadges: React.FC<PartyRoleBadgesProps> = ({ party }) => {
  const pt = party.party_type;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {hasPartyRole(pt, 'CUSTOMER') && (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-600 dark:text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded-md">
          🛒 Customer
        </span>
      )}
      {hasPartyRole(pt, 'SUPPLIER') && (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-purple-600 dark:text-purple-400 bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded-md">
          📦 Supplier
        </span>
      )}
      {hasPartyRole(pt, 'STAFF') && (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-md">
          👥 Staff
        </span>
      )}
      {hasPartyRole(pt, 'CUSTOM') && (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-md">
          🏦 {party.custom_category || 'Custom'}
        </span>
      )}
    </div>
  );
};
