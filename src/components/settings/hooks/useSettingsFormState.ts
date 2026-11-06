import { useState } from 'react';
import { useSettingsUpdater } from './useSettingsUpdater';
import { getStoreCountry, getStoreVatInclusive, type StoreCountry } from '../../../utils/localization/storeProfile';
import { type PrinterConfig, type OsPrinterRow, type ServiceChargeProductRow } from '../settingsTypes';
import { getStoreTimezone } from '../../../utils/time/timezoneHelper';
import { type BillSettings, DEFAULT_BILL_SETTINGS } from '../../../utils/print/receiptGenerator';
import { type CodeType, DEFAULT_CODE_TYPE } from '../../../config/labelCodeTypes';
import { type BillingUIConfig, useBillingUIStore } from '../../../store/billingUIStore';
import { type StaffDataMaskingConfig, DEFAULT_STAFF_DATA_MASKING_CONFIG } from '../../../utils/security/staffDataMasking';
import { type EmergencyPanicConfig, DEFAULT_EMERGENCY_PANIC_CONFIG } from '../../../utils/security/emergencyPurge';
import { type ShopClosingOverviewConfig, DEFAULT_SHOP_CLOSING_CONFIG } from '../../../utils/time/shopClosingHelper';
import type { EffectiveCloudState } from '../../../data/sync';

/**
 * State of the settings screen: every setting being edited (shop, billing, numbering, printing, tax, loyalty,
 * sync / LAN, hardware, WhatsApp, feature switches) plus the screen's own UI state (tabs, dialogs, password change,
 * update status). Loaded by useSettingsLoader and saved by useSettingsSave.
 */
