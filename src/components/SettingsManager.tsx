import { useState, useEffect, useRef, useMemo } from 'react';
import { Settings, Printer, Save, Loader2, CheckCircle2, AlertCircle, Wifi, Smartphone, X, EyeOff, Palette, Store, Package, Monitor, ChevronRight, Shield, FileText, Clock, Power, Copy, Check, BookOpen, Layers, AlertOctagon, LayoutGrid } from 'lucide-react';
import { setSetting } from '../data/settings';
import { DashboardCardCustomizer } from './DashboardCardCustomizer';
import { BillingUICustomizer } from './BillingUICustomizer';
import { LedgerTerminologySettings } from './LedgerTerminologySettings';
import { StaffDataMaskingSettings } from './StaffDataMaskingSettings';
import { EmergencyPurgeSettings } from './EmergencyPurgeSettings';
import { DesignSettings } from './DesignSettings';
import { StoreSettingsTab } from './settings/tabs/StoreSettingsTab';
import { WhatsAppSettingsTab } from './settings/tabs/WhatsAppSettingsTab';
import { ProductsSettingsTab } from './settings/tabs/ProductsSettingsTab';
import { PrintingSettingsTab } from './settings/tabs/PrintingSettingsTab';
import { PrintOptionsSettingsTab } from './settings/tabs/PrintOptionsSettingsTab';
import { SystemPreferencesTab } from './settings/tabs/SystemPreferencesTab';
import { FeaturesTab } from './settings/tabs/FeaturesTab';
import { NetworkSyncTab } from './settings/tabs/NetworkSyncTab';
import { HardwareSettingsTab } from './settings/tabs/HardwareSettingsTab';
import { useBillingUIStore, DEFAULT_BILLING_UI_CONFIG, DEFAULT_HEADER_BUTTON_CONFIG, type BillingUIConfig } from '../store/billingUIStore';
import { useCartStore } from '../store/cartStore';
import clsx from 'clsx';
import { useAuthStore } from '../store/authStore';
import { fetchApi } from '../lib/api';
import { Skeleton } from './ui/Skeleton';
import { Modal } from './ui/Modal';
import { RedCrossButton } from './ui/RedCrossButton';
import { useCloseOnEscape } from '../hooks/useCloseOnEscape';
import { BulkOnboardingSheet } from './BulkOnboardingSheet';
import { PaperPreviewModal } from './PaperPreviewModal';
import { WhatsAppIcon } from './ui/WhatsAppIcon';
import { isAdminRole } from '../utils/permissions';
import {
  type StaffDataMaskingConfig,
  STAFF_DATA_MASKING_KEY,
  DEFAULT_STAFF_DATA_MASKING_CONFIG,
  parseStaffDataMaskingConfig
} from '../utils/staffDataMasking';
import {
  type EmergencyPanicConfig,
  EMERGENCY_PANIC_CONFIG_KEY,
  DEFAULT_EMERGENCY_PANIC_CONFIG,
  parseEmergencyPanicConfig
} from '../utils/emergencyPurge';
import {
  type ShopClosingOverviewConfig,
  DEFAULT_SHOP_CLOSING_CONFIG,
  DEFAULT_CHECKLIST
} from '../utils/shopClosingHelper';

import { DEFAULT_BILL_SETTINGS, type BillSettings, setAppTimeFormat } from '../utils/receiptGenerator';
import { CODE_TYPE_CONFIGS, DEFAULT_CODE_TYPE, type CodeType } from '../labelCodeTypes';
import { FEATURE_LIST, DEFAULT_FEATURE_FLAGS, wereFeatureFlagsStored, sanitizeFeatureFlags, type FeatureFlags, type FeatureKey, useFeatureFlagsStore } from '../featureFlags';
import { useTabStore } from '../store/tabStore';
import { getStoreTimezone, setStoreTimezone } from '../utils/timezoneHelper';
import { appApi, logError } from '../data/app';
import { hasBridge, isDesktopRuntime } from '../data/client';
import { bridgeEvents } from '../data/events';
import { printingApi } from '../data/printing';
import { productsApi } from '../data/products';
import { settingsApi } from '../data/settings';
import { syncApi } from '../data/sync';
import { whatsappApi } from '../data/whatsapp';

interface SidebarItem {
  id: string;
  label: string;
  icon: typeof Settings;
  ownerOnly?: boolean;
}

interface SidebarGroup {
  category: string;
  icon: typeof Settings;
  items: SidebarItem[];
}

const SIDEBAR_GROUPS: SidebarGroup[] = [
  {
    category: 'Store Settings',
    icon: Store,
    items: [
      { id: 'store', label: 'Store Profile', icon: Store, ownerOnly: true },
    ],
  },
  {
    category: 'Hardware & Devices',
    icon: Monitor,
    items: [
      { id: 'hardware', label: 'Devices & Hardware', icon: Monitor },
    ],
  },
  {
    category: 'Integrations & Services',
    icon: WhatsAppIcon as any,
    items: [
      { id: 'whatsapp', label: 'WhatsApp Integration', icon: WhatsAppIcon as any },
    ],
  },
  {
    category: 'Products & Coding',
    icon: Package,
    items: [
      { id: 'products', label: 'Products & Inventory', icon: Package },
    ],
  },
  {
    category: 'Printing & Layout',
    icon: Printer,
    items: [
      { id: 'printing', label: 'Print Templates', icon: Printer, ownerOnly: true },
      { id: 'print_options', label: 'Bill & Print Options', icon: FileText, ownerOnly: true },
    ],
  },
  {
    category: 'Application',
    icon: Settings,
    items: [
      { id: 'design', label: 'Theme & Typography', icon: Palette },
      { id: 'terminology', label: 'Ledger Terminology', icon: BookOpen },
      { id: 'billing_ui', label: 'Billing Page Customizer', icon: LayoutGrid },
      { id: 'dashboard_cards', label: 'Dashboard Cards Order', icon: Layers },
      { id: 'system', label: 'App Preferences', icon: Settings },
    ],
  },
  {
    category: 'Network & Connectivity',
    icon: Wifi,
    items: [
      { id: 'network', label: 'Network & Sync Mode', icon: Wifi, ownerOnly: true },
    ],
  },
  {
    category: 'Security & Privacy',
    icon: Shield,
    items: [
      { id: 'emergency_purge', label: 'Emergency Reset & Kill Switch', icon: AlertOctagon, ownerOnly: true },
      { id: 'staff_masking', label: 'Staff Privacy & Data Masking', icon: EyeOff, ownerOnly: true },
    ],
  },
  {
    category: 'Feature Management',
    icon: Power,
    items: [
      { id: 'features', label: 'Features & Modules', icon: Power, ownerOnly: true },
    ],
  },
];

