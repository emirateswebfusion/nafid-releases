import type * as B from '../billingTypes';
import React, { useEffect } from 'react';
import type { UpiPageConfig } from '../../../utils/print/upiConfig';

import { isDesktopRuntime, hasBridge } from '../../../data/client';
import { productsApi } from '../../../data/products';
import { getSetting } from '../../../data/settings';
import { useAuthStore } from '../../../store/authStore';
import { getUpiPageConfig } from '../../../utils/print/upiConfig';
import { paymentSourcesApi } from '../../../data/paymentSources';
import { pricingTiersApi } from '../../../data/pricingTiers';
import { sortTiersWithMrp } from '../../../utils/pricing/pricingTierHelper';
import { listParties } from '../../../data/parties';
import { bridgeEvents } from '../../../data/events';
import type { ProductFormState } from './useProductFormState';
import type { BillingSettingsState } from './useBillingSettings';

export interface UseBillingSettingsLoaderContext {
  billingSettings: BillingSettingsState;
  productForm: ProductFormState;
  isQuotationMode: boolean;
  isReturnMode: boolean;
  isScrapMode: boolean;
  loadFlags: (tenantId: string) => Promise<void>;
  reserveInvoiceNumberForTab: (forceRefresh?: boolean) => Promise<void>;
  reserveQuotationNumberForTab: (forceRefresh?: boolean) => Promise<void>;
  reserveReturnNumberForTab: (forceRefresh?: boolean) => Promise<void>;
  reserveScrapInvoiceNumberForTab: (forceRefresh?: boolean) => Promise<void>;
  setPartiesForTier: React.Dispatch<React.SetStateAction<B.Party[]>>;
  setProductPricingMap: React.Dispatch<React.SetStateAction<Record<string, Record<string, number>>>>;
  setSelectedTierId: React.Dispatch<React.SetStateAction<string>>;
  setUpiPageConfig: React.Dispatch<React.SetStateAction<UpiPageConfig>>;
  shopName: string | null;
  tenantId: string | null;
}

/**
 * Loads the billing configuration into `billingSettings` (and tiers, tier prices, party list, UPI page config) when
 * the page mounts or the tenant changes, and reloads shop/bank/loyalty details and re-peeks tab numbers on
 * `settings:updated`. Both effects moved verbatim from BillingPage.
 */
