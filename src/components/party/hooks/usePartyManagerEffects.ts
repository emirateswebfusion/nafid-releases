import React, { useEffect } from 'react';
import { pricingTiersApi } from '../../../data/pricingTiers';
import { settingsApi } from '../../../data/settings';
import type { View } from '../partyTypes';
import type { PartyManagerState } from './usePartyManagerState';
import type { Party } from '../partyTypes';

export interface UsePartyManagerEffectsContext {
  initialPartyIdOrQuery: string | undefined;
  lastInteractedPartyId: React.RefObject<string | null>;
  listScrollRef: React.RefObject<HTMLDivElement | null>;
  loadLedger: (partyId: string) => Promise<void>;
  loadParties: () => Promise<Party[] | undefined>;
  loadPartySettings: () => Promise<void>;
  prevViewRef: React.RefObject<View>;
  processedInitialTargetRef: React.RefObject<string | null>;
  savedScrollTop: React.RefObject<number>;
  tenantId: string | null;
  pm: PartyManagerState;
}

/**
 * All of the ledger screen's effects, in their original order (initial loads, opening a requested party, scroll
 * restore, view changes).
 */
export function usePartyManagerEffects(ctx: UsePartyManagerEffectsContext) {
  const { initialPartyIdOrQuery, lastInteractedPartyId, listScrollRef, loadLedger, loadParties, loadPartySettings, prevViewRef, processedInitialTargetRef, savedScrollTop, tenantId } = ctx;
  const { activeTab, customCategoryFilter, debouncedSearchQuery, parties, searchQuery, setDebouncedSearchQuery, setHighlightedPartyId, setPricingTiers, setSavedCustomCategories, setSearchQuery, setSelectedParty, setView, setVisibleCount, view, visibleCount } = ctx.pm;
  useEffect(() => { loadPartySettings(); }, [loadPartySettings]);

  useEffect(() => {
    const handleSettingsUpdate = () => { loadPartySettings(); };
    window.addEventListener('settings:updated', handleSettingsUpdate);
    return () => window.removeEventListener('settings:updated', handleSettingsUpdate);
  }, [loadPartySettings]);

  // Debounce search query to keep typing at 60fps with zero input lag
  useEffect(() => {
    if (!searchQuery.trim()) {
      setDebouncedSearchQuery('');
      return;
    }
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 120);
    return () => clearTimeout(timer);
  }, [searchQuery, setDebouncedSearchQuery]);

  // Reset pagination when search query or filters change
  useEffect(() => {
    setVisibleCount(50);
  }, [debouncedSearchQuery, activeTab, customCategoryFilter, setVisibleCount]);

  // Restore scroll position and highlight party row when returning to list
  useEffect(() => {
    if (view === 'list' && (lastInteractedPartyId.current || savedScrollTop.current > 0)) {
      const targetId = lastInteractedPartyId.current;
      if (targetId) {
        setHighlightedPartyId(targetId);
        setTimeout(() => setHighlightedPartyId(null), 3000);
        const targetIdx = parties.findIndex(p => p.party_id === targetId);
        if (targetIdx >= 0 && targetIdx >= visibleCount) {
          setVisibleCount(Math.ceil((targetIdx + 1) / 50) * 50);
        }
      }

      const restore = () => {
        if (targetId) {
          const row = document.getElementById(`party-row-${targetId}`);
          if (row) {
            row.scrollIntoView({ block: 'center', behavior: 'instant' });
            return true;
          }
        }
        if (listScrollRef.current && savedScrollTop.current > 0) {
          listScrollRef.current.scrollTop = savedScrollTop.current;
          return true;
        }
        return false;
      };

      restore();
      const raf1 = requestAnimationFrame(() => {
        if (!restore()) {
          requestAnimationFrame(restore);
        }
      });
      const t1 = setTimeout(restore, 50);
      const t2 = setTimeout(restore, 150);
      const t3 = setTimeout(restore, 300);

      return () => {
        cancelAnimationFrame(raf1);
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
      };
    }
  }, [view, lastInteractedPartyId, listScrollRef, savedScrollTop, setHighlightedPartyId, setVisibleCount]);

  useEffect(() => { loadParties(); }, [loadParties]);

  useEffect(() => {
    if (prevViewRef.current === 'ledger' && view === 'list') {
      loadParties();
    }
    prevViewRef.current = view;
  }, [view, loadParties, prevViewRef]);

  useEffect(() => {
    if (!tenantId) return;
    pricingTiersApi.getPricingTiers(tenantId)
      .then(res => {
        if (Array.isArray(res)) setPricingTiers(res);
      })
      .catch(console.error);

    settingsApi.get({ tenant_id: tenantId || 'global', key: 'custom_party_categories' })
      .then((val: unknown) => {
        if (val) {
          try {
            const parsed = typeof val === 'string' ? JSON.parse(val) : val;
            if (Array.isArray(parsed)) setSavedCustomCategories(parsed);
          } catch { /* ignore */ }
        }
      })
      .catch(console.error);
  }, [tenantId, setPricingTiers, setSavedCustomCategories]);

  useEffect(() => {
    if (!initialPartyIdOrQuery || parties.length === 0) return;
    if (processedInitialTargetRef.current === initialPartyIdOrQuery) return;

    processedInitialTargetRef.current = initialPartyIdOrQuery;
    const q = initialPartyIdOrQuery.trim().toLowerCase();
    const queryDigits = initialPartyIdOrQuery.replace(/\D/g, '');

    const found = parties.find(p => {
      if (!p) return false;
      if (p.party_id === initialPartyIdOrQuery) return true;
      const pDigits = (p.phone || '').replace(/\D/g, '');
      if (queryDigits && pDigits) {
        if (queryDigits === pDigits) return true;
        if (queryDigits.length >= 7 && pDigits.length >= 7 && queryDigits.slice(-10) === pDigits.slice(-10)) return true;
      }
      if (p.name && p.name.trim().toLowerCase() === q) return true;
      return false;
    });
    if (found) {
      setSelectedParty(found);
      setView('ledger');
      loadLedger(found.party_id);
    } else {
      setSearchQuery(initialPartyIdOrQuery);
      setDebouncedSearchQuery(initialPartyIdOrQuery);
    }
  }, [initialPartyIdOrQuery, parties, processedInitialTargetRef, setDebouncedSearchQuery, setSearchQuery, setSelectedParty, setView]);

}
