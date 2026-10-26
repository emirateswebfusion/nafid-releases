import type React from 'react';
import { logError, appApi } from '../../../data/app';
import { isDesktopRuntime, hasBridge } from '../../../data/client';
import { useAuthStore } from '../../../store/authStore';
import { partyConnectCloud } from '../../../data/cloud/partyConnect';
import { settingsApi, setSetting } from '../../../data/settings';
import { STAFF_DATA_MASKING_KEY, parseStaffDataMaskingConfig, DEFAULT_STAFF_DATA_MASKING_CONFIG } from '../../../utils/staffDataMasking';
import { EMERGENCY_PANIC_CONFIG_KEY, parseEmergencyPanicConfig, DEFAULT_EMERGENCY_PANIC_CONFIG } from '../../../utils/emergencyPurge';
import { type FeatureFlags, sanitizeFeatureFlags, DEFAULT_FEATURE_FLAGS, FEATURE_LIST, useFeatureFlagsStore, wereFeatureFlagsStored } from '../../../featureFlags';
import { type CodeType, DEFAULT_CODE_TYPE, CODE_TYPE_CONFIGS } from '../../../labelCodeTypes';
import { setAppTimeFormat, DEFAULT_BILL_SETTINGS } from '../../../utils/receiptGenerator';
import { getStoreTimezone, setStoreTimezone } from '../../../utils/timezoneHelper';
import { DEFAULT_BILLING_UI_CONFIG, DEFAULT_HEADER_BUTTON_CONFIG, useBillingUIStore } from '../../../store/billingUIStore';
import { DEFAULT_SHOP_CLOSING_CONFIG, DEFAULT_CHECKLIST } from '../../../utils/shopClosingHelper';
import { whatsappApi } from '../../../data/whatsapp';
import { productsApi } from '../../../data/products';
import type { SettingsSnapshotObject } from '../settingsTypes';
import type { SettingsFormState } from './useSettingsFormState';

export interface UseSettingsLoaderContext {
  featureFlags: FeatureFlags | null;
  fetchPrinters: (showToast?: boolean) => Promise<void>;
  initialSnapshot: React.RefObject<string>;
  loadFlags: (tenantId: string) => Promise<void>;
  returnPrefix: string;
  returnStartNumber: string | number;
  updateSnapshotField: (updater: (prevObj: SettingsSnapshotObject) => SettingsSnapshotObject) => void;
  form: SettingsFormState;
}

