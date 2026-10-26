import { partiesApi } from '../../../data/parties';
import { v4 as uuidv4 } from 'uuid';
import { settingsApi } from '../../../data/settings';
import type { Party } from '../partyTypes';
import type { PartyManagerState } from './usePartyManagerState';

export interface UsePartySaveContext {
  allCustomCategories: string[];
  isOwner: boolean;
  loadParties: () => Promise<Party[] | undefined>;
  resetPartyForm: () => void;
  showStatus: (text: string, type: "success" | "error") => void;
  tenantId: string | null;
  userId: string | null;
  userName: string | null;
  pm: PartyManagerState;
}

/**
 * Save the party form (add or update a party); a new custom category is also saved to the party categories setting.
 */
export function usePartySave(ctx: UsePartySaveContext) {
  const { allCustomCategories, isOwner, loadParties, resetPartyForm, showStatus, tenantId, userId, userName } = ctx;
  const { editingParty, editReturnView, parties, partyForm, selectedParty, setEditReturnView, setIsCustomCategoryNew, setIsSavingParty, setParties, setSavedCustomCategories, setSelectedParty, setView } = ctx.pm;
  const handleSaveParty = async () => {
    if (!partyForm.name.trim()) { showStatus('Party name is required', 'error'); return; }
    if (!isOwner) { showStatus('Only owners can manage parties', 'error'); return; }

    // If adding a new party, check if a party with the exact same name already exists
    if (!editingParty) {
      const trimmedName = partyForm.name.trim();
      const existingWithSameName = parties.filter(p =>
        (p.name || '').trim().toLowerCase() === trimmedName.toLowerCase()
      );

      if (existingWithSameName.length > 0) {
        // Calculate the next suffix number: e.g. "suhaib (1)", "suhaib (2)"
        let nextNum = 1;
        const baseLower = trimmedName.toLowerCase();
        // Check existing parties for suffixes like "name (1)", "name (2)"
        const escapedBase = baseLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const suffixRegex = new RegExp(`^${escapedBase}\\s*\\((\\d+)\\)$`, 'i');

        parties.forEach(p => {
          const pName = (p.name || '').trim().toLowerCase();
          const match = pName.match(suffixRegex);
          if (match) {
            const num = parseInt(match[1], 10);
            if (num >= nextNum) {
              nextNum = num + 1;
            }
          }
        });

        const suggestedName = `${trimmedName} (${nextNum})`;
        showStatus(`A party named "${trimmedName}" already exists! Please use a unique name, e.g.: "${suggestedName}"`, 'error');
        return;
      }
    }

    setIsSavingParty(true);
    const parsedCreditLimit = Math.max(0, parseFloat(partyForm.credit_limit) || 0);
    const parsedCreditPeriodDays = Math.max(1, parseInt(partyForm.credit_period_days, 10) || 30);
    try {
      if (editingParty) {
        const trimmedName = partyForm.name.trim();
        const otherWithSameName = parties.find(p =>
          p.party_id !== editingParty.party_id &&
          (p.name || '').trim().toLowerCase() === trimmedName.toLowerCase()
        );
        if (otherWithSameName) {
          showStatus(`Another party named "${trimmedName}" already exists!`, 'error');
          setIsSavingParty(false);
          return;
        }

        const updatedFields = {
          party_id: editingParty.party_id,
          name: trimmedName,
          phone: partyForm.phone.trim() || null,
          address: partyForm.address.trim() || null,
          gstin: partyForm.gstin.trim() || null,
          party_type: partyForm.party_type,
          custom_category: partyForm.party_type === 'CUSTOM' ? (partyForm.custom_category.trim() || null) : null,
          notes: partyForm.notes.trim() || null,
          pricing_tier_id: partyForm.pricing_tier_id || null,
          credit_limit: parsedCreditLimit,
          credit_period_enabled: partyForm.credit_period_enabled,
          credit_period_days: parsedCreditPeriodDays,
          credit_period_basis: partyForm.credit_period_basis,
          restrict_on_credit_expiry: partyForm.restrict_on_credit_expiry,
          whatsapp_alerts_enabled: partyForm.whatsapp_alerts_enabled,
        };

        const res = await partiesApi.updateParty(updatedFields);
        if (res && res.success === false) {
          showStatus(res.error || 'Failed to update party', 'error');
          setIsSavingParty(false);
          return;
        }

        const statePartyUpdate: Partial<Party> = {
          name: trimmedName,
          phone: partyForm.phone.trim() || '',
          address: partyForm.address.trim() || '',
          gstin: partyForm.gstin.trim() || '',
          party_type: partyForm.party_type,
          custom_category: partyForm.party_type === 'CUSTOM' ? (partyForm.custom_category.trim() || null) : null,
          notes: partyForm.notes.trim() || '',
          pricing_tier_id: partyForm.pricing_tier_id || null,
          credit_limit: parsedCreditLimit,
          credit_period_enabled: partyForm.credit_period_enabled,
          credit_period_days: parsedCreditPeriodDays,
          credit_period_basis: partyForm.credit_period_basis,
          restrict_on_credit_expiry: partyForm.restrict_on_credit_expiry,
          whatsapp_alerts_enabled: partyForm.whatsapp_alerts_enabled,
        };

        // Immediately update React states for instant consistency
        setSelectedParty(prev => (prev && prev.party_id === editingParty.party_id) ? { ...prev, ...statePartyUpdate } : prev);
        setParties(prev => prev.map(p => p.party_id === editingParty.party_id ? { ...p, ...statePartyUpdate } : p));
        showStatus('Party updated successfully', 'success');
      } else {
        const res = await partiesApi.addParty({
          party_id: uuidv4(),
          tenant_id: tenantId,
          name: partyForm.name.trim(),
          phone: partyForm.phone.trim() || null,
          address: partyForm.address.trim() || null,
          gstin: partyForm.gstin.trim() || null,
          balance: parseFloat(partyForm.opening_balance) || 0,
          balance_type: partyForm.balance_type,
          party_type: partyForm.party_type,
          custom_category: partyForm.party_type === 'CUSTOM' ? (partyForm.custom_category.trim() || null) : null,
          notes: partyForm.notes.trim() || null,
          pricing_tier_id: partyForm.pricing_tier_id || null,
          credit_limit: parsedCreditLimit,
          credit_period_enabled: partyForm.credit_period_enabled,
          credit_period_days: parsedCreditPeriodDays,
          credit_period_basis: partyForm.credit_period_basis,
          restrict_on_credit_expiry: partyForm.restrict_on_credit_expiry,
          whatsapp_alerts_enabled: partyForm.whatsapp_alerts_enabled,
          created_by: userId,
          created_by_name: userName || undefined,
        });
        if (res && res.success === false) {
          showStatus(res.error || 'Failed to create party', 'error');
          setIsSavingParty(false);
          return;
        }
        showStatus('Party created successfully', 'success');
      }
      if (partyForm.party_type === 'CUSTOM' && partyForm.custom_category.trim()) {
        const catName = partyForm.custom_category.trim();
        if (!allCustomCategories.map(c => c.toLowerCase()).includes(catName.toLowerCase())) {
          const updated = [...allCustomCategories, catName];
          setSavedCustomCategories(updated);
          settingsApi.set({
            tenant_id: tenantId || 'global',
            key: 'custom_party_categories',
            value: JSON.stringify(updated)
          }).catch(console.error);
        }
      }

      await loadParties();
      if (editReturnView === 'ledger' && selectedParty) {
        setView('ledger');
      } else {
        setView('list');
      }
      setEditReturnView('list');
      resetPartyForm();
      setIsCustomCategoryNew(false);
    } catch (err) {
      showStatus((err as Error)?.message || 'Operation failed', 'error');
    } finally {
      setIsSavingParty(false);
    }
  };

  return { handleSaveParty };
}