export function useBillingSettingsLoader(ctx: UseBillingSettingsLoaderContext) {
  const { isQuotationMode, isReturnMode, isScrapMode, loadFlags, reserveInvoiceNumberForTab, reserveQuotationNumberForTab, reserveReturnNumberForTab, reserveScrapInvoiceNumberForTab, setPartiesForTier, setProductPricingMap, setSelectedTierId, setUpiPageConfig, shopName, tenantId } = ctx;
  const { setProductPricingMapLoaded, setTerminalCodeState, setShopNameState, setShopGstin, setShopAddress, setShopPhone, setShopState, setQuotationGstEnabledSetting, setShopEmail, setShopWebsite, setUpiId, setShowUpiQr, setBankNameState, setBankAccountState, setBankIfscState, setBankBranchState, setUpiSources, setEnableRealPaperStock, setShowPaperInGstSetting, setShowPaperInEstSetting, setEnableScrap, setShowCashRegister, setEnableThreeInvoiceSeries, setLoyaltyEnabled, setLoyaltyEarningRate, setLoyaltyRedemptionRate, setLoyaltyAwardOnPending, setBosTaxRatePercent, setBosTaxInclusive, setShowDescriptionState, setPricingTiers, setAllowBillerOverride } = ctx.billingSettings;
  const { setAutoPrintBarcode } = ctx.productForm;
  useEffect(() => {
    if (!isDesktopRuntime()) return;
    setProductPricingMapLoaded(false);
    productsApi.ensureServiceItem({ tenant_id: tenantId || 'global' }).catch(() => {});
    getSetting({ tenant_id: 'global', key: 'terminal_code' }).then((v) => {
      if (typeof v === 'string' && v.trim()) {
        setTerminalCodeState(v.trim().replace(/^["']|["']$/g, '').toUpperCase());
      }
    });
    getSetting({ tenant_id: tenantId || 'global', key: 'shop_name' }).then((v) => {
      const resolved = typeof v === 'string' && v.trim() ? v.trim() : (shopName || '');
      setShopNameState(resolved);
      if (resolved) useAuthStore.setState({ shopName: resolved });
    });
    getSetting({ tenant_id: tenantId || 'global', key: 'shop_gstin' }).then((v) => {
      setShopGstin(typeof v === 'string' ? v : '');
    });
    getSetting({ tenant_id: tenantId || 'global', key: 'shop_address' }).then((v) => {
      setShopAddress(typeof v === 'string' ? v : '');
    });
    getSetting({ tenant_id: tenantId || 'global', key: 'shop_phone' }).then((v) => {
      setShopPhone(typeof v === 'string' ? v : '');
    });
    getSetting({ tenant_id: tenantId || 'global', key: 'shop_state' }).then((v) => {
      setShopState(typeof v === 'string' ? v : '');
    });
    getSetting({ tenant_id: tenantId || 'global', key: 'quotation_gst_enabled' }).then((v) => {
      if (v !== undefined && v !== null) setQuotationGstEnabledSetting(v !== 'false' && v !== false);
    });
    getSetting({ tenant_id: tenantId || 'global', key: 'shop_email' }).then((v) => {
      setShopEmail(typeof v === 'string' ? v : '');
    });
    getSetting({ tenant_id: tenantId || 'global', key: 'shop_website' }).then((v) => {
      setShopWebsite(typeof v === 'string' ? v : '');
    });
    getSetting({ tenant_id: tenantId || 'global', key: 'upi_id' }).then((v) => {
      setUpiId(typeof v === 'string' ? v : '');
    });
    getSetting({ tenant_id: tenantId || 'global', key: 'show_upi_qr' }).then((v) => {
      if (v !== null && v !== undefined) setShowUpiQr(Boolean(v));
    });
    getSetting({ tenant_id: tenantId || 'global', key: 'bank_name' }).then((v) => {
      if (typeof v === 'string') setBankNameState(v);
    });
    getSetting({ tenant_id: tenantId || 'global', key: 'bank_account_number' }).then((v) => {
      if (typeof v === 'string') setBankAccountState(v);
    });
    getSetting({ tenant_id: tenantId || 'global', key: 'bank_ifsc' }).then((v) => {
      if (typeof v === 'string') setBankIfscState(v);
    });
    getSetting({ tenant_id: tenantId || 'global', key: 'bank_branch' }).then((v) => {
      if (typeof v === 'string') setBankBranchState(v);
    });
    getUpiPageConfig(tenantId || 'global').then(setUpiPageConfig);
    if (hasBridge('dbPaymentGetSources')) {
      paymentSourcesApi.getSources(tenantId || 'global').then((sources) => {
        if (Array.isArray(sources)) {
          setUpiSources(sources.filter((s) => s.type === 'UPI' && (s.is_enabled === 1 || s.is_enabled === true)));
        }
      }).catch(() => {});
    }
    getSetting({ tenant_id: tenantId || 'global', key: 'enable_real_paper_stock' }).then((v) => {
      if (v !== null && v !== undefined) setEnableRealPaperStock(Boolean(v));
    });
    getSetting({ tenant_id: tenantId || 'global', key: 'show_paper_stock_in_gst' }).then((v) => {
      if (v !== null && v !== undefined) setShowPaperInGstSetting(Boolean(v));
      else setShowPaperInGstSetting(true);
    });
    getSetting({ tenant_id: tenantId || 'global', key: 'show_paper_stock_in_estimate' }).then((v) => {
      if (v !== null && v !== undefined) setShowPaperInEstSetting(Boolean(v));
      else setShowPaperInEstSetting(false);
    });
    getSetting({ tenant_id: tenantId || 'global', key: 'enable_scrap' }).then((v) => {
      if (v !== null && v !== undefined) setEnableScrap(Boolean(v));
    });
    loadFlags(tenantId || 'global');
    getSetting({ tenant_id: tenantId || 'global', key: 'show_cash_register' }).then((v) => {
      if (v !== null && v !== undefined) setShowCashRegister(Boolean(v));
    });
    getSetting({ tenant_id: tenantId || 'global', key: 'auto_print_barcode' }).then((v) => {
      if (v !== null && v !== undefined) setAutoPrintBarcode(Boolean(v));
    });
    getSetting<{ enabled?: boolean }>({ tenant_id: 'global', key: 'three_invoice_series' }).then((v) => {
      if (v !== null && v !== undefined) setEnableThreeInvoiceSeries(Boolean(v.enabled));
    });
    const reloadLoyaltyConfig = () => {
      Promise.all([
        getSetting<B.LoyaltySetting | string>({ tenant_id: tenantId || 'global', key: 'loyalty_config' }),
        getSetting<B.LoyaltyFlags | string>({ tenant_id: tenantId || 'global', key: 'feature_flags' }),
      ]).then(([rawCfg, rawFlags]) => {
        let cfg = rawCfg;
        if (typeof cfg === 'string') { try { cfg = JSON.parse(cfg); } catch { /* ignore */ } }
        let flags = rawFlags as B.LoyaltyFlags | null;
        if (typeof flags === 'string') { try { flags = JSON.parse(flags); } catch { /* ignore */ } }

        let isEnabled = false;
        let eRate = 100;
        let rRate = 1;
        let awardOnPending = false;

        if (cfg && typeof cfg === 'object') {
          if (cfg.enabled !== undefined) isEnabled = Boolean(cfg.enabled);
          if (cfg.earningRate) eRate = Number(cfg.earningRate) || 100;
          if (cfg.redemptionRate) rRate = Number(cfg.redemptionRate) || 1;
          if (cfg.awardPointsOnPending !== undefined) awardOnPending = Boolean(cfg.awardPointsOnPending);
        }
        if (flags && typeof flags.loyalty === 'boolean') {
          isEnabled = flags.loyalty && (!(cfg && typeof cfg === 'object') || cfg.enabled !== false);
        }

        setLoyaltyEnabled(isEnabled);
        setLoyaltyEarningRate(Math.max(1, eRate));
        setLoyaltyRedemptionRate(Math.max(0.01, rRate));
        setLoyaltyAwardOnPending(awardOnPending);
      }).catch(() => {});
    };
    reloadLoyaltyConfig();
    getSetting<B.PrintSetting>({ tenant_id: tenantId || 'global', key: 'print_format' }).then((v) => {
      if (v?.billSettings?.bosTaxRatePercent != null) {
        setBosTaxRatePercent(Number(v.billSettings.bosTaxRatePercent));
      }
      if (v?.billSettings?.bosTaxInclusive != null) {
        setBosTaxInclusive(Boolean(v.billSettings.bosTaxInclusive));
      }
      if (v?.billSettings?.showDescription !== undefined) {
        setShowDescriptionState(v.billSettings.showDescription !== false);
      }
    });
    Promise.all([
      pricingTiersApi.getPricingTiers(tenantId || 'global'),
      getSetting({ tenant_id: tenantId || 'global', key: 'mrp_sort_order' })
    ])
      .then(([res, mrpSortRes]) => {
        if (Array.isArray(res)) {
          const active = res.filter((t) => (t.is_active === 1 || t.is_active === true || t.is_active === '1') && !t.is_deleted);
          const mrpSortOrder = (mrpSortRes !== null && mrpSortRes !== undefined && !isNaN(Number(mrpSortRes))) ? Number(mrpSortRes) : 0;
          const sortedWithMrp = sortTiersWithMrp(active, mrpSortOrder);
          setPricingTiers(sortedWithMrp);
          const defaultTier = active.find((t) => t.is_default === 1 || t.is_default === true || t.is_default === '1');
          if (defaultTier) {
            setSelectedTierId(defaultTier.pricing_tier_id);
          }
        }
      })
      .catch(console.error);
    pricingTiersApi.getProductPricing(tenantId || 'global')
      .then((rows) => {
        if (Array.isArray(rows)) {
          const map: Record<string, Record<string, number>> = {};
          for (const r of rows) {
            if (!map[r.product_id]) map[r.product_id] = {};
            map[r.product_id][r.pricing_tier_id] = Number(r.price) || 0;
          }
          setProductPricingMap(map);
          setProductPricingMapLoaded(true);
        }
      })
      .catch(console.error);
    getSetting({ tenant_id: tenantId || 'global', key: 'allow_biller_price_override' })
      .then((v) => {
        if (v !== null && v !== undefined) setAllowBillerOverride(Boolean(v));
      })
      .catch(console.error);
    listParties(tenantId || 'global')
      .then((res) => {
        if (Array.isArray(res)) setPartiesForTier(res);
      })
      .catch(console.error);

    const unsubSync = bridgeEvents.onSyncDataUpdated(() => {
      const tid = tenantId || 'global';
      Promise.all([
        pricingTiersApi.getPricingTiers(tid),
        getSetting({ tenant_id: tid, key: 'mrp_sort_order' })
      ])
        .then(([res, mrpSortRes]) => {
          if (Array.isArray(res)) {
            const active = res.filter((t) => (t.is_active === 1 || t.is_active === true || t.is_active === '1') && !t.is_deleted);
            const mrpSortOrder = (mrpSortRes !== null && mrpSortRes !== undefined && !isNaN(Number(mrpSortRes))) ? Number(mrpSortRes) : 0;
            const sortedWithMrp = sortTiersWithMrp(active, mrpSortOrder);
            setPricingTiers(sortedWithMrp);
            const defaultTier = active.find((t) => t.is_default === 1 || t.is_default === true || t.is_default === '1');
            if (defaultTier) {
              setSelectedTierId(prev => prev || defaultTier.pricing_tier_id);
            }
          }
        })
        .catch(console.error);

      pricingTiersApi.getProductPricing(tid)
        .then((rows) => {
          if (Array.isArray(rows)) {
            const map: Record<string, Record<string, number>> = {};
            for (const r of rows) {
              if (!map[r.product_id]) map[r.product_id] = {};
              map[r.product_id][r.pricing_tier_id] = Number(r.price) || 0;
            }
            setProductPricingMap(map);
            setProductPricingMapLoaded(true);
          }
        })
        .catch(console.error);
    });

    return () => {
      if (typeof unsubSync === 'function') unsubSync();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- shopName is written by this settings load; including it would repeat all settings and pricing requests after that write.
  }, [
    tenantId, loadFlags, setAllowBillerOverride, setAutoPrintBarcode, setBankAccountState, setBankBranchState,
    setBankIfscState, setBankNameState, setBosTaxInclusive, setBosTaxRatePercent, setEnableRealPaperStock,
    setEnableScrap, setEnableThreeInvoiceSeries, setLoyaltyAwardOnPending, setLoyaltyEarningRate,
    setLoyaltyEnabled, setLoyaltyRedemptionRate, setPartiesForTier, setPricingTiers, setProductPricingMap,
    setProductPricingMapLoaded, setQuotationGstEnabledSetting, setSelectedTierId, setShopAddress, setShopEmail,
    setShopGstin, setShopNameState, setShopPhone, setShopState, setShopWebsite, setShowCashRegister,
    setShowDescriptionState, setShowPaperInEstSetting, setShowPaperInGstSetting, setShowUpiQr,
    setTerminalCodeState, setUpiId, setUpiPageConfig, setUpiSources,
  ]);

  // Listen for settings updates to immediately refresh Computer Code display and tab bill numbers
  useEffect(() => {
    const handleSettingsUpdated = (e: B.SettingsEvent) => {
      const newCode = e?.detail?.terminalCode;
      if (newCode) {
        setTerminalCodeState(newCode);
      } else if (isDesktopRuntime()) {
        getSetting({ tenant_id: 'global', key: 'terminal_code' }).then((v) => {
          if (typeof v === 'string' && v.trim()) {
            setTerminalCodeState(v.trim().replace(/^["']|["']$/g, '').toUpperCase());
          }
        });
      }
      if (e?.detail?.shopName) {
        setShopNameState(e.detail.shopName);
        useAuthStore.setState({ shopName: e.detail.shopName });
      } else if (isDesktopRuntime()) {
        getSetting({ tenant_id: tenantId || 'global', key: 'shop_name' }).then((v) => {
          if (typeof v === 'string' && v.trim()) {
            setShopNameState(v.trim());
            useAuthStore.setState({ shopName: v.trim() });
          }
        });
      }
      if (isDesktopRuntime()) {
        getSetting({ tenant_id: tenantId || 'global', key: 'shop_address' }).then((v) => {
          if (typeof v === 'string') setShopAddress(v);
        });
        getSetting({ tenant_id: tenantId || 'global', key: 'shop_phone' }).then((v) => {
          if (typeof v === 'string') setShopPhone(v);
        });
        getSetting({ tenant_id: tenantId || 'global', key: 'shop_gstin' }).then((v) => {
          if (typeof v === 'string') setShopGstin(v);
        });
        getSetting({ tenant_id: tenantId || 'global', key: 'bank_name' }).then((v) => {
          if (typeof v === 'string') setBankNameState(v);
        });
        getSetting({ tenant_id: tenantId || 'global', key: 'bank_account_number' }).then((v) => {
          if (typeof v === 'string') setBankAccountState(v);
        });
        getSetting({ tenant_id: tenantId || 'global', key: 'bank_ifsc' }).then((v) => {
          if (typeof v === 'string') setBankIfscState(v);
        });
        getSetting({ tenant_id: tenantId || 'global', key: 'bank_branch' }).then((v) => {
          if (typeof v === 'string') setBankBranchState(v);
        });
        getSetting<B.PrintSetting>({ tenant_id: tenantId || 'global', key: 'print_format' }).then((v) => {
          if (v?.billSettings?.showDescription !== undefined) {
            setShowDescriptionState(v.billSettings.showDescription !== false);
          }
        });
        Promise.all([
          getSetting<B.LoyaltySetting | string>({ tenant_id: tenantId || 'global', key: 'loyalty_config' }),
          getSetting<B.LoyaltyFlags | string>({ tenant_id: tenantId || 'global', key: 'feature_flags' }),
        ]).then(([rawCfg, rawFlags]) => {
          let cfg = rawCfg;
          if (typeof cfg === 'string') { try { cfg = JSON.parse(cfg); } catch { /* ignore */ } }
          let flags = rawFlags as B.LoyaltyFlags | null;
          if (typeof flags === 'string') { try { flags = JSON.parse(flags); } catch { /* ignore */ } }

          let isEnabled = false;
          let eRate = 100;
          let rRate = 1;
          let awardOnPending = false;

          if (cfg && typeof cfg === 'object') {
            if (cfg.enabled !== undefined) isEnabled = Boolean(cfg.enabled);
            if (cfg.earningRate) eRate = Number(cfg.earningRate) || 100;
            if (cfg.redemptionRate) rRate = Number(cfg.redemptionRate) || 1;
            if (cfg.awardPointsOnPending !== undefined) awardOnPending = Boolean(cfg.awardPointsOnPending);
          }
          if (flags && typeof flags.loyalty === 'boolean') {
            isEnabled = flags.loyalty && (!(cfg && typeof cfg === 'object') || cfg.enabled !== false);
          }

          setLoyaltyEnabled(isEnabled);
          setLoyaltyEarningRate(Math.max(1, eRate));
          setLoyaltyRedemptionRate(Math.max(0.01, rRate));
          setLoyaltyAwardOnPending(awardOnPending);
        }).catch(() => {});
      }
      loadFlags(tenantId || 'global');
      if (isScrapMode) reserveScrapInvoiceNumberForTab(true);
      else if (isQuotationMode) reserveQuotationNumberForTab(true);
      else if (isReturnMode) reserveReturnNumberForTab(true);
      else reserveInvoiceNumberForTab(true);
    };
    window.addEventListener('settings:updated', handleSettingsUpdated);
    return () => window.removeEventListener('settings:updated', handleSettingsUpdated);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tenantId excluded: including it would re-register the settings:updated listener across tenant changes.
  }, [
    reserveInvoiceNumberForTab, reserveScrapInvoiceNumberForTab, reserveQuotationNumberForTab,
    reserveReturnNumberForTab, isScrapMode, isQuotationMode, isReturnMode, loadFlags,
    setBankAccountState, setBankBranchState, setBankIfscState, setBankNameState,
    setLoyaltyAwardOnPending, setLoyaltyEarningRate, setLoyaltyEnabled, setLoyaltyRedemptionRate,
    setShopAddress, setShopGstin, setShopNameState, setShopPhone, setShowDescriptionState,
    setTerminalCodeState,
  ]);

}