export function useSettingsLoader(ctx: UseSettingsLoaderContext) {
  const { featureFlags, fetchPrinters, initialSnapshot, loadFlags, returnPrefix, returnStartNumber, updateSnapshotField } = ctx;
  const { a4Printer, a4Style, a5Orientation, autoCloseCashDrawer, autoCloseCashDrawerTime, autoOpenCashDrawer, autoPrintBarcode, b2bPrefix, b2bStartNumber, b2cPrefix, b2cStartNumber, bankAccount, bankBranch, bankIfsc, bankName, barcodePrinter, billingUIConfig, billSettings, defaultOpeningBalance, emergencyPanicConfig, enableConvertToGst, enablePartyEstimate, enablePartyGst, enableRealPaperStock, enableScrap, enableThreeInvoiceSeries, gstConversionTaxInclusive, gstProfitPercentage, inventoryDefaultView, invoiceStartNumber, labelCodeType, labelShowShopName, lanHostIp, lanPort, lanRole, loyaltyAwardOnPending, loyaltyEarningRate, loyaltyEnabled, loyaltyRedemptionRate, openCashDrawerOnPending, priceCoding, printFormat, printWidth, purchaseBillPrefix, purchaseBillStartNumber, quotationPrefix, quotationStartNumber, receiptFont, receiptPrinter, scale, scrapBillSettings, scrapPrefix, scrapStartNumber, serviceChargeBarcode, setA4Printer, setA4Style, setA5Orientation, setAppVersion, setAutoCloseCashDrawer, setAutoCloseCashDrawerTime, setAutoOpenCashDrawer, setAutoPrintBarcode, setB2bPrefix, setB2bStartNumber, setB2cPrefix, setB2cStartNumber, setBankAccount, setBankBranch, setBankIfsc, setBankName, setBarcodePrinter, setBillingUIConfig, setBillSettings, setConnectCode, setDefaultOpeningBalance, setEmergencyPanicConfig, setEnableConvertToGst, setEnablePartyEstimate, setEnablePartyGst, setEnableRealPaperStock, setEnableScrap, setEnableThreeInvoiceSeries, setGstConversionTaxInclusive, setGstProfitPercentage, setInventoryDefaultView, setInvoiceStartNumber, setLabelCodeType, setLabelShowShopName, setLanHostIp, setLanPort, setLanRole, setLoading, setLoyaltyAwardOnPending, setLoyaltyEarningRate, setLoyaltyEnabled, setLoyaltyRedemptionRate, setOpenCashDrawerOnPending, setPriceCoding, setPrintFormat, setPrintWidth, setPurchaseBillPrefix, setPurchaseBillStartNumber, setQuotationPrefix, setQuotationStartNumber, setReceiptFont, setReceiptPrinter, setReturnPrefix, setReturnStartNumber, setScale, setScrapBillSettings, setScrapPrefix, setScrapStartNumber, setServiceChargeBarcode, setServiceChargeProduct, setShopAddress, setShopClosingConfig, setShopEmail, setShopGstin, setShopNameLocal, setShopPhone, setShopState, setShopWebsite, setShowCashRegister, setShowFullyPaidCashInLedger, setShowPaperOnlyProducts, setShowPaperStockInEstimate, setShowPaperStockInGst, setShowPriceOverrideMrp, setShowPriceTiersInInventory, setShowProductGstBadge, setShowProductOffers, setShowUpiQr, setShowZeroPaperStock, setStaffDataMaskingConfig, setStockReportDefaultView, setStoreTimezoneState, setSyncFrequency, setSyncMode, setTerminalCode, setThermalStyle, setTimeFormat, setUpiId, shopAddress, shopClosingConfig, shopEmail, shopGstin, shopNameLocal, shopPhone, shopState, shopWebsite, showCashRegister, showPaperOnlyProducts, showPaperStockInEstimate, showPaperStockInGst, showPriceOverrideMrp, showPriceTiersInInventory, showProductGstBadge, showProductOffers, showUpiQr, showZeroPaperStock, staffDataMaskingConfig, stockReportDefaultView, storeTimezone, syncFrequency, syncMode, terminalCode, thermalStyle, timeFormat, upiId } = ctx.form;
  const buildSettingsSnapshot = (overrides: Record<string, any> = {}) => JSON.stringify({
    barcodePrinter: overrides.barcodePrinter !== undefined ? overrides.barcodePrinter : barcodePrinter,
    receiptPrinter: overrides.receiptPrinter !== undefined ? overrides.receiptPrinter : receiptPrinter,
    a4Printer: overrides.a4Printer !== undefined ? overrides.a4Printer : a4Printer,
    scale: overrides.scale !== undefined ? overrides.scale : scale,
    priceCoding: overrides.priceCoding !== undefined ? overrides.priceCoding : priceCoding,
    shopGstin: overrides.shopGstin !== undefined ? overrides.shopGstin : shopGstin,
    shopState: overrides.shopState !== undefined ? overrides.shopState : shopState,
    shopNameLocal: overrides.shopNameLocal !== undefined ? overrides.shopNameLocal : shopNameLocal,
    shopAddress: overrides.shopAddress !== undefined ? overrides.shopAddress : shopAddress,
    shopPhone: overrides.shopPhone !== undefined ? overrides.shopPhone : shopPhone,
    shopEmail: overrides.shopEmail !== undefined ? overrides.shopEmail : shopEmail,
    shopWebsite: overrides.shopWebsite !== undefined ? overrides.shopWebsite : shopWebsite,
    storeTimezone: overrides.storeTimezone !== undefined ? overrides.storeTimezone : storeTimezone,
    upiId: overrides.upiId !== undefined ? overrides.upiId : upiId,
    showUpiQr: overrides.showUpiQr !== undefined ? overrides.showUpiQr : showUpiQr,
    bankName: overrides.bankName !== undefined ? overrides.bankName : bankName,
    bankAccount: overrides.bankAccount !== undefined ? overrides.bankAccount : bankAccount,
    bankIfsc: overrides.bankIfsc !== undefined ? overrides.bankIfsc : bankIfsc,
    bankBranch: overrides.bankBranch !== undefined ? overrides.bankBranch : bankBranch,
    showProductOffers: overrides.showProductOffers !== undefined ? overrides.showProductOffers : showProductOffers,
    showPriceOverrideMrp: overrides.showPriceOverrideMrp !== undefined ? overrides.showPriceOverrideMrp : showPriceOverrideMrp,
    openCashDrawerOnPending: overrides.openCashDrawerOnPending !== undefined ? overrides.openCashDrawerOnPending : openCashDrawerOnPending,
    autoOpenCashDrawer: overrides.autoOpenCashDrawer !== undefined ? overrides.autoOpenCashDrawer : autoOpenCashDrawer,
    autoCloseCashDrawer: overrides.autoCloseCashDrawer !== undefined ? overrides.autoCloseCashDrawer : autoCloseCashDrawer,
    autoCloseCashDrawerTime: overrides.autoCloseCashDrawerTime !== undefined ? overrides.autoCloseCashDrawerTime : autoCloseCashDrawerTime,
    defaultOpeningBalance: overrides.defaultOpeningBalance !== undefined ? overrides.defaultOpeningBalance : defaultOpeningBalance,
    receiptFont: overrides.receiptFont !== undefined ? overrides.receiptFont : receiptFont,
    printFormat: overrides.printFormat !== undefined ? overrides.printFormat : printFormat,
    a5Orientation: overrides.a5Orientation !== undefined ? overrides.a5Orientation : a5Orientation,
    printWidth: overrides.printWidth !== undefined ? overrides.printWidth : printWidth,
    thermalStyle: overrides.thermalStyle !== undefined ? overrides.thermalStyle : thermalStyle,
    a4Style: overrides.a4Style !== undefined ? overrides.a4Style : a4Style,
    terminalCode: overrides.terminalCode !== undefined ? overrides.terminalCode : terminalCode,
    invoiceStartNumber: overrides.invoiceStartNumber !== undefined ? overrides.invoiceStartNumber : invoiceStartNumber,
    enableThreeInvoiceSeries: overrides.enableThreeInvoiceSeries !== undefined ? overrides.enableThreeInvoiceSeries : enableThreeInvoiceSeries,
    b2bPrefix: (overrides.enableThreeInvoiceSeries !== undefined ? overrides.enableThreeInvoiceSeries : enableThreeInvoiceSeries) ? (overrides.b2bPrefix !== undefined ? overrides.b2bPrefix : b2bPrefix) : '',
    b2bStartNumber: (overrides.enableThreeInvoiceSeries !== undefined ? overrides.enableThreeInvoiceSeries : enableThreeInvoiceSeries) ? (overrides.b2bStartNumber !== undefined ? overrides.b2bStartNumber : b2bStartNumber) : '',
    b2cPrefix: (overrides.enableThreeInvoiceSeries !== undefined ? overrides.enableThreeInvoiceSeries : enableThreeInvoiceSeries) ? (overrides.b2cPrefix !== undefined ? overrides.b2cPrefix : b2cPrefix) : '',
    b2cStartNumber: (overrides.enableThreeInvoiceSeries !== undefined ? overrides.enableThreeInvoiceSeries : enableThreeInvoiceSeries) ? (overrides.b2cStartNumber !== undefined ? overrides.b2cStartNumber : b2cStartNumber) : '',
    labelCodeType: overrides.labelCodeType !== undefined ? overrides.labelCodeType : labelCodeType,
    labelShowShopName: overrides.labelShowShopName !== undefined ? overrides.labelShowShopName : labelShowShopName,
    enableScrap: overrides.enableScrap !== undefined ? overrides.enableScrap : enableScrap,
    showCashRegister: overrides.showCashRegister !== undefined ? overrides.showCashRegister : showCashRegister,
    autoPrintBarcode: overrides.autoPrintBarcode !== undefined ? overrides.autoPrintBarcode : autoPrintBarcode,
    loyaltyEnabled: overrides.loyaltyEnabled !== undefined ? overrides.loyaltyEnabled : loyaltyEnabled,
    loyaltyEarningRate: overrides.loyaltyEarningRate !== undefined ? overrides.loyaltyEarningRate : loyaltyEarningRate,
    loyaltyRedemptionRate: overrides.loyaltyRedemptionRate !== undefined ? overrides.loyaltyRedemptionRate : loyaltyRedemptionRate,
    loyaltyAwardOnPending: overrides.loyaltyAwardOnPending !== undefined ? overrides.loyaltyAwardOnPending : loyaltyAwardOnPending,
    billSettings: overrides.billSettings !== undefined ? overrides.billSettings : billSettings,
    scrapBillSettings: overrides.scrapBillSettings !== undefined ? overrides.scrapBillSettings : scrapBillSettings,
    gstProfitPercentage: overrides.gstProfitPercentage !== undefined ? overrides.gstProfitPercentage : gstProfitPercentage,
    gstConversionTaxInclusive: overrides.gstConversionTaxInclusive !== undefined ? overrides.gstConversionTaxInclusive : gstConversionTaxInclusive,
    returnPrefix: overrides.returnPrefix !== undefined ? overrides.returnPrefix : returnPrefix,
    returnStartNumber: overrides.returnStartNumber !== undefined ? overrides.returnStartNumber : returnStartNumber,
    scrapPrefix: overrides.scrapPrefix !== undefined ? overrides.scrapPrefix : scrapPrefix,
    scrapStartNumber: overrides.scrapStartNumber !== undefined ? overrides.scrapStartNumber : scrapStartNumber,
    quotationPrefix: overrides.quotationPrefix !== undefined ? overrides.quotationPrefix : quotationPrefix,
    quotationStartNumber: overrides.quotationStartNumber !== undefined ? overrides.quotationStartNumber : quotationStartNumber,
    purchaseBillPrefix: overrides.purchaseBillPrefix !== undefined ? overrides.purchaseBillPrefix : purchaseBillPrefix,
    purchaseBillStartNumber: overrides.purchaseBillStartNumber !== undefined ? overrides.purchaseBillStartNumber : purchaseBillStartNumber,
    stockReportDefaultView: overrides.stockReportDefaultView !== undefined ? overrides.stockReportDefaultView : stockReportDefaultView,
    inventoryDefaultView: overrides.inventoryDefaultView !== undefined ? overrides.inventoryDefaultView : inventoryDefaultView,
    serviceChargeBarcode: overrides.serviceChargeBarcode !== undefined ? overrides.serviceChargeBarcode : serviceChargeBarcode,
    timeFormat: overrides.timeFormat !== undefined ? overrides.timeFormat : timeFormat,
    syncMode: overrides.syncMode !== undefined ? overrides.syncMode : syncMode,
    lanRole: overrides.lanRole !== undefined ? overrides.lanRole : lanRole,
    lanHostIp: overrides.lanHostIp !== undefined ? overrides.lanHostIp : lanHostIp,
    lanPort: overrides.lanPort !== undefined ? overrides.lanPort : lanPort,
    syncFrequency: overrides.syncFrequency !== undefined ? overrides.syncFrequency : syncFrequency,
    enablePartyGst: overrides.enablePartyGst !== undefined ? overrides.enablePartyGst : enablePartyGst,
    enablePartyEstimate: overrides.enablePartyEstimate !== undefined ? overrides.enablePartyEstimate : enablePartyEstimate,
    enableRealPaperStock: overrides.enableRealPaperStock !== undefined ? overrides.enableRealPaperStock : enableRealPaperStock,
    showZeroPaperStock: overrides.showZeroPaperStock !== undefined ? overrides.showZeroPaperStock : showZeroPaperStock,
    showPaperOnlyProducts: overrides.showPaperOnlyProducts !== undefined ? overrides.showPaperOnlyProducts : showPaperOnlyProducts,
    showPaperStockInGst: overrides.showPaperStockInGst !== undefined ? overrides.showPaperStockInGst : showPaperStockInGst,
    showPaperStockInEstimate: overrides.showPaperStockInEstimate !== undefined ? overrides.showPaperStockInEstimate : showPaperStockInEstimate,
    showProductGstBadge: overrides.showProductGstBadge !== undefined ? overrides.showProductGstBadge : showProductGstBadge,
    showPriceTiersInInventory: overrides.showPriceTiersInInventory !== undefined ? overrides.showPriceTiersInInventory : showPriceTiersInInventory,
    enableConvertToGst: overrides.enableConvertToGst !== undefined ? overrides.enableConvertToGst : enableConvertToGst,
    billingUIConfig: JSON.stringify(overrides.billingUIConfig !== undefined ? overrides.billingUIConfig : billingUIConfig),
    staffDataMaskingConfig: JSON.stringify(overrides.staffDataMaskingConfig !== undefined ? overrides.staffDataMaskingConfig : staffDataMaskingConfig),
    emergencyPanicConfig: JSON.stringify(overrides.emergencyPanicConfig !== undefined ? overrides.emergencyPanicConfig : emergencyPanicConfig),
    shopClosingConfig: JSON.stringify(overrides.shopClosingConfig !== undefined ? overrides.shopClosingConfig : shopClosingConfig),
    features: JSON.stringify(overrides.featureFlags !== undefined ? overrides.featureFlags : featureFlags)
  });

  const loadSettings = async () => {
    logError('[SettingsManager] loadSettings STARTED');
    if (!isDesktopRuntime()) {
      setLoading(false);
      return;
    }
    try {
      const { tenantId } = useAuthStore.getState();
      const currentTenant = tenantId || 'global';
      logError(`[SettingsManager] tenantId: ${currentTenant}`);

      partyConnectCloud.getConnectCode()
        .then((res) => {
          if (res?.connect_code) setConnectCode(res.connect_code);
        })
        .catch((err: any) => {
          console.warn('[SettingsManager] fetchApi connect-code failed:', err);
          const tId = useAuthStore.getState().tenantId || 'STORE';
          setConnectCode('NF-' + tId.replace(/[^A-Za-z0-9]/g, '').slice(0, 6).toUpperCase());
        });

      // 1. Fetch all settings in a single batch query, or parallel fallback
      let allSettings: Record<string, any> = {};
      if (hasBridge('settingsGetAll')) {
        try {
          allSettings = await settingsApi.getAll({ tenant_id: currentTenant }) || {};
        } catch (err) {
          console.warn('[SettingsManager] settingsGetAll failed, falling back to parallel fetch', err);
        }
      }

      // If settingsGetAll returned empty or is not yet available, fetch in parallel (not sequential!)
      if (Object.keys(allSettings).length === 0) {
        const keysToFetch = [
          'barcode_printer_config', 'receipt_printer_config', 'a4_printer_config', 'printer_config',
          'scale_config', 'price_coding', 'shop_gstin', 'shop_state', 'shop_name', 'shop_address',
          'shop_phone', 'shop_email', 'shop_website', 'upi_id', 'show_upi_qr', 'print_format', 'label_code_type',
          'network_sync_config', 'enable_scrap', 'show_cash_register', 'auto_print_barcode',
          'loyalty_config', 'label_show_shop_name', 'stock_report_default_view', 'inventory_default_view', 'show_product_gst_badge', 'show_price_tiers_in_inventory',
          'time_format', 'store_timezone', 'gst_profit_percentage', 'gst_conversion_tax_inclusive', 'feature_flags',
          'enable_party_gst_balance', 'enable_party_estimate_balance',
          'auto_open_cash_drawer', 'default_opening_balance', 'cash_drawer_auto_close', 'cash_drawer_auto_close_time',
          'enable_real_paper_stock', 'show_paper_stock_in_gst', 'show_paper_stock_in_estimate', 'show_zero_paper_stock', 'show_paper_only_products', 'enable_convert_to_gst', 'billing_ui_config',
          STAFF_DATA_MASKING_KEY, EMERGENCY_PANIC_CONFIG_KEY,
          'terminal_code', 'invoice_counter_config', 'return_counter', 'scrap_invoice_counter',
          'quotation_counter', 'purchase_bill_counter', 'three_invoice_series', 'dual_invoice_series'
        ];
        const globalOnlyKeys = new Set([
          'terminal_code', 'invoice_counter_config', 'return_counter',
          'scrap_invoice_counter', 'quotation_counter', 'purchase_bill_counter', 'three_invoice_series', 'dual_invoice_series'
        ]);

        const results = await Promise.allSettled(
          keysToFetch.map(key =>
            settingsApi.get({
              tenant_id: globalOnlyKeys.has(key) ? 'global' : currentTenant,
              key
            })
          )
        );
        keysToFetch.forEach((key, idx) => {
          const res = results[idx];
          if (res.status === 'fulfilled' && res.value !== undefined) {
            allSettings[key] = res.value;
          }
        });
      }

      const pBarcode = allSettings['barcode_printer_config'];
      const pReceipt = allSettings['receipt_printer_config'];
      const pA4 = allSettings['a4_printer_config'];
      const pLegacy = allSettings['printer_config'];
      const s = allSettings['scale_config'];
      const pCoding = allSettings['price_coding'];
      const gstinVal = allSettings['shop_gstin'];
      const stateVal = allSettings['shop_state'];
      const nameVal = allSettings['shop_name'];
      const addressVal = allSettings['shop_address'];
      const phoneVal = allSettings['shop_phone'];
      const emailVal = allSettings['shop_email'];
      const websiteVal = allSettings['shop_website'] || allSettings['shop_web'];
      const upiVal = allSettings['upi_id'];
      const showQrVal = allSettings['show_upi_qr'];
      const printFmt = allSettings['print_format'];
      const labelType = allSettings['label_code_type'];

      let finalBarcode = { type: 'usb', ip: '192.168.1.100', port: 9100, deviceName: '' };
      if (pBarcode && typeof pBarcode === 'object' && !Array.isArray(pBarcode)) {
        const cleanBarcode = { ...pBarcode };
        for (let i = 0; i <= 20; i++) delete cleanBarcode[String(i)];
        finalBarcode = { ...finalBarcode, ...cleanBarcode };
      } else if (pLegacy && typeof pLegacy === 'object' && !Array.isArray(pLegacy)) {
        const cleanLegacy = { ...pLegacy };
        for (let i = 0; i <= 20; i++) delete cleanLegacy[String(i)];
        finalBarcode = { ...finalBarcode, ...cleanLegacy };
      }

      let finalReceipt = { type: 'usb', ip: '192.168.1.100', port: 9100, deviceName: '', receiptWidthCm: 5.8 };
      if (pReceipt && typeof pReceipt === 'object' && !Array.isArray(pReceipt)) {
        const cleanReceipt = { ...pReceipt };
        for (let i = 0; i <= 20; i++) delete cleanReceipt[String(i)];
        finalReceipt = { ...finalReceipt, ...cleanReceipt };
      } else if (pLegacy && typeof pLegacy === 'object' && !Array.isArray(pLegacy)) {
        const cleanLegacy = { ...pLegacy };
        for (let i = 0; i <= 20; i++) delete cleanLegacy[String(i)];
        finalReceipt = { ...finalReceipt, ...cleanLegacy };
      }

      let finalA4 = { deviceName: '' };
      if (pA4 && typeof pA4 === 'object' && !Array.isArray(pA4)) {
        const cleanA4 = { ...pA4 };
        for (let i = 0; i <= 20; i++) delete cleanA4[String(i)];
        finalA4 = cleanA4;
      }

      let finalScaleObj = { path: 'COM3', baudRate: 9600 };
      if (s && typeof s === 'object' && !Array.isArray(s)) finalScaleObj = s;

      let finalCoding = { '0': '', '1': '', '2': '', '3': '', '4': '', '5': '', '6': '', '7': '', '8': '', '9': '' };
      if (pCoding && typeof pCoding === 'object' && !Array.isArray(pCoding)) finalCoding = pCoding;

      const finalGstin = typeof gstinVal === 'string' ? gstinVal : (gstinVal ? String(gstinVal) : '');
      const finalState = typeof stateVal === 'string' ? stateVal : (stateVal ? String(stateVal) : '');
      const finalName = typeof nameVal === 'string' ? nameVal : (nameVal ? String(nameVal) : '');
      const finalAddress = typeof addressVal === 'string' ? addressVal : (addressVal ? String(addressVal) : '');
      const finalPhone = typeof phoneVal === 'string' ? phoneVal : (phoneVal ? String(phoneVal) : '');
      const finalEmail = typeof emailVal === 'string' ? emailVal : (emailVal ? String(emailVal) : '');
      const finalWebsite = typeof websiteVal === 'string' ? websiteVal : (websiteVal ? String(websiteVal) : '');
      const finalUpi = typeof upiVal === 'string' ? upiVal : (upiVal ? String(upiVal) : '');
      const finalShowQr = showQrVal !== null && showQrVal !== undefined ? Boolean(showQrVal) : true;

      let finalSyncMode: 'CLOUD' | 'LAN' | 'HYBRID' = 'HYBRID';
      let finalLanRole: 'PRIMARY' | 'SECONDARY' = 'PRIMARY';
      let finalLanHostIp = '192.168.1.100';
      let finalLanPort = 3888;
      let finalSyncFreq: 'NORMAL' | 'BALANCED' | 'HIGH' = 'NORMAL';

      const netSync = allSettings['network_sync_config'];
      if (netSync && typeof netSync === 'object') {
        if (netSync.syncMode) finalSyncMode = netSync.syncMode;
        if (netSync.lanRole) finalLanRole = netSync.lanRole;
        if (netSync.lanHostIp) finalLanHostIp = netSync.lanHostIp;
        if (netSync.lanPort) finalLanPort = Number(netSync.lanPort) || 3888;
        if (netSync.syncFrequency) finalSyncFreq = netSync.syncFrequency;
      }

      let finalScrap = false;
      const scrapEnabled = allSettings['enable_scrap'];
      if (scrapEnabled !== null && scrapEnabled !== undefined) finalScrap = Boolean(scrapEnabled);

      let finalCashReg = false;
      const cashReg = allSettings['show_cash_register'];
      if (cashReg !== null && cashReg !== undefined) finalCashReg = Boolean(cashReg);

      let finalFlags: FeatureFlags = sanitizeFeatureFlags({ ...DEFAULT_FEATURE_FLAGS });
      const storedFlags = allSettings['feature_flags'];
      if (storedFlags && typeof storedFlags === 'object' && !Array.isArray(storedFlags)) {
        for (const def of FEATURE_LIST) {
          const v = (storedFlags as any)[def.key];
          if (typeof v === 'boolean') (finalFlags as any)[def.key] = v;
        }
        finalFlags = sanitizeFeatureFlags(finalFlags);
        finalScrap = finalFlags.scrap;
        finalCashReg = finalFlags.cash_register;
      } else {
        try {
          await loadFlags(currentTenant);
          const flags = useFeatureFlagsStore.getState().flags;
          if (flags) {
            finalFlags = sanitizeFeatureFlags({ ...flags });
            if (wereFeatureFlagsStored()) {
              finalScrap = finalFlags.scrap;
              finalCashReg = finalFlags.cash_register;
            }
          }
        } catch {}
      }

      let finalAutoBarcode = true;
      const autoBarcode = allSettings['auto_print_barcode'];
      if (autoBarcode !== null && autoBarcode !== undefined) finalAutoBarcode = Boolean(autoBarcode);

      let finalLoyaltyEnabled = Boolean(finalFlags?.loyalty);
      let finalLoyaltyEarningRate = 100;
      let finalLoyaltyRedemptionRate = 1;
      let finalLoyaltyAwardOnPending = false;
      const loyaltyCfg = allSettings['loyalty_config'];
      if (loyaltyCfg && typeof loyaltyCfg === 'object') {
        if (loyaltyCfg.enabled !== undefined) {
          finalLoyaltyEnabled = Boolean(loyaltyCfg.enabled) || Boolean(finalFlags?.loyalty);
        }
        if (loyaltyCfg.earningRate) finalLoyaltyEarningRate = Number(loyaltyCfg.earningRate) || 100;
        if (loyaltyCfg.redemptionRate) finalLoyaltyRedemptionRate = Number(loyaltyCfg.redemptionRate) || 1;
        if (loyaltyCfg.awardPointsOnPending !== undefined) finalLoyaltyAwardOnPending = Boolean(loyaltyCfg.awardPointsOnPending);
      }

      let finalBankName = '';
      const bName = allSettings['bank_name'];
      if (bName) finalBankName = typeof bName === 'string' ? bName : (bName.value || '');

      let finalBankAccount = '';
      const bAcc = allSettings['bank_account_number'] || allSettings['bank_account'];
      if (bAcc) finalBankAccount = typeof bAcc === 'string' ? bAcc : (bAcc.value || '');

      let finalBankIfsc = '';
      const bIfsc = allSettings['bank_ifsc'];
      if (bIfsc) finalBankIfsc = typeof bIfsc === 'string' ? bIfsc : (bIfsc.value || '');

      let finalBankBranch = '';
      const bBranch = allSettings['bank_branch'];
      if (bBranch) finalBankBranch = typeof bBranch === 'string' ? bBranch : (bBranch.value || '');

      let finalLabelType: CodeType = DEFAULT_CODE_TYPE;
      if (labelType && CODE_TYPE_CONFIGS[labelType as CodeType]) finalLabelType = labelType as CodeType;

      let finalLabelShowName = true;
      const labelShowName = allSettings['label_show_shop_name'];
      if (labelShowName !== null && labelShowName !== undefined) finalLabelShowName = Boolean(labelShowName);

      let finalSrdv = 'combined';
      const srdv = allSettings['stock_report_default_view'];
      if (srdv === 'estimate' || srdv === 'gst' || srdv === 'combined') finalSrdv = srdv;

      let finalInvdv = 'combined';
      const invdv = allSettings['inventory_default_view'];
      if (invdv === 'estimate' || invdv === 'gst' || invdv === 'combined') finalInvdv = invdv;

      const spgb = allSettings['show_product_gst_badge'];
      const finalProductGstBadge = spgb !== 'false' && spgb !== false;
      setShowProductGstBadge(finalProductGstBadge);

      const spti = allSettings['show_price_tiers_in_inventory'];
      const finalPriceTiers = spti !== 'false' && spti !== false;
      setShowPriceTiersInInventory(finalPriceTiers);

      let finalTimeFmt: '12h' | '24h' = '12h';
      const timeFmt = allSettings['time_format'];
      if (timeFmt === '24h' || timeFmt === '12h') {
        finalTimeFmt = timeFmt;
        setAppTimeFormat(timeFmt);
      } else {
        setAppTimeFormat('12h');
      }

      let finalPrintFmt: 'thermal' | 'a4' | 'half-a4' = 'thermal';
      let finalPrintWidth = 58;
      let finalThermalStyle: any = 'standard';
      let finalA4Style: any = 'standard';
      let finalA5Orientation: 'horizontal' | 'vertical' = 'horizontal';
      let finalShowOffers = true;
      let finalShowPriceOverrideMrp = true;
      let finalOpenCashDrawer = false;
      let finalReceiptFont = 'courier';
      let finalBillSettings = { ...DEFAULT_BILL_SETTINGS };
      let finalScrapBillSettings = { ...DEFAULT_BILL_SETTINGS };

      if (printFmt && typeof printFmt === 'object') {
        if (printFmt.format === 'a4' || printFmt.format === 'half-a4' || printFmt.format === 'thermal') {
          finalPrintFmt = printFmt.format;
        }
        if (printFmt.a5Orientation === 'vertical' || printFmt.a5Orientation === 'horizontal') {
          finalA5Orientation = printFmt.a5Orientation;
        }
        finalPrintWidth = Number(printFmt.width) || Math.round((Number(finalReceipt.receiptWidthCm) || 5.8) * 10);
        if (printFmt.thermalStyle) {
          finalThermalStyle = printFmt.thermalStyle;
        } else if (printFmt.format === 'thermal' && printFmt.style) {
          finalThermalStyle = printFmt.style;
        }
        if (printFmt.a4Style) {
          finalA4Style = printFmt.a4Style;
        } else if (printFmt.format === 'a4' && printFmt.style) {
          finalA4Style = printFmt.style;
        }
        finalReceipt.receiptWidthCm = finalPrintWidth / 10;
        if (printFmt.showProductOffers !== undefined) finalShowOffers = Boolean(printFmt.showProductOffers);
        if (printFmt.showPriceOverrideMrp !== undefined) finalShowPriceOverrideMrp = Boolean(printFmt.showPriceOverrideMrp);
        if (printFmt.openCashDrawerOnPending !== undefined) finalOpenCashDrawer = Boolean(printFmt.openCashDrawerOnPending);
        if (printFmt.receiptFont) finalReceiptFont = printFmt.receiptFont;
        if (printFmt.billSettings) finalBillSettings = { ...DEFAULT_BILL_SETTINGS, ...printFmt.billSettings };
        if (allSettings['quotation_gst_enabled'] !== undefined) { const qg = allSettings['quotation_gst_enabled']; finalBillSettings.quotationGstEnabled = qg !== 'false' && qg !== false; }
        if (printFmt.scrapBillSettings) finalScrapBillSettings = { ...DEFAULT_BILL_SETTINGS, ...printFmt.scrapBillSettings };
      
      // Load showFullyPaidCashInLedger setting
      const fullyPaidCashSetting = allSettings['show_fully_paid_cash_in_ledger'];
      if (fullyPaidCashSetting !== undefined) {
        const val = fullyPaidCashSetting !== 'false' && fullyPaidCashSetting !== false;
        setShowFullyPaidCashInLedger(val);
      }
    }

      let rawTermCode = allSettings['terminal_code'];
      if (rawTermCode && typeof rawTermCode === 'object') {
        rawTermCode = rawTermCode.value || rawTermCode.code || '';
      }
      let termCode = typeof rawTermCode === 'string'
        ? rawTermCode.trim().replace(/^["']|["']$/g, '').replace(/[^A-Z0-9]/gi, '').toUpperCase()
        : '';
      if (!termCode || termCode.length === 0) {
        const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
        termCode = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
        setSetting({ tenant_id: 'global', key: 'terminal_code', value: termCode }).catch(() => {});
      }
      const finalTermCode = termCode;

      let finalInvoiceStart: number | string = 1;
      const invCfg = allSettings['invoice_counter_config'];
      if (invCfg && invCfg.counter) finalInvoiceStart = invCfg.counter;

      let finalGstProfit = 30;
      const gstProfitPct = allSettings['gst_profit_percentage'];
      if (gstProfitPct !== null && gstProfitPct !== undefined) finalGstProfit = Number(gstProfitPct) || 30;

      let finalGstTaxInclusive = false;
      const gstTaxInc = allSettings['gst_conversion_tax_inclusive'];
      if (gstTaxInc !== null && gstTaxInc !== undefined) finalGstTaxInclusive = Boolean(gstTaxInc);

      let finalReturnPrefix = '';
      let finalReturnStart: number | string = 1;
      const returnCfg = allSettings['return_counter'];
      if (returnCfg && typeof returnCfg === 'object') {
        if (returnCfg.prefix) finalReturnPrefix = String(returnCfg.prefix).replace(/-$/, '');
        if (returnCfg.counter) finalReturnStart = returnCfg.counter;
      }

      let finalScrapPrefix = '';
      let finalScrapStart: number | string = 1;
      const scrapCfg = allSettings['scrap_invoice_counter'];
      if (scrapCfg && typeof scrapCfg === 'object') {
        if (scrapCfg.prefix) finalScrapPrefix = String(scrapCfg.prefix).replace(/-$/, '');
        if (scrapCfg.counter) finalScrapStart = scrapCfg.counter;
      }

      let finalQuotationPrefix = '';
      let finalQuotationStart: number | string = 1;
      const quotationCfg = allSettings['quotation_counter'];
      if (quotationCfg && typeof quotationCfg === 'object') {
        if (quotationCfg.prefix) finalQuotationPrefix = String(quotationCfg.prefix).replace(/-$/, '');
        if (quotationCfg.counter) finalQuotationStart = quotationCfg.counter;
      }

      let finalPurchaseBillPrefix = '';
      let finalPurchaseBillStart: number | string = 1;
      const pbCfg = allSettings['purchase_bill_counter'];
      if (pbCfg && typeof pbCfg === 'object') {
        if (pbCfg.prefix) finalPurchaseBillPrefix = String(pbCfg.prefix).replace(/-$/, '');
        if (pbCfg.counter) finalPurchaseBillStart = pbCfg.counter;
      }

      let finalTripleSeries = false;
      let finalB2bPrefix = '';
      let finalB2bStart: number | string = 1;
      let finalB2cPrefix = '';
      let finalB2cStart: number | string = 1;

      const tripleSeries = allSettings['three_invoice_series'];
      if (tripleSeries && typeof tripleSeries === 'object') {
        finalTripleSeries = Boolean(tripleSeries.enabled);
        if (tripleSeries.b2bPrefix) finalB2bPrefix = String(tripleSeries.b2bPrefix);
        if (tripleSeries.b2bStartNumber) finalB2bStart = tripleSeries.b2bStartNumber;
        if (tripleSeries.b2cPrefix) finalB2cPrefix = String(tripleSeries.b2cPrefix);
        if (tripleSeries.b2cStartNumber) finalB2cStart = tripleSeries.b2cStartNumber;
      } else {
        const dualSeries = allSettings['dual_invoice_series'];
        if (dualSeries && typeof dualSeries === 'object' && dualSeries.enabled) {
          finalTripleSeries = true;
          finalB2bPrefix = String(dualSeries.gstTerminalCode || 'B2B');
          finalB2bStart = dualSeries.gstStartNumber || 1;
          finalB2cPrefix = String(dualSeries.gstTerminalCode || 'B2C');
          finalB2cStart = dualSeries.gstStartNumber || 1;
        }
      }

      const storeTzVal = allSettings['store_timezone'];
      const finalStoreTz = typeof storeTzVal === 'string' ? storeTzVal : (storeTzVal?.timezone || getStoreTimezone());
      setStoreTimezoneState(finalStoreTz);
      setStoreTimezone(finalStoreTz);

      setBarcodePrinter(finalBarcode);
      setReceiptPrinter(finalReceipt);
      setA4Printer(finalA4);
      setScale(finalScaleObj);
      setPriceCoding(finalCoding);
      setShopGstin(finalGstin);
      setShopState(finalState);
      setShopNameLocal(finalName);
      setShopAddress(finalAddress);
      setShopPhone(finalPhone);
      setShopEmail(finalEmail);
      setShopWebsite(finalWebsite);
      setUpiId(finalUpi);
      setShowUpiQr(finalShowQr);
      setSyncMode(finalSyncMode);
      setLanRole(finalLanRole);
      setLanHostIp(finalLanHostIp);
      setLanPort(finalLanPort);
      setSyncFrequency(finalSyncFreq);
      setEnableScrap(finalScrap);
      setShowCashRegister(finalCashReg);
      useFeatureFlagsStore.getState().setFlags(finalFlags);
      const storedBillingUI = allSettings['billing_ui_config'];
      if (storedBillingUI && typeof storedBillingUI === 'object') {
        const mergedCfg = {
          ...DEFAULT_BILLING_UI_CONFIG,
          ...storedBillingUI,
          headerButtons: {
            ...DEFAULT_HEADER_BUTTON_CONFIG,
            ...(storedBillingUI.headerButtons || {}),
          },
        };
        setBillingUIConfig(mergedCfg);
        useBillingUIStore.getState().updateConfig(mergedCfg);
      }
      const rawMasking = allSettings[STAFF_DATA_MASKING_KEY];
      const finalStaffDataMasking = rawMasking ? parseStaffDataMaskingConfig(rawMasking) : DEFAULT_STAFF_DATA_MASKING_CONFIG;
      setStaffDataMaskingConfig(finalStaffDataMasking);

      const rawPanic = allSettings[EMERGENCY_PANIC_CONFIG_KEY];
      const finalEmergencyPanic = rawPanic ? parseEmergencyPanicConfig(rawPanic) : DEFAULT_EMERGENCY_PANIC_CONFIG;
      setEmergencyPanicConfig(finalEmergencyPanic);

      let finalShopClosing = DEFAULT_SHOP_CLOSING_CONFIG;
      const rawClosingSetting = allSettings['shop_closing_whatsapp_config'];
      if (rawClosingSetting) {
        try {
          const parsed = typeof rawClosingSetting === 'string' ? JSON.parse(rawClosingSetting) : rawClosingSetting;
          if (parsed && typeof parsed === 'object') {
            finalShopClosing = {
              ...DEFAULT_SHOP_CLOSING_CONFIG,
              ...parsed,
              checklist: {
                ...DEFAULT_CHECKLIST,
                ...(parsed.checklist || {}),
              },
            };
          }
        } catch (e) {
          console.warn('[SettingsManager] Failed to parse shop_closing_whatsapp_config from allSettings:', e);
        }
      }

      if (hasBridge('shopClosingGetConfig')) {
        try {
          const res = await whatsappApi.shopClosingGetConfig({ tenant_id: currentTenant });
          const cfg = (res && res.config) ? res.config : res;
          if (cfg && typeof cfg === 'object' && ('enabled' in cfg || 'ownerPhone' in cfg || 'sendTiming' in cfg)) {
            finalShopClosing = {
              ...DEFAULT_SHOP_CLOSING_CONFIG,
              ...cfg,
              checklist: {
                ...DEFAULT_CHECKLIST,
                ...(cfg.checklist || {}),
              },
            };
          }
        } catch (e) {
          console.warn('[SettingsManager] Failed to load shop closing config:', e);
        }
      }
      setShopClosingConfig(finalShopClosing);
      setAutoPrintBarcode(finalAutoBarcode);
      setLoyaltyEnabled(finalLoyaltyEnabled);
      setLoyaltyEarningRate(finalLoyaltyEarningRate);
      setLoyaltyRedemptionRate(finalLoyaltyRedemptionRate);
      setLoyaltyAwardOnPending(finalLoyaltyAwardOnPending);
      setLabelCodeType(finalLabelType);
      setLabelShowShopName(finalLabelShowName);
      setStockReportDefaultView(finalSrdv);
      setInventoryDefaultView(finalInvdv);
      setTimeFormat(finalTimeFmt);
      setPrintFormat(finalPrintFmt);
      setPrintWidth(finalPrintWidth);
      setThermalStyle(finalThermalStyle);
      setA4Style(finalA4Style);
      setA5Orientation(finalA5Orientation);
      setShowProductOffers(finalShowOffers);
      setShowPriceOverrideMrp(finalShowPriceOverrideMrp);
      setOpenCashDrawerOnPending(finalOpenCashDrawer);
      const autoOpenVal = allSettings['auto_open_cash_drawer'];
      const defaultBalVal = allSettings['default_opening_balance'];
      const autoCloseVal = allSettings['cash_drawer_auto_close'];
      const autoCloseTimeVal = allSettings['cash_drawer_auto_close_time'];
      setAutoOpenCashDrawer(Boolean(autoOpenVal));
      setAutoCloseCashDrawer(Boolean(autoCloseVal));
      setAutoCloseCashDrawerTime(typeof autoCloseTimeVal === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(autoCloseTimeVal) ? autoCloseTimeVal : '23:30');
      setDefaultOpeningBalance(defaultBalVal !== undefined && defaultBalVal !== null ? defaultBalVal : 0);
      setReceiptFont(finalReceiptFont);
      setBillSettings(finalBillSettings);
      setScrapBillSettings(finalScrapBillSettings);
      setTerminalCode(finalTermCode);
      setInvoiceStartNumber(finalInvoiceStart);
      setGstProfitPercentage(finalGstProfit);
      setGstConversionTaxInclusive(finalGstTaxInclusive);
      setReturnPrefix(finalReturnPrefix);
      setReturnStartNumber(finalReturnStart);
      setScrapPrefix(finalScrapPrefix);
      setScrapStartNumber(finalScrapStart);
      setQuotationPrefix(finalQuotationPrefix);
      setQuotationStartNumber(finalQuotationStart);
      setPurchaseBillPrefix(finalPurchaseBillPrefix);
      setPurchaseBillStartNumber(finalPurchaseBillStart);
      setEnableThreeInvoiceSeries(finalTripleSeries);
      setB2bPrefix(finalB2bPrefix);
      setB2bStartNumber(finalB2bStart);
      setB2cPrefix(finalB2cPrefix);
      setB2cStartNumber(finalB2cStart);
      setBankName(finalBankName);
      setBankAccount(finalBankAccount);
      setBankIfsc(finalBankIfsc);
      setBankBranch(finalBankBranch);

      const pGst = allSettings['enable_party_gst_balance'];
      const pEst = allSettings['enable_party_estimate_balance'];
      const isPartyFirstRun = pGst === undefined && pEst === undefined;
      const finalPartyGst = isPartyFirstRun ? true : Boolean(pGst);
      const finalPartyEst = isPartyFirstRun ? true : Boolean(pEst);
      setEnablePartyGst(finalPartyGst);
      setEnablePartyEstimate(finalPartyEst);

      const realPaperVal = allSettings['enable_real_paper_stock'];
      const finalRealPaper = realPaperVal !== null && realPaperVal !== undefined ? Boolean(realPaperVal) : true;
      setEnableRealPaperStock(finalRealPaper);

      const paperGstVal = allSettings['show_paper_stock_in_gst'];
      const finalPaperGst = paperGstVal !== null && paperGstVal !== undefined ? Boolean(paperGstVal) : true;
      setShowPaperStockInGst(finalPaperGst);

      const paperEstVal = allSettings['show_paper_stock_in_estimate'];
      const finalPaperEst = paperEstVal !== null && paperEstVal !== undefined ? Boolean(paperEstVal) : false;
      setShowPaperStockInEstimate(finalPaperEst);

      const zeroPaperVal = allSettings['show_zero_paper_stock'];
      const finalZeroPaper = zeroPaperVal !== null && zeroPaperVal !== undefined ? Boolean(zeroPaperVal) : false;
      setShowZeroPaperStock(finalZeroPaper);

      const paperOnlyVal = allSettings['show_paper_only_products'];
      const finalPaperOnly = paperOnlyVal !== null && paperOnlyVal !== undefined ? Boolean(paperOnlyVal) : true;
      setShowPaperOnlyProducts(finalPaperOnly);

      const convertGstVal = allSettings['enable_convert_to_gst'];
      const finalConvertGst = convertGstVal !== null && convertGstVal !== undefined ? Boolean(convertGstVal) : true;
      setEnableConvertToGst(finalConvertGst);

      initialSnapshot.current = buildSettingsSnapshot({
        barcodePrinter: finalBarcode,
        receiptPrinter: finalReceipt,
        a4Printer: finalA4,
        scale: finalScaleObj,
        priceCoding: finalCoding,
        shopGstin: finalGstin,
        shopState: finalState,
        shopNameLocal: finalName,
        shopAddress: finalAddress,
        shopPhone: finalPhone,
        storeTimezone: finalStoreTz,
        upiId: finalUpi,
        showUpiQr: finalShowQr,
        bankName: finalBankName,
        bankAccount: finalBankAccount,
        bankIfsc: finalBankIfsc,
        bankBranch: finalBankBranch,
        showProductOffers: finalShowOffers,
        showPriceOverrideMrp: finalShowPriceOverrideMrp,
        openCashDrawerOnPending: finalOpenCashDrawer,
        receiptFont: finalReceiptFont,
        printFormat: finalPrintFmt,
        a5Orientation: finalA5Orientation,
        printWidth: finalPrintWidth,
        thermalStyle: finalThermalStyle,
        a4Style: finalA4Style,
        terminalCode: finalTermCode,
        invoiceStartNumber: finalInvoiceStart,
        enableThreeInvoiceSeries: finalTripleSeries,
        b2bPrefix: finalB2bPrefix,
        b2bStartNumber: finalB2bStart,
        b2cPrefix: finalB2cPrefix,
        b2cStartNumber: finalB2cStart,
        labelCodeType: finalLabelType,
        labelShowShopName: finalLabelShowName,
        enableScrap: finalScrap,
        showCashRegister: finalCashReg,
        autoPrintBarcode: finalAutoBarcode,
        loyaltyEnabled: finalLoyaltyEnabled,
        loyaltyEarningRate: finalLoyaltyEarningRate,
        loyaltyRedemptionRate: finalLoyaltyRedemptionRate,
        loyaltyAwardOnPending: finalLoyaltyAwardOnPending,
        billSettings: finalBillSettings,
        scrapBillSettings: finalScrapBillSettings,
        gstProfitPercentage: finalGstProfit,
        gstConversionTaxInclusive: finalGstTaxInclusive,
        returnPrefix: finalReturnPrefix,
        returnStartNumber: finalReturnStart,
        scrapPrefix: finalScrapPrefix,
        scrapStartNumber: finalScrapStart,
        quotationPrefix: finalQuotationPrefix,
        quotationStartNumber: finalQuotationStart,
        stockReportDefaultView: finalSrdv,
        inventoryDefaultView: finalInvdv,
        serviceChargeBarcode: '',
        timeFormat: finalTimeFmt,
        syncMode: finalSyncMode,
        lanRole: finalLanRole,
        lanHostIp: finalLanHostIp,
        lanPort: finalLanPort,
        syncFrequency: finalSyncFreq,
        enablePartyGst: finalPartyGst,
        enablePartyEstimate: finalPartyEst,
        enableRealPaperStock: finalRealPaper,
        showZeroPaperStock: finalZeroPaper,
        showPaperOnlyProducts: finalPaperOnly,
        showPaperStockInGst: finalPaperGst,
        showPaperStockInEstimate: finalPaperEst,
        showProductGstBadge: finalProductGstBadge,
        showPriceTiersInInventory: finalPriceTiers,
        enableConvertToGst: finalConvertGst,
        staffDataMaskingConfig: finalStaffDataMasking,
        emergencyPanicConfig: finalEmergencyPanic,
        shopClosingConfig: finalShopClosing,
        featureFlags: finalFlags
      });

      // Settings loaded: dismiss skeleton loader immediately (<30ms)
      setLoading(false);
      logError('[SettingsManager] loadSettings COMPLETED SUCCESS');

      // 2. Non-blocking asynchronous background jobs: Printers, Version, Service Charge Item
      // A. Printers (Windows Print Spooler enumeration can take several seconds - do NOT block UI)
      fetchPrinters(false);

      // B. App Version
      appApi.getVersion().then((v: string) => {
        if (v) setAppVersion(`v${v}`);
      }).catch(() => {});

      // C. Service Charge Product & Barcode
      productsApi.ensureServiceItem({ tenant_id: currentTenant })
        .then(() => productsApi.getProducts({ tenant_id: currentTenant, search: 'Service Charge' }))
        .then((svcProducts: any) => {
          const svcProd = Array.isArray(svcProducts)
            ? svcProducts
                .filter((p: any) => Number(p.is_service_item) === 1 || String(p.name || '').trim() === 'Service Charge')
                .sort((a: any, b: any) => {
                  const rank = (p: any) => (Number(p.is_service_item) === 1 ? (String(p.sku_barcode || '') === '99' ? 0 : 1) : 2);
                  return rank(a) - rank(b) || String(a.created_at || '').localeCompare(String(a.created_at || ''));
                })[0]
            : null;
          if (svcProd) {
            setServiceChargeProduct(svcProd);
            const barcode = svcProd.sku_barcode || '99';
            setServiceChargeBarcode(barcode);
            updateSnapshotField(s => ({ ...s, serviceChargeBarcode: barcode }));
          }
        })
        .catch((err: any) => console.error('[SettingsManager] Failed to load Service Charge settings', err));

    } catch (err: any) {
      logError('[SettingsManager] ERROR in loadSettings: ' + (err?.message || String(err)));
      setLoading(false);
    }
  };

  return { buildSettingsSnapshot, loadSettings };
}
