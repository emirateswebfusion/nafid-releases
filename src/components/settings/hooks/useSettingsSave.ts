import type React from 'react';
import { isDesktopRuntime, hasBridge } from '../../../data/client';
import { useAuthStore } from '../../../store/authStore';
import { isAdminRole } from '../../../utils/security/permissions';
import { sanitizeFeatureFlags, DEFAULT_FEATURE_FLAGS, useFeatureFlagsStore } from '../../../config/featureFlags';
import { setSetting } from '../../../data/settings';
import { STAFF_DATA_MASKING_KEY } from '../../../utils/security/staffDataMasking';
import { EMERGENCY_PANIC_CONFIG_KEY } from '../../../utils/security/emergencyPurge';
import { whatsappApi } from '../../../data/whatsapp';
import { useTabStore } from '../../../store/tabStore';
import { productsApi } from '../../../data/products';
import { setAppTimeFormat } from '../../../utils/print/receiptGenerator';
import { useCartStore } from '../../../store/cartStore';
import { useBillingUIStore } from '../../../store/billingUIStore';
import type { ShopDomain } from '../../../store/cartStore';
import type { FeatureFlags } from '../../../config/featureFlags';
import { findSettingsSection } from '../settingsSections';
import type { SettingsSnapshotOverrides } from '../settingsTypes';
import type { SettingsFormState } from './useSettingsFormState';

export interface UseSettingsSaveContext {
  activeSection: string;
  buildSettingsSnapshot: (overrides?: SettingsSnapshotOverrides) => string;
  featureFlags: FeatureFlags | null;
  setInitialSnapshot: React.Dispatch<React.SetStateAction<string>>;
  localDomain: "GENERAL" | "HARDWARE" | "JEWELRY" | "GROCERY";
  returnPrefix: string;
  returnStartNumber: string | number;
  role: "ADMIN" | "SUPER_ADMIN" | "STAFF" | null;
  shopDomain: ShopDomain | null;
  updateDomain: (domain: string) => Promise<{ success: boolean; error?: string; }>;
  form: SettingsFormState;
}

