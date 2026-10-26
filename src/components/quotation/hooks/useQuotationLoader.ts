import { useEffect } from 'react';
import { hasBridge, isDesktopRuntime } from '../../../data/client';
import { bridgeEvents } from '../../../data/events';
import { quotationsApi } from '../../../data/quotations';
import { settingsApi } from '../../../data/settings';
import type { QuotationState } from './useQuotationState';

export interface UseQuotationLoaderContext {
  qm: QuotationState;
  tenantId: string | null;
}

/** Loads quotations (with the localStorage cache fallback), shop / bank settings, and reloads on sync updates. */
export function useQuotationLoader(ctx: UseQuotationLoaderContext) {
  const { tenantId } = ctx;
  const {
    setBankAccount, setBankBranch, setBankIfsc, setBankName, setLoading, setQuotationGstEnabledSetting,
    setQuotations, setShopAddress, setShopEmail, setShopGstin, setShopPhone, setShopState, setUpiId,
  } = ctx.qm;

  const loadQuotations = async () => {
    setLoading(true);
    try {
      if (isDesktopRuntime()) {
        const tid = tenantId || 'global';
        const qs = await quotationsApi.getQuotations({ tenant_id: tid });
        if (Array.isArray(qs)) {
          setQuotations(qs);
          localStorage.setItem('nafid_quotations_cache', JSON.stringify(qs));
        }
      }
    } catch (err) {
      console.error('[QuotationManager] Failed to load quotations:', err);
      const cached = localStorage.getItem('nafid_quotations_cache');
      if (cached) {
        try { setQuotations(JSON.parse(cached)); } catch (e) { /* ignore */ }
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    loadQuotations();
    if (isDesktopRuntime()) {
      const tid = tenantId || 'global';
      Promise.all([
        settingsApi.get({ tenant_id: tid, key: 'shop_address' }),
        settingsApi.get({ tenant_id: tid, key: 'shop_phone' }),
        settingsApi.get({ tenant_id: tid, key: 'shop_gstin' }),
        settingsApi.get({ tenant_id: tid, key: 'shop_state' }),
        settingsApi.get({ tenant_id: tid, key: 'shop_email' }),
        settingsApi.get({ tenant_id: tid, key: 'bank_name' }),
        settingsApi.get({ tenant_id: tid, key: 'bank_account_number' }),
        settingsApi.get({ tenant_id: tid, key: 'bank_ifsc' }),
        settingsApi.get({ tenant_id: tid, key: 'bank_branch' }),
        settingsApi.get({ tenant_id: tid, key: 'upi_id' }),
        settingsApi.get({ tenant_id: tid, key: 'quotation_gst_enabled' }),
        settingsApi.get({ tenant_id: tid, key: 'print_format' }),
      ]).then(([addr, ph, gst, st, em, bName, bAcc, bIfsc, bBranch, upi, qGst, pFmt]) => {
        if (addr) setShopAddress(addr);
        if (ph) setShopPhone(ph);
        if (gst) setShopGstin(gst);
        if (st) setShopState(st);
        if (em) setShopEmail(em);
        if (bName) setBankName(bName);
        if (bAcc) setBankAccount(bAcc);
        if (bIfsc) setBankIfsc(bIfsc);
        if (bBranch) setBankBranch(bBranch);
        if (upi) setUpiId(upi);

        let gstFlag = true;
        if (qGst !== undefined && qGst !== null) {
          gstFlag = qGst !== 'false' && qGst !== false;
        } else if (pFmt?.billSettings?.quotationGstEnabled !== undefined) {
          gstFlag = Boolean(pFmt.billSettings.quotationGstEnabled);
        }
        setQuotationGstEnabledSetting(gstFlag);
      }).catch(err => console.error('[QuotationManager] Failed to load shop settings:', err));
    }
    if (hasBridge('onSyncDataUpdated')) {
      const unsub = bridgeEvents.onSyncDataUpdated(() => {
        loadQuotations();
      });
      return () => {
        if (typeof unsub === 'function') (unsub as any)();
      };
    }
  }, [tenantId]);

  return { loadQuotations };
}