export function useSettingsFormState() {
  const updater = useSettingsUpdater();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveRevision, setSaveRevision] = useState(0);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string, title?: string } | null>(null);
  const [showBulkSheet, setShowBulkSheet] = useState(false);
  const [barcodePrinter, setBarcodePrinter] = useState<PrinterConfig>({ type: 'usb', ip: '192.168.1.100', port: 9100, deviceName: '' });
  const [receiptPrinter, setReceiptPrinter] = useState<PrinterConfig>({ type: 'usb', ip: '192.168.1.100', port: 9100, deviceName: '', receiptWidthCm: 8.0 });
  const [a4Printer, setA4Printer] = useState<PrinterConfig>({ deviceName: '' });
  const [scale, setScale] = useState({ path: 'COM3', baudRate: 9600 });
  const [osPrinters, setOsPrinters] = useState<OsPrinterRow[]>([]);
  const [printersLoading, setPrintersLoading] = useState(false);
  const [activeHardwareTab, setActiveHardwareTab] = useState<'receipt' | 'barcode' | 'a4' | 'scale' | 'card' | 'kitchen'>('receipt');
  const [autoWhatsAppSend, setAutoWhatsAppSend] = useState<boolean>(() => localStorage.getItem('auto_whatsapp_send') === 'true');
  const [activeProductsTab, setActiveProductsTab] = useState<'coding' | 'bulk'>('coding');
  const [activeWhatsAppTab, setActiveWhatsAppTab] = useState<'qr' | 'settings' | 'closing'>('qr');
  const [whatsNewLang, setWhatsNewLang] = useState<'ml' | 'en'>(() => (localStorage.getItem('nafid_whats_new_lang') as 'ml' | 'en') || 'ml');
  const [pass, setPass] = useState({ old: '', new: '', confirm: '' });
  const [showOldPass, setShowOldPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);
  const [changingPass, setChangingPass] = useState(false);
  const [confirmTurnOffAllModalOpen, setConfirmTurnOffAllModalOpen] = useState(false);
  const [appVersion, setAppVersion] = useState('');
  const [priceCoding, setPriceCoding] = useState<Record<string, string>>({
    '0': '', '1': '', '2': '', '3': '', '4': '', '5': '', '6': '', '7': '', '8': '', '9': ''
  });
  const [shopGstin, setShopGstin] = useState('');
  const [shopState, setShopState] = useState('KL');
  const [shopNameLocal, setShopNameLocal] = useState('');
  const [shopAddress, setShopAddress] = useState('');
  const [shopPhone, setShopPhone] = useState('');
  const [shopEmail, setShopEmail] = useState('');
  const [shopWebsite, setShopWebsite] = useState('');
  const [connectCode, setConnectCode] = useState('');
  const [copiedCode, setCopiedCode] = useState(false);
  const [vatPriceInclusive, setVatPriceInclusive] = useState(getStoreVatInclusive());
  const [storeCountry, setStoreCountryState] = useState<StoreCountry>(getStoreCountry());
  const [storeTimezone, setStoreTimezoneState] = useState<string>(getStoreTimezone());
  const [upiId, setUpiId] = useState('');
  const [showUpiQr, setShowUpiQr] = useState(true);
  const [showProductOffers, setShowProductOffers] = useState(true);
  const [showPriceOverrideMrp, setShowPriceOverrideMrp] = useState(true);
  const [openCashDrawerOnPending, setOpenCashDrawerOnPending] = useState(false);
  const [autoOpenCashDrawer, setAutoOpenCashDrawer] = useState(false);
  const [autoCloseCashDrawer, setAutoCloseCashDrawer] = useState(false);
  const [autoCloseCashDrawerTime, setAutoCloseCashDrawerTime] = useState('23:30');
  const [defaultOpeningBalance, setDefaultOpeningBalance] = useState<number | string>(0);
  const [receiptFont, setReceiptFont] = useState('courier');
  const [billSettings, setBillSettings] = useState<BillSettings>({ ...DEFAULT_BILL_SETTINGS });
  const [scrapBillSettings, setScrapBillSettings] = useState<BillSettings>({ ...DEFAULT_BILL_SETTINGS });
  const [showFullyPaidCashInLedger, setShowFullyPaidCashInLedger] = useState(false);
  const [printFormat, setPrintFormat] = useState<'thermal' | 'a4' | 'half-a4'>('thermal');
  const [a5Orientation, setA5Orientation] = useState<'horizontal' | 'vertical'>('horizontal');
  const [labelCodeType, setLabelCodeType] = useState<CodeType>(DEFAULT_CODE_TYPE);
  const [labelShowShopName, setLabelShowShopName] = useState(true);
  const [printWidth, setPrintWidth] = useState<number>(80);
  const [thermalStyle, setThermalStyle] = useState<'standard' | 'compact' | 'modern' | 'classic' | 'clean' | 'dot' | 'slim' | 'luxe' | 'boxed'>('boxed');
  const [a4Style, setA4Style] = useState<'standard' | 'boxed' | 'modern' | 'classic'>('standard');
  const [previewFormat, setPreviewFormat] = useState<'thermal' | 'a4' | 'half-a4' | null>(null);
  const [previewStyle, setPreviewStyle] = useState<string | null>(null);
  const [bankName, setBankName] = useState('');
  const [bankAccount, setBankAccount] = useState('');
  const [bankIfsc, setBankIfsc] = useState('');
  const [bankBranch, setBankBranch] = useState('');
  const [enableScrap, setEnableScrap] = useState(false);
  const [showCashRegister, setShowCashRegister] = useState(false);
  const [autoPrintBarcode, setAutoPrintBarcode] = useState(true);
  const [loyaltyEnabled, setLoyaltyEnabled] = useState(false);
  const [loyaltyIncludeTax, setLoyaltyIncludeTax] = useState(true);
  const [loyaltyEarningRate, setLoyaltyEarningRate] = useState(100);
  const [loyaltyRedemptionRate, setLoyaltyRedemptionRate] = useState(1);
  const [loyaltyAwardOnPending, setLoyaltyAwardOnPending] = useState(false);
  const [enablePartyGst, setEnablePartyGst] = useState(true);
  const [enablePartyEstimate, setEnablePartyEstimate] = useState(true);
  const [enableRealPaperStock, setEnableRealPaperStock] = useState(true);
  const [showPaperStockInGst, setShowPaperStockInGst] = useState(true);
  const [showPaperStockInEstimate, setShowPaperStockInEstimate] = useState(false);
  const [showZeroPaperStock, setShowZeroPaperStock] = useState(false);
  const [showPaperOnlyProducts, setShowPaperOnlyProducts] = useState(true);
  const [enableConvertToGst, setEnableConvertToGst] = useState(true);
  const [billingUIConfig, setBillingUIConfig] = useState<BillingUIConfig>(() => useBillingUIStore.getState().config);
  const [staffDataMaskingConfig, setStaffDataMaskingConfig] = useState<StaffDataMaskingConfig>(DEFAULT_STAFF_DATA_MASKING_CONFIG);
  const [emergencyPanicConfig, setEmergencyPanicConfig] = useState<EmergencyPanicConfig>(DEFAULT_EMERGENCY_PANIC_CONFIG);
  const [shopClosingConfig, setShopClosingConfig] = useState<ShopClosingOverviewConfig>(DEFAULT_SHOP_CLOSING_CONFIG);
  const [terminalCode, setTerminalCode] = useState('POS1');
  const [invoiceStartNumber, setInvoiceStartNumber] = useState<number | string>(1);
  const [enableThreeInvoiceSeries, setEnableThreeInvoiceSeries] = useState(false);
  const [b2bPrefix, setB2bPrefix] = useState('');
  const [b2bStartNumber, setB2bStartNumber] = useState<number | string>(1);
  const [b2cPrefix, setB2cPrefix] = useState('');
  const [b2cStartNumber, setB2cStartNumber] = useState<number | string>(1);
  const [gstProfitPercentage, setGstProfitPercentage] = useState<number>(30);
  const [gstConversionTaxInclusive, setGstConversionTaxInclusive] = useState<boolean>(false);
  const [returnPrefix, setReturnPrefix] = useState('');
  const [returnStartNumber, setReturnStartNumber] = useState<number | string>(1);
  const [scrapPrefix, setScrapPrefix] = useState('');
  const [scrapStartNumber, setScrapStartNumber] = useState<number | string>(1);
  const [quotationPrefix, setQuotationPrefix] = useState('');
  const [quotationStartNumber, setQuotationStartNumber] = useState<number | string>(1);
  const [purchaseBillPrefix, setPurchaseBillPrefix] = useState('');
  const [purchaseBillStartNumber, setPurchaseBillStartNumber] = useState<number | string>(1);
  const [stockReportDefaultView, setStockReportDefaultView] = useState('combined');
  const [inventoryDefaultView, setInventoryDefaultView] = useState('combined');
  const [showProductGstBadge, setShowProductGstBadge] = useState(true);
  const [showPriceTiersInInventory, setShowPriceTiersInInventory] = useState(true);
  const [serviceChargeProduct, setServiceChargeProduct] = useState<ServiceChargeProductRow | null>(null);
  const [serviceChargeBarcode, setServiceChargeBarcode] = useState('');
  const [timeFormat, setTimeFormat] = useState<'12h' | '24h'>('12h');
  const [syncMode, setSyncMode] = useState<'CLOUD' | 'LAN' | 'HYBRID'>('HYBRID');
  const [lanRole, setLanRole] = useState<'PRIMARY' | 'SECONDARY'>('PRIMARY');
  const [lanHostIp, setLanHostIp] = useState('192.168.1.100');
  const [detectedLocalIp, setDetectedLocalIp] = useState('');
  const [networkDetails, setNetworkDetails] = useState<{ ip: string; subnetPrefix: string; netmask: string; gateway: string; dns: string }>({
    ip: '',
    subnetPrefix: '24',
    netmask: '255.255.255.0',
    gateway: '',
    dns: '8.8.8.8'
  });
  const [lanPort, setLanPort] = useState<number>(3888);
  const [syncFrequency, setSyncFrequency] = useState<'NORMAL' | 'BALANCED' | 'HIGH'>('NORMAL');
  const [testingNetwork, setTestingNetwork] = useState(false);
  const [effectiveCloudState, setEffectiveCloudState] = useState<EffectiveCloudState | null>(null);
  const [drainingQueue, setDrainingQueue] = useState(false);
  const [showLanHelpModal, setShowLanHelpModal] = useState(false);
  const [copiedFirewallCmd, setCopiedFirewallCmd] = useState(false);

  return {
    loading, setLoading, saving, setSaving, saveRevision, setSaveRevision, message, setMessage, showBulkSheet,
    setShowBulkSheet, barcodePrinter, setBarcodePrinter, receiptPrinter, setReceiptPrinter, a4Printer, setA4Printer,
    scale, setScale, osPrinters, setOsPrinters, printersLoading, setPrintersLoading, activeHardwareTab,
    setActiveHardwareTab, autoWhatsAppSend, setAutoWhatsAppSend, activeProductsTab, setActiveProductsTab,
    activeWhatsAppTab, setActiveWhatsAppTab, whatsNewLang, setWhatsNewLang, ...updater, pass, setPass, showOldPass, setShowOldPass, showNewPass,
    setShowNewPass, showConfirmPass, setShowConfirmPass, changingPass, setChangingPass, confirmTurnOffAllModalOpen,
    setConfirmTurnOffAllModalOpen, appVersion, setAppVersion, priceCoding, setPriceCoding, shopGstin, setShopGstin,
    shopState, setShopState, shopNameLocal, setShopNameLocal, shopAddress, setShopAddress, shopPhone, setShopPhone,
    shopEmail, setShopEmail, shopWebsite, setShopWebsite, connectCode, setConnectCode, copiedCode, setCopiedCode,
    vatPriceInclusive, setVatPriceInclusive, storeCountry, setStoreCountryState, storeTimezone, setStoreTimezoneState, upiId, setUpiId, showUpiQr, setShowUpiQr, showProductOffers,
    setShowProductOffers, showPriceOverrideMrp, setShowPriceOverrideMrp, openCashDrawerOnPending,
    setOpenCashDrawerOnPending, autoOpenCashDrawer, setAutoOpenCashDrawer, autoCloseCashDrawer,
    setAutoCloseCashDrawer, autoCloseCashDrawerTime, setAutoCloseCashDrawerTime, defaultOpeningBalance,
    setDefaultOpeningBalance, receiptFont, setReceiptFont, billSettings, setBillSettings, scrapBillSettings,
    setScrapBillSettings, showFullyPaidCashInLedger, setShowFullyPaidCashInLedger, printFormat, setPrintFormat,
    a5Orientation, setA5Orientation, labelCodeType, setLabelCodeType, labelShowShopName, setLabelShowShopName,
    printWidth, setPrintWidth, thermalStyle, setThermalStyle, a4Style, setA4Style, previewFormat, setPreviewFormat,
    previewStyle, setPreviewStyle, bankName, setBankName, bankAccount, setBankAccount, bankIfsc, setBankIfsc,
    bankBranch, setBankBranch, enableScrap, setEnableScrap, showCashRegister, setShowCashRegister, autoPrintBarcode,
    setAutoPrintBarcode, loyaltyIncludeTax, setLoyaltyIncludeTax, loyaltyEnabled, setLoyaltyEnabled, loyaltyEarningRate, setLoyaltyEarningRate,
    loyaltyRedemptionRate, setLoyaltyRedemptionRate, loyaltyAwardOnPending, setLoyaltyAwardOnPending, enablePartyGst,
    setEnablePartyGst, enablePartyEstimate, setEnablePartyEstimate, enableRealPaperStock, setEnableRealPaperStock,
    showPaperStockInGst, setShowPaperStockInGst, showPaperStockInEstimate, setShowPaperStockInEstimate,
    showZeroPaperStock, setShowZeroPaperStock, showPaperOnlyProducts, setShowPaperOnlyProducts, enableConvertToGst,
    setEnableConvertToGst, billingUIConfig, setBillingUIConfig, staffDataMaskingConfig, setStaffDataMaskingConfig,
    emergencyPanicConfig, setEmergencyPanicConfig, shopClosingConfig, setShopClosingConfig, terminalCode,
    setTerminalCode, invoiceStartNumber, setInvoiceStartNumber, enableThreeInvoiceSeries,
    setEnableThreeInvoiceSeries, b2bPrefix, setB2bPrefix, b2bStartNumber, setB2bStartNumber, b2cPrefix, setB2cPrefix,
    b2cStartNumber, setB2cStartNumber, gstProfitPercentage, setGstProfitPercentage, gstConversionTaxInclusive,
    setGstConversionTaxInclusive, returnPrefix, setReturnPrefix, returnStartNumber, setReturnStartNumber,
    scrapPrefix, setScrapPrefix, scrapStartNumber, setScrapStartNumber, quotationPrefix, setQuotationPrefix,
    quotationStartNumber, setQuotationStartNumber, purchaseBillPrefix, setPurchaseBillPrefix,
    purchaseBillStartNumber, setPurchaseBillStartNumber, stockReportDefaultView, setStockReportDefaultView,
    inventoryDefaultView, setInventoryDefaultView, showProductGstBadge, setShowProductGstBadge,
    showPriceTiersInInventory, setShowPriceTiersInInventory, serviceChargeProduct, setServiceChargeProduct,
    serviceChargeBarcode, setServiceChargeBarcode, timeFormat, setTimeFormat, syncMode, setSyncMode, lanRole,
    setLanRole, lanHostIp, setLanHostIp, detectedLocalIp, setDetectedLocalIp, networkDetails, setNetworkDetails,
    lanPort, setLanPort, syncFrequency, setSyncFrequency, testingNetwork, setTestingNetwork, effectiveCloudState,
    setEffectiveCloudState, drainingQueue, setDrainingQueue, showLanHelpModal, setShowLanHelpModal,
    copiedFirewallCmd, setCopiedFirewallCmd,
  };
}

export type SettingsFormState = ReturnType<typeof useSettingsFormState>;