export function SettingsManager({ onClose, isRestricted: _isRestricted }: { onClose: () => void; isRestricted?: boolean }) {
  useCloseOnEscape(onClose);
  const { role, updateDomain, tenantId } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveRevision, setSaveRevision] = useState(0);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string, title?: string } | null>(null);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => {
      setMessage(null);
    }, 4000);
    return () => clearTimeout(timer);
  }, [message]);
  const [activeSection, setActiveSection] = useState(isAdminRole(role) ? 'store' : 'hardware');
  const [showBulkSheet, setShowBulkSheet] = useState(false);

  const [barcodePrinter, setBarcodePrinter] = useState<any>({ type: 'usb', ip: '192.168.1.100', port: 9100, deviceName: '' });
  const [receiptPrinter, setReceiptPrinter] = useState<any>({ type: 'usb', ip: '192.168.1.100', port: 9100, deviceName: '', receiptWidthCm: 5.8 });
  const [a4Printer, setA4Printer] = useState<any>({ deviceName: '' });
  const [scale, setScale] = useState({ path: 'COM3', baudRate: 9600 });
  const [osPrinters, setOsPrinters] = useState<any[]>([]);
  const [printersLoading, setPrintersLoading] = useState(false);
  const shopDomain = useCartStore((state) => state.shopDomain);
  const [activeHardwareTab, setActiveHardwareTab] = useState<'receipt' | 'barcode' | 'a4' | 'scale'>('receipt');
  const [autoWhatsAppSend, setAutoWhatsAppSend] = useState<boolean>(() => localStorage.getItem('auto_whatsapp_send') === 'true');
  const [activeProductsTab, setActiveProductsTab] = useState<'coding' | 'bulk'>('coding');
  const [activeWhatsAppTab, setActiveWhatsAppTab] = useState<'qr' | 'settings' | 'closing'>('qr');
  const [whatsNewLang, setWhatsNewLang] = useState<'ml' | 'en'>(() => (localStorage.getItem('nafid_whats_new_lang') as 'ml' | 'en') || 'ml');
  const [updateStatus, setUpdateStatus] = useState<string | null>(null);
  const [updateInfo, setUpdateInfo] = useState<{ version: string; releaseDate?: string; releaseNotes?: string } | null>(null);
  const [updateReady, setUpdateReady] = useState(false);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<{ percent: number; bytesPerSecond: number; transferred: number; total: number } | null>(null);
  const [localDomain] = useState(shopDomain || 'GENERAL');
  const [pass, setPass] = useState({ old: '', new: '', confirm: '' });
  const [showOldPass, setShowOldPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);
  const [changingPass, setChangingPass] = useState(false);
  const [confirmTurnOffAllModalOpen, setConfirmTurnOffAllModalOpen] = useState(false);
  const [appVersion, setAppVersion] = useState('v2.0.7');
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
  const [storeTimezone, setStoreTimezoneState] = useState<string>(getStoreTimezone());
  const [upiId, setUpiId] = useState('');
  const [showUpiQr, setShowUpiQr] = useState(true);
  const [showProductOffers, setShowProductOffers] = useState(true);
  const [showPriceOverrideMrp, setShowPriceOverrideMrp] = useState(true);
  const [openCashDrawerOnPending, setOpenCashDrawerOnPending] = useState(false);
  const [autoOpenCashDrawer, setAutoOpenCashDrawer] = useState(false);
  const [defaultOpeningBalance, setDefaultOpeningBalance] = useState<number | string>(0);
  const [receiptFont, setReceiptFont] = useState('courier');
  const [billSettings, setBillSettings] = useState<BillSettings>({ ...DEFAULT_BILL_SETTINGS });
  const [scrapBillSettings, setScrapBillSettings] = useState<BillSettings>({ ...DEFAULT_BILL_SETTINGS });
  const [showFullyPaidCashInLedger, setShowFullyPaidCashInLedger] = useState(false);
  const [printFormat, setPrintFormat] = useState<'thermal' | 'a4' | 'half-a4'>('thermal');
  const [a5Orientation, setA5Orientation] = useState<'horizontal' | 'vertical'>('horizontal');
  const [labelCodeType, setLabelCodeType] = useState<CodeType>(DEFAULT_CODE_TYPE);
  const [labelShowShopName, setLabelShowShopName] = useState(true);
  const [printWidth, setPrintWidth] = useState<number>(58);
  const [thermalStyle, setThermalStyle] = useState<'standard' | 'compact' | 'modern' | 'classic' | 'clean' | 'dot' | 'slim' | 'luxe' | 'boxed'>('standard');
  const [a4Style, setA4Style] = useState<'standard' | 'boxed' | 'modern' | 'classic'>('standard');
  const [previewFormat, setPreviewFormat] = useState<'thermal' | 'a4' | 'half-a4' | null>(null);
  const [previewStyle, setPreviewStyle] = useState<string | null>(null);
  const [bankName, setBankName] = useState('');
  const [bankAccount, setBankAccount] = useState('');
  const [bankIfsc, setBankIfsc] = useState('');
  const [bankBranch, setBankBranch] = useState('');
  const [enableScrap, setEnableScrap] = useState(false);
  const [showCashRegister, setShowCashRegister] = useState(false);
  const { flags: featureFlags, loadFlags } = useFeatureFlagsStore();
  const [autoPrintBarcode, setAutoPrintBarcode] = useState(true);
  const [loyaltyEnabled, setLoyaltyEnabled] = useState(false);
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
  const [serviceChargeProduct, setServiceChargeProduct] = useState<any>(null);
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
  const [effectiveCloudState, setEffectiveCloudState] = useState<any>(null);

  const handleToggleFeatureFlag = (key: FeatureKey, nextVal?: boolean) => {
    const currentVal = featureFlags?.[key];
    const targetVal = nextVal !== undefined ? nextVal : !currentVal;

    let updatedFlags: FeatureFlags = { ...DEFAULT_FEATURE_FLAGS, ...featureFlags, [key]: targetVal };
    if (key === 'cash_settlement' && !targetVal) {
      updatedFlags.cash_register = false;
      setShowCashRegister(false);
    } else if (key === 'cash_register' && targetVal) {
      updatedFlags.cash_settlement = true;
      setShowCashRegister(true);
    } else if (key === 'cash_register' && !targetVal) {
      setShowCashRegister(false);
    } else if (key === 'loyalty') {
      setLoyaltyEnabled(targetVal);
    }

    updatedFlags = sanitizeFeatureFlags(updatedFlags);
    useFeatureFlagsStore.getState().setFlags(updatedFlags);
  };
  const [drainingQueue, setDrainingQueue] = useState(false);
  const initialSnapshot = useRef<string>('');

  useEffect(() => {
    if (hasBridge('appGetNetworkDetails')) {
      appApi.getNetworkDetails().then((details) => {
        if (details && details.ip) {
          setNetworkDetails(details);
          if (details.ip && details.ip !== '192.168.1.100') {
            setDetectedLocalIp(details.ip);
          }
        }
      }).catch(() => {});
    } else if (hasBridge('appGetLocalIp')) {
      appApi.getLocalIp().then((ip) => {
        if (ip) {
          setDetectedLocalIp(ip);
          setNetworkDetails(prev => ({
            ...prev,
            ip: ip,
            gateway: ip.replace(/\.\d+$/, '.1')
          }));
        }
      }).catch(() => {});
    }
    if (hasBridge('getCloudAccessState')) {
      syncApi.getCloudAccessState().then((state: any) => {
        if (state) setEffectiveCloudState(state);
      }).catch(() => {});
    }
    if (hasBridge('onCloudStateChanged')) {
      const unsub = bridgeEvents.onCloudStateChanged((state: any) => {
        if (state) setEffectiveCloudState(state);
      });
      return unsub;
    }
  }, [tenantId]);

  const [showLanHelpModal, setShowLanHelpModal] = useState(false);
  const [copiedFirewallCmd, setCopiedFirewallCmd] = useState(false);

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

  const getSettingsSnapshot = () => buildSettingsSnapshot();

  const hasChanges = useMemo(() => {
    if (!initialSnapshot.current) return false;
    return getSettingsSnapshot() !== initialSnapshot.current;
  }, [barcodePrinter, receiptPrinter, a4Printer, scale, priceCoding, shopGstin, shopState, shopNameLocal, shopAddress, shopPhone, shopEmail, shopWebsite, storeTimezone, upiId, showUpiQr, bankName, bankAccount, bankIfsc, bankBranch, showProductOffers, showPriceOverrideMrp, openCashDrawerOnPending, autoOpenCashDrawer, defaultOpeningBalance, receiptFont, printFormat, a5Orientation, printWidth, thermalStyle, a4Style, terminalCode, invoiceStartNumber, enableThreeInvoiceSeries, b2bPrefix, b2bStartNumber, b2cPrefix, b2cStartNumber, labelCodeType, labelShowShopName, enableScrap, showCashRegister, autoPrintBarcode, loyaltyEnabled, loyaltyEarningRate, loyaltyRedemptionRate, loyaltyAwardOnPending, billSettings, scrapBillSettings, gstProfitPercentage, gstConversionTaxInclusive, returnPrefix, returnStartNumber, scrapPrefix, scrapStartNumber, quotationPrefix, quotationStartNumber, purchaseBillPrefix, purchaseBillStartNumber, stockReportDefaultView, inventoryDefaultView, serviceChargeBarcode, timeFormat, syncMode, lanRole, lanHostIp, lanPort, syncFrequency, featureFlags, enablePartyGst, enablePartyEstimate, enableRealPaperStock, showZeroPaperStock, showPaperOnlyProducts, showPaperStockInGst, showPaperStockInEstimate, showProductGstBadge, showPriceTiersInInventory, enableConvertToGst, billingUIConfig, staffDataMaskingConfig, emergencyPanicConfig, shopClosingConfig, saveRevision]);

  const updateSnapshotField = (updater: (prevObj: any) => any) => {
    try {
      if (initialSnapshot.current) {
        const snap = JSON.parse(initialSnapshot.current);
        initialSnapshot.current = JSON.stringify(updater(snap));
      }
    } catch {}
  };

  useEffect(() => {
    let isMounted = true;
    loadSettings();
    // Maximum safety timer: Never let the UI remain stuck on skeleton loader
    const safetyTimer = setTimeout(() => {
      if (isMounted) setLoading(false);
    }, 1500);
    return () => {
      isMounted = false;
      clearTimeout(safetyTimer);
    };
  }, []);

  useEffect(() => {
    if (!isDesktopRuntime()) return;
    if (hasBridge('onUpdateStatus')) {
      bridgeEvents.onUpdateStatus((status: string) => {
        if (status === 'ready-to-install') { setUpdateReady(true); setIsDownloading(false); setDownloadProgress(null); setUpdateStatus('Update ready to install'); }
        else if (status === 'update-available') { setUpdateStatus('Update available'); }
        else if (status === 'error') { setIsDownloading(false); setUpdateStatus('Download failed'); }
        else { setUpdateStatus(status); }
      });
    }
    if (hasBridge('onUpdateProgress')) {
      bridgeEvents.onUpdateProgress((progress) => { setDownloadProgress(progress); });
    }
    if (hasBridge('onUpdateInfo')) {
      bridgeEvents.onUpdateInfo((info: any) => {
        if (info) {
          setUpdateInfo({ version: info.version, releaseDate: info.releaseDate, releaseNotes: info.releaseNotes });
          // The main process already starts the download automatically when update-available fires.
          // Do NOT call appDownloadUpdate() here — that would start a second concurrent download,
          // causing a race condition that leaves slow machines stuck at 100% indefinitely.
          setIsDownloading(true);
          setUpdateStatus('Downloading...');
        }
      });
    }
    appApi.checkForUpdates().then(() => setLastChecked(new Date())).catch(() => {});
  }, []);

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

      fetchApi('/settings/connect-code')
        .then((res: any) => {
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
      setAutoOpenCashDrawer(Boolean(autoOpenVal));
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

  const fetchPrinters = async (showToast = false) => {
    if (!isDesktopRuntime()) return;
    setPrintersLoading(true);
    try {
      const pr = await printingApi.getPrinters();
      const printerList = Array.isArray(pr) ? pr : [];
      setOsPrinters(printerList);

      if (printerList.length > 0) {
        const defPr = printerList.find((p: any) => p.isDefault) || printerList[0];
        if (defPr && defPr.name) {
          setReceiptPrinter((prev: any) => {
            if (!prev?.deviceName) {
              updateSnapshotField(s => ({ ...s, receiptPrinter: { ...s.receiptPrinter, deviceName: defPr.name } }));
              return { ...prev, deviceName: defPr.name };
            }
            return prev;
          });
          setBarcodePrinter((prev: any) => {
            if (!prev?.deviceName) {
              updateSnapshotField(s => ({ ...s, barcodePrinter: { ...s.barcodePrinter, deviceName: defPr.name } }));
              return { ...prev, deviceName: defPr.name };
            }
            return prev;
          });
        }
      }
      if (showToast) {
        setMessage({
          type: 'success',
          text: printerList.length > 0 ? `Found ${printerList.length} printer(s)` : 'No printers found. Make sure printers are installed and powered on.'
        });
      }
    } catch (err: any) {
      console.error('[SettingsManager] Failed to get printers', err);
      if (showToast) {
        setMessage({ type: 'error', text: `Failed to fetch printers: ${err.message || 'Unknown error'}` });
      }
    } finally {
      setPrintersLoading(false);
    }
  };

  const handleSave = async () => {
    if (!isDesktopRuntime()) return;
    setSaving(true); setMessage(null);
    try {
      const { tenantId } = useAuthStore.getState();
      if (localDomain !== shopDomain && isAdminRole(role)) {
        const res = await updateDomain(localDomain);
        if (!res.success) throw new Error(res.error);
      }

      const defaultSystemPrinter = osPrinters.find((p: any) => p.isDefault)?.name || osPrinters[0]?.name || '';
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

      const checks: { promise: Promise<any>; name: string }[] = [
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
        ...(hasBridge('shopClosingSaveConfig') ? [{
          promise: whatsappApi.shopClosingSaveConfig({
            tenant_id: tenantId || 'global',
            config: shopClosingConfig,
            user_role: role as string | undefined,
          }),
          name: 'shop_closing_config'
        }] : []),
        { promise: setSetting({ tenant_id: tenantId || 'global', key: 'network_sync_config', value: { syncMode, lanRole, lanHostIp, lanPort: Number(lanPort) || 3888, syncFrequency } }), name: 'network_sync_config' },
      ];

      for (const { promise, name } of checks) {
        const res = await promise;
        if (!res.success) throw new Error(`${name}: ${res.error}`);
      }

      // Notify application and invalidate stale tab reservations
      try {
        useAuthStore.setState({ shopName: shopNameLocal });
        window.dispatchEvent(new CustomEvent('settings:updated', { detail: { terminalCode: cleanCode, shopName: shopNameLocal } }));
      } catch {}
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
      } catch {}

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
        const sectionLabels: Record<string, string> = {
          hardware: 'Hardware & device settings',
          store: 'Store profile settings',
          products: 'Products & inventory settings',
          printing: 'Print template settings',
          print_options: 'Bill & print options',
          billing_ui: 'Billing Page Customizer settings',
          system: 'App preferences',
          features: 'Feature module settings',
          staff_masking: 'Staff privacy & data masking settings',
          emergency_purge: 'Emergency reset & kill switch settings',
          whatsapp: 'WhatsApp integration & closing settings',
          whatsapp_device: 'WhatsApp integration & closing settings',
          whatsapp_settings: 'WhatsApp integration & closing settings',
        };
        const label = sectionLabels[activeSection] || 'Settings';
        setMessage({
          type: 'success',
          title: 'SETTINGS SAVED',
          text: `${label} saved successfully!`
        });
      }
      initialSnapshot.current = buildSettingsSnapshot({
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
      });
      setSaveRevision(v => v + 1);
      setTimeout(() => setMessage(null), 3000);
    } catch (err: any) {
      console.error('Failed to save settings:', err);
      setMessage({ type: 'error', text: 'Failed to save settings. Please try again' });
      setTimeout(() => setMessage(null), 3000);
    }
    setSaving(false);
  };

  const handleInstallUpdate = () => { setUpdateStatus('Restarting to install update...'); appApi.installUpdate(); };

  const handleRetryDownload = () => {
    if (!isDesktopRuntime()) return;
    setUpdateStatus(null);
    setUpdateInfo(null);
    setIsDownloading(false);
    setDownloadProgress(null);
    setUpdateReady(false);
    appApi.checkForUpdates().then(() => setLastChecked(new Date())).catch(() => {});
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pass.old || !pass.new) { setMessage({ type: 'error', text: 'Current and new passwords are required.' }); setTimeout(() => setMessage(null), 3000); return; }
    if (pass.new !== pass.confirm) { setMessage({ type: 'error', text: 'New passwords do not match.' }); setTimeout(() => setMessage(null), 3000); return; }
    setChangingPass(true); setMessage(null);
    try {
      const { changePassword } = useAuthStore.getState();
      const res = await changePassword(pass.old, pass.new);
      if (res.success) { setMessage({ type: 'success', text: 'Password updated successfully!' }); setPass({ old: '', new: '', confirm: '' }); setTimeout(() => setMessage(null), 3000); }
      else { setMessage({ type: 'error', text: res.error || 'Failed to update password.' }); setTimeout(() => setMessage(null), 3000); }
    } catch (err: any) { console.error('Change password error:', err); setMessage({ type: 'error', text: 'Failed to change password. Please try again.' }); setTimeout(() => setMessage(null), 3000); }
    finally { setChangingPass(false); }
  };

  const renderMessage = () => {
    if (!message) return null;
    return (
      <div className="fixed bottom-5 right-5 z-[9999] flex flex-col items-end gap-2 w-full max-w-md pointer-events-none">
        <div className="px-4 py-3 bg-slate-900 text-slate-100 dark:bg-slate-800 border border-slate-700/80 rounded-2xl flex items-center gap-3 shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-200 pointer-events-auto w-full">
          <div className={clsx("p-2 rounded-xl shrink-0", message.type === 'success' ? "bg-emerald-500/25 text-emerald-400" : "bg-red-500/25 text-red-400")}>
            {message.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          </div>
          <div className="flex-1 min-w-0 leading-snug">
            <span className="text-slate-400 block text-[10px] font-black uppercase tracking-wider">
              {message.title || (message.type === 'success' ? 'SETTINGS SAVED' : 'SETTINGS ALERT')}
            </span>
            <span className="text-white font-bold text-xs block leading-tight">{message.text}</span>
          </div>
          <button onClick={() => setMessage(null)} className="p-1 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-40 flex flex-col bg-background">
        {/* Header Skeleton */}
        <header className="px-6 py-4 border-b border-border flex items-center justify-between bg-card shrink-0">
          <div className="flex items-center gap-3">
            <Skeleton className="w-10 h-10 rounded-xl" />
            <div className="space-y-2">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-3 w-56" />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Skeleton className="h-9 w-24 rounded-xl" />
            <button
              onClick={onClose}
              className="p-2.5 text-destructive hover:bg-destructive/10 border border-destructive/30 shadow-sm rounded-2xl transition-all duration-200 active:scale-95 cursor-pointer"
              title="Close"
            >
              <X className="w-4.5 h-4.5 text-destructive" />
            </button>
          </div>
        </header>

        {/* Body Skeleton with Sidebar & Main Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Sidebar Skeleton */}
          <div className="w-64 border-r border-border p-4 space-y-6 bg-card/50 shrink-0">
            {[1, 2, 3, 4, 5].map((g) => (
              <div key={g} className="space-y-2">
                <Skeleton className="h-3 w-20 mb-3" />
                <Skeleton className="h-9 w-full rounded-xl" />
                <Skeleton className="h-9 w-full rounded-xl" />
              </div>
            ))}
          </div>

          {/* Content Pane Skeleton */}
          <div className="flex-1 p-8 overflow-y-auto space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-border">
              <div className="space-y-2">
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-4 w-72" />
              </div>
              <Skeleton className="h-9 w-32 rounded-xl" />
            </div>

            <div className="grid grid-cols-2 gap-6">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="p-5 rounded-2xl border border-border bg-card space-y-3">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-10 w-full rounded-xl" />
                  <Skeleton className="h-3 w-40" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const activeItem = (SIDEBAR_GROUPS || []).flatMap(g => g?.items || []).find(i => i?.id === activeSection);

  const renderSectionContent = (sectionId: string) => {

    switch (sectionId) {
      case 'emergency_purge':
        return (
          <EmergencyPurgeSettings
            config={emergencyPanicConfig}
            onChange={setEmergencyPanicConfig}
          />
        );
      case 'staff_masking':
        return (
          <StaffDataMaskingSettings
            config={staffDataMaskingConfig}
            onChange={setStaffDataMaskingConfig}
          />
        );
      case 'design':
        return <DesignSettings />;
      case 'terminology':
        return <LedgerTerminologySettings />;
      case 'billing_ui':
        return (
          <BillingUICustomizer
            config={billingUIConfig}
            onChange={(newCfg) => {
              setBillingUIConfig(newCfg);
              useBillingUIStore.getState().updateConfig(newCfg);
            }}
          />
        );
      case 'dashboard_cards':
        return (
          <div className="space-y-6 animate-in fade-in duration-300 w-full pb-12">
            <DashboardCardCustomizer />
          </div>
        );
      case 'store':
        return (
          <StoreSettingsTab
            connectCode={connectCode}
            copiedCode={copiedCode}
            setCopiedCode={setCopiedCode}
            shopNameLocal={shopNameLocal} setShopNameLocal={setShopNameLocal}
            shopAddress={shopAddress} setShopAddress={setShopAddress}
            shopPhone={shopPhone} setShopPhone={setShopPhone}
            shopEmail={shopEmail} setShopEmail={setShopEmail}
            shopWebsite={shopWebsite} setShopWebsite={setShopWebsite}
            shopGstin={shopGstin} setShopGstin={setShopGstin}
            shopState={shopState} setShopState={setShopState}
            gstProfitPercentage={gstProfitPercentage} setGstProfitPercentage={setGstProfitPercentage}
            gstConversionTaxInclusive={gstConversionTaxInclusive} setGstConversionTaxInclusive={setGstConversionTaxInclusive}
            storeTimezone={storeTimezone} setStoreTimezoneState={setStoreTimezoneState}
            bankName={bankName} setBankName={setBankName}
            bankAccount={bankAccount} setBankAccount={setBankAccount}
            bankIfsc={bankIfsc} setBankIfsc={setBankIfsc}
            bankBranch={bankBranch} setBankBranch={setBankBranch}
            upiId={upiId} setUpiId={setUpiId}
            showUpiQr={showUpiQr} setShowUpiQr={setShowUpiQr}
            terminalCode={terminalCode} setTerminalCode={setTerminalCode}
            invoiceStartNumber={invoiceStartNumber} setInvoiceStartNumber={setInvoiceStartNumber}
            enableThreeInvoiceSeries={enableThreeInvoiceSeries} setEnableThreeInvoiceSeries={setEnableThreeInvoiceSeries}
            b2bPrefix={b2bPrefix} setB2bPrefix={setB2bPrefix}
            b2bStartNumber={b2bStartNumber} setB2bStartNumber={setB2bStartNumber}
            b2cPrefix={b2cPrefix} setB2cPrefix={setB2cPrefix}
            b2cStartNumber={b2cStartNumber} setB2cStartNumber={setB2cStartNumber}
            returnPrefix={returnPrefix} setReturnPrefix={setReturnPrefix}
            returnStartNumber={returnStartNumber} setReturnStartNumber={setReturnStartNumber}
            scrapPrefix={scrapPrefix} setScrapPrefix={setScrapPrefix}
            scrapStartNumber={scrapStartNumber} setScrapStartNumber={setScrapStartNumber}
            quotationPrefix={quotationPrefix} setQuotationPrefix={setQuotationPrefix}
            quotationStartNumber={quotationStartNumber} setQuotationStartNumber={setQuotationStartNumber}
            purchaseBillPrefix={purchaseBillPrefix} setPurchaseBillPrefix={setPurchaseBillPrefix}
            purchaseBillStartNumber={purchaseBillStartNumber} setPurchaseBillStartNumber={setPurchaseBillStartNumber}
          />
        );

      case 'whatsapp':
      case 'whatsapp_device':
      case 'whatsapp_settings':
        return (
          <WhatsAppSettingsTab
            tenantId={tenantId as string | undefined}
            autoWhatsAppSend={autoWhatsAppSend}
            setAutoWhatsAppSend={setAutoWhatsAppSend}
            activeWhatsAppTab={activeWhatsAppTab}
            setActiveWhatsAppTab={setActiveWhatsAppTab}
            shopClosingConfig={shopClosingConfig}
            setShopClosingConfig={setShopClosingConfig}
          />
        );

      case 'hardware':
        return (
          <HardwareSettingsTab
            activeHardwareTab={activeHardwareTab}
            setActiveHardwareTab={setActiveHardwareTab}
            receiptPrinter={receiptPrinter}
            setReceiptPrinter={setReceiptPrinter}
            barcodePrinter={barcodePrinter}
            setBarcodePrinter={setBarcodePrinter}
            a4Printer={a4Printer}
            setA4Printer={setA4Printer}
            scale={scale}
            setScale={setScale}
            osPrinters={osPrinters}
            printersLoading={printersLoading}
            fetchPrinters={fetchPrinters}
            printWidth={printWidth}
            setPrintWidth={setPrintWidth}
          />
        );

      case 'products':
        return (
          <ProductsSettingsTab
            isAdminRole={isAdminRole(role)}
            activeProductsTab={activeProductsTab} setActiveProductsTab={setActiveProductsTab}
            priceCoding={priceCoding} setPriceCoding={setPriceCoding}
            serviceChargeBarcode={serviceChargeBarcode} setServiceChargeBarcode={setServiceChargeBarcode}
            enableRealPaperStock={enableRealPaperStock} setEnableRealPaperStock={setEnableRealPaperStock}
            showZeroPaperStock={showZeroPaperStock} setShowZeroPaperStock={setShowZeroPaperStock}
            showPaperStockInGst={showPaperStockInGst} setShowPaperStockInGst={setShowPaperStockInGst}
            showPaperStockInEstimate={showPaperStockInEstimate} setShowPaperStockInEstimate={setShowPaperStockInEstimate}
            showProductGstBadge={showProductGstBadge} setShowProductGstBadge={setShowProductGstBadge}
            showBulkSheet={showBulkSheet} setShowBulkSheet={setShowBulkSheet}
            showPaperOnlyProducts={showPaperOnlyProducts} setShowPaperOnlyProducts={setShowPaperOnlyProducts}
          />
        );

      case 'printing':
        return (
          <PrintingSettingsTab
            printFormat={printFormat} setPrintFormat={setPrintFormat}
            a5Orientation={a5Orientation} setA5Orientation={setA5Orientation}
            timeFormat={timeFormat} setTimeFormat={setTimeFormat}
            a4Style={a4Style} setA4Style={setA4Style}
            thermalStyle={thermalStyle} setThermalStyle={setThermalStyle}
            setPreviewStyle={setPreviewStyle}
            setPreviewFormat={setPreviewFormat}
            printWidth={printWidth}
            setActiveSection={setActiveSection}
          />
        );

      case 'print_options':
        return (
          <PrintOptionsSettingsTab
            autoOpenCashDrawer={autoOpenCashDrawer} setAutoOpenCashDrawer={setAutoOpenCashDrawer}
            autoPrintBarcode={autoPrintBarcode} setAutoPrintBarcode={setAutoPrintBarcode}
            billSettings={billSettings} setBillSettings={setBillSettings}
            billingUIConfig={billingUIConfig} setBillingUIConfig={setBillingUIConfig}
            defaultOpeningBalance={defaultOpeningBalance} setDefaultOpeningBalance={setDefaultOpeningBalance}
            enableConvertToGst={enableConvertToGst} setEnableConvertToGst={setEnableConvertToGst}
            labelCodeType={labelCodeType} setLabelCodeType={setLabelCodeType}
            labelShowShopName={labelShowShopName} setLabelShowShopName={setLabelShowShopName}
            openCashDrawerOnPending={openCashDrawerOnPending} setOpenCashDrawerOnPending={setOpenCashDrawerOnPending}
            receiptFont={receiptFont} setReceiptFont={setReceiptFont}
            scrapBillSettings={scrapBillSettings} setScrapBillSettings={setScrapBillSettings}
            showFullyPaidCashInLedger={showFullyPaidCashInLedger} setShowFullyPaidCashInLedger={setShowFullyPaidCashInLedger}
            showPriceOverrideMrp={showPriceOverrideMrp} setShowPriceOverrideMrp={setShowPriceOverrideMrp}
            showProductOffers={showProductOffers} setShowProductOffers={setShowProductOffers}
            loyaltyEnabled={loyaltyEnabled} setLoyaltyEnabled={setLoyaltyEnabled}
            loyaltyEarningRate={loyaltyEarningRate} setLoyaltyEarningRate={setLoyaltyEarningRate}
            loyaltyRedemptionRate={loyaltyRedemptionRate} setLoyaltyRedemptionRate={setLoyaltyRedemptionRate}
            loyaltyAwardOnPending={loyaltyAwardOnPending} setLoyaltyAwardOnPending={setLoyaltyAwardOnPending}
            enableScrap={enableScrap} setEnableScrap={setEnableScrap}
            previewFormat={previewFormat} setPreviewFormat={setPreviewFormat}
            previewStyle={previewStyle} setPreviewStyle={setPreviewStyle}
          />
        );

      case 'system':
        return (
          <SystemPreferencesTab
            appVersion={appVersion}
            changingPass={changingPass} setPass={setPass} pass={pass}
            showOldPass={showOldPass} setShowOldPass={setShowOldPass}
            showNewPass={showNewPass} setShowNewPass={setShowNewPass}
            showConfirmPass={showConfirmPass} setShowConfirmPass={setShowConfirmPass}
            inventoryDefaultView={inventoryDefaultView} setInventoryDefaultView={setInventoryDefaultView}
            isDownloading={isDownloading}
            downloadProgress={downloadProgress}
            lastChecked={lastChecked}
            loading={loading}
            stockReportDefaultView={stockReportDefaultView} setStockReportDefaultView={setStockReportDefaultView}
            showPriceTiersInInventory={showPriceTiersInInventory} setShowPriceTiersInInventory={setShowPriceTiersInInventory}
            showProductGstBadge={showProductGstBadge} setShowProductGstBadge={setShowProductGstBadge}
            updateInfo={updateInfo}
            updateReady={updateReady}
            updateStatus={updateStatus}
            whatsNewLang={whatsNewLang} setWhatsNewLang={setWhatsNewLang}
            setActiveSection={setActiveSection}
            handleChangePassword={handleChangePassword}
            handleRetryDownload={handleRetryDownload}
            handleInstallUpdate={handleInstallUpdate}
          />
        );

      case 'features':
        return (
          <FeaturesTab
            featureFlags={featureFlags}
            handleToggleFeatureFlag={handleToggleFeatureFlag}
            enablePartyEstimate={enablePartyEstimate} setEnablePartyEstimate={setEnablePartyEstimate}
            enablePartyGst={enablePartyGst} setEnablePartyGst={setEnablePartyGst}
            loyaltyAwardOnPending={loyaltyAwardOnPending} setLoyaltyAwardOnPending={setLoyaltyAwardOnPending}
            loyaltyEarningRate={loyaltyEarningRate} setLoyaltyEarningRate={setLoyaltyEarningRate}
            loyaltyRedemptionRate={loyaltyRedemptionRate} setLoyaltyRedemptionRate={setLoyaltyRedemptionRate}
            saving={saving}
            confirmTurnOffAllModalOpen={confirmTurnOffAllModalOpen} setConfirmTurnOffAllModalOpen={setConfirmTurnOffAllModalOpen}
            showCashRegister={showCashRegister} setShowCashRegister={setShowCashRegister}
          />
        );

      case 'network':
        return (
          <NetworkSyncTab
            activeSection={activeSection}
            appVersion={appVersion}
            detectedLocalIp={detectedLocalIp}
            lanHostIp={lanHostIp} setLanHostIp={setLanHostIp}
            lanRole={lanRole} setLanRole={setLanRole}
            lanPort={lanPort}
            saving={saving}
            setActiveHardwareTab={setActiveHardwareTab}
            setActiveProductsTab={setActiveProductsTab}
            setActiveSection={setActiveSection}
            setShowBulkSheet={setShowBulkSheet}
            showBulkSheet={showBulkSheet}
            showLanHelpModal={showLanHelpModal} setShowLanHelpModal={setShowLanHelpModal}
            syncFrequency={syncFrequency} setSyncFrequency={setSyncFrequency}
            syncMode={syncMode} setSyncMode={setSyncMode}
            testingNetwork={testingNetwork} setTestingNetwork={setTestingNetwork}
            drainingQueue={drainingQueue} setDrainingQueue={setDrainingQueue}
            effectiveCloudState={effectiveCloudState} setEffectiveCloudState={setEffectiveCloudState}
            copiedFirewallCmd={copiedFirewallCmd} setCopiedFirewallCmd={setCopiedFirewallCmd}
            networkDetails={networkDetails} setNetworkDetails={setNetworkDetails}
            setMessage={setMessage}
          />
        );

      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-background font-sans">
      {renderMessage()}
      {showBulkSheet && <BulkOnboardingSheet onClose={() => setShowBulkSheet(false)} />}

      {/* ── Premium Header ── */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-border bg-card shrink-0 gap-4 shadow-sm z-30">
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative shrink-0">
            <div className="absolute inset-0 bg-primary/20 rounded-xl blur-sm" />
            <div className="relative p-2.5 rounded-xl bg-gradient-to-br from-primary/25 to-primary/5 text-primary ring-1 ring-primary/20 shadow-inner">
              <Settings className="w-5 h-5" />
            </div>
          </div>
          <div className="min-w-0 leading-tight">
            <div className="flex items-center gap-2.5">
              <h1 className="text-sm font-black text-foreground uppercase tracking-widest truncate">Settings</h1>
              <span className="hidden sm:inline-flex items-center gap-1.5 px-2 py-0.5 bg-muted/80 rounded-md text-[9px] text-muted-foreground font-mono font-bold border border-border/50">
                {appVersion}
              </span>
            </div>
            <p className="text-xs text-muted-foreground/75 font-medium mt-0.5">Configure your shop, hardware, and system preferences</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {(hasChanges || saving) && (
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-black rounded-2xl transition-all duration-200 active:scale-95 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-md border text-primary-foreground bg-primary hover:bg-primary/90 border-primary shadow-primary/25 ring-2 ring-primary/20 animate-in fade-in zoom-in-95 duration-200"
              title="Save Changes (Unsaved Changes Pending)"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : <Save className="w-4 h-4 shrink-0 text-current" />}
              <span className="hidden sm:inline">{saving ? 'Saving...' : 'Save Changes'}</span>
              <span className="sm:hidden">{saving ? 'Saving...' : 'Save'}</span>
            </button>
          )}
          <button onClick={onClose}
            className="p-2.5 text-destructive hover:bg-destructive/10 border border-destructive/30 shadow-sm rounded-2xl transition-all duration-200 active:scale-95 cursor-pointer"
            title="Close">
            <X className="w-4.5 h-4.5 text-destructive" />
          </button>
        </div>
      </header>

      {/* ── Sidebar + Content ── */}
      <div className="flex-1 flex overflow-hidden">

        {/* ── Left Sidebar Navigation ── */}
        <aside className="w-56 lg:w-64 shrink-0 bg-muted/30 border-r border-border overflow-y-auto hidden md:block">
          <nav className="py-4 px-3.5 space-y-6">
            {SIDEBAR_GROUPS.map((group) => {
              const visibleItems = group.items.filter(item => !item.ownerOnly || isAdminRole(role));
              if (visibleItems.length === 0) return null;
              const GroupIcon = group.icon;
              return (
                <div key={group.category} className="space-y-1">
                  <div className="flex items-center gap-2 px-3 py-1 mb-1.5 select-none">
                    <GroupIcon className="w-3.5 h-3.5 text-muted-foreground/45" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">{group.category}</span>
                  </div>
                  <div className="space-y-0.5">
                    {visibleItems.map((item) => {
                      const ItemIcon = item.icon;
                      const isActive = activeSection === item.id;
                      return (
                        <button
                          key={item.id}
                          onClick={() => {
                            setActiveSection(item.id);
                            if (item.id === 'hardware') setActiveHardwareTab('receipt');
                            if (item.id === 'products') setActiveProductsTab('coding');
                          }}
                          className={clsx(
                            "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer text-left border-l-2 group",
                            isActive
                              ? "bg-gradient-to-r from-primary/10 to-primary/[0.01] text-primary border-primary shadow-sm font-extrabold"
                              : "text-muted-foreground/80 hover:text-foreground hover:bg-muted/40 border-transparent"
                          )}
                        >
                          <ItemIcon className={clsx("w-4 h-4 shrink-0 transition-all duration-200", isActive ? "text-primary scale-110" : "text-muted-foreground/50 group-hover:text-foreground group-hover:scale-105")} />
                          <span className="flex-1 truncate">{item.label}</span>
                          {item.ownerOnly && (
                            <span className="px-1.5 py-0.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[8px] font-bold rounded-lg border border-amber-500/20 shrink-0">OWNER</span>
                          )}
                          {isActive && <ChevronRight className="w-3 h-3 text-primary/60 shrink-0 animate-pulse" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </nav>
        </aside>

        {/* ── Mobile Section Picker ── */}
        <div className="md:hidden shrink-0 border-b border-border bg-muted/20 overflow-x-auto">
          <div className="flex gap-1.5 p-2 whitespace-nowrap">
            {SIDEBAR_GROUPS.flatMap(g => g.items).filter(item => !item.ownerOnly || isAdminRole(role)).map((item) => {
              const ItemIcon = item.icon;
              const isActive = activeSection === item.id;
              return (
                <button key={item.id} 
                  onClick={() => {
                    setActiveSection(item.id);
                    if (item.id === 'hardware') setActiveHardwareTab('receipt');
                    if (item.id === 'products') setActiveProductsTab('coding');
                  }}
                  className={clsx("flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all duration-150 cursor-pointer border shrink-0 active:scale-95",
                    isActive ? "bg-primary/10 text-primary border-primary/20 shadow-sm" : "bg-card text-muted-foreground/80 border-border/60 hover:text-foreground hover:bg-muted"
                  )}>
                  <ItemIcon className="w-3.5 h-3.5 shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ─── Main Content Area ─── */}
        <main className="flex-1 overflow-y-auto bg-background" style={{ scrollbarGutter: 'stable' }}>
          <div className="w-full max-w-7xl 2xl:max-w-full mx-auto p-6 lg:p-8 animate-in fade-in duration-300">

            {/* Section Header */}
            {activeItem && (
              <div className="mb-8 flex flex-col items-center justify-center text-center pb-5 border-b border-border/40 select-none">
                <div className="flex items-center justify-center gap-3">
                  <div className="p-2.5 rounded-2xl bg-primary/10 text-primary shadow-[0_4px_12px_rgba(79,70,229,0.1)] shrink-0">
                    <activeItem.icon className="w-5 h-5" />
                  </div>
                  <h2 className="text-xl font-black text-foreground uppercase tracking-widest">{activeItem.label}</h2>
                  {activeItem.ownerOnly && (
                    <span className="px-2.5 py-0.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[9px] font-bold rounded-full border border-amber-500/20 shrink-0 uppercase tracking-wider select-none">
                      OWNER ONLY
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-2 max-w-2xl text-center leading-relaxed font-medium">
                  {activeItem.id === 'design' && 'Calibrate system brand accent colors, interface font stacks, and touchscreen reading density.'}
                  {activeItem.id === 'store' && 'Manage your shop profile, GST registration, invoice counters, and features.'}
                  {activeItem.id === 'terminology' && 'Customise how Receivable, Payable, Received, and Paid terms are displayed across ledgers and reports.'}
                  {activeItem.id === 'hardware' && 'Configure receipt printers, barcode label printers, scales, and hardware connections.'}
                  {activeItem.id === 'products' && 'Manage product categories, grade pricing, and price coding alphabets.'}
                  {activeItem.id === 'printing' && 'Select paper formats for normal print (BOS/Estimate) and customize invoice & thermal template styles.'}
                  {activeItem.id === 'print_options' && 'Configure bill content checklists, T&C instructions, BOS tax rate, receipt typography, and label codes.'}
                  {activeItem.id === 'billing_ui' && 'Rearrange POS billing columns, customize theme colors, adjust touchscreen target density, and tailor layout for cashiers.'}
                  {activeItem.id === 'dashboard_cards' && 'Rearrange the display sequence of POS dashboard module cards according to your preferred workflow.'}
                  {activeItem.id === 'system' && 'Adjust UI scaling, security passwords, and manage system updates.'}
                  {activeItem.id === 'network' && 'Configure Cloud API sync, Local Wi-Fi direct connections, and hybrid store networks.'}
                  {activeItem.id === 'features' && 'Turn individual modules on or off across the app — dashboards, billing, and managers hide disabled features.'}
                  {activeItem.id === 'emergency_purge' && 'Configure on-site panic hotkeys, multi-click gestures, and remote cloud wipe signals.'}
                  {activeItem.id === 'staff_masking' && 'Mask aggregate stock valuations and customize sales history visibility and revenue display for staff.'}
                </p>
              </div>
            )}

            {/* Section Content */}
            <div className="space-y-6">
              {renderSectionContent(activeSection)}
            </div>

          </div>

        </main>
      </div>

      <PaperPreviewModal
        isOpen={previewFormat !== null}
        onClose={() => { setPreviewFormat(null); setPreviewStyle(null); }}
        format={previewFormat || 'thermal'}
        thermalStyle={(previewStyle as any) || thermalStyle}
        a4Style={(previewStyle as any) || a4Style}
        paperWidth={printWidth}
        onSelectStyle={(s) => { if (previewFormat === 'thermal') setThermalStyle(s as any); else setA4Style(s as any); }}
        showProductOffers={showProductOffers}
        receiptFont={receiptFont}
        billSettings={billSettings}
        a5Orientation={a5Orientation}
        shopName={shopNameLocal || undefined}
        shopAddress={shopAddress || undefined}
        shopPhone={shopPhone || undefined}
        shopGstin={shopGstin || undefined}
        shopState={shopState || undefined}
        bankName={bankName || undefined}
        bankAccount={bankAccount || undefined}
        bankIfsc={bankIfsc || undefined}
        bankBranch={bankBranch || undefined}
      />

      {/* LAN / Wi-Fi Sync Help Modal — Fully Redesigned Step-by-Step Wizard */}
      <Modal
        isOpen={showLanHelpModal}
        onClose={() => setShowLanHelpModal(false)}
        title="📖 Wi-Fi / LAN Sync — Easy Step-by-Step Setup Guide"
        size="lg"
      >
        <div className="space-y-4 text-left text-foreground py-1">
          {/* Top Banner */}
          <div className="p-4 rounded-2xl bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border border-primary/20 flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary text-primary-foreground shadow-sm shrink-0">
              <Wifi className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-xs font-black uppercase tracking-wider text-primary">Simple Wi-Fi Sync Guide (A to Z)</h4>
              <p className="text-xs text-muted-foreground mt-0.5 font-medium leading-relaxed">
                Follow these 5 simple steps one by one to connect all your store billing computers over Wi-Fi.
              </p>
            </div>
          </div>

          {/* 1st Step Card */}
          <div className="p-4.5 rounded-2xl border border-blue-500/25 bg-blue-500/[0.03] space-y-3 relative overflow-hidden">
            <div className="flex items-center justify-between gap-2 border-b border-blue-500/15 pb-2.5">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 rounded-lg bg-blue-500 text-white text-[11px] font-black uppercase tracking-wider shrink-0 shadow-sm">
                  1st Step
                </span>
                <h5 className="text-xs font-black text-foreground uppercase tracking-wide flex items-center gap-1.5">
                  <Monitor className="w-4 h-4 text-blue-500 shrink-0" />
                  Set Up Computer A (Main Host PC)
                </h5>
              </div>
              <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full border border-blue-500/20">PRIMARY HOST</span>
            </div>
            <ol className="text-xs text-muted-foreground space-y-2 list-decimal pl-4 font-medium leading-relaxed">
              <li>Open <strong>Nafid POS</strong> on Computer A → Go to <strong>Settings ⚙️ → Network &amp; Sync Settings</strong>.</li>
              <li>Set <strong>Sync Mode</strong> to <strong>`HYBRID`</strong> <em>(Recommended)</em> or <strong>`LAN`</strong>.</li>
              <li>Set <strong>LAN Role</strong> to <strong>`PRIMARY (Master Server)`</strong>.</li>
              <li>Note down Computer A's <strong>Local IP Address</strong> displayed on screen (e.g. <span className="font-mono text-foreground font-bold px-1 py-0.5 bg-muted rounded">{networkDetails.ip || detectedLocalIp || '192.168.1.100'}</span>).</li>
              <li>Click <strong>Save Settings</strong>.</li>
            </ol>
          </div>

          {/* 2nd Step Card */}
          <div className="p-4.5 rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.03] space-y-3 relative overflow-hidden">
            <div className="flex items-center justify-between gap-2 border-b border-emerald-500/15 pb-2.5">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 rounded-lg bg-emerald-500 text-white text-[11px] font-black uppercase tracking-wider shrink-0 shadow-sm">
                  2nd Step
                </span>
                <h5 className="text-xs font-black text-foreground uppercase tracking-wide flex items-center gap-1.5">
                  <Smartphone className="w-4 h-4 text-emerald-500 shrink-0" />
                  Set Up Computer B (Secondary Billing PC)
                </h5>
              </div>
              <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">CLIENT TERMINAL</span>
            </div>
            <ol className="text-xs text-muted-foreground space-y-2 list-decimal pl-4 font-medium leading-relaxed">
              <li>Open <strong>Nafid POS</strong> on Computer B → Go to <strong>Settings ⚙️ → Network &amp; Sync Settings</strong>.</li>
              <li>Set <strong>Sync Mode</strong> to <strong>`HYBRID`</strong> or <strong>`LAN`</strong>.</li>
              <li>Set <strong>LAN Role</strong> to <strong>`SECONDARY (Client Terminal)`</strong>.</li>
              <li>In the <strong>Primary Host IP</strong> field, type Computer A's IP address (e.g. <span className="font-mono text-foreground font-bold px-1 py-0.5 bg-muted rounded">{networkDetails.ip || detectedLocalIp || '192.168.1.100'}</span>).</li>
              <li>Click <strong>Test Connection</strong>. When it shows green success, click <strong>Save Settings</strong>.</li>
            </ol>
          </div>

          {/* 3rd Step Card */}
          <div className="p-4.5 rounded-2xl border border-amber-500/25 bg-amber-500/[0.03] space-y-3 relative overflow-hidden">
            <div className="flex items-center justify-between gap-2 border-b border-amber-500/15 pb-2.5">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 rounded-lg bg-amber-500 text-white text-[11px] font-black uppercase tracking-wider shrink-0 shadow-sm">
                  3rd Step
                </span>
                <h5 className="text-xs font-black text-foreground uppercase tracking-wide flex items-center gap-1.5">
                  <Shield className="w-4 h-4 text-amber-500 shrink-0" />
                  Run Firewall Rule on ALL PCs (EVERY Computer)
                </h5>
              </div>
              <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">PORT 3888</span>
            </div>
            <p className="text-xs text-muted-foreground font-medium leading-relaxed">
              Run this command in <strong>PowerShell as Administrator</strong> on <strong>EVERY computer</strong> using local sync so Windows Firewall allows communication:
            </p>
            <div className="p-3 bg-zinc-950 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest">PowerShell Command</span>
                <button
                  type="button"
                  onClick={() => {
                    const cmd = 'New-NetFirewallRule -DisplayName "Nafid POS Local Sync (Port 3888)" -Direction Inbound -LocalPort 3888 -Protocol TCP -Action Allow -Profile Any';
                    navigator.clipboard.writeText(cmd);
                    setCopiedFirewallCmd(true);
                    setTimeout(() => setCopiedFirewallCmd(false), 2500);
                  }}
                  className="px-3 py-1 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-[10px] rounded-lg transition flex items-center gap-1.5 cursor-pointer shrink-0 active:scale-95 shadow-sm"
                >
                  {copiedFirewallCmd ? <Check className="w-3.5 h-3.5 text-zinc-950" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedFirewallCmd ? 'Copied to Clipboard!' : 'Copy'}</span>
                </button>
              </div>
              <code className="block text-emerald-400 font-mono text-[11px] overflow-x-auto select-all leading-relaxed">
                New-NetFirewallRule -DisplayName "Nafid POS Local Sync (Port 3888)" -Direction Inbound -LocalPort 3888 -Protocol TCP -Action Allow -Profile Any
              </code>
            </div>
          </div>

          {/* 4th Step Card */}
          <div className="p-4.5 rounded-2xl border border-purple-500/25 bg-purple-500/[0.03] space-y-3 relative overflow-hidden">
            <div className="flex items-center justify-between gap-2 border-b border-purple-500/15 pb-2.5">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 rounded-lg bg-purple-600 text-white text-[11px] font-black uppercase tracking-wider shrink-0 shadow-sm">
                  4th Step
                </span>
                <h5 className="text-xs font-black text-foreground uppercase tracking-wide flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-purple-500 shrink-0" />
                  Lock Computer A's IP in Windows (30 Seconds)
                </h5>
              </div>
              <span className="text-[10px] font-bold text-purple-600 dark:text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded-full border border-purple-500/20">NO ROUTER NEEDED</span>
            </div>
            <p className="text-xs text-muted-foreground font-medium leading-relaxed">
              Lock Computer A's IP address directly inside Windows Settings so it never changes when router reboots:
            </p>
            <ol className="text-xs text-muted-foreground space-y-2 list-decimal pl-4 font-medium leading-relaxed">
              <li>On <strong>Computer A</strong>, open <strong>Windows Settings</strong> (press <kbd className="px-1.5 py-0.5 bg-muted border border-border rounded text-[10px] font-mono">Win + I</kbd>) → <strong>Network &amp; Internet</strong> → <strong>Wi-Fi</strong>.</li>
              <li>Click your Wi-Fi Network Name → Scroll down to <strong>IP assignment</strong> → Click <strong>Edit</strong>.</li>
              <li>Change from <strong>Automatic (DHCP)</strong> to <strong>Manual</strong> → Turn <strong>ON IPv4</strong>.</li>
              <li>Fill in the real network details auto-detected for this computer:
                <div className="mt-1.5 p-3 rounded-xl bg-card border border-border/80 grid grid-cols-2 gap-2 text-[11px] font-mono">
                  <div><span className="text-muted-foreground">IP address:</span> <strong className="text-purple-600 dark:text-purple-400">{networkDetails.ip || detectedLocalIp || '192.168.1.100'}</strong></div>
                  <div><span className="text-muted-foreground">Subnet mask:</span> <strong className="text-purple-600 dark:text-purple-400">{networkDetails.netmask || '255.255.255.0'}</strong> <span className="text-[10px] text-muted-foreground">(or Prefix: {networkDetails.subnetPrefix || '24'})</span></div>
                  <div><span className="text-muted-foreground">Gateway (Router IP):</span> <strong className="text-purple-600 dark:text-purple-400">{networkDetails.gateway || '192.168.1.1'}</strong></div>
                  <div><span className="text-muted-foreground">Preferred DNS:</span> <strong className="text-purple-600 dark:text-purple-400">{networkDetails.dns || '8.8.8.8'}</strong></div>
                </div>
              </li>
              <li>Click <strong>Save</strong>. Computer A's IP address is now permanently locked!</li>
            </ol>
          </div>

          {/* 5th Step Card */}
          <div className="p-4.5 rounded-2xl border border-sky-500/25 bg-sky-500/[0.03] space-y-3 relative overflow-hidden">
            <div className="flex items-center justify-between gap-2 border-b border-sky-500/15 pb-2.5">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 rounded-lg bg-sky-500 text-white text-[11px] font-black uppercase tracking-wider shrink-0 shadow-sm">
                  5th Step
                </span>
                <h5 className="text-xs font-black text-foreground uppercase tracking-wide flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-sky-500 shrink-0" />
                  Test &amp; Start Billing!
                </h5>
              </div>
              <span className="text-[10px] font-bold text-sky-600 dark:text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded-full border border-sky-500/20">READY</span>
            </div>
            <ul className="text-xs text-muted-foreground space-y-1.5 list-disc pl-4 font-medium leading-relaxed">
              <li>Print a test bill on Computer A or Computer B. It will appear on both screens instantly!</li>
              <li>Click the <strong>Syncing</strong> button at the top-right header anytime to force an immediate manual refresh.</li>
              <li>Ensure your Wi-Fi network profile is set to <strong>Private Network</strong> on both PCs.</li>
            </ul>
          </div>
        </div>
      </Modal>

      {/* Turn Off All Features Confirmation Modal */}
      <Modal
        isOpen={confirmTurnOffAllModalOpen}
        onClose={() => setConfirmTurnOffAllModalOpen(false)}
        closeButton={<RedCrossButton onClick={() => setConfirmTurnOffAllModalOpen(false)} />}
        title={
          <div className="flex items-center gap-2.5 font-bold text-foreground">
            <Power className="w-5 h-5 text-red-500" />
            <span>Turn Off All Features</span>
          </div>
        }
      >
        <div className="space-y-4 min-w-[400px] text-foreground">
          <div className="p-4 bg-red-500/5 border border-red-500/20 rounded-2xl">
            <p className="text-sm font-bold text-red-600 dark:text-red-400 flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              Are you sure?
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              This will turn OFF all feature flags. Only Settings will remain accessible.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <button
              type="button"
              onClick={() => {
                useFeatureFlagsStore.getState().setFlags(sanitizeFeatureFlags(Object.fromEntries(FEATURE_LIST.map(f => [f.key, false])) as FeatureFlags));
                setShowCashRegister(false);
                setConfirmTurnOffAllModalOpen(false);
              }}
              className="px-5 py-2.5 text-sm font-black bg-red-500 text-white rounded-xl hover:bg-red-600 transition-all active:scale-95 shadow-sm cursor-pointer flex items-center gap-2"
            >
              <Power className="w-3.5 h-3.5" /> Turn Off All
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

