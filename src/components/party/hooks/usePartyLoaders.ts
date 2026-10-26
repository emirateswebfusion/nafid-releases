import { useCallback } from 'react';
import { isDesktopRuntime, hasBridge } from '../../../data/client';
import { settingsApi } from '../../../data/settings';
import { partiesApi } from '../../../data/parties';
import type { PartyManagerState } from './usePartyManagerState';

export interface UsePartyLoadersContext {
  showStatus: (text: string, type: "success" | "error") => void;
  tenantId: string | null;
  pm: PartyManagerState;
}

/**
 * Loads the ledger screen's settings and the selected party's ledger (`loadPartySettings`, `loadLedger`).
 */
export function usePartyLoaders(ctx: UsePartyLoadersContext) {
  const { showStatus, tenantId } = ctx;
  const { setEnablePartyEstimate, setEnablePartyGst, setLedger, setLedgerLoading, setLedgerWhatsappEnabled, setLedgerWhatsappIncludeShop, setParties, setSelectedParty, setShopDetails } = ctx.pm;
  const loadPartySettings = useCallback(async () => {
    if (!tenantId || !isDesktopRuntime()) return;
    try {
      const [gstVal, estVal, waEnabledVal, waIncShopVal] = await Promise.all([
        settingsApi.get({ tenant_id: tenantId, key: 'enable_party_gst_balance' }),
        settingsApi.get({ tenant_id: tenantId, key: 'enable_party_estimate_balance' }),
        settingsApi.get({ tenant_id: tenantId, key: 'ledger_whatsapp_enabled' }),
        settingsApi.get({ tenant_id: tenantId, key: 'ledger_whatsapp_include_shop' }),
      ]);
      const isPartyFirstRun = gstVal === undefined && estVal === undefined;
      const g = isPartyFirstRun ? true : Boolean(gstVal);
      const e = isPartyFirstRun ? true : Boolean(estVal);
      setEnablePartyGst(g);
      setEnablePartyEstimate(e);
      if (waEnabledVal !== null && waEnabledVal !== undefined) {
        setLedgerWhatsappEnabled(Boolean(waEnabledVal));
      }
      if (waIncShopVal !== null && waIncShopVal !== undefined) {
        setLedgerWhatsappIncludeShop(Boolean(waIncShopVal));
      }
      if (hasBridge('settingsGetAll')) {
        const all = await settingsApi.getAll({ tenant_id: tenantId || 'global' });
        if (all) {
          setShopDetails({
            shopName: all['shop_name'] || '',
            shopAddress: all['shop_address'] || '',
            shopPhone: all['shop_phone'] || '',
            shopEmail: all['shop_email'] || '',
            shopGstin: all['shop_gstin'] || '',
            shopState: all['shop_state'] || '',
          });
        }
      }
    } catch (err) {
      console.error('Failed to load party balance settings', err);
    }
  }, [tenantId, setEnablePartyEstimate, setEnablePartyGst, setLedgerWhatsappEnabled, setLedgerWhatsappIncludeShop, setShopDetails]);

  const loadLedger = async (partyId: string) => {
    setLedgerLoading(true);
    try {
      const data = await partiesApi.getPartyLedger(partyId);
      if (data && !Array.isArray(data) && (data as { error?: string }).error) {
        showStatus('Ledger: ' + (data as { error?: string }).error, 'error');
      } else {
        const entries = Array.isArray(data) ? data : [];
        setLedger(entries);
        const latestBal = entries.length > 0 ? Number(entries[entries.length - 1].running_balance) || 0 : 0;
        const gBal = entries.filter(e => (e.balance_type || 'GST') === 'GST').reduce((s, e) => s + (Number(e.credit_amount) || 0) - (Number(e.debit_amount) || 0), 0);
        const eBal = entries.filter(e => e.balance_type === 'ESTIMATE').reduce((s, e) => s + (Number(e.credit_amount) || 0) - (Number(e.debit_amount) || 0), 0);
        setSelectedParty(prev => prev ? {
          ...prev,
          balance: latestBal,
          current_balance: latestBal,
          gst_balance: gBal,
          current_gst_balance: gBal,
          estimate_balance: eBal,
          current_estimate_balance: eBal,
        } : prev);
        setParties(prev => prev.map(p => p.party_id === partyId ? {
          ...p,
          balance: latestBal,
          current_balance: latestBal,
          gst_balance: gBal,
          current_gst_balance: gBal,
          estimate_balance: eBal,
          current_estimate_balance: eBal,
        } : p));
      }
    } catch {
      showStatus('Failed to load ledger', 'error');
    } finally {
      setLedgerLoading(false);
    }
  };

  return { loadPartySettings, loadLedger };
}