export function useSettingsSave(ctx: UseSettingsSaveContext) {
  const { activeSection, buildSettingsSnapshot, featureFlags, setInitialSnapshot, localDomain, returnPrefix, returnStartNumber, role, shopDomain, updateDomain } = ctx;
  const { a4Printer, a4Style, a5Orientation, autoCloseCashDrawer, autoCloseCashDrawerTime, autoOpenCashDrawer, autoPrintBarcode, b2bPrefix, b2bStartNumber, b2cPrefix, b2cStartNumber, bankAccount, bankBranch, bankIfsc, bankName, barcodePrinter, billingUIConfig, billSettings, defaultOpeningBalance, detectedLocalIp, emergencyPanicConfig, enableConvertToGst, enablePartyEstimate, enablePartyGst, enableRealPaperStock, enableThreeInvoiceSeries, gstConversionTaxInclusive, gstProfitPercentage, inventoryDefaultView, invoiceStartNumber, labelCodeType, labelShowShopName, lanHostIp, lanPort, lanRole, loyaltyAwardOnPending, loyaltyEarningRate, loyaltyEnabled, loyaltyRedemptionRate, openCashDrawerOnPending, osPrinters, priceCoding, printFormat, printWidth, purchaseBillPrefix, purchaseBillStartNumber, quotationPrefix, quotationStartNumber, receiptFont, receiptPrinter, scale, scrapBillSettings, scrapPrefix, scrapStartNumber, serviceChargeBarcode, serviceChargeProduct, setBarcodePrinter, setEnableScrap, setMessage, setReceiptPrinter, setSaveRevision, setSaving, setServiceChargeProduct, shopAddress, shopClosingConfig, shopEmail, shopGstin, shopNameLocal, shopPhone, shopState, shopWebsite, showFullyPaidCashInLedger, showPaperOnlyProducts, showPaperStockInEstimate, showPaperStockInGst, showPriceOverrideMrp, showPriceTiersInInventory, showProductGstBadge, showProductOffers, showUpiQr, showZeroPaperStock, staffDataMaskingConfig, stockReportDefaultView, storeTimezone, syncFrequency, syncMode, terminalCode, thermalStyle, timeFormat, upiId } = ctx.form;
  const handleSave = async () => {
    if (!isDesktopRuntime()) return;
    setSaving(true); setMessage(null);
    try {
      const { tenantId } = useAuthStore.getState();
      if (localDomain !== shopDomain && isAdminRole(role)) {
        const res = await updateDomain(localDomain);
        if (!res.success) throw new Error(res.error);
      }

      const defaultSystemPrinter = osPrinters.find((p) => p.isDefault)?.name || osPrinters[0]?.name || '';
      const formattedBarcodePrinter = {
        ...barcodePrinter,
        type: barcodePrinter.type || 'usb',
        deviceName: barcodePrinter.deviceName || defaultSystemPrinter,
        port: Number(barcodePrinter.port) || 9100,
        labelWidthMm: Number(barcodePrinter.labelWidthMm) || 50,
        labelHeightMm: Number(barcodePrinter.labelHeightMm) || 25,
        labelColumns: Number(barcodePrinter.labelColumns) || 1
      };
      const formattedReceiptPrinter = {
        ...receiptPrinter,
        type: receiptPrinter.type || 'usb',
        deviceName: receiptPrinter.deviceName || defaultSystemPrinter,
        port: Number(receiptPrinter.port) || 9100,
        receiptWidthCm: Number(receiptPrinter.receiptWidthCm) || 5.8,
        leftMarginOffsetMm: Number(receiptPrinter.leftMarginOffsetMm) || 0
      };

      // User-entered starting numbers take priority — do NOT use Math.max() here,
      // as that would prevent users from lowering counters (the reported bug).
      // We use the user's input directly; only fall back to 1 if nothing was entered.
      const finalInvCounter = Number(invoiceStartNumber) || 1;
      const finalReturnCounter = Number(returnStartNumber) || 1;
      const finalScrapCounter = Number(scrapStartNumber) || 1;
      const finalQuotationCounter = Number(quotationStartNumber) || 1;
      const finalPurchaseBillCounter = Number(purchaseBillStartNumber) || 1;
      const finalB2bCounter = Number(b2bStartNumber) || 1;
      const finalB2cCounter = Number(b2cStartNumber) || 1;

      const cleanCode = String(terminalCode || 'POS1').trim().replace(/^["']|["']$/g, '').replace(/[^A-Z0-9]/gi, '').toUpperCase() || 'POS1';

      // Use user-provided prefix if it has content; fall back to auto-generated default.
      // Previously, prefixes containing keywords like 'RTN', 'SCR', 'QTN' were incorrectly
      // overridden with auto-generated values — that was the bug preventing prefix changes.
      const computedReturnPrefix = (returnPrefix && returnPrefix.trim())
        ? returnPrefix.trim().replace(/-$/, '')
        : `${cleanCode}-RTN`;
      const computedScrapPrefix = (scrapPrefix && scrapPrefix.trim())
        ? scrapPrefix.trim().replace(/-$/, '')
        : `${cleanCode}-SCR`;
      const computedQuotationPrefix = (quotationPrefix && quotationPrefix.trim())
        ? quotationPrefix.trim().replace(/-$/, '')
        : `${cleanCode}-QTN`;
      const computedPurchaseBillPrefix = (purchaseBillPrefix && purchaseBillPrefix.trim())
        ? purchaseBillPrefix.trim().replace(/-$/, '')
        : `${cleanCode}-PUR`;

      const sanitizedFlags = sanitizeFeatureFlags(featureFlags || DEFAULT_FEATURE_FLAGS);

      const checks: { promise: Promise<unknown>; name: string }[] = [
        { promise: setSetting({ tenant_id: tenantId || 'global', key: 'enable_party_gst_balance', value: enablePartyGst }), name: 'party_gst' },
        { promise: setSetting({ tenant_id: tenantId || 'global', key: 'enable_party_estimate_balance', value: enablePartyEstimate }), name: 'party_estimate' },
        { promise: setSetting({ tenant_id: tenantId || 'global', key: 'barcode_printer_config', value: formattedBarcodePrinter }), name: 'barcode' },
        { promise: setSetting({ tenant_id: tenantId || 'global', key: 'receipt_printer_config', value: formattedReceiptPrinter }), name: 'receipt' },
        { promise: setSetting({ tenant_id: tenantId || 'global', key: 'a4_printer_config', value: a4Printer }), name: 'a4' },
        { promise: setSetting({ tenant_id: tenantId || 'global', key: 'scale_config', value: scale }), name: 'scale' },
        { promise: setSetting({ tenant_id: tenantId || 'global', key: 'price_coding', value: priceCoding }), name: 'price_coding' },
        { promise: setSetting({ tenant_id: tenantId || 'global', key: 'shop_gstin', value: shopGstin }), name: 'gstin' },
        { promise: setSetting({ tenant_id: tenantId || 'global', key: 'shop_state', value: shopState }), name: 'state' },
        { promise: setSetting({ tenant_id: tenantId || 'global', key: 'shop_name', value: shopNameLocal }), name: 'name' },
        ...(tenantId && tenantId !== 'global' ? [
          { promise: setSetting({ tenant_id: 'global', key: 'shop_name', value: shopNameLocal }), name: 'name_global' },
          { promise: setSetting({ tenant_id: 'global', key: 'shop_address', value: shopAddress }), name: 'address_global' },
          { promise: setSetting({ tenant_id: 'global', key: 'shop_phone', value: shopPhone }), name: 'phone_global' },
          { promise: setSetting({ tenant_id: 'global', key: 'shop_email', value: shopEmail }), name: 'email_global' },
          { promise: setSetting({ tenant_id: 'global', key: 'shop_website', value: shopWebsite }), name: 'website_global' },
          { promise: setSetting({ tenant_id: 'global', key: 'shop_gstin', value: shopGstin }), name: 'gstin_global' },
          { promise: setSetting({ tenant_id: 'global', key: 'shop_state', value: shopState }), name: 'state_global' },
        ] : []),
        { promise: setSetting({ tenant_id: tenantId || 'global', key: 'shop_address', value: shopAddress }), name: 'address' },
        { promise: setSetting({ tenant_id: tenantId || 'global', key: 'shop_phone', value: shopPhone }), name: 'phone' },
        { promise: setSetting({ tenant_id: tenantId || 'global', key: 'shop_email', value: shopEmail }), name: 'email' },
        { promise: setSetting({ tenant_id: tenantId || 'global', key: 'shop_website', value: shopWebsite }), name: 'website' },
        { promise: setSetting({ tenant_id: tenantId || 'global', key: 'upi_id', value: upiId }), name: 'upi' },
        { promise: setSetting({ tenant_id: tenantId || 'global', key: 'show_upi_qr', value: showUpiQr }), name: 'qr' },
        { promise: setSetting({ tenant_id: tenantId || 'global', key: 'bank_name', value: bankName }), name: 'bank_name' },
        { promise: setSetting({ tenant_id: tenantId || 'global', key: 'bank_account_number', value: bankAccount }), name: 'bank_account_number' },
        { promise: setSetting({ tenant_id: tenantId || 'global', key: 'bank_ifsc', value: bankIfsc }), name: 'bank_ifsc' },
        { promise: setSetting({ tenant_id: tenantId || 'global', key: 'bank_branch', value: bankBranch }), name: 'bank_branch' },
        { promise: setSetting({ tenant_id: tenantId || 'global', key: 'enable_scrap', value: Boolean(sanitizedFlags.scrap) }), name: 'enable_scrap' },
        { promise: setSetting({ tenant_id: tenantId || 'global', key: 'show_cash_register', value: sanitizedFlags.cash_register }), name: 'show_cash_register' },
        { promise: setSetting({ tenant_id: tenantId || 'global', key: 'feature_flags', value: { ...sanitizedFlags } }), name: 'feature_flags' },
        { promise: setSetting({ tenant_id: tenantId || 'global', key: 'auto_print_barcode', value: autoPrintBarcode }), name: 'auto_print_barcode' },
        { promise: setSetting({ tenant_id: tenantId || 'global', key: 'gst_profit_percentage', value: gstProfitPercentage }), name: 'gst_profit_percentage' },
        { promise: setSetting({ tenant_id: tenantId || 'global', key: 'gst_conversion_tax_inclusive', value: gstConversionTaxInclusive }), name: 'gst_conversion_tax_inclusive' },
        { promise: setSetting({ tenant_id: tenantId || 'global', key: 'loyalty_config', value: { enabled: Boolean(sanitizedFlags.loyalty), earningRate: Number(loyaltyEarningRate) || 100, redemptionRate: Number(loyaltyRedemptionRate) || 1, awardPointsOnPending: Boolean(loyaltyAwardOnPending) } }), name: 'loyalty_config' },
        { promise: setSetting({ tenant_id: tenantId || 'global', key: 'label_code_type', value: labelCodeType }), name: 'label_code_type' },
        { promise: setSetting({ tenant_id: tenantId || 'global', key: 'label_show_shop_name', value: labelShowShopName }), name: 'label_show_shop_name' },
        { promise: setSetting({ tenant_id: tenantId || 'global', key: 'auto_open_cash_drawer', value: autoOpenCashDrawer }), name: 'auto_open_cash_drawer' },
        { promise: setSetting({ tenant_id: tenantId || 'global', key: 'cash_drawer_auto_close', value: autoCloseCashDrawer }), name: 'cash_drawer_auto_close' },
        { promise: setSetting({ tenant_id: tenantId || 'global', key: 'cash_drawer_auto_close_time', value: autoCloseCashDrawerTime || '23:30' }), name: 'cash_drawer_auto_close_time' },
        { promise: setSetting({ tenant_id: tenantId || 'global', key: 'quotation_gst_enabled', value: billSettings.quotationGstEnabled !== false }), name: 'quotation_gst_enabled' },
        { promise: setSetting({ tenant_id: tenantId || 'global', key: 'default_opening_balance', value: defaultOpeningBalance === '' ? 0 : (Number(defaultOpeningBalance) || 0) }), name: 'default_opening_balance' },
        { promise: setSetting({ tenant_id: tenantId || 'global', key: 'print_format', value: { format: printFormat, width: printWidth, thermalStyle, a4Style, style: printFormat === 'thermal' ? thermalStyle : (printFormat === 'a4' ? a4Style : 'half-a4'), a5Orientation, showProductOffers, showPriceOverrideMrp, openCashDrawerOnPending, receiptFont, leftMarginOffsetMm: Number(receiptPrinter.leftMarginOffsetMm) || 0, billSettings, scrapBillSettings } }), name: 'print_format' },
        { promise: setSetting({ tenant_id: 'global', key: 'terminal_code', value: cleanCode }), name: 'terminal_code' },
        { promise: setSetting({ tenant_id: 'global', key: 'invoice_counter_config', value: { prefix: `${cleanCode}-`, counter: finalInvCounter } }), name: 'invoice' },
        { promise: setSetting({ tenant_id: 'global', key: 'return_counter', value: { prefix: `${computedReturnPrefix}-`, counter: finalReturnCounter } }), name: 'return_counter' },
        { promise: setSetting({ tenant_id: 'global', key: 'scrap_invoice_counter', value: { prefix: `${computedScrapPrefix}-`, counter: finalScrapCounter } }), name: 'scrap_invoice_counter' },
        { promise: setSetting({ tenant_id: 'global', key: 'quotation_counter', value: { prefix: `${computedQuotationPrefix}-`, counter: finalQuotationCounter } }), name: 'quotation_counter' },
        { promise: setSetting({ tenant_id: 'global', key: 'purchase_bill_counter', value: { prefix: `${computedPurchaseBillPrefix}-`, counter: finalPurchaseBillCounter } }), name: 'purchase_bill_counter' },
        ...(tenantId && tenantId !== 'global' ? [
          { promise: setSetting({ tenant_id: tenantId, key: 'purchase_bill_counter', value: { prefix: `${computedPurchaseBillPrefix}-`, counter: finalPurchaseBillCounter } }), name: 'purchase_bill_counter_tenant' },
        ] : []),
        { promise: setSetting({ tenant_id: 'global', key: 'three_invoice_series', value: { enabled: enableThreeInvoiceSeries, b2bPrefix: enableThreeInvoiceSeries ? b2bPrefix : '', b2bStartNumber: enableThreeInvoiceSeries ? finalB2bCounter : 1, b2cPrefix: enableThreeInvoiceSeries ? b2cPrefix : '', b2cStartNumber: enableThreeInvoiceSeries ? finalB2cCounter : 1 } }), name: 'three_invoice_series' },
        ...(enableThreeInvoiceSeries ? [
          { promise: setSetting({ tenant_id: 'global', key: 'gst_b2b_invoice_counter_config', value: { prefix: `${b2bPrefix}-`, counter: finalB2bCounter } }), name: 'gst_b2b_invoice' },
          { promise: setSetting({ tenant_id: 'global', key: 'gst_b2c_invoice_counter_config', value: { prefix: `${b2cPrefix}-`, counter: finalB2cCounter } }), name: 'gst_b2c_invoice' },
        ] : []),
        { promise: setSetting({ tenant_id: tenantId || 'global', key: 'stock_report_default_view', value: stockReportDefaultView }), name: 'stock_report_default_view' },
        { promise: setSetting({ tenant_id: tenantId || 'global', key: 'inventory_default_view', value: inventoryDefaultView }), name: 'inventory_default_view' },
        { promise: setSetting({ tenant_id: tenantId || 'global', key: 'show_product_gst_badge', value: showProductGstBadge ? 'true' : 'false' }), name: 'show_product_gst_badge' },
        { promise: setSetting({ tenant_id: tenantId || 'global', key: 'show_price_tiers_in_inventory', value: showPriceTiersInInventory ? 'true' : 'false' }), name: 'show_price_tiers_in_inventory' },
        { promise: setSetting({ tenant_id: tenantId || 'global', key: 'store_timezone', value: storeTimezone }), name: 'store_timezone' },
        { promise: setSetting({ tenant_id: tenantId || 'global', key: 'time_format', value: timeFormat }), name: 'time_format' },
        { promise: setSetting({ tenant_id: tenantId || 'global', key: 'enable_party_gst_balance', value: enablePartyGst }), name: 'enable_party_gst_balance' },
        { promise: setSetting({ tenant_id: tenantId || 'global', key: 'enable_party_estimate_balance', value: enablePartyEstimate }), name: 'enable_party_estimate_balance' },
        { promise: setSetting({ tenant_id: tenantId || 'global', key: 'show_fully_paid_cash_in_ledger', value: showFullyPaidCashInLedger }), name: 'show_fully_paid_cash_in_ledger' },
        { promise: setSetting({ tenant_id: tenantId || 'global', key: 'enable_real_paper_stock', value: enableRealPaperStock }), name: 'enable_real_paper_stock' },
        { promise: setSetting({ tenant_id: tenantId || 'global', key: 'show_paper_stock_in_gst', value: showPaperStockInGst }), name: 'show_paper_stock_in_gst' },
        { promise: setSetting({ tenant_id: tenantId || 'global', key: 'show_paper_stock_in_estimate', value: showPaperStockInEstimate }), name: 'show_paper_stock_in_estimate' },
        { promise: setSetting({ tenant_id: tenantId || 'global', key: 'show_zero_paper_stock', value: showZeroPaperStock }), name: 'show_zero_paper_stock' },
        { promise: setSetting({ tenant_id: tenantId || 'global', key: 'show_paper_only_products', value: showPaperOnlyProducts }), name: 'show_paper_only_products' },
        { promise: setSetting({ tenant_id: tenantId || 'global', key: 'enable_convert_to_gst', value: enableConvertToGst }), name: 'enable_convert_to_gst' },
        { promise: setSetting({ tenant_id: tenantId || 'global', key: 'billing_ui_config', value: billingUIConfig }), name: 'billing_ui_config' },
        { promise: setSetting({ tenant_id: tenantId || 'global', key: STAFF_DATA_MASKING_KEY, value: JSON.stringify(staffDataMaskingConfig) }), name: 'staff_data_masking' },
        { promise: setSetting({ tenant_id: tenantId || 'global', key: EMERGENCY_PANIC_CONFIG_KEY, value: { ...emergencyPanicConfig, updated_at: new Date().toISOString() } }), name: 'emergency_panic_config' },
        // The main process rejects non-admins; skip rather than fail the whole save for staff.
        ...(hasBridge('shopClosingSaveConfig') && isAdminRole(role) ? [{
          promise: whatsappApi.shopClosingSaveConfig({
            tenant_id: tenantId || 'global',
            config: shopClosingConfig,
            user_role: role as string | undefined,
          }),
          name: 'shop_closing_config'
        }] : []),
        { promise: setSetting({ tenant_id: tenantId || 'global', key: 'network_sync_config', value: { syncMode, lanRole, lanHostIp, lanPort: Number(lanPort) || 3888, syncFrequency } }), name: 'network_sync_config' },
      ];

      // Request section-specific forms (such as Revenue & Filing-only) to persist their changes
      window.dispatchEvent(new Event('settings:request-save'));

      // setSetting resolves to void and throws on failure; other bridge calls resolve to { success, error }.
      for (const { promise, name } of checks) {
        const res = await promise as { success?: boolean; error?: unknown } | undefined;
        if (res && res.success === false) throw new Error(`${name}: ${res.error}`);
      }

      // Notify application and invalidate stale tab reservations
      try {
        useAuthStore.setState({ shopName: shopNameLocal });
        window.dispatchEvent(new CustomEvent('settings:updated', { detail: { terminalCode: cleanCode, shopName: shopNameLocal } }));
      } catch { /* ignore */ }
      try {
        const { tabs } = useTabStore.getState();
        useTabStore.setState({
          tabs: tabs.map(t => ({
            ...t,
            reservedInvoiceNumber: '',
            reservedScrapInvoiceNumber: '',
            reservedQuotationNumber: '',
            reservedReturnNumber: '',
          }))
        });
      } catch { /* ignore */ }

      if (serviceChargeProduct && serviceChargeBarcode && serviceChargeBarcode !== serviceChargeProduct.sku_barcode) {
        const updatedProduct = {
          ...serviceChargeProduct,
          sku_barcode: serviceChargeBarcode,
          sync_status: 'PENDING'
        };
        const updateRes = await productsApi.updateProduct(updatedProduct);
        if (!updateRes.success) {
          throw new Error(`service_charge: ${updateRes.error || 'Failed to update barcode'}`);
        }
        setServiceChargeProduct(updatedProduct);
      }

      setBarcodePrinter(formattedBarcodePrinter);
      setReceiptPrinter(formattedReceiptPrinter);
      setAppTimeFormat(timeFormat);
      useCartStore.setState({ shopState });
      useBillingUIStore.getState().updateConfig(billingUIConfig);
      useFeatureFlagsStore.getState().setFlags(sanitizeFeatureFlags(featureFlags || DEFAULT_FEATURE_FLAGS));
      setEnableScrap(Boolean(featureFlags?.scrap));
      if (activeSection === 'network') {
        const syncStatusToast = (syncMode === 'LAN' || (syncMode === 'HYBRID' && lanRole === 'SECONDARY'))
          ? `Wifi Sync Active (${lanRole === 'PRIMARY' ? `Primary Master Server IP ${detectedLocalIp || lanHostIp || '192.168.1.100'}:${lanPort}` : `Connected to Master Server ${lanHostIp}:${lanPort}`})`
          : 'Cloud Sync Active (Connected to Cloud API)';
        setMessage({
          type: 'success',
          title: 'NETWORK & SYNC STATUS',
          text: `Network & sync settings saved successfully! ${syncStatusToast}`
        });
      } else {
        const section = findSettingsSection(activeSection);
        setMessage({
          type: 'success',
          title: 'SETTINGS SAVED',
          text: section ? `${section.label} settings saved successfully!` : 'Settings saved successfully!'
        });
      }
      setInitialSnapshot(buildSettingsSnapshot({
        barcodePrinter: formattedBarcodePrinter,
        receiptPrinter: formattedReceiptPrinter,
        a4Printer,
        scale,
        priceCoding,
        shopGstin,
        shopState,
        shopNameLocal,
        shopAddress,
        shopPhone,
        storeTimezone,
        upiId,
        showUpiQr,
        bankName,
        bankAccount,
        bankIfsc,
        bankBranch,
        showProductOffers,
        openCashDrawerOnPending,
        receiptFont,
        printFormat,
        a5Orientation,
        printWidth,
        thermalStyle,
        a4Style,
        terminalCode: cleanCode,
        invoiceStartNumber: finalInvCounter,
        enableThreeInvoiceSeries,
        b2bPrefix,
        b2bStartNumber: finalB2bCounter,
        b2cPrefix,
        b2cStartNumber: finalB2cCounter,
        labelCodeType,
        labelShowShopName,
        enableScrap: Boolean(featureFlags?.scrap),
        showCashRegister: Boolean(featureFlags?.cash_register),
        autoPrintBarcode,
        loyaltyEnabled,
        loyaltyEarningRate: Number(loyaltyEarningRate) || 100,
        loyaltyRedemptionRate: Number(loyaltyRedemptionRate) || 1,
        loyaltyAwardOnPending,
        billSettings,
        scrapBillSettings,
        gstProfitPercentage,
        gstConversionTaxInclusive,
        returnPrefix: computedReturnPrefix,
        returnStartNumber: finalReturnCounter,
        scrapPrefix: computedScrapPrefix,
        scrapStartNumber: finalScrapCounter,
        quotationPrefix: computedQuotationPrefix,
        quotationStartNumber: finalQuotationCounter,
        stockReportDefaultView,
        inventoryDefaultView,
        serviceChargeBarcode,
        timeFormat,
        syncMode,
        lanRole,
        lanHostIp,
        lanPort: Number(lanPort) || 3888,
        syncFrequency,
        enablePartyGst,
        enablePartyEstimate,
        enableRealPaperStock,
        showZeroPaperStock,
        showPaperOnlyProducts,
        showPaperStockInGst,
        showPaperStockInEstimate,
        showProductGstBadge,
        showPriceTiersInInventory,
        enableConvertToGst,
        billingUIConfig,
        staffDataMaskingConfig,
        emergencyPanicConfig,
        shopClosingConfig,
        featureFlags
      }));
      setSaveRevision(v => v + 1);
      setTimeout(() => setMessage(null), 3000);
    } catch (err) {
      console.error('Failed to save settings:', err);
      const reason = err instanceof Error && err.message ? ` (${err.message})` : '';
      setMessage({ type: 'error', text: `Failed to save settings. Please try again${reason}` });
      setTimeout(() => setMessage(null), 3000);
    }
    setSaving(false);
  };

  return { handleSave };
}
