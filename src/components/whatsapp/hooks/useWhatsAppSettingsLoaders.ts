import React, { useEffect, useCallback } from 'react';
import { hasBridge } from '../../../data/client';
import { whatsappApi } from '../../../data/whatsapp';
import { bridgeEvents } from '../../../data/events';
import { settingsApi } from '../../../data/settings';
import { DEFAULT_SHOP_CLOSING_CONFIG, DEFAULT_CHECKLIST, type ShopClosingOverviewConfig, getSampleClosingSummary, generateWhatsAppClosingMessage } from '../../../utils/shopClosingHelper';
import type { WhatsAppSettingsState } from './useWhatsAppSettingsState';

export interface UseWhatsAppSettingsLoadersContext {
  closingConfig: ShopClosingOverviewConfig;
  effectiveTenantId: string;
  setClosingConfig: (newCfg: ShopClosingOverviewConfig | ((prev: ShopClosingOverviewConfig) => ShopClosingOverviewConfig)) => void;
  setShopName: React.Dispatch<React.SetStateAction<string>>;
  shopName: string;
  wa: WhatsAppSettingsState;
}

/** Device status subscription, ledger alert settings, shop closing config / history loading, and the live preview. */
export function useWhatsAppSettingsLoaders(ctx: UseWhatsAppSettingsLoadersContext) {
  const { closingConfig, effectiveTenantId, setClosingConfig, setShopName, shopName } = ctx;
  const { setClosingHistory, setIncludeShopName, setLedgerAlertsEnabled, setLoading, setLoadingClosing, setLoadingHistory, setMsg, setPhone, setPreviewLoading, setPreviewText, setQrCode, setStatus } = ctx.wa;
  useEffect(() => {
    // Initial status check
    if (hasBridge('whatsappGetStatus')) {
      whatsappApi.getStatus()
        .then((res) => {
          if (res) {
            setStatus(res.status);
            setQrCode(res.qrCode);
            setPhone(res.phone);
          }
        })
        .catch(console.error);
    }

    // Subscribe to real-time status updates
    if (hasBridge('onWhatsAppStatusUpdate')) {
      const unsubscribe = bridgeEvents.onWhatsAppStatusUpdate((data) => {
        setStatus(data.status);
        setQrCode(data.qrCode);
        setPhone(data.phone);
        if (data.status === 'connected') {
          setLoading(false);
          setMsg({ text: 'WhatsApp connected and synced successfully!', type: 'success' });
        }
        if (data.status === 'syncing') {
          setLoading(false);
        }
      });
      return () => {
        if (typeof unsubscribe === 'function') unsubscribe();
      };
    }
  }, [setLoading, setMsg, setPhone, setQrCode, setStatus]);

  useEffect(() => {
    if (hasBridge('settingsGet')) {
      Promise.all([
        settingsApi.get({ tenant_id: effectiveTenantId, key: 'ledger_whatsapp_enabled' }),
        settingsApi.get({ tenant_id: effectiveTenantId, key: 'ledger_whatsapp_include_shop' }),
        settingsApi.get({ tenant_id: effectiveTenantId, key: 'shop_name' }),
      ])
        .then(([enabledVal, includeShopVal, shopVal]) => {
          if (enabledVal !== null && enabledVal !== undefined) {
            setLedgerAlertsEnabled(Boolean(enabledVal));
          }
          if (includeShopVal !== null && includeShopVal !== undefined) {
            setIncludeShopName(Boolean(includeShopVal));
          }
          if (shopVal && typeof shopVal === 'string') {
            setShopName(shopVal);
          }
        })
        .catch(console.error);
    }
  }, [effectiveTenantId, setIncludeShopName, setLedgerAlertsEnabled, setShopName]);

  // Load Shop Closing Configuration
  const loadClosingConfig = useCallback(async () => {
    if (!hasBridge('shopClosingGetConfig')) return;
    setLoadingClosing(true);
    try {
      const res = await whatsappApi.shopClosingGetConfig({ tenant_id: effectiveTenantId });
      const cfg = (res && res.config) ? res.config : res;
      if (cfg && typeof cfg === 'object') {
        setClosingConfig({
          ...DEFAULT_SHOP_CLOSING_CONFIG,
          ...cfg,
          checklist: {
            ...DEFAULT_CHECKLIST,
            ...(cfg.checklist || {}),
          },
        });
      }
    } catch (err) {
      console.error('[WhatsAppSettings] loadClosingConfig error:', err);
    } finally {
      setLoadingClosing(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- setClosingConfig excluded: a fresh wrapper every render (controlled / uncontrolled config); the load runs once per tenant
  }, [effectiveTenantId, setLoadingClosing]);

  // Load Shop Closing Delivery History
  const loadClosingHistory = useCallback(async () => {
    if (!hasBridge('shopClosingGetHistory')) return;
    setLoadingHistory(true);
    try {
      const history = await whatsappApi.shopClosingGetHistory({ tenant_id: effectiveTenantId, limit: 15 });
      if (Array.isArray(history)) {
        setClosingHistory(history);
      }
    } catch (err) {
      console.error('[WhatsAppSettings] loadClosingHistory error:', err);
    } finally {
      setLoadingHistory(false);
    }
  }, [effectiveTenantId, setClosingHistory, setLoadingHistory]);

  useEffect(() => {
    loadClosingConfig();
    loadClosingHistory();

    if (hasBridge('onShopClosingUpdated')) {
      const unsubscribe = bridgeEvents.onShopClosingUpdated(() => {
        loadClosingHistory();
      });
      return () => {
        if (typeof unsubscribe === 'function') unsubscribe();
      };
    }
  }, [loadClosingConfig, loadClosingHistory]);

  // Refresh live preview text
  const refreshPreview = useCallback(async (cfgToUse: ShopClosingOverviewConfig) => {
    setPreviewLoading(true);
    try {
      if (hasBridge('shopClosingGetPreview')) {
        const res = await whatsappApi.shopClosingGetPreview({
          tenant_id: effectiveTenantId,
          checklist: cfgToUse.checklist,
        });
        if (res && res.success && res.message) {
          setPreviewText(res.message);
          setPreviewLoading(false);
          return;
        }
      }
    } catch {
      // Fallback to client sample preview generator
    }
    const sample = getSampleClosingSummary(shopName);
    const msg = generateWhatsAppClosingMessage(sample, cfgToUse.checklist);
    setPreviewText(msg);
    setPreviewLoading(false);
  }, [effectiveTenantId, shopName, setPreviewLoading, setPreviewText]);

  useEffect(() => {
    refreshPreview(closingConfig);
  }, [closingConfig, refreshPreview]);

  return { loadClosingConfig, loadClosingHistory, refreshPreview };
}
