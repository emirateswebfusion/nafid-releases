import { useState, useEffect, useRef, useMemo } from 'react';
import {
  Settings, Printer, Scale, Save, Loader2, RefreshCw, Download,
  Key, Tags, Building, Receipt, Usb, Landmark,
  CheckCircle2, AlertCircle, Globe, Upload, Type, Plus, Minus, Wifi, Info,
  Smartphone, X, RotateCcw, Maximize2, Eye, EyeOff, Palette,
  Store, Package, Monitor, ChevronRight, Shield, FileText, TrendingUp,
  Clock, Power, Lock, Unlock, Cloud, Database, HelpCircle, Copy, Check, BookOpen, Handshake, QrCode
} from 'lucide-react';
import { BillingUICustomizer } from './BillingUICustomizer';
import { LedgerTerminologySettings } from './LedgerTerminologySettings';
import { useBillingUIStore, DEFAULT_BILLING_UI_CONFIG, DEFAULT_HEADER_BUTTON_CONFIG, type BillingUIConfig } from '../store/billingUIStore';
import { useCartStore } from '../store/cartStore';
import { useThemeStore } from '../store/themeStore';
import clsx from 'clsx';
import { useAuthStore } from '../store/authStore';
import { fetchApi } from '../lib/api';
import { Input } from './ui/Input';
import { Select } from './ui/Select';
import { Skeleton } from './ui/Skeleton';
import { Modal } from './ui/Modal';
import { RedCrossButton } from './ui/RedCrossButton';
import { useCloseOnEscape } from '../hooks/useCloseOnEscape';
import { BulkOnboardingSheet } from './BulkOnboardingSheet';
import { PaperPreviewModal } from './PaperPreviewModal';
import { isAdminRole } from '../utils/permissions';

import { DEFAULT_BILL_SETTINGS, type BillSettings, setAppTimeFormat } from '../utils/receiptGenerator';
import { CODE_TYPE_CONFIGS, CODE_TYPES, DEFAULT_CODE_TYPE, type CodeType } from '../labelCodeTypes';
import { FEATURE_LIST, DEFAULT_FEATURE_FLAGS, loadFeatureFlags, wereFeatureFlagsStored, setFeatureFlag, sanitizeFeatureFlags, type FeatureFlags, type FeatureKey } from '../featureFlags';
import { useTabStore } from '../store/tabStore';
import { SUPPORTED_TIMEZONES, getStoreTimezone, setStoreTimezone } from '../utils/timezoneHelper';

const INDIAN_STATES = [
  { code: 'MH', name: 'Maharashtra' },
  { code: 'DL', name: 'Delhi' },
  { code: 'KA', name: 'Karnataka' },
  { code: 'TN', name: 'Tamil Nadu' },
  { code: 'TS', name: 'Telangana' },
  { code: 'AP', name: 'Andhra Pradesh' },
  { code: 'GJ', name: 'Gujarat' },
  { code: 'WB', name: 'West Bengal' },
  { code: 'UP', name: 'Uttar Pradesh' },
  { code: 'HR', name: 'Haryana' },
  { code: 'KL', name: 'Kerala' },
  { code: 'MP', name: 'Madhya Pradesh' },
  { code: 'RJ', name: 'Rajasthan' },
  { code: 'PB', name: 'Punjab' },
  { code: 'BR', name: 'Bihar' },
  { code: 'OD', name: 'Odisha' },
  { code: 'AS', name: 'Assam' },
  { code: 'UT', name: 'Uttarakhand' },
  { code: 'GA', name: 'Goa' },
];

const FONT_OPTIONS = [
  { id: 'courier', name: 'Courier New', family: '"Courier New", monospace' },
  { id: 'consolas', name: 'Consolas', family: 'Consolas, monospace' },
  { id: 'lucida', name: 'Lucida Console', family: '"Lucida Console", monospace' },
  { id: 'lucida-sans', name: 'Lucida Sans Typewriter', family: '"Lucida Sans Typewriter", "Lucida Console", monospace' },
  { id: 'monospace', name: 'System Monospace', family: 'monospace' },
] as const;

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
      { id: 'terminology', label: 'Ledger Terminology', icon: BookOpen },
      { id: 'billing_ui', label: 'Billing Page Customizer', icon: Palette },
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
    category: 'Feature Management',
    icon: Power,
    items: [
      { id: 'features', label: 'Features & Modules', icon: Power, ownerOnly: true },
    ],
  },
];

function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes === 1) return '1 min ago';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours === 1) return '1 hour ago';
  return `${hours} hours ago`;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function DefaultStockReportViewSelector({ value, onChange }: { value: string; onChange: (val: string) => void }) {
  const options = [
    { id: 'estimate', label: 'Estimate Only', desc: 'Non-GST products' },
    { id: 'gst', label: 'GST Only', desc: 'GST enabled products' },
    { id: 'combined', label: 'Estimate & GST', desc: 'All products combined' },
  ] as const;

  return (
    <div className="grid grid-cols-3 gap-x-3">
      {options.map(opt => (
        <button
          key={opt.id}
          type="button"
          onClick={() => onChange(opt.id)}
          className={clsx(
            'flex flex-col items-center justify-center p-3 text-center rounded-xl border transition-all cursor-pointer',
            value === opt.id
              ? 'bg-primary/10 border-primary text-primary font-extrabold shadow-sm'
              : 'bg-background border-border text-muted-foreground hover:border-primary/30 hover:text-foreground'
          )}
        >
          <span className="text-xs font-bold">{opt.label}</span>
          <span className="text-[10px] opacity-75 mt-0.5">{opt.desc}</span>
        </button>
      ))}
    </div>
  );
}

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
  const { shopDomain } = useCartStore();
  const [activeHardwareTab, setActiveHardwareTab] = useState<'receipt' | 'barcode' | 'a4' | 'scale'>('receipt');
  const [activeProductsTab, setActiveProductsTab] = useState<'coding' | 'bulk'>('coding');
  const { fontScale, increaseFontScale, decreaseFontScale, setFontScale } = useThemeStore();
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
  const [appVersion, setAppVersion] = useState('v1.0.0');
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
  const [featureFlags, setFeatureFlags] = useState<FeatureFlags>({ ...DEFAULT_FEATURE_FLAGS });
  const [autoPrintBarcode, setAutoPrintBarcode] = useState(true);
  const [loyaltyEnabled, setLoyaltyEnabled] = useState(false);
  const [loyaltyEarningRate, setLoyaltyEarningRate] = useState(100);
  const [loyaltyRedemptionRate, setLoyaltyRedemptionRate] = useState(1);
  const [enablePartyGst, setEnablePartyGst] = useState(true);
  const [enablePartyEstimate, setEnablePartyEstimate] = useState(true);
  const [enableRealPaperStock, setEnableRealPaperStock] = useState(true);
  const [enableConvertToGst, setEnableConvertToGst] = useState(true);
  const [billingUIConfig, setBillingUIConfig] = useState<BillingUIConfig>(() => useBillingUIStore.getState().config);
  const [terminalCode, setTerminalCode] = useState('POS1');
  const [invoiceStartNumber, setInvoiceStartNumber] = useState<number | string>(1);
  const [enableThreeInvoiceSeries, setEnableThreeInvoiceSeries] = useState(false);
  const [b2bPrefix, setB2bPrefix] = useState('');
  const [b2bStartNumber, setB2bStartNumber] = useState<number | string>(1);
  const [b2cPrefix, setB2cPrefix] = useState('');
  const [b2cStartNumber, setB2cStartNumber] = useState<number | string>(1);
  const [gstProfitPercentage, setGstProfitPercentage] = useState<number>(30);
  const [returnPrefix, setReturnPrefix] = useState('');
  const [returnStartNumber, setReturnStartNumber] = useState<number | string>(1);
  const [scrapPrefix, setScrapPrefix] = useState('');
  const [scrapStartNumber, setScrapStartNumber] = useState<number | string>(1);
  const [quotationPrefix, setQuotationPrefix] = useState('');
  const [quotationStartNumber, setQuotationStartNumber] = useState<number | string>(1);
  const [stockReportDefaultView, setStockReportDefaultView] = useState('combined');
  const [inventoryDefaultView, setInventoryDefaultView] = useState('combined');
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
    const currentVal = featureFlags[key];
    const targetVal = nextVal !== undefined ? nextVal : !currentVal;

    let updatedFlags: FeatureFlags = { ...featureFlags, [key]: targetVal };
    if (key === 'cash_settlement' && !targetVal) {
      updatedFlags.cash_register = false;
      setShowCashRegister(false);
    } else if (key === 'cash_register' && targetVal) {
      updatedFlags.cash_settlement = true;
      setShowCashRegister(true);
    } else if (key === 'cash_register' && !targetVal) {
      setShowCashRegister(false);
    }

    updatedFlags = sanitizeFeatureFlags(updatedFlags);
    setFeatureFlags(updatedFlags);
  };
  const [drainingQueue, setDrainingQueue] = useState(false);
  const initialSnapshot = useRef<string>('');

  useEffect(() => {
    if (window.electronAPI?.appGetNetworkDetails) {
      window.electronAPI.appGetNetworkDetails().then((details) => {
        if (details && details.ip) {
          setNetworkDetails(details);
          if (details.ip && details.ip !== '192.168.1.100') {
            setDetectedLocalIp(details.ip);
          }
        }
      }).catch(() => {});
    } else if (window.electronAPI?.appGetLocalIp) {
      window.electronAPI.appGetLocalIp().then((ip) => {
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
    if (window.electronAPI?.getCloudAccessState) {
      window.electronAPI.getCloudAccessState().then((state: any) => {
        if (state) setEffectiveCloudState(state);
      }).catch(() => {});
    }
    if (window.electronAPI?.onCloudStateChanged) {
      const unsub = window.electronAPI.onCloudStateChanged((state: any) => {
        if (state) setEffectiveCloudState(state);
      });
      return unsub;
    }
  }, [tenantId]);

  const [showLanHelpModal, setShowLanHelpModal] = useState(false);
  const [copiedFirewallCmd, setCopiedFirewallCmd] = useState(false);

  const handleManualQueueDrain = async () => {
    if (!window.electronAPI?.drainPendingCloudQueue) return;
    setDrainingQueue(true);
    try {
      const res = await window.electronAPI.drainPendingCloudQueue();
      if (res.success) {
        setMessage({ type: 'success', text: 'Queue drain completed' });
      } else {
        setMessage({ type: 'error', text: `Queue drain error: ${res.error || 'Failed'}` });
      }
      if (window.electronAPI?.getCloudAccessState) {
        const newState = await window.electronAPI.getCloudAccessState();
        if (newState) setEffectiveCloudState(newState);
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: `Queue drain error: ${err.message}` });
    } finally {
      setDrainingQueue(false);
    }
  };

  const handleTestNetworkConnection = async () => {
    setTestingNetwork(true);
    setMessage({ type: 'success', text: 'Testing network connection...' });
    const cleanHost = lanHostIp.trim().replace(/^https?:\/\//i, '').replace(/:\d+$/, '').replace(/\/.*$/, '');
    const port = Number(lanPort) || 3888;

    try {
      if (window.electronAPI?.testNetworkConnection) {
        const result = await window.electronAPI.testNetworkConnection({
          syncMode,
          lanRole,
          lanHostIp: cleanHost,
          lanPort: port,
        });
        if (result.ok) {
          setMessage({ type: 'success', text: result.message || 'Connection test successful' });
        } else {
          setMessage({ type: 'error', text: result.error || 'Connection failed' });
        }
      } else {
        // Cloud API URL — set VITE_CLOUD_API in .env
        const defaultCloud = (import.meta.env.VITE_CLOUD_API as string).replace(/\/$/, '');
        if (syncMode === 'LAN' || syncMode === 'HYBRID') {
          if (lanRole === 'PRIMARY') {
            const hostIp = detectedLocalIp || cleanHost || '192.168.1.100';
            setMessage({
              type: 'success',
              text: `Wifi Sync Active — This PC is Primary Master Server (IP: ${hostIp}, Port ${port})`
            });
          } else {
            const host = cleanHost || '192.168.1.100';
            try {
              const res = await fetch(`http://${host}:${port}/health`, { method: 'GET', signal: AbortSignal.timeout(3500) });
              if (res.ok) {
                setMessage({
                  type: 'success',
                  text: `Wifi Sync Active — Connected to Primary Master Server (${host})`
                });
              } else if (syncMode === 'HYBRID') {
                try {
                  const cloudRes = await fetch(`${defaultCloud}/health`, { method: 'GET', signal: AbortSignal.timeout(3500) });
                  if (cloudRes.ok) {
                    setMessage({
                      type: 'success',
                      text: `Cloud Sync Active (Hybrid Fallback) — LAN Master Server (${host}) returned status ${res.status}. Syncing via Cloud API.`
                    });
                  } else {
                    setMessage({
                      type: 'error',
                      text: `Sync Inactive — Master Server (${host}) returned status ${res.status} & Cloud API unreachable.`
                    });
                  }
                } catch {
                  setMessage({
                    type: 'error',
                    text: `Sync Inactive — Master Server (${host}) returned status ${res.status}`
                  });
                }
              } else {
                setMessage({
                  type: 'error',
                  text: `Sync Inactive — Master Server (${host}) returned status ${res.status}`
                });
              }
            } catch {
              if (syncMode === 'HYBRID') {
                try {
                  const cloudRes = await fetch(`${defaultCloud}/health`, { method: 'GET', signal: AbortSignal.timeout(3500) });
                  if (cloudRes.ok) {
                    setMessage({
                      type: 'success',
                      text: `Cloud Sync Active (Hybrid Fallback) — LAN Master Server (${host}) unreachable. Automatically syncing via Cloud API!`
                    });
                  } else {
                    setMessage({
                      type: 'error',
                      text: `Sync Inactive — Could not connect to Master Server at ${host}:${port} or Cloud API. Operating offline.`
                    });
                  }
                } catch {
                  setMessage({
                    type: 'error',
                    text: `Sync Inactive — Could not connect to Master Server at ${host}:${port}. Ensure PC 1 is on, POS is open & Windows Firewall allows Port 3888.`
                  });
                }
              } else {
                setMessage({
                  type: 'error',
                  text: `Sync Inactive — Could not connect to Master Server at ${host}:${port}. Ensure PC 1 is on, POS is open & Windows Firewall allows Port 3888.`
                });
              }
            }
          }
        } else {
          try {
            const res = await fetch(`${defaultCloud}/health`, { method: 'GET', signal: AbortSignal.timeout(3500) });
            if (res.ok) {
              setMessage({
                type: 'success',
                text: `Cloud Sync Active — Connected to Cloud API server`
              });
            } else {
              setMessage({
                type: 'error',
                text: `Sync Inactive — Could not reach Cloud API server (${defaultCloud}). Operating in Offline Mode.`
              });
            }
          } catch {
            setMessage({
              type: 'error',
              text: `Sync Inactive — Could not reach Cloud API server (${defaultCloud}). Operating in Offline Mode.`
            });
          }
        }
      }
    } finally {
      setTestingNetwork(false);
      setTimeout(() => setMessage(null), 5000);
    }
  };

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
    billSettings: overrides.billSettings !== undefined ? overrides.billSettings : billSettings,
    scrapBillSettings: overrides.scrapBillSettings !== undefined ? overrides.scrapBillSettings : scrapBillSettings,
    gstProfitPercentage: overrides.gstProfitPercentage !== undefined ? overrides.gstProfitPercentage : gstProfitPercentage,
    returnPrefix: overrides.returnPrefix !== undefined ? overrides.returnPrefix : returnPrefix,
    returnStartNumber: overrides.returnStartNumber !== undefined ? overrides.returnStartNumber : returnStartNumber,
    scrapPrefix: overrides.scrapPrefix !== undefined ? overrides.scrapPrefix : scrapPrefix,
    scrapStartNumber: overrides.scrapStartNumber !== undefined ? overrides.scrapStartNumber : scrapStartNumber,
    quotationPrefix: overrides.quotationPrefix !== undefined ? overrides.quotationPrefix : quotationPrefix,
    quotationStartNumber: overrides.quotationStartNumber !== undefined ? overrides.quotationStartNumber : quotationStartNumber,
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
    enableConvertToGst: overrides.enableConvertToGst !== undefined ? overrides.enableConvertToGst : enableConvertToGst,
    billingUIConfig: JSON.stringify(overrides.billingUIConfig !== undefined ? overrides.billingUIConfig : billingUIConfig),
    features: JSON.stringify(overrides.featureFlags !== undefined ? overrides.featureFlags : featureFlags)
  });

  const getSettingsSnapshot = () => buildSettingsSnapshot();

  const hasChanges = useMemo(() => {
    if (!initialSnapshot.current) return false;
    return getSettingsSnapshot() !== initialSnapshot.current;
  }, [barcodePrinter, receiptPrinter, a4Printer, scale, priceCoding, shopGstin, shopState, shopNameLocal, shopAddress, shopPhone, shopEmail, shopWebsite, storeTimezone, upiId, showUpiQr, bankName, bankAccount, bankIfsc, bankBranch, showProductOffers, showPriceOverrideMrp, openCashDrawerOnPending, autoOpenCashDrawer, defaultOpeningBalance, receiptFont, printFormat, a5Orientation, printWidth, thermalStyle, a4Style, terminalCode, invoiceStartNumber, enableThreeInvoiceSeries, b2bPrefix, b2bStartNumber, b2cPrefix, b2cStartNumber, labelCodeType, labelShowShopName, enableScrap, showCashRegister, autoPrintBarcode, loyaltyEnabled, loyaltyEarningRate, loyaltyRedemptionRate, billSettings, scrapBillSettings, gstProfitPercentage, returnPrefix, returnStartNumber, scrapPrefix, scrapStartNumber, quotationPrefix, quotationStartNumber, stockReportDefaultView, inventoryDefaultView, serviceChargeBarcode, timeFormat, syncMode, lanRole, lanHostIp, lanPort, syncFrequency, featureFlags, enablePartyGst, enablePartyEstimate, enableRealPaperStock, enableConvertToGst, billingUIConfig, saveRevision]);

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
    if (!window.electronAPI) return;
    if (window.electronAPI.onUpdateStatus) {
      window.electronAPI.onUpdateStatus((status: string) => {
        if (status === 'ready-to-install') { setUpdateReady(true); setIsDownloading(false); setDownloadProgress(null); setUpdateStatus('Update ready to install'); }
        else if (status === 'update-available') { setUpdateStatus('Update available'); }
        else if (status === 'error') { setIsDownloading(false); setUpdateStatus('Download failed'); }
        else { setUpdateStatus(status); }
      });
    }
    if (window.electronAPI.onUpdateProgress) {
      window.electronAPI.onUpdateProgress((progress) => { setDownloadProgress(progress); });
    }
    if (window.electronAPI.onUpdateInfo) {
      window.electronAPI.onUpdateInfo((info: any) => {
        if (info) {
          setUpdateInfo({ version: info.version, releaseDate: info.releaseDate, releaseNotes: info.releaseNotes });
          setIsDownloading(true);
          setUpdateStatus('Downloading...');
          window.electronAPI!.appDownloadUpdate().then((res: any) => {
            if (!res.success) { setIsDownloading(false); setUpdateStatus('Download failed'); }
          });
        }
      });
    }
    window.electronAPI.appCheckForUpdates().then(() => setLastChecked(new Date())).catch(() => {});
  }, []);

  const loadSettings = async () => {
    window.electronAPI?.logError?.('[SettingsManager] loadSettings STARTED');
    if (!window.electronAPI) {
      setLoading(false);
      return;
    }
    try {
      const { tenantId } = useAuthStore.getState();
      const currentTenant = tenantId || 'global';
      window.electronAPI?.logError?.(`[SettingsManager] tenantId: ${currentTenant}`);

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
      if (typeof window.electronAPI.settingsGetAll === 'function') {
        try {
          allSettings = await window.electronAPI.settingsGetAll({ tenant_id: currentTenant }) || {};
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
          'loyalty_config', 'label_show_shop_name', 'stock_report_default_view', 'inventory_default_view',
          'time_format', 'store_timezone', 'gst_profit_percentage', 'feature_flags',
          'enable_party_gst_balance', 'enable_party_estimate_balance',
          'enable_real_paper_stock', 'enable_convert_to_gst', 'billing_ui_config',
          'terminal_code', 'invoice_counter_config', 'return_counter', 'scrap_invoice_counter',
          'quotation_counter', 'three_invoice_series', 'dual_invoice_series'
        ];
        const globalOnlyKeys = new Set([
          'terminal_code', 'invoice_counter_config', 'return_counter',
          'scrap_invoice_counter', 'quotation_counter', 'three_invoice_series', 'dual_invoice_series'
        ]);

        const results = await Promise.allSettled(
          keysToFetch.map(key =>
            window.electronAPI!.settingsGet({
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
          const flags = await loadFeatureFlags(currentTenant);
          finalFlags = sanitizeFeatureFlags({ ...flags });
          if (wereFeatureFlagsStored()) {
            finalScrap = finalFlags.scrap;
            finalCashReg = finalFlags.cash_register;
          }
        } catch {}
      }

      let finalAutoBarcode = true;
      const autoBarcode = allSettings['auto_print_barcode'];
      if (autoBarcode !== null && autoBarcode !== undefined) finalAutoBarcode = Boolean(autoBarcode);

      let finalLoyaltyEnabled = false;
      let finalLoyaltyEarningRate = 100;
      let finalLoyaltyRedemptionRate = 1;
      const loyaltyCfg = allSettings['loyalty_config'];
      if (loyaltyCfg && typeof loyaltyCfg === 'object') {
        finalLoyaltyEnabled = Boolean(loyaltyCfg.enabled);
        if (loyaltyCfg.earningRate) finalLoyaltyEarningRate = Number(loyaltyCfg.earningRate) || 100;
        if (loyaltyCfg.redemptionRate) finalLoyaltyRedemptionRate = Number(loyaltyCfg.redemptionRate) || 1;
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
        if (printFmt.scrapBillSettings) finalScrapBillSettings = { ...DEFAULT_BILL_SETTINGS, ...printFmt.scrapBillSettings };
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
        window.electronAPI.settingsSet({ tenant_id: 'global', key: 'terminal_code', value: termCode }).catch(() => {});
      }
      const finalTermCode = termCode;

      let finalInvoiceStart: number | string = 1;
      const invCfg = allSettings['invoice_counter_config'];
      if (invCfg && invCfg.counter) finalInvoiceStart = invCfg.counter;

      let finalGstProfit = 30;
      const gstProfitPct = allSettings['gst_profit_percentage'];
      if (gstProfitPct !== null && gstProfitPct !== undefined) finalGstProfit = Number(gstProfitPct) || 30;

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
      setFeatureFlags(finalFlags);
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
      setAutoPrintBarcode(finalAutoBarcode);
      setLoyaltyEnabled(finalLoyaltyEnabled);
      setLoyaltyEarningRate(finalLoyaltyEarningRate);
      setLoyaltyRedemptionRate(finalLoyaltyRedemptionRate);
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
      setReturnPrefix(finalReturnPrefix);
      setReturnStartNumber(finalReturnStart);
      setScrapPrefix(finalScrapPrefix);
      setScrapStartNumber(finalScrapStart);
      setQuotationPrefix(finalQuotationPrefix);
      setQuotationStartNumber(finalQuotationStart);
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
      let finalPartyGst = pGst !== null && pGst !== undefined ? Boolean(pGst) : true;
      let finalPartyEst = pEst !== null && pEst !== undefined ? Boolean(pEst) : true;
      if (!finalPartyGst && !finalPartyEst) finalPartyGst = true;
      setEnablePartyGst(finalPartyGst);
      setEnablePartyEstimate(finalPartyEst);

      const realPaperVal = allSettings['enable_real_paper_stock'];
      const finalRealPaper = realPaperVal !== null && realPaperVal !== undefined ? Boolean(realPaperVal) : true;
      setEnableRealPaperStock(finalRealPaper);

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
        billSettings: finalBillSettings,
        scrapBillSettings: finalScrapBillSettings,
        gstProfitPercentage: finalGstProfit,
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
        featureFlags: finalFlags
      });

      // Settings loaded: dismiss skeleton loader immediately (<30ms)
      setLoading(false);
      window.electronAPI?.logError?.('[SettingsManager] loadSettings COMPLETED SUCCESS');

      // 2. Non-blocking asynchronous background jobs: Printers, Version, Service Charge Item
      // A. Printers (Windows Print Spooler enumeration can take several seconds - do NOT block UI)
      window.electronAPI.getPrinters().then((pr: any) => {
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
      }).catch((err: any) => console.error('[SettingsManager] Failed to get printers in background', err));

      // B. App Version
      window.electronAPI.appGetVersion().then((v: string) => {
        if (v) setAppVersion(`v${v}`);
      }).catch(() => {});

      // C. Service Charge Product & Barcode
      window.electronAPI.dbEnsureServiceItem({ tenant_id: currentTenant })
        .then(() => window.electronAPI.dbGetProducts({ tenant_id: currentTenant, search: 'Service Charge' }))
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
      window.electronAPI?.logError?.('[SettingsManager] ERROR in loadSettings: ' + (err?.message || String(err)));
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!window.electronAPI) return;
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
        receiptWidthCm: Number(receiptPrinter.receiptWidthCm) || 5.8
      };

      // User-entered starting numbers take priority — do NOT use Math.max() here,
      // as that would prevent users from lowering counters (the reported bug).
      // We use the user's input directly; only fall back to 1 if nothing was entered.
      const finalInvCounter = Number(invoiceStartNumber) || 1;
      const finalReturnCounter = Number(returnStartNumber) || 1;
      const finalScrapCounter = Number(scrapStartNumber) || 1;
      const finalQuotationCounter = Number(quotationStartNumber) || 1;
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

      const sanitizedFlags = sanitizeFeatureFlags(featureFlags);

      const checks: { promise: Promise<any>; name: string }[] = [
        { promise: window.electronAPI.settingsSet({ tenant_id: tenantId || 'global', key: 'enable_party_gst_balance', value: enablePartyGst }), name: 'party_gst' },
        { promise: window.electronAPI.settingsSet({ tenant_id: tenantId || 'global', key: 'enable_party_estimate_balance', value: enablePartyEstimate }), name: 'party_estimate' },
        { promise: window.electronAPI.settingsSet({ tenant_id: tenantId || 'global', key: 'barcode_printer_config', value: formattedBarcodePrinter }), name: 'barcode' },
        { promise: window.electronAPI.settingsSet({ tenant_id: tenantId || 'global', key: 'receipt_printer_config', value: formattedReceiptPrinter }), name: 'receipt' },
        { promise: window.electronAPI.settingsSet({ tenant_id: tenantId || 'global', key: 'a4_printer_config', value: a4Printer }), name: 'a4' },
        { promise: window.electronAPI.settingsSet({ tenant_id: tenantId || 'global', key: 'scale_config', value: scale }), name: 'scale' },
        { promise: window.electronAPI.settingsSet({ tenant_id: tenantId || 'global', key: 'price_coding', value: priceCoding }), name: 'price_coding' },
        { promise: window.electronAPI.settingsSet({ tenant_id: tenantId || 'global', key: 'shop_gstin', value: shopGstin }), name: 'gstin' },
        { promise: window.electronAPI.settingsSet({ tenant_id: tenantId || 'global', key: 'shop_state', value: shopState }), name: 'state' },
        { promise: window.electronAPI.settingsSet({ tenant_id: tenantId || 'global', key: 'shop_name', value: shopNameLocal }), name: 'name' },
        ...(tenantId && tenantId !== 'global' ? [
          { promise: window.electronAPI.settingsSet({ tenant_id: 'global', key: 'shop_name', value: shopNameLocal }), name: 'name_global' },
          { promise: window.electronAPI.settingsSet({ tenant_id: 'global', key: 'shop_address', value: shopAddress }), name: 'address_global' },
          { promise: window.electronAPI.settingsSet({ tenant_id: 'global', key: 'shop_phone', value: shopPhone }), name: 'phone_global' },
          { promise: window.electronAPI.settingsSet({ tenant_id: 'global', key: 'shop_email', value: shopEmail }), name: 'email_global' },
          { promise: window.electronAPI.settingsSet({ tenant_id: 'global', key: 'shop_website', value: shopWebsite }), name: 'website_global' },
          { promise: window.electronAPI.settingsSet({ tenant_id: 'global', key: 'shop_gstin', value: shopGstin }), name: 'gstin_global' },
          { promise: window.electronAPI.settingsSet({ tenant_id: 'global', key: 'shop_state', value: shopState }), name: 'state_global' },
        ] : []),
        { promise: window.electronAPI.settingsSet({ tenant_id: tenantId || 'global', key: 'shop_address', value: shopAddress }), name: 'address' },
        { promise: window.electronAPI.settingsSet({ tenant_id: tenantId || 'global', key: 'shop_phone', value: shopPhone }), name: 'phone' },
        { promise: window.electronAPI.settingsSet({ tenant_id: tenantId || 'global', key: 'shop_email', value: shopEmail }), name: 'email' },
        { promise: window.electronAPI.settingsSet({ tenant_id: tenantId || 'global', key: 'shop_website', value: shopWebsite }), name: 'website' },
        { promise: window.electronAPI.settingsSet({ tenant_id: tenantId || 'global', key: 'upi_id', value: upiId }), name: 'upi' },
        { promise: window.electronAPI.settingsSet({ tenant_id: tenantId || 'global', key: 'show_upi_qr', value: showUpiQr }), name: 'qr' },
        { promise: window.electronAPI.settingsSet({ tenant_id: tenantId || 'global', key: 'bank_name', value: bankName }), name: 'bank_name' },
        { promise: window.electronAPI.settingsSet({ tenant_id: tenantId || 'global', key: 'bank_account_number', value: bankAccount }), name: 'bank_account_number' },
        { promise: window.electronAPI.settingsSet({ tenant_id: tenantId || 'global', key: 'bank_ifsc', value: bankIfsc }), name: 'bank_ifsc' },
        { promise: window.electronAPI.settingsSet({ tenant_id: tenantId || 'global', key: 'bank_branch', value: bankBranch }), name: 'bank_branch' },
        { promise: window.electronAPI.settingsSet({ tenant_id: tenantId || 'global', key: 'enable_scrap', value: Boolean(sanitizedFlags.scrap) }), name: 'enable_scrap' },
        { promise: window.electronAPI.settingsSet({ tenant_id: tenantId || 'global', key: 'show_cash_register', value: sanitizedFlags.cash_register }), name: 'show_cash_register' },
        { promise: window.electronAPI.settingsSet({ tenant_id: tenantId || 'global', key: 'feature_flags', value: { ...sanitizedFlags } }), name: 'feature_flags' },
        { promise: window.electronAPI.settingsSet({ tenant_id: tenantId || 'global', key: 'auto_print_barcode', value: autoPrintBarcode }), name: 'auto_print_barcode' },
        { promise: window.electronAPI.settingsSet({ tenant_id: tenantId || 'global', key: 'gst_profit_percentage', value: gstProfitPercentage }), name: 'gst_profit_percentage' },
        { promise: window.electronAPI.settingsSet({ tenant_id: tenantId || 'global', key: 'loyalty_config', value: { enabled: loyaltyEnabled, earningRate: Number(loyaltyEarningRate) || 100, redemptionRate: Number(loyaltyRedemptionRate) || 1 } }), name: 'loyalty_config' },
        { promise: window.electronAPI.settingsSet({ tenant_id: tenantId || 'global', key: 'label_code_type', value: labelCodeType }), name: 'label_code_type' },
        { promise: window.electronAPI.settingsSet({ tenant_id: tenantId || 'global', key: 'label_show_shop_name', value: labelShowShopName }), name: 'label_show_shop_name' },
        { promise: window.electronAPI.settingsSet({ tenant_id: tenantId || 'global', key: 'auto_open_cash_drawer', value: autoOpenCashDrawer }), name: 'auto_open_cash_drawer' },
        { promise: window.electronAPI.settingsSet({ tenant_id: tenantId || 'global', key: 'default_opening_balance', value: defaultOpeningBalance === '' ? 0 : (Number(defaultOpeningBalance) || 0) }), name: 'default_opening_balance' },
        { promise: window.electronAPI.settingsSet({ tenant_id: tenantId || 'global', key: 'print_format', value: { format: printFormat, width: printWidth, thermalStyle, a4Style, style: printFormat === 'thermal' ? thermalStyle : (printFormat === 'a4' ? a4Style : 'half-a4'), a5Orientation, showProductOffers, showPriceOverrideMrp, openCashDrawerOnPending, receiptFont, billSettings, scrapBillSettings } }), name: 'print_format' },
        { promise: window.electronAPI.settingsSet({ tenant_id: 'global', key: 'terminal_code', value: cleanCode }), name: 'terminal_code' },
        { promise: window.electronAPI.settingsSet({ tenant_id: 'global', key: 'invoice_counter_config', value: { prefix: `${cleanCode}-`, counter: finalInvCounter } }), name: 'invoice' },
        { promise: window.electronAPI.settingsSet({ tenant_id: 'global', key: 'return_counter', value: { prefix: `${computedReturnPrefix}-`, counter: finalReturnCounter } }), name: 'return_counter' },
        { promise: window.electronAPI.settingsSet({ tenant_id: 'global', key: 'scrap_invoice_counter', value: { prefix: `${computedScrapPrefix}-`, counter: finalScrapCounter } }), name: 'scrap_invoice_counter' },
        { promise: window.electronAPI.settingsSet({ tenant_id: 'global', key: 'quotation_counter', value: { prefix: `${computedQuotationPrefix}-`, counter: finalQuotationCounter } }), name: 'quotation_counter' },
        { promise: window.electronAPI.settingsSet({ tenant_id: 'global', key: 'three_invoice_series', value: { enabled: enableThreeInvoiceSeries, b2bPrefix: enableThreeInvoiceSeries ? b2bPrefix : '', b2bStartNumber: enableThreeInvoiceSeries ? finalB2bCounter : 1, b2cPrefix: enableThreeInvoiceSeries ? b2cPrefix : '', b2cStartNumber: enableThreeInvoiceSeries ? finalB2cCounter : 1 } }), name: 'three_invoice_series' },
        ...(enableThreeInvoiceSeries ? [
          { promise: window.electronAPI.settingsSet({ tenant_id: 'global', key: 'gst_b2b_invoice_counter_config', value: { prefix: `${b2bPrefix}-`, counter: finalB2bCounter } }), name: 'gst_b2b_invoice' },
          { promise: window.electronAPI.settingsSet({ tenant_id: 'global', key: 'gst_b2c_invoice_counter_config', value: { prefix: `${b2cPrefix}-`, counter: finalB2cCounter } }), name: 'gst_b2c_invoice' },
        ] : []),
        { promise: window.electronAPI.settingsSet({ tenant_id: tenantId || 'global', key: 'stock_report_default_view', value: stockReportDefaultView }), name: 'stock_report_default_view' },
        { promise: window.electronAPI.settingsSet({ tenant_id: tenantId || 'global', key: 'inventory_default_view', value: inventoryDefaultView }), name: 'inventory_default_view' },
        { promise: window.electronAPI.settingsSet({ tenant_id: tenantId || 'global', key: 'time_format', value: timeFormat }), name: 'time_format' },
        { promise: window.electronAPI.settingsSet({ tenant_id: tenantId || 'global', key: 'enable_party_gst_balance', value: enablePartyGst }), name: 'enable_party_gst_balance' },
        { promise: window.electronAPI.settingsSet({ tenant_id: tenantId || 'global', key: 'enable_party_estimate_balance', value: enablePartyEstimate }), name: 'enable_party_estimate_balance' },
        { promise: window.electronAPI.settingsSet({ tenant_id: tenantId || 'global', key: 'enable_real_paper_stock', value: enableRealPaperStock }), name: 'enable_real_paper_stock' },
        { promise: window.electronAPI.settingsSet({ tenant_id: tenantId || 'global', key: 'enable_convert_to_gst', value: enableConvertToGst }), name: 'enable_convert_to_gst' },
        { promise: window.electronAPI.settingsSet({ tenant_id: tenantId || 'global', key: 'billing_ui_config', value: billingUIConfig }), name: 'billing_ui_config' },
        { promise: window.electronAPI.settingsSet({ tenant_id: tenantId || 'global', key: 'network_sync_config', value: { syncMode, lanRole, lanHostIp, lanPort: Number(lanPort) || 3888, syncFrequency } }), name: 'network_sync_config' },
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
        const updateRes = await window.electronAPI.dbUpdateProduct(updatedProduct);
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
      for (const def of FEATURE_LIST) setFeatureFlag(def.key, featureFlags[def.key]);
      setEnableScrap(Boolean(featureFlags.scrap));
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
        enableScrap: Boolean(featureFlags.scrap),
        showCashRegister: featureFlags.cash_register,
        autoPrintBarcode,
        loyaltyEnabled,
        loyaltyEarningRate: Number(loyaltyEarningRate) || 100,
        loyaltyRedemptionRate: Number(loyaltyRedemptionRate) || 1,
        billSettings,
        scrapBillSettings,
        gstProfitPercentage,
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

  const handleInstallUpdate = () => { setUpdateStatus('Restarting to install update...'); window.electronAPI?.appInstallUpdate(); };

  const handleRetryDownload = () => {
    if (!window.electronAPI) return;
    setUpdateStatus(null);
    setUpdateInfo(null);
    setIsDownloading(false);
    setDownloadProgress(null);
    setUpdateReady(false);
    window.electronAPI.appCheckForUpdates().then(() => setLastChecked(new Date())).catch(() => {});
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
    const productTabs = [
      { id: 'coding', label: 'Price Coding', icon: Key, ownerOnly: true },
      { id: 'bulk', label: 'Bulk Import', icon: Upload, ownerOnly: true },
    ].filter(t => !t.ownerOnly || isAdminRole(role));

    switch (sectionId) {
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
      case 'store':
        return (
          <div className="space-y-6 animate-in fade-in duration-300">
            {/* Card 0: Nafid Connect Code Card */}
            <div className="bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-pink-500/10 border border-indigo-500/30 rounded-[28px] p-6 md:p-8 shadow-sm">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-4">
                  <div className="p-3.5 rounded-2xl bg-indigo-600 text-white shadow-lg shadow-indigo-500/30 shrink-0">
                    <QrCode className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest">Nafid Connect Code</span>
                      <span className="text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 px-2.5 py-0.5 rounded-full">Peer Sync Active</span>
                    </div>
                    <h3 className="text-2xl font-black font-mono tracking-wider text-foreground mt-1">
                      {connectCode || 'Loading...'}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      Share this unique code with counterparty shops or customers to link ledgers & auto-sync transactions in real time.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (connectCode) {
                      navigator.clipboard.writeText(connectCode);
                      setCopiedCode(true);
                      setTimeout(() => setCopiedCode(false), 2000);
                    }
                  }}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl transition-all shadow-md active:scale-95 cursor-pointer flex items-center gap-2 shrink-0"
                >
                  {copiedCode ? <Check className="w-4 h-4 text-emerald-300" /> : <Copy className="w-4 h-4" />}
                  {copiedCode ? 'Copied to Clipboard!' : 'Copy Connect Code'}
                </button>
              </div>
            </div>

            {/* Card 1: Shop Profile */}
            <div className="bg-card border border-border rounded-[28px] p-6 md:p-8 shadow-sm hover:shadow-md hover:border-primary/20 transition-all duration-300">
              <div className="flex items-center gap-3 mb-6 pb-4 border-b border-border">
                <div className="p-2.5 rounded-2xl bg-primary/10 text-primary shadow-[0_4px_12px_rgba(79,70,229,0.1)] dark:shadow-[0_4px_12px_rgba(79,70,229,0.05)] shrink-0">
                  <Building className="w-4.5 h-4.5" />
                </div>
                <span className="text-xs font-black text-foreground uppercase tracking-widest">Shop Details</span>
              </div>
              <div className="grid grid-cols-2 gap-5">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider mb-1.5 block">Shop Name</label>
                  <Input type="text" value={shopNameLocal} onChange={(e) => setShopNameLocal(e.target.value)} placeholder="Your business name" className="font-semibold bg-background/50 focus:bg-background border-border/80 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all rounded-xl py-2.5" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider mb-1.5 block">Phone Number</label>
                  <Input type="text" value={shopPhone} onChange={(e) => setShopPhone(e.target.value)} placeholder="e.g. +91 98765 43210" className="bg-background/50 focus:bg-background border-border/80 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all rounded-xl py-2.5" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider mb-1.5 block">Email Address (E-Mail)</label>
                  <Input type="email" value={shopEmail} onChange={(e) => setShopEmail(e.target.value)} placeholder="e.g. info@business.com" className="bg-background/50 focus:bg-background border-border/80 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all rounded-xl py-2.5" />
                </div>
                <div className="space-y-2 col-span-2">
                  <label className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider mb-1.5 block">Website URL (Web)</label>
                  <Input type="text" value={shopWebsite} onChange={(e) => setShopWebsite(e.target.value)} placeholder="e.g. www.business.com" className="bg-background/50 focus:bg-background border-border/80 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all rounded-xl py-2.5" />
                </div>
                <div className="col-span-2 space-y-2">
                  <label className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider mb-1.5 block">Shop Address</label>
                  <textarea value={shopAddress} onChange={(e) => setShopAddress(e.target.value)} placeholder="Enter your business address..." rows={3} className="w-full bg-background/50 border border-border/80 rounded-xl px-4 py-3 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 focus:bg-background transition-all resize-none text-sm font-medium" />
                </div>
                <div className="col-span-2 space-y-2">
                  <label className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider mb-1.5 block flex items-center justify-between">
                    <span>Store Location & Timezone</span>
                    <span className="text-[9px] font-bold text-primary bg-primary/10 px-2.5 py-0.5 rounded-full">UTC + Store Timezone Standard</span>
                  </label>
                  <Select
                    value={storeTimezone}
                    onChange={(val) => {
                      setStoreTimezoneState(val);
                      setStoreTimezone(val);
                    }}
                    options={SUPPORTED_TIMEZONES}
                  />
                  <p className="text-[10px] text-muted-foreground/75 mt-1">
                    Store business dates, cashier settlement, receipts, and daily sales reports are formatted based on this store timezone. Remote owners viewing from other countries will see reports calculated for this store timezone.
                  </p>
                </div>
                <div className="col-span-2 space-y-2">
                  <label className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider mb-1.5 block flex items-center justify-between">
                    <span>UPI ID</span>
                    <span className="text-[9px] font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded-full lowercase">Shown on receipts</span>
                  </label>
                  <div className="relative">
                    <Smartphone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-muted-foreground/50" />
                    <Input type="text" value={upiId} onChange={(e) => setUpiId(e.target.value)} placeholder="e.g. shopname@upi" className="pl-11 font-mono font-semibold bg-background/50 focus:bg-background border-border/80 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all rounded-xl py-2.5" />
                  </div>
                  <p className="text-[10px] text-muted-foreground/70 mt-1">This UPI ID will appear on printed receipts for customer payments.</p>
                </div>
                <div className="col-span-2 flex items-center justify-between gap-4 p-4.5 bg-muted/30 border border-border rounded-2xl hover:border-primary/20 transition-all duration-300">
                  <div className="flex-1">
                    <label className="text-xs font-bold text-foreground cursor-pointer select-none" onClick={() => setShowUpiQr(!showUpiQr)}>Show UPI QR Code on Receipt</label>
                    <p className="text-[10px] text-muted-foreground/75 mt-0.5">When enabled, a QR code with the bill amount pre-filled will appear on printed receipts.</p>
                  </div>
                  <button type="button" onClick={() => setShowUpiQr(!showUpiQr)} className={clsx('relative w-11 h-6 rounded-full transition-all duration-300 shrink-0 cursor-pointer', showUpiQr ? 'bg-primary shadow-[0_2px_8px_rgba(79,70,229,0.3)]' : 'bg-muted-foreground/20')}>
                    <span className={clsx('absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all duration-300', showUpiQr ? 'translate-x-5' : 'translate-x-0')} />
                  </button>
                </div>

              </div>
            </div>

            {/* Card 2: GST & Taxation */}
            <div className="bg-card border border-border rounded-[28px] p-6 md:p-8 shadow-sm hover:shadow-md hover:border-emerald-500/20 transition-all duration-300">
              <div className="flex items-center gap-3 mb-6 pb-4 border-b border-border">
                <div className="p-2.5 rounded-2xl bg-emerald-500/10 text-emerald-600 shadow-[0_4px_12px_rgba(16,185,129,0.1)] dark:shadow-[0_4px_12px_rgba(16,185,129,0.05)] shrink-0">
                  <Building className="w-4.5 h-4.5" />
                </div>
                <span className="text-xs font-black text-emerald-600 uppercase tracking-widest">GST &amp; Taxation</span>
              </div>
              <div className="space-y-5">
                <div className="grid grid-cols-2 gap-5">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider mb-1.5 block">Shop GSTIN</label>
                    <Input type="text" maxLength={15} value={shopGstin} onChange={(e) => setShopGstin(e.target.value.toUpperCase())} placeholder="e.g. 27AAAAA1111A1Z1" className="uppercase font-semibold font-mono bg-background/50 focus:bg-background border-border/80 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all rounded-xl py-2.5" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider mb-1.5 block">State (Place of Business)</label>
                    <Select value={shopState} onChange={setShopState} options={INDIAN_STATES.map(s => ({value:s.code,label:s.name+' ('+s.code+')'}))} />
                  </div>
                </div>
                <div className="rounded-2xl border border-border p-5 space-y-4 bg-muted/30">
                  <div className="flex items-center gap-2.5 pb-2.5 border-b border-border">
                    <TrendingUp className="w-4 h-4 text-emerald-600" />
                    <span className="text-xs font-bold text-foreground">Bill of Supply â†’ GST Conversion</span>
                  </div>
                  <div className="grid grid-cols-2 gap-5">
                    <div className="space-y-2 col-span-2">
                      <label className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider mb-1">
                        Profit Percentage Margin
                      </label>
                      <div className="flex items-center gap-3">
                        <div className="relative flex-1">
                          <input type="number" min="0" max="999" value={gstProfitPercentage}
                            onChange={e => setGstProfitPercentage(e.target.value === '' ? 0 : Number(e.target.value))}
                            className="w-full bg-background border border-border/80 rounded-xl px-3 py-2 text-foreground focus:border-primary focus:ring-4 focus:ring-primary/10 focus:outline-none transition-all text-sm font-bold font-mono" />
                          <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">%</span>
                        </div>
                      </div>
                      <p className="text-[10px] text-muted-foreground/70 mt-1">GST sale price = GST purchase price + this % margin. Used when converting Bill of Supply invoices to GST Invoices.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Card 2.5: Bank Account Details */}
            <div className="bg-card border border-border rounded-[28px] p-6 md:p-8 shadow-sm hover:shadow-md hover:border-indigo-500/20 transition-all duration-300">
              <div className="flex items-center gap-3 mb-6 pb-4 border-b border-border">
                <div className="p-2.5 rounded-2xl bg-indigo-500/10 text-indigo-500 shadow-[0_4px_12px_rgba(99,102,241,0.1)] dark:shadow-[0_4px_12px_rgba(99,102,241,0.05)] shrink-0">
                  <Landmark className="w-4.5 h-4.5" />
                </div>
                <span className="text-xs font-black text-indigo-500 uppercase tracking-widest">Bank Account Details</span>
              </div>
              <div className="space-y-5">
                <div className="grid grid-cols-2 gap-5">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider mb-1.5 block">Bank Name</label>
                    <Input type="text" value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="e.g. ICICI Bank / State Bank of India" className="font-semibold bg-background/50 focus:bg-background border-border/80 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all rounded-xl py-2.5" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider mb-1.5 block">Account Number</label>
                    <Input type="text" value={bankAccount} onChange={(e) => setBankAccount(e.target.value)} placeholder="e.g. 5010023456789" className="font-mono font-semibold bg-background/50 focus:bg-background border-border/80 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all rounded-xl py-2.5" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-5">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider mb-1.5 block">IFSC Code</label>
                    <Input type="text" value={bankIfsc} onChange={(e) => setBankIfsc(e.target.value.toUpperCase())} placeholder="e.g. ICIC0001234" className="uppercase font-mono font-semibold bg-background/50 focus:bg-background border-border/80 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all rounded-xl py-2.5" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider mb-1.5 block">Branch</label>
                    <Input type="text" value={bankBranch} onChange={(e) => setBankBranch(e.target.value)} placeholder="e.g. Main Branch, MG Road" className="font-semibold bg-background/50 focus:bg-background border-border/80 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all rounded-xl py-2.5" />
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground/70 mt-1">Bank details are printed on tax invoices and A4 GST bills for customer wire transfers.</p>
              </div>
            </div>

            {/* Card 3: Invoice Counter & Series */}
            <div className="bg-card border border-border rounded-[28px] p-6 md:p-8 shadow-sm hover:shadow-md hover:border-blue-500/20 transition-all duration-300">
              <div className="flex items-center gap-3 mb-6 pb-4 border-b border-border">
                <div className="p-2.5 rounded-2xl bg-blue-500/10 text-blue-500 shadow-[0_4px_12px_rgba(59,130,246,0.1)] dark:shadow-[0_4px_12px_rgba(59,130,246,0.05)] shrink-0">
                  <Receipt className="w-4.5 h-4.5" />
                </div>
                <span className="text-xs font-black text-blue-500 uppercase tracking-widest">Invoice Counters</span>
                <div className="ml-auto flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/60 border border-border/50 text-[10px] font-mono font-bold text-foreground">
                  <span>{terminalCode || 'POS1'}-{String(Number(invoiceStartNumber) || 1).padStart(3, '0')}</span>
                  <span className="text-[9px] text-muted-foreground font-semibold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0">NEXT</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-5">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider mb-1.5 block flex items-center justify-between">
                    <span>Terminal Code</span>
                    <span className="text-[8px] font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full">Per computer</span>
                  </label>
                  <Input type="text" value={terminalCode} onChange={(e) => {
                    const newCode = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
                    setTerminalCode(newCode);
                    if (newCode) {
                      setScrapPrefix(`${newCode}-SCR`);
                      setQuotationPrefix(`${newCode}-QTN`);
                      setReturnPrefix(`${newCode}-RTN`);
                    }
                  }} placeholder="Auto-generated" className="font-mono font-bold uppercase tracking-wider bg-background/50 focus:bg-background border-border/80 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all rounded-xl py-2.5" maxLength={6} />
                  <p className="text-[10px] text-muted-foreground/70 mt-1">Format: <span className="font-mono text-foreground/80">{terminalCode || 'POS1'}-XXX</span></p>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider mb-1.5 block">Starting Number</label>
                  <Input type="number" min="1" value={invoiceStartNumber} onChange={(e) => setInvoiceStartNumber(e.target.value === '' ? '' : Number(e.target.value))} placeholder="e.g. 1" className="font-mono font-bold bg-background/50 focus:bg-background border-border/80 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all rounded-xl py-2.5" />
                </div>
              </div>

              {/* 3 Invoice Series Block */}
              <div className="mt-6 border-t border-border/40 pt-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-xs font-black text-purple-500 uppercase tracking-widest">3 Invoice Series</span>
                    <p className="text-[10px] text-muted-foreground/75 mt-0.5">Separate counters for B2B &amp; B2C GST invoices</p>
                  </div>
                  <button type="button" onClick={() => setEnableThreeInvoiceSeries(!enableThreeInvoiceSeries)} className={clsx('relative w-11 h-6 rounded-full transition-all duration-300 shrink-0 cursor-pointer', enableThreeInvoiceSeries ? 'bg-purple-500 shadow-[0_2px_8px_rgba(168,85,247,0.3)]' : 'bg-muted-foreground/20')}>
                    <span className={clsx('absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all duration-300', enableThreeInvoiceSeries ? 'translate-x-5' : 'translate-x-0')} />
                  </button>
                </div>

                {enableThreeInvoiceSeries && (
                  <div className="space-y-4 pt-2">
                    <div className="rounded-2xl border border-blue-500/25 bg-blue-500/[0.03] p-5 space-y-4">
                      <div className="flex items-center justify-between">
                        <h5 className="text-xs font-black text-blue-600 dark:text-blue-400 uppercase tracking-widest flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                          GST B2B Invoice Series
                        </h5>
                        <span className="text-[10px] font-mono font-bold text-foreground bg-background border border-border px-2 py-0.5 rounded-lg">{b2bPrefix || 'B2B'}-{String(Number(b2bStartNumber) || 1).padStart(3, '0')}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider">Prefix</label>
                          <Input type="text" value={b2bPrefix} onChange={(e) => setB2bPrefix(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))} className="font-mono font-bold uppercase bg-background focus:ring-4 focus:ring-blue-500/10 rounded-xl" maxLength={6} placeholder="e.g. B2B" />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider">Starting Number</label>
                          <Input type="number" min="1" value={b2bStartNumber} onChange={(e) => setB2bStartNumber(e.target.value === '' ? '' : Number(e.target.value))} placeholder="e.g. 1" className="font-mono font-bold bg-background focus:ring-4 focus:ring-blue-500/10 rounded-xl" />
                        </div>
                      </div>
                    </div>
                    <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.03] p-5 space-y-4">
                      <div className="flex items-center justify-between">
                        <h5 className="text-xs font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                          GST B2C Invoice Series
                        </h5>
                        <span className="text-[10px] font-mono font-bold text-foreground bg-background border border-border px-2 py-0.5 rounded-lg">{b2cPrefix || 'B2C'}-{String(Number(b2cStartNumber) || 1).padStart(3, '0')}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider">Prefix</label>
                          <Input type="text" value={b2cPrefix} onChange={(e) => setB2cPrefix(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))} className="font-mono font-bold uppercase bg-background focus:ring-4 focus:ring-emerald-500/10 rounded-xl" maxLength={6} placeholder="e.g. B2C" />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider">Starting Number</label>
                          <Input type="number" min="1" value={b2cStartNumber} onChange={(e) => setB2cStartNumber(e.target.value === '' ? '' : Number(e.target.value))} placeholder="e.g. 1" className="font-mono font-bold bg-background focus:ring-4 focus:ring-emerald-500/10 rounded-xl" />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Scrap Counter */}
              <div className="mt-6 border-t border-border/40 pt-6 space-y-4">
                <div className="flex flex-col">
                  <span className="text-xs font-black text-orange-500 uppercase tracking-widest">Scrap Counter</span>
                  <p className="text-[10px] text-muted-foreground/75 mt-0.5">Prefix and starting number for scrap invoices</p>
                </div>
                <div className="space-y-4 pt-2">
                  <div className="rounded-2xl border border-orange-500/25 bg-orange-500/[0.03] p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <h5 className="text-xs font-black text-orange-600 dark:text-orange-400 uppercase tracking-widest flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-orange-500 shrink-0" />
                        Scrap Invoice Series
                      </h5>
                      <span className="text-[10px] font-mono font-bold text-foreground bg-background border border-border px-2 py-0.5 rounded-lg">{scrapPrefix || `${terminalCode}-SCR`}-{String(Number(scrapStartNumber) || 1).padStart(3, '0')}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider">Prefix</label>
                        <Input type="text" value={scrapPrefix || `${terminalCode}-SCR`} onChange={(e) => setScrapPrefix(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 12))} className="font-mono font-bold uppercase bg-background focus:ring-4 focus:ring-orange-500/10 rounded-xl" maxLength={12} placeholder="Auto-generated" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider">Starting Number</label>
                        <Input type="number" min="1" value={scrapStartNumber} onChange={(e) => setScrapStartNumber(e.target.value === '' ? '' : Number(e.target.value))} placeholder="e.g. 1" className="font-mono font-bold bg-background focus:ring-4 focus:ring-orange-500/10 rounded-xl" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Quotation Counter */}
              <div className="mt-6 border-t border-border/40 pt-6 space-y-4">
                <div className="flex flex-col">
                  <span className="text-xs font-black text-blue-500 uppercase tracking-widest">Quotation Counter</span>
                  <p className="text-[10px] text-muted-foreground/75 mt-0.5">Prefix and starting number for quotations</p>
                </div>
                <div className="space-y-4 pt-2">
                  <div className="rounded-2xl border border-blue-500/25 bg-blue-500/[0.03] p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <h5 className="text-xs font-black text-blue-600 dark:text-blue-400 uppercase tracking-widest flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                        Quotation Series
                      </h5>
                      <span className="text-[10px] font-mono font-bold text-foreground bg-background border border-border px-2 py-0.5 rounded-lg">{quotationPrefix || `${terminalCode}-QTN`}-{String(Number(quotationStartNumber) || 1).padStart(3, '0')}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider">Prefix</label>
                        <Input type="text" value={quotationPrefix || `${terminalCode}-QTN`} onChange={(e) => setQuotationPrefix(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 12))} className="font-mono font-bold uppercase bg-background focus:ring-4 focus:ring-blue-500/10 rounded-xl" maxLength={12} placeholder="Auto-generated" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider">Starting Number</label>
                        <Input type="number" min="1" value={quotationStartNumber} onChange={(e) => setQuotationStartNumber(e.target.value === '' ? '' : Number(e.target.value))} placeholder="e.g. 1" className="font-mono font-bold bg-background focus:ring-4 focus:ring-blue-500/10 rounded-xl" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Return Counter */}
              <div className="mt-6 border-t border-border/40 pt-6 space-y-4">
                <div className="flex flex-col">
                  <span className="text-xs font-black text-rose-500 uppercase tracking-widest">Return Counter</span>
                  <p className="text-[10px] text-muted-foreground/75 mt-0.5">Prefix and starting number for return invoices</p>
                </div>
                <div className="space-y-4 pt-2">
                  <div className="rounded-2xl border border-rose-500/25 bg-rose-500/[0.03] p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <h5 className="text-xs font-black text-rose-600 dark:text-rose-400 uppercase tracking-widest flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
                        Return Invoice Series
                      </h5>
                      <span className="text-[10px] font-mono font-bold text-foreground bg-background border border-border px-2 py-0.5 rounded-lg">{returnPrefix || `${terminalCode}-RTN`}-{String(Number(returnStartNumber) || 1).padStart(3, '0')}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider">Prefix</label>
                        <Input type="text" value={returnPrefix || `${terminalCode}-RTN`} onChange={(e) => setReturnPrefix(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 12))} className="font-mono font-bold uppercase bg-background focus:ring-4 focus:ring-rose-500/10 rounded-xl" maxLength={12} placeholder="Auto-generated" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider">Starting Number</label>
                        <Input type="number" min="1" value={returnStartNumber} onChange={(e) => setReturnStartNumber(e.target.value === '' ? '' : Number(e.target.value))} placeholder="e.g. 1" className="font-mono font-bold bg-background focus:ring-4 focus:ring-rose-500/10 rounded-xl" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Card 4: Store Features */}
            <div className="bg-card border border-border rounded-[28px] p-6 md:p-8 shadow-sm hover:shadow-md hover:border-purple-500/20 transition-all duration-300">
              <div className="flex items-center gap-3 mb-6 pb-4 border-b border-border">
                <div className="p-2.5 rounded-2xl bg-purple-500/10 text-purple-600 shadow-[0_4px_12px_rgba(168,85,247,0.1)] dark:shadow-[0_4px_12px_rgba(168,85,247,0.05)] shrink-0">
                  <Tags className="w-4.5 h-4.5" />
                </div>
                <span className="text-xs font-black text-purple-600 uppercase tracking-widest">Store Features</span>
              </div>
              <div className="space-y-5">
                {/* Loyalty Toggle & Configs */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-4 p-4.5 bg-muted/30 border border-border rounded-2xl hover:border-primary/20 transition-all duration-300">
                    <div className="flex-1">
                      <label className="text-xs font-bold text-foreground cursor-pointer select-none" onClick={() => { const v = !loyaltyEnabled; setLoyaltyEnabled(v); setFeatureFlags(prev => ({ ...prev, loyalty: v })); }}>Enable Loyalty Points System</label>
                      <p className="text-[10px] text-muted-foreground/75 mt-0.5">When enabled, customers will earn loyalty points on every purchase which can be redeemed for future discounts.</p>
                    </div>
                    <button type="button" onClick={() => { const v = !loyaltyEnabled; setLoyaltyEnabled(v); setFeatureFlags(prev => ({ ...prev, loyalty: v })); }} className={clsx('relative w-11 h-6 rounded-full transition-all duration-300 shrink-0 cursor-pointer', loyaltyEnabled ? 'bg-primary shadow-[0_2px_8px_rgba(79,70,229,0.3)]' : 'bg-muted-foreground/20')}>
                      <span className={clsx('absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all duration-300', loyaltyEnabled ? 'translate-x-5' : 'translate-x-0')} />
                    </button>
                  </div>

                  {loyaltyEnabled && (
                    <div className="rounded-2xl border border-border p-5 space-y-4 bg-muted/30 animate-in slide-in-from-top-2 duration-200">
                      <div className="flex items-center gap-2.5 pb-2.5 border-b border-border">
                        <TrendingUp className="w-4 h-4 text-primary" />
                        <span className="text-xs font-bold text-foreground">Points Earning &amp; Redemption Rules</span>
                      </div>
                      <div className="grid grid-cols-2 gap-5">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider mb-1">Earning Rate</label>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-muted-foreground font-mono">â‚¹</span>
                            <input type="number" min="1" value={loyaltyEarningRate}
                              onChange={e => setLoyaltyEarningRate(e.target.value === '' ? 100 : Number(e.target.value))}
                              className="w-full bg-background border border-border/80 rounded-xl p-2.5 text-foreground focus:border-primary focus:ring-4 focus:ring-primary/10 focus:outline-none transition-all text-sm font-bold font-mono" />
                            <span className="text-xs font-bold text-muted-foreground shrink-0">= 1 Pt</span>
                          </div>
                          <p className="text-[10px] text-muted-foreground/70">Customer earns 1 point per â‚¹{loyaltyEarningRate} spent.</p>
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider mb-1">Redemption Value</label>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-muted-foreground shrink-0">1 Pt = â‚¹</span>
                            <input type="number" min="0.5" step="0.5" value={loyaltyRedemptionRate}
                              onChange={e => setLoyaltyRedemptionRate(e.target.value === '' ? 1 : Number(e.target.value))}
                              className="w-full bg-background border border-border/80 rounded-xl p-2.5 text-foreground focus:border-primary focus:ring-4 focus:ring-primary/10 focus:outline-none transition-all text-sm font-bold font-mono" />
                          </div>
                          <p className="text-[10px] text-muted-foreground/70">Each point gives â‚¹{loyaltyRedemptionRate} discount on bills.</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      case 'hardware':
        return (
          <div className="space-y-6 animate-in fade-in duration-300">
            {/* Top Sub-tabs */}
            <div className="flex gap-1.5 p-1.5 bg-muted/50 dark:bg-muted/20 border border-border rounded-2xl overflow-x-auto scrollbar-none w-full max-w-fit shadow-inner mx-auto">
              {[
                { id: 'receipt', label: 'Receipt Printer', icon: Printer },
                { id: 'barcode', label: 'Barcode Printer', icon: Printer },
                { id: 'a4', label: 'A4 & A5 Printer', icon: FileText },
                { id: 'scale', label: 'Weighing Scale', icon: Scale },
              ].map((tab) => {
                const Icon = tab.icon;
                const isTabActive = activeHardwareTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveHardwareTab(tab.id as any)}
                    className={clsx(
                      "flex items-center justify-center gap-2 py-2 px-3.5 rounded-xl text-xs font-bold transition-all duration-200 active:scale-95 whitespace-nowrap cursor-pointer border border-transparent shrink-0",
                      isTabActive
                        ? "bg-background shadow-md shadow-foreground/[0.03] text-primary border-border/40 font-extrabold scale-100"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    )}
                  >
                    <Icon className="w-4 h-4 shrink-0 text-current" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Render selected hardware settings card */}
            <div className="bg-card border border-border rounded-[28px] p-6 md:p-8 shadow-sm">
              {activeHardwareTab === 'receipt' && (
                <div className="space-y-5">
                  <div className="flex items-center gap-3 pb-4 border-b border-border">
                    <Printer className="w-4.5 h-4.5 text-primary" />
                    <span className="text-xs font-black uppercase tracking-widest text-foreground">Receipt Printer Settings</span>
                  </div>
                  <div className="grid grid-cols-2 gap-5">
                    <div className="col-span-2 space-y-2">
                      <label className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider mb-1.5 block">Connection Type</label>
                      <div className="flex gap-3">
                        <button type="button" className={clsx("flex items-center justify-center gap-2 py-3 px-5 rounded-2xl border text-xs font-bold transition-all duration-200 active:scale-95 flex-1 cursor-pointer", receiptPrinter.type === 'network' ? "border-primary bg-primary/10 text-primary shadow-sm font-extrabold" : "border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/30")} onClick={() => setReceiptPrinter({ ...receiptPrinter, type: 'network' })}>
                          <Globe className="w-4 h-4 shrink-0" /> Network (TCP/IP)
                        </button>
                        <button type="button" className={clsx("flex items-center justify-center gap-2 py-3 px-5 rounded-2xl border text-xs font-bold transition-all duration-200 active:scale-95 flex-1 cursor-pointer", receiptPrinter.type === 'usb' ? "border-primary bg-primary/10 text-primary shadow-sm font-extrabold" : "border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/30")} onClick={() => setReceiptPrinter({ ...receiptPrinter, type: 'usb' })}>
                          <Usb className="w-4 h-4 shrink-0" /> USB (OS Print Queue)
                        </button>
                      </div>
                    </div>
                    {receiptPrinter.type === 'network' ? (
                      <>
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider mb-1 block">Printer IP Address</label>
                          <Input type="text" value={receiptPrinter.ip} onChange={(e) => setReceiptPrinter({ ...receiptPrinter, ip: e.target.value })} placeholder="192.168.1.100" className="bg-background/50 focus:bg-background border-border/80 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all rounded-xl py-2.5 font-mono" />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider mb-1 block">Port</label>
                          <Input type="text" inputMode="numeric" value={receiptPrinter.port ?? 9100} onChange={(e) => setReceiptPrinter({ ...receiptPrinter, port: e.target.value === '' ? '' : e.target.value.replace(/\D/g, '') })} className="bg-background/50 focus:bg-background border-border/80 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all rounded-xl py-2.5 font-mono" />
                        </div>
                      </>
                    ) : (
                      <div className="col-span-2 space-y-2">
                        <label className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider mb-1 block">Select USB Printer</label>
                        <Select value={receiptPrinter.deviceName} placeholder="-- Select a printer --" onChange={v => setReceiptPrinter({ ...receiptPrinter, deviceName: v })} options={osPrinters.map(p => ({value:p.name,label:p.name}))} />
                      </div>
                    )}
                    <div className="col-span-2 space-y-2">
                      <label className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider mb-1 block">Paper Width (mm)</label>
                      <div className="flex gap-3">
                        <div className="flex-1">
                          <Select
                            value={[58, 80, 76, 112].includes(Number(printWidth)) ? String(printWidth) : 'custom'}
                            onChange={(v) => {
                              if (v !== 'custom') {
                                const num = Number(v);
                                setPrintWidth(num);
                                setReceiptPrinter({ ...receiptPrinter, receiptWidthCm: (num / 10).toString() });
                              }
                            }}
                            options={[
                              { value: '58', label: '58mm (2" Standard Small Thermal)' },
                              { value: '80', label: '80mm (3" Standard Wide Thermal)' },
                              { value: '76', label: '76mm (3" Impact / Dot Matrix Roll)' },
                              { value: '112', label: '112mm (4" Wide Desktop Thermal)' },
                              { value: 'custom', label: 'Custom Width (mm)...' }
                            ]}
                          />
                        </div>
                        {![58, 80, 76, 112].includes(Number(printWidth)) && (
                          <div className="w-36">
                            <Input
                              type="text"
                              inputMode="numeric"
                              value={printWidth ?? 58}
                              onChange={(e) => {
                                const val = e.target.value.replace(/\D/g, '');
                                const num = val === '' ? 58 : Number(val);
                                setPrintWidth(num);
                                setReceiptPrinter({ ...receiptPrinter, receiptWidthCm: (num / 10).toString() });
                              }}
                              placeholder="e.g. 58"
                              className="bg-background/50 focus:bg-background border-border/80 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all rounded-xl py-2.5 font-mono"
                            />
                          </div>
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground/70 mt-1">Standard thermal roll sizes are 58mm (5.8cm) and 80mm (8.0cm).</p>
                    </div>
                  </div>
                </div>
              )}

              {activeHardwareTab === 'barcode' && (
                <div className="space-y-5">
                  <div className="flex items-center gap-3 pb-4 border-b border-border">
                    <Printer className="w-4.5 h-4.5 text-primary" />
                    <span className="text-xs font-black uppercase tracking-widest text-foreground">Barcode Printer Settings</span>
                  </div>
                  <div className="grid grid-cols-2 gap-5">
                    <div className="col-span-2 space-y-2">
                      <label className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider mb-1.5 block">Connection Type</label>
                      <div className="flex gap-3">
                        <button type="button" className={clsx("flex items-center justify-center gap-2 py-3 px-5 rounded-2xl border text-xs font-bold transition-all duration-200 active:scale-95 flex-1 cursor-pointer", barcodePrinter.type === 'network' ? "border-primary bg-primary/10 text-primary shadow-sm font-extrabold" : "border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/30")} onClick={() => setBarcodePrinter({ ...barcodePrinter, type: 'network' })}>
                          <Globe className="w-4 h-4 shrink-0" /> Network (TCP/IP)
                        </button>
                        <button type="button" className={clsx("flex items-center justify-center gap-2 py-3 px-5 rounded-2xl border text-xs font-bold transition-all duration-200 active:scale-95 flex-1 cursor-pointer", barcodePrinter.type === 'usb' ? "border-primary bg-primary/10 text-primary shadow-sm font-extrabold" : "border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/30")} onClick={() => setBarcodePrinter({ ...barcodePrinter, type: 'usb' })}>
                          <Usb className="w-4 h-4 shrink-0" /> USB (OS Print Queue)
                        </button>
                      </div>
                    </div>
                    {barcodePrinter.type === 'network' ? (
                      <>
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider mb-1 block">Printer IP Address</label>
                          <Input type="text" value={barcodePrinter.ip} onChange={(e) => setBarcodePrinter({ ...barcodePrinter, ip: e.target.value })} placeholder="192.168.1.100" className="bg-background/50 focus:bg-background border-border/80 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all rounded-xl py-2.5 font-mono" />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider mb-1 block">Port</label>
                          <Input type="text" inputMode="numeric" value={barcodePrinter.port ?? 9100} onChange={(e) => setBarcodePrinter({ ...barcodePrinter, port: e.target.value === '' ? '' : e.target.value.replace(/\D/g, '') })} className="bg-background/50 focus:bg-background border-border/80 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all rounded-xl py-2.5 font-mono" />
                        </div>
                      </>
                    ) : (
                      <div className="col-span-2 space-y-2">
                        <label className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider mb-1 block">Select USB Printer</label>
                        <Select value={barcodePrinter.deviceName} placeholder="-- Select a printer --" onChange={v => setBarcodePrinter({ ...barcodePrinter, deviceName: v })} options={osPrinters.map(p => ({value:p.name,label:p.name}))} />
                      </div>
                    )}
                    {barcodePrinter.type === 'usb' && (
                      <div className="col-span-2 grid grid-cols-3 gap-4">
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider mb-1 block">Label Width (mm)</label>
                          <Input type="text" inputMode="numeric" value={barcodePrinter.labelWidthMm ?? 50} onChange={(e) => setBarcodePrinter({ ...barcodePrinter, labelWidthMm: e.target.value === '' ? '' : e.target.value.replace(/\D/g, '') })} className="bg-background/50 focus:bg-background border-border/80 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all rounded-xl py-2.5 font-mono" />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider mb-1 block">Label Height (mm)</label>
                          <Input type="text" inputMode="numeric" value={barcodePrinter.labelHeightMm ?? 25} onChange={(e) => setBarcodePrinter({ ...barcodePrinter, labelHeightMm: e.target.value === '' ? '' : e.target.value.replace(/\D/g, '') })} className="bg-background/50 focus:bg-background border-border/80 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all rounded-xl py-2.5 font-mono" />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider mb-1 block">Label Columns</label>
                          <Input type="text" inputMode="numeric" value={barcodePrinter.labelColumns ?? 1} onChange={(e) => setBarcodePrinter({ ...barcodePrinter, labelColumns: e.target.value === '' ? '' : e.target.value.replace(/\D/g, '') })} className="bg-background/50 focus:bg-background border-border/80 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all rounded-xl py-2.5 font-mono" />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeHardwareTab === 'a4' && (
                <div className="space-y-5">
                  <div className="flex items-center gap-3 pb-4 border-b border-border">
                    <FileText className="w-4.5 h-4.5 text-primary" />
                    <span className="text-xs font-black uppercase tracking-widest text-foreground">A4 &amp; A5 Printer Settings</span>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider mb-1.5 block">Select A4 / A5 Printer Device</label>
                    <Select value={a4Printer.deviceName} placeholder="-- Use default system printer --" onChange={v => setA4Printer({ ...a4Printer, deviceName: v })} options={osPrinters.map(p => ({value:p.name,label:p.name}))} />
                    <p className="text-[10px] text-muted-foreground/75 mt-2">Choose the printer to use for A5 estimates &amp; full A4 invoices. Leave as default to use system printer dialog.</p>
                  </div>
                </div>
              )}

              {activeHardwareTab === 'scale' && (
                <div className="space-y-5">
                  <div className="flex items-center gap-3 pb-4 border-b border-border">
                    <Scale className="w-4.5 h-4.5 text-primary" />
                    <span className="text-xs font-black uppercase tracking-widest text-foreground">Weighing Scale Connection</span>
                  </div>
                  <div className="grid grid-cols-2 gap-5">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider mb-1 block">Serial Port (COM/tty)</label>
                      <Input type="text" value={scale.path} onChange={(e) => setScale({ ...scale, path: e.target.value })} placeholder="COM3" className="bg-background/50 focus:bg-background border-border/80 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all rounded-xl py-2.5 font-mono" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider mb-1 block">Baud Rate</label>
                      <Select value={String(scale.baudRate)} onChange={v => setScale({ ...scale, baudRate: parseInt(v) })} options={['2400','4800','9600','19200','38400','115200'].map(b => ({value:b,label:b}))} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      case 'products':
        return (
          <div className="space-y-6 animate-in fade-in duration-300">
            {/* Top Sub-tabs (only show if role is OWNER, since cashier only sees Grades) */}
            {productTabs.length > 1 && (
              <div className="flex gap-1.5 p-1.5 bg-muted/50 dark:bg-muted/20 border border-border rounded-2xl overflow-x-auto scrollbar-none w-full max-w-fit shadow-inner mx-auto">
                {productTabs.map((tab) => {
                  const Icon = tab.icon;
                  const isTabActive = activeProductsTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveProductsTab(tab.id as any)}
                      className={clsx(
                        "flex items-center justify-center gap-2 py-2 px-3.5 rounded-xl text-xs font-bold transition-all duration-200 active:scale-95 whitespace-nowrap cursor-pointer border border-transparent shrink-0",
                        isTabActive
                          ? "bg-background shadow-md shadow-foreground/[0.03] text-primary border-border/40 font-extrabold scale-100"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                      )}
                    >
                      <Icon className="w-4 h-4 shrink-0 text-current" />
                      <span>{tab.label}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Content pane */}

            {activeProductsTab === 'coding' && (
              <div className="space-y-6">
                <div className="bg-card border border-border rounded-[28px] p-6 md:p-8 shadow-sm space-y-6">
                  <div className="flex items-center gap-3 pb-4 border-b border-border">
                    <Key className="w-4.5 h-4.5 text-primary" />
                    <span className="text-xs font-black uppercase tracking-widest text-foreground">Purchase Price Coding System</span>
                  </div>
                  <p className="text-xs text-muted-foreground/80 leading-relaxed">
                    Assign a unique, non-repeating letter to each digit (0-9). This lets you print encoded purchase prices on product labels (e.g. code "BHXY" for ₹1250).
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                    {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => (
                      <div key={digit} className="flex items-center justify-between gap-3 bg-muted/40 dark:bg-muted/10 p-3 rounded-2xl border border-border hover:border-primary/30 hover:bg-background/80 hover:shadow-sm transition-all duration-300 select-none">
                        <div className="flex items-center gap-2">
                          <span className="flex items-center justify-center font-black text-xs w-8 h-8 rounded-xl bg-primary/10 text-primary shrink-0 shadow-inner">{digit}</span>
                          <span className="text-muted-foreground/50 text-xs font-bold">=</span>
                        </div>
                        <Input type="text" maxLength={1} value={priceCoding[digit.toString()] || ''} onChange={(e) => setPriceCoding({ ...priceCoding, [digit.toString()]: e.target.value.toUpperCase() })} className="w-12 h-10 text-center font-extrabold text-base uppercase bg-card dark:bg-background border border-border/80 focus:border-primary focus:ring-4 focus:ring-primary/10 rounded-xl px-1 block shadow-sm transition-all duration-200" style={{ color: 'var(--foreground)' }} />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-card border border-border rounded-[28px] p-6 md:p-8 shadow-sm space-y-6">
                  <div className="flex items-center gap-3 pb-4 border-b border-border">
                    <Tags className="w-4.5 h-4.5 text-primary" />
                    <span className="text-xs font-black uppercase tracking-widest text-foreground">Service Charge Configuration</span>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <p className="text-xs font-extrabold text-foreground">Service Charge Barcode</p>
                      <p className="text-xs text-muted-foreground/80 leading-relaxed">
                        Customize the barcode used to quickly scan/add the Service Charge item in the billing panel.
                      </p>
                    </div>
                    <div className="w-full sm:w-48">
                      <Input
                        type="text"
                        placeholder="Enter barcode (e.g. 99)"
                        value={serviceChargeBarcode}
                        onChange={(e) => setServiceChargeBarcode(e.target.value.trim())}
                        className="w-full font-bold text-sm bg-card border border-border/80 focus:border-primary focus:ring-4 focus:ring-primary/10 rounded-xl px-3 py-2"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeProductsTab === 'bulk' && (
              <div className="bg-card border border-border rounded-[28px] p-6 md:p-8 shadow-sm space-y-6">
                <div className="flex items-center gap-3 pb-4 border-b border-border">
                  <Upload className="w-4.5 h-4.5 text-primary" />
                  <span className="text-xs font-black uppercase tracking-widest text-foreground">Bulk Product Import</span>
                </div>
                <p className="text-xs text-muted-foreground/80 leading-relaxed">
                  Quickly upload products and generate barcode labels in bulk using a spreadsheet layout.
                </p>
                <div>
                  <button type="button" onClick={() => setShowBulkSheet(true)}
                    className="flex items-center gap-2 px-5 py-3 text-xs font-bold bg-primary/10 hover:bg-primary hover:text-primary-foreground rounded-2xl transition-all duration-200 active:scale-95 cursor-pointer border border-primary/20 hover:border-primary shadow-sm shadow-primary/5">
                    <Upload className="w-4 h-4 shrink-0" /> Open Bulk Import Sheet
                  </button>
                </div>
              </div>
            )}

            {/* Card: Real & Paper Stock Tracking */}
            <div className="bg-card border border-border rounded-[28px] p-6 md:p-8 shadow-sm space-y-4">
              <div className="flex items-center gap-3 pb-4 border-b border-border">
                <div className="p-2.5 rounded-2xl bg-primary/10 text-primary shadow-[0_4px_12px_rgba(79,70,229,0.1)] shrink-0">
                  <Package className="w-4.5 h-4.5" />
                </div>
                <div>
                  <h3 className="text-xs font-black text-foreground uppercase tracking-widest">Real &amp; Paper Stock Tracking</h3>
                  <p className="text-[11px] text-muted-foreground font-medium mt-0.5">Control Real vs Paper stock separation across purchase bills and reports</p>
                </div>
              </div>

              <div className="flex items-center justify-between gap-4 p-4 rounded-2xl border bg-muted/20 border-border/60">
                <div className="flex-1 min-w-0">
                  <label className="text-xs font-bold text-foreground block">Real &amp; Paper Stock Tracking</label>
                  <p className="text-[10px] text-muted-foreground/80 mt-0.5 leading-relaxed">
                    Show Real / Paper stock selection in Purchase Bills, Inventory, and Stock Reports. When disabled, all GST purchases default to real physical stock.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setEnableRealPaperStock(!enableRealPaperStock)}
                  className={clsx('relative w-11 h-6 rounded-full transition-all duration-300 shrink-0 cursor-pointer', enableRealPaperStock ? 'bg-primary shadow-[0_2px_8px_rgba(79,70,229,0.3)]' : 'bg-muted-foreground/20')}
                  title={enableRealPaperStock ? 'Enabled' : 'Disabled'}
                >
                  <span className={clsx('absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all duration-300', enableRealPaperStock ? 'translate-x-5' : 'translate-x-0')} />
                </button>
              </div>
            </div>
          </div>
        );
      case 'printing':
        return (
          <div className="space-y-6 animate-in fade-in duration-300">
            {/* Card 1: Normal Print Paper Format (Bill of Supply & Estimate) */}
            <div className="bg-card border border-border rounded-[28px] p-6 md:p-8 shadow-sm hover:shadow-md hover:border-primary/20 transition-all duration-300">
              <div className="flex items-center gap-3 mb-6 pb-4 border-b border-border">
                <div className="p-2.5 rounded-2xl bg-primary/10 text-primary shadow-[0_4px_12px_rgba(79,70,229,0.1)] shrink-0">
                  <Printer className="w-4.5 h-4.5" />
                </div>
                <div>
                  <span className="text-xs font-black text-primary uppercase tracking-widest block">Normal Print Paper Format</span>
                  <p className="text-[11px] text-muted-foreground/75 mt-0.5">Format used for non-GST bills (Bill of Supply &amp; Estimate)</p>
                </div>
              </div>

              <div className="space-y-6">

                {/* Normal Print Format Toggle: Thermal vs A5 (Half A4) vs A4 */}
                <div>
                  <label className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider mb-3 block">Select Format for BOS / Estimate</label>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <button
                      type="button"
                      onClick={() => setPrintFormat('thermal')}
                      className={clsx(
                        "relative flex items-center gap-3.5 p-4 rounded-2xl border-2 transition-all duration-300 cursor-pointer text-left h-full",
                        printFormat === 'thermal'
                          ? "border-primary bg-primary/5 shadow-md ring-1 ring-primary/10"
                          : "border-border/80 hover:border-primary/35 hover:bg-muted/20"
                      )}
                    >
                      <div className={clsx("p-2.5 rounded-xl shrink-0", printFormat === 'thermal' ? "bg-blue-500/20 text-blue-600 dark:text-blue-400" : "bg-muted text-muted-foreground")}>
                        <Receipt className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-foreground truncate">Thermal Receipt</p>
                        <p className="text-xs text-muted-foreground/75 mt-0.5 truncate">58mm / 80mm roll paper</p>
                      </div>
                      {printFormat === 'thermal' && (
                        <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center shrink-0 shadow-sm shadow-primary/20">
                          <CheckCircle2 className="w-3.5 h-3.5 text-primary-foreground" />
                        </div>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => setPrintFormat('half-a4')}
                      className={clsx(
                        "relative flex items-center gap-3.5 p-4 rounded-2xl border-2 transition-all duration-300 cursor-pointer text-left h-full",
                        printFormat === 'half-a4'
                          ? "border-primary bg-primary/5 shadow-md ring-1 ring-primary/10"
                          : "border-border/80 hover:border-primary/35 hover:bg-muted/20"
                      )}
                    >
                      <div className={clsx("p-2.5 rounded-xl shrink-0", printFormat === 'half-a4' ? "bg-amber-500/20 text-amber-600 dark:text-amber-400" : "bg-muted text-muted-foreground")}>
                        <FileText className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-foreground truncate">A5 Paper (Half-A4)</p>
                        <p className="text-xs text-muted-foreground/75 mt-0.5 truncate">Estimate &amp; BOS cut-sheet</p>
                      </div>
                      {printFormat === 'half-a4' && (
                        <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center shrink-0 shadow-sm shadow-primary/20">
                          <CheckCircle2 className="w-3.5 h-3.5 text-primary-foreground" />
                        </div>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => setPrintFormat('a4')}
                      className={clsx(
                        "relative flex items-center gap-3.5 p-4 rounded-2xl border-2 transition-all duration-300 cursor-pointer text-left h-full",
                        printFormat === 'a4'
                          ? "border-primary bg-primary/5 shadow-md ring-1 ring-primary/10"
                          : "border-border/80 hover:border-primary/35 hover:bg-muted/20"
                      )}
                    >
                      <div className={clsx("p-2.5 rounded-xl shrink-0", printFormat === 'a4' ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400" : "bg-muted text-muted-foreground")}>
                        <FileText className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-foreground truncate">A4 Paper</p>
                        <p className="text-xs text-muted-foreground/75 mt-0.5 truncate">Full-page A4 document</p>
                      </div>
                      {printFormat === 'a4' && (
                        <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center shrink-0 shadow-sm shadow-primary/20">
                          <CheckCircle2 className="w-3.5 h-3.5 text-primary-foreground" />
                        </div>
                      )}
                    </button>
                  </div>
                </div>

                {/* Time Format Toggle */}
                <div className="pt-4 border-t border-border/40">
                  <label className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider mb-3 block">Time Format</label>
                  <div className="grid grid-cols-2 gap-4">
                    <button
                      type="button"
                      onClick={() => setTimeFormat('12h')}
                      className={clsx(
                        "relative flex items-center gap-3.5 p-4 rounded-2xl border-2 transition-all duration-300 cursor-pointer text-left",
                        timeFormat === '12h'
                          ? "border-primary bg-primary/5 shadow-md ring-1 ring-primary/10"
                          : "border-border/80 hover:border-primary/35 hover:bg-muted/20"
                      )}
                    >
                      <div className={clsx("p-2.5 rounded-xl", timeFormat === '12h' ? "bg-blue-500/20 text-blue-600 dark:text-blue-400" : "bg-muted text-muted-foreground")}>
                        <Clock className="w-5 h-5 shrink-0" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-bold text-foreground">12-hour Format</p>
                        <p className="text-xs text-muted-foreground/75 mt-0.5">e.g., 09:12 PM</p>
                      </div>
                      {timeFormat === '12h' && (
                        <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center shrink-0 shadow-sm shadow-primary/20">
                          <CheckCircle2 className="w-3.5 h-3.5 text-primary-foreground" />
                        </div>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setTimeFormat('24h')}
                      className={clsx(
                        "relative flex items-center gap-3.5 p-4 rounded-2xl border-2 transition-all duration-300 cursor-pointer text-left",
                        timeFormat === '24h'
                          ? "border-primary bg-primary/5 shadow-md ring-1 ring-primary/10"
                          : "border-border/80 hover:border-primary/35 hover:bg-muted/20"
                      )}
                    >
                      <div className={clsx("p-2.5 rounded-xl", timeFormat === '24h' ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400" : "bg-muted text-muted-foreground")}>
                        <Clock className="w-5 h-5 shrink-0" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-bold text-foreground">24-hour Format</p>
                        <p className="text-xs text-muted-foreground/75 mt-0.5">e.g., 21:12</p>
                      </div>
                      {timeFormat === '24h' && (
                        <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center shrink-0 shadow-sm shadow-primary/20">
                          <CheckCircle2 className="w-3.5 h-3.5 text-primary-foreground" />
                        </div>
                      )}
                    </button>
                  </div>
                </div>

                {/* 1. A4 & A5 Invoice Style Selector */}
                <div className="space-y-4 pt-6 border-t border-border/40 animate-in fade-in duration-300">
                  <div>
                    <span className="text-xs font-extrabold text-foreground uppercase tracking-wider block">A4 &amp; A5 Invoice Style</span>
                    <p className="text-[11px] text-muted-foreground/75 mt-0.5">Applied automatically when printing A4, A5, GST, or B2B tax invoices</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    {[
                      { id: 'standard', name: 'Standard', color: 'from-blue-500/10 to-blue-500/5' },
                      { id: 'boxed', name: 'GST Boxed', color: 'from-emerald-500/10 to-emerald-500/5' },
                      { id: 'modern', name: 'Modern', color: 'from-amber-500/10 to-amber-500/5' },
                      { id: 'classic', name: 'Classic', color: 'from-rose-500/10 to-rose-500/5' }
                    ].map((style) => {
                      const isActive = a4Style === style.id;
                      return (
                        <div key={style.id} className={clsx("relative rounded-2xl border-2 transition-all duration-300 overflow-hidden hover:shadow-md hover:border-primary/45", isActive ? "border-primary shadow-md ring-2 ring-primary/5 bg-card" : "border-border/80")}>
                          {isActive && <div className="absolute top-2.5 right-2.5 z-10 w-5 h-5 rounded-full bg-primary flex items-center justify-center shadow-sm shadow-primary/20"><CheckCircle2 className="w-3.5 h-3.5 text-primary-foreground" /></div>}
                          <button type="button" onClick={() => { setA4Style(style.id as any); }} className="w-full cursor-pointer text-left">
                            <div className={clsx("p-3 border-b border-border bg-gradient-to-r", style.color)}>
                              <span className="text-xs font-extrabold text-foreground">{style.name}</span>
                            </div>
                          </button>
                          <div className="bg-muted/20 dark:bg-muted/5 flex justify-center py-4">
                            <div className="relative group flex justify-center">
                              <button type="button" onClick={() => { setPreviewStyle(style.id); setPreviewFormat('a4'); }} className="bg-card shadow-inner font-mono overflow-hidden border border-border w-36 rounded-md cursor-pointer hover:border-primary/50 transition-colors">
                                <div className="text-[8px] text-center p-2.5 text-muted-foreground/60 font-semibold select-none">{style.name} Preview</div>
                              </button>
                              <button type="button" onClick={(e) => { e.stopPropagation(); setPreviewStyle(style.id); setPreviewFormat('a4'); }} className="absolute bottom-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 bg-primary text-primary-foreground rounded-lg shadow-lg hover:bg-primary/95 cursor-pointer" title="Full Preview"><Maximize2 className="w-3.5 h-3.5 text-primary-foreground" /></button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 2. Thermal Receipt Typography & Style */}
                <div className="space-y-4 pt-6 border-t border-border/40 animate-in fade-in duration-300">
                  <div className="flex items-center justify-between px-3.5 py-2.5 bg-muted/40 rounded-xl border border-border/60 text-xs">
                    <span className="text-muted-foreground text-[11px] font-medium flex items-center gap-1.5">
                      Thermal Roll Width: <strong className="text-foreground font-bold">{printWidth}mm</strong>
                    </span>
                    <button type="button" onClick={() => setActiveSection('hardware')} className="text-primary hover:underline text-[11px] font-bold cursor-pointer">
                      Configure in Devices &amp; Hardware &rarr;
                    </button>
                  </div>

                  <div>
                    <span className="text-xs font-extrabold text-foreground uppercase tracking-wider block mb-1">Thermal Receipt Style</span>
                    <p className="text-[11px] text-muted-foreground/75 mb-3">Layout format used for thermal roll printer receipts</p>
                    <div className="grid grid-cols-2 gap-4">
                      {[
                        { id: 'standard', name: 'Standard', color: 'from-blue-500/10 to-blue-500/5' },
                        { id: 'compact', name: 'Compact', color: 'from-violet-500/10 to-violet-500/5' },
                        { id: 'modern', name: 'Modern', color: 'from-amber-500/10 to-amber-500/5' },
                        { id: 'classic', name: 'Classic', color: 'from-rose-500/10 to-rose-500/5' },
                        { id: 'clean', name: 'Clean', color: 'from-emerald-500/10 to-emerald-500/5' },
                        { id: 'dot', name: 'Dot', color: 'from-cyan-500/10 to-cyan-500/5' },
                        { id: 'slim', name: 'Slim', color: 'from-gray-500/10 to-gray-500/5' },
                        { id: 'luxe', name: 'Luxe', color: 'from-yellow-500/10 to-yellow-500/5' },
                        { id: 'boxed', name: 'Boxed', color: 'from-teal-500/10 to-teal-500/5' }
                      ].map((style) => {
                        const isActive = thermalStyle === style.id;
                        return (
                          <div key={style.id} className={clsx("relative rounded-2xl border-2 transition-all duration-300 overflow-hidden hover:shadow-md hover:border-primary/45", isActive ? "border-primary shadow-md ring-2 ring-primary/5 bg-card" : "border-border/80")}>
                            {isActive && <div className="absolute top-2.5 right-2.5 z-10 w-5 h-5 rounded-full bg-primary flex items-center justify-center shadow-sm shadow-primary/20"><CheckCircle2 className="w-3 h-3 text-primary-foreground" /></div>}
                            <button type="button" onClick={() => { setThermalStyle(style.id as any); }} className="w-full cursor-pointer text-left">
                              <div className={clsx("p-3 border-b border-border bg-gradient-to-r", style.color)}>
                                <span className="text-xs font-extrabold text-foreground">{style.name}</span>
                              </div>
                            </button>
                            <div className="bg-muted/20 dark:bg-muted/5 flex justify-center py-4">
                              <div className="relative group flex justify-center">
                                <button type="button" onClick={() => { setPreviewStyle(style.id); setPreviewFormat('thermal'); }} className="bg-card shadow-inner font-mono overflow-hidden border border-border w-36 rounded-md cursor-pointer hover:border-primary/50 transition-colors">
                                  <div className="text-[8px] text-center p-2.5 text-muted-foreground/60 font-semibold select-none">{style.name} Preview</div>
                                </button>
                                <button type="button" onClick={(e) => { e.stopPropagation(); setPreviewStyle(style.id); setPreviewFormat('thermal'); }} className="absolute bottom-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 bg-primary text-primary-foreground rounded-lg shadow-lg hover:bg-primary/95 cursor-pointer" title="Full Preview"><Maximize2 className="w-3.5 h-3.5 text-primary-foreground" /></button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* 3. A5 Page Orientation */}
                <div className="space-y-4 pt-6 border-t border-border/40 animate-in fade-in duration-300">
                  <span className="text-xs font-extrabold text-foreground uppercase tracking-wider block mb-1">A5 Page Orientation</span>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <button
                      type="button"
                      onClick={() => setA5Orientation('horizontal')}
                      className={clsx(
                        "relative flex items-center gap-3.5 p-4 rounded-2xl border-2 transition-all duration-300 cursor-pointer text-left",
                        a5Orientation === 'horizontal'
                          ? "border-primary bg-primary/5 shadow-md ring-1 ring-primary/10"
                          : "border-border/80 hover:border-primary/35 hover:bg-muted/20"
                      )}
                    >
                      <div className={clsx("p-2.5 rounded-xl shrink-0", a5Orientation === 'horizontal' ? "bg-amber-500/20 text-amber-600 dark:text-amber-400" : "bg-muted text-muted-foreground")}>
                        <FileText className="w-5 h-5 rotate-90" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-foreground truncate">Half-A4 Cut Sheet (210mm Wide)</p>
                        <p className="text-xs text-muted-foreground/75 mt-0.5 truncate">Cut Half-A4 sheet (210mm wide feed - Recommended)</p>
                      </div>
                      {a5Orientation === 'horizontal' && (
                        <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center shrink-0 shadow-sm shadow-primary/20">
                          <CheckCircle2 className="w-3.5 h-3.5 text-primary-foreground" />
                        </div>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => setA5Orientation('vertical')}
                      className={clsx(
                        "relative flex items-center gap-3.5 p-4 rounded-2xl border-2 transition-all duration-300 cursor-pointer text-left",
                        a5Orientation === 'vertical'
                          ? "border-primary bg-primary/5 shadow-md ring-1 ring-primary/10"
                          : "border-border/80 hover:border-primary/35 hover:bg-muted/20"
                      )}
                    >
                      <div className={clsx("p-2.5 rounded-xl shrink-0", a5Orientation === 'vertical' ? "bg-amber-500/20 text-amber-600 dark:text-amber-400" : "bg-muted text-muted-foreground")}>
                        <FileText className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-foreground truncate">A5 Vertical (148.5mm Wide)</p>
                        <p className="text-xs text-muted-foreground/75 mt-0.5 truncate">Standard A5 portrait paper (148mm feed)</p>
                      </div>
                      {a5Orientation === 'vertical' && (
                        <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center shrink-0 shadow-sm shadow-primary/20">
                          <CheckCircle2 className="w-3.5 h-3.5 text-primary-foreground" />
                        </div>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      case 'print_options':
        return (
          <div className="space-y-6 animate-in fade-in duration-300">
            {/* Card 1: General Bill Options & Checklist */}
            <div className="bg-card border border-border rounded-[28px] p-6 md:p-8 shadow-sm hover:shadow-md hover:border-primary/20 transition-all duration-300">
              <div className="flex items-center gap-3 mb-6 pb-4 border-b border-border">
                <div className="p-2.5 rounded-2xl bg-primary/10 text-primary shadow-[0_4px_12px_rgba(79,70,229,0.1)] shrink-0">
                  <FileText className="w-4.5 h-4.5" />
                </div>
                <span className="text-xs font-black text-primary uppercase tracking-widest">Bill Printing Options &amp; Content Checklist</span>
              </div>

              <div className="space-y-6">
                <div className="flex items-center justify-between gap-4 p-4.5 bg-muted/30 border border-border rounded-2xl hover:border-primary/20 transition-all duration-300">
                  <div className="flex-1">
                    <label className="text-xs font-bold text-foreground cursor-pointer select-none" onClick={() => setAutoPrintBarcode(!autoPrintBarcode)}>Auto Print Barcode for New Products</label>
                    <p className="text-[10px] text-muted-foreground/75 mt-0.5">When a new product is created from the Billing page, automatically print its barcode label.</p>
                  </div>
                  <button type="button" onClick={() => setAutoPrintBarcode(!autoPrintBarcode)} className={clsx('relative w-11 h-6 rounded-full transition-all duration-300 shrink-0 cursor-pointer', autoPrintBarcode ? 'bg-primary shadow-[0_2px_8px_rgba(79,70,229,0.3)]' : 'bg-muted-foreground/20')}>
                    <span className={clsx('absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all duration-300', autoPrintBarcode ? 'translate-x-5' : 'translate-x-0')} />
                  </button>
                </div>

                <div className="flex items-center justify-between gap-4 p-4.5 bg-muted/30 border border-border rounded-2xl hover:border-primary/20 transition-all duration-300">
                  <div className="flex-1">
                    <label className="text-xs font-bold text-foreground cursor-pointer select-none" onClick={() => setShowProductOffers(!showProductOffers)}>Show Pre-Set Catalog Offers on Bills</label>
                    <p className="text-[10px] text-muted-foreground/75 mt-0.5">Controls whether original MRP is shown for pre-set product catalog offers &amp; discounts created in Product Master (e.g. MRP ₹100 → Offer Price ₹80).</p>
                  </div>
                  <button type="button" onClick={() => setShowProductOffers(!showProductOffers)} className={clsx('relative w-11 h-6 rounded-full transition-all duration-300 shrink-0 cursor-pointer', showProductOffers ? 'bg-primary shadow-[0_2px_8px_rgba(79,70,229,0.3)]' : 'bg-muted-foreground/20')}>
                    <span className={clsx('absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all duration-300', showProductOffers ? 'translate-x-5' : 'translate-x-0')} />
                  </button>
                </div>

                <div className="flex items-center justify-between gap-4 p-4.5 bg-muted/30 border border-border rounded-2xl hover:border-primary/20 transition-all duration-300">
                  <div className="flex-1">
                    <label className="text-xs font-bold text-foreground cursor-pointer select-none" onClick={() => setShowPriceOverrideMrp(!showPriceOverrideMrp)}>Show Old MRP on Price Overrides (Billing Page)</label>
                    <p className="text-[10px] text-muted-foreground/75 mt-0.5">Controls whether original MRP is shown when unit price is manually overridden or discounted directly on the Billing checkout page (e.g. MRP ₹100 → Overridden ₹80).</p>
                  </div>
                  <button type="button" onClick={() => setShowPriceOverrideMrp(!showPriceOverrideMrp)} className={clsx('relative w-11 h-6 rounded-full transition-all duration-300 shrink-0 cursor-pointer', showPriceOverrideMrp ? 'bg-primary shadow-[0_2px_8px_rgba(79,70,229,0.3)]' : 'bg-muted-foreground/20')}>
                    <span className={clsx('absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all duration-300', showPriceOverrideMrp ? 'translate-x-5' : 'translate-x-0')} />
                  </button>
                </div>

                <div className="flex items-center justify-between gap-4 p-4.5 bg-muted/30 border border-border rounded-2xl hover:border-primary/20 transition-all duration-300">
                  <div className="flex-1">
                    <label className="text-xs font-bold text-foreground cursor-pointer select-none" onClick={() => {
                      const newVal = !billingUIConfig.showPurchasePriceInPOS;
                      const updated = { ...billingUIConfig, showPurchasePriceInPOS: newVal };
                      setBillingUIConfig(updated);
                      useBillingUIStore.getState().updateConfig(updated);
                    }}>Show Product Purchase Cost in Price Override Menu (View-Only)</label>
                    <p className="text-[10px] text-muted-foreground/75 mt-0.5">When enabled, the product's cost/purchase price is shown in the Price Override &amp; Tier dropdown on POS for reference (View Only, non-selectable).</p>
                  </div>
                  <button type="button" onClick={() => {
                    const newVal = !billingUIConfig.showPurchasePriceInPOS;
                    const updated = { ...billingUIConfig, showPurchasePriceInPOS: newVal };
                    setBillingUIConfig(updated);
                    useBillingUIStore.getState().updateConfig(updated);
                  }} className={clsx('relative w-11 h-6 rounded-full transition-all duration-300 shrink-0 cursor-pointer', billingUIConfig.showPurchasePriceInPOS ? 'bg-primary shadow-[0_2px_8px_rgba(79,70,229,0.3)]' : 'bg-muted-foreground/20')}>
                    <span className={clsx('absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all duration-300', billingUIConfig.showPurchasePriceInPOS ? 'translate-x-5' : 'translate-x-0')} />
                  </button>
                </div>

                <div className="flex items-center justify-between gap-4 p-4.5 bg-muted/30 border border-border rounded-2xl hover:border-primary/20 transition-all duration-300">
                  <div className="flex-1">
                    <label className="text-xs font-bold text-foreground cursor-pointer select-none" onClick={() => setOpenCashDrawerOnPending(!openCashDrawerOnPending)}>Open Cash Drawer on Pending Payment</label>
                    <p className="text-[10px] text-muted-foreground/75 mt-0.5">When billing with Pending payment method, automatically open the cash drawer after printing.</p>
                  </div>
                  <button type="button" onClick={() => setOpenCashDrawerOnPending(!openCashDrawerOnPending)} className={clsx('relative w-11 h-6 rounded-full transition-all duration-300 shrink-0 cursor-pointer', openCashDrawerOnPending ? 'bg-primary shadow-[0_2px_8px_rgba(79,70,229,0.3)]' : 'bg-muted-foreground/20')}>
                    <span className={clsx('absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all duration-300', openCashDrawerOnPending ? 'translate-x-5' : 'translate-x-0')} />
                  </button>
                </div>

                <div className="flex items-center justify-between gap-4 p-4.5 bg-muted/30 border border-border rounded-2xl hover:border-primary/20 transition-all duration-300">
                  <div className="flex-1">
                    <label className="text-xs font-bold text-foreground cursor-pointer select-none" onClick={() => setAutoOpenCashDrawer(!autoOpenCashDrawer)}>Auto Open Cash Drawer</label>
                    <p className="text-[10px] text-muted-foreground/75 mt-0.5">Automatically open the cash register drawer session with a default balance on session start.</p>
                  </div>
                  <button type="button" onClick={() => setAutoOpenCashDrawer(!autoOpenCashDrawer)} className={clsx('relative w-11 h-6 rounded-full transition-all duration-300 shrink-0 cursor-pointer', autoOpenCashDrawer ? 'bg-primary shadow-[0_2px_8px_rgba(79,70,229,0.3)]' : 'bg-muted-foreground/20')}>
                    <span className={clsx('absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all duration-300', autoOpenCashDrawer ? 'translate-x-5' : 'translate-x-0')} />
                  </button>
                </div>

                {autoOpenCashDrawer && (
                  <div className="p-4.5 bg-muted/30 border border-border rounded-2xl hover:border-primary/20 transition-all duration-300">
                    <label className="text-xs font-bold text-foreground mb-1 block">Default Opening Amount (₹)</label>
                    <p className="text-[10px] text-muted-foreground/75 mb-2.5">Set a default cash amount to start the drawer with. If empty or cleared, opening balance will be 0 (starts from 0).</p>
                    <div className="relative max-w-xs">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">₹</span>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        placeholder="0"
                        value={defaultOpeningBalance}
                        onChange={(e) => setDefaultOpeningBalance(e.target.value)}
                        className="w-full pl-7 pr-3 py-2 bg-background border border-border rounded-xl text-xs font-bold text-foreground focus:outline-none focus:border-primary transition-colors"
                      />
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between gap-4 p-4.5 bg-muted/30 border border-border rounded-2xl hover:border-primary/20 transition-all duration-300">
                  <div className="flex-1">
                    <label className="text-xs font-bold text-foreground cursor-pointer select-none" onClick={() => setBillSettings(s => ({ ...s, showDescription: s.showDescription === false ? true : false }))}>Show Bill Description / Remarks</label>
                    <p className="text-[10px] text-muted-foreground/75 mt-0.5">When enabled, the Bill Description / Remarks box will appear on the billing page and printed receipts.</p>
                  </div>
                  <button type="button" onClick={() => setBillSettings(s => ({ ...s, showDescription: s.showDescription === false ? true : false }))} className={clsx('relative w-11 h-6 rounded-full transition-all duration-300 shrink-0 cursor-pointer', billSettings.showDescription !== false ? 'bg-primary shadow-[0_2px_8px_rgba(79,70,229,0.3)]' : 'bg-muted-foreground/20')}>
                    <span className={clsx('absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all duration-300', billSettings.showDescription !== false ? 'translate-x-5' : 'translate-x-0')} />
                  </button>
                </div>

                <div className="flex items-center justify-between gap-4 p-4.5 bg-muted/30 border border-border rounded-2xl hover:border-primary/20 transition-all duration-300">
                  <div className="flex-1">
                    <label className="text-xs font-bold text-foreground cursor-pointer select-none" onClick={() => setBillSettings(s => ({ ...s, showTransporterDetails: s.showTransporterDetails === false ? true : false }))}>Show Transporter &amp; E-Way Bill Details Section</label>
                    <p className="text-[10px] text-muted-foreground/75 mt-0.5">When enabled, the Transporter &amp; E-Way Bill Details section will appear on printed invoices and preview.</p>
                  </div>
                  <button type="button" onClick={() => setBillSettings(s => ({ ...s, showTransporterDetails: s.showTransporterDetails === false ? true : false }))} className={clsx('relative w-11 h-6 rounded-full transition-all duration-300 shrink-0 cursor-pointer', billSettings.showTransporterDetails !== false ? 'bg-primary shadow-[0_2px_8px_rgba(79,70,229,0.3)]' : 'bg-muted-foreground/20')}>
                    <span className={clsx('absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all duration-300', billSettings.showTransporterDetails !== false ? 'translate-x-5' : 'translate-x-0')} />
                  </button>
                </div>

                <div className="flex items-center justify-between gap-4 p-4.5 bg-muted/30 border border-border rounded-2xl hover:border-primary/20 transition-all duration-300">
                  <div className="flex-1">
                    <label className="text-xs font-bold text-foreground cursor-pointer select-none" onClick={() => setBillSettings(s => ({ ...s, reverseCharge: !s.reverseCharge }))}>Tax Is Payable On Reverse Charge</label>
                    <p className="text-[10px] text-muted-foreground/75 mt-0.5">GST-based: When enabled, invoices will indicate tax is payable on reverse charge basis.</p>
                  </div>
                  <button type="button" onClick={() => setBillSettings(s => ({ ...s, reverseCharge: !s.reverseCharge }))} className={clsx('relative w-11 h-6 rounded-full transition-all duration-300 shrink-0 cursor-pointer', billSettings.reverseCharge ? 'bg-primary shadow-[0_2px_8px_rgba(79,70,229,0.3)]' : 'bg-muted-foreground/20')}>
                    <span className={clsx('absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all duration-300', billSettings.reverseCharge ? 'translate-x-5' : 'translate-x-0')} />
                  </button>
                </div>

                <div className="p-4.5 bg-muted/30 border border-border rounded-2xl hover:border-primary/20 transition-all duration-300">
                  <label className="text-xs font-bold text-foreground mb-1 block">Item Columns Order on Bill</label>
                  <p className="text-[10px] text-muted-foreground/75 mb-3">Choose column order for items in receipts and bills (Qty Rate vs Rate Qty).</p>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setBillSettings(s => ({ ...s, itemColumnOrder: 'qty_rate' }))}
                      className={clsx(
                        'flex items-center gap-3 p-3 rounded-xl border text-left transition-all cursor-pointer',
                        (billSettings.itemColumnOrder || 'qty_rate') === 'qty_rate'
                          ? 'bg-primary/10 border-primary text-primary font-semibold'
                          : 'bg-background border-border text-foreground hover:border-primary/30'
                      )}
                    >
                      <div className="w-4 h-4 rounded-full border-2 border-current flex items-center justify-center shrink-0">
                        {(billSettings.itemColumnOrder || 'qty_rate') === 'qty_rate' && <div className="w-2 h-2 rounded-full bg-current" />}
                      </div>
                      <div>
                        <div className="text-xs font-bold">Qty → Rate</div>
                        <div className="text-[10px] text-muted-foreground">Quantity first, then Rate</div>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setBillSettings(s => ({ ...s, itemColumnOrder: 'rate_qty' }))}
                      className={clsx(
                        'flex items-center gap-3 p-3 rounded-xl border text-left transition-all cursor-pointer',
                        billSettings.itemColumnOrder === 'rate_qty'
                          ? 'bg-primary/10 border-primary text-primary font-semibold'
                          : 'bg-background border-border text-foreground hover:border-primary/30'
                      )}
                    >
                      <div className="w-4 h-4 rounded-full border-2 border-current flex items-center justify-center shrink-0">
                        {billSettings.itemColumnOrder === 'rate_qty' && <div className="w-2 h-2 rounded-full bg-current" />}
                      </div>
                      <div>
                        <div className="text-xs font-bold">Rate → Qty</div>
                        <div className="text-[10px] text-muted-foreground">Rate first, then Quantity</div>
                      </div>
                    </button>
                  </div>
                </div>

                <div className="p-4.5 bg-muted/30 border border-border rounded-2xl hover:border-primary/20 transition-all duration-300">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                    <div>
                      <label className="text-xs font-bold text-foreground block">Bill Content Checklist</label>
                      <p className="text-[11px] text-muted-foreground/80 mt-0.5">Customize fields for Bill of Supply &amp; Estimate bills</p>
                    </div>
                    <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/20 self-start sm:self-auto shrink-0">
                      Applies to Bill of Supply &amp; Estimate Only
                    </span>
                  </div>

                  <div className="mb-3.5 p-3 bg-blue-500/[0.06] border border-blue-500/20 rounded-xl flex items-start gap-2.5">
                    <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                    <p className="text-[11px] text-blue-700 dark:text-blue-300 font-medium leading-relaxed">
                      Checklist customization applies only to <strong>Bill of Supply &amp; Estimate</strong> bills. <strong>GST Tax Invoices</strong> will always display all mandatory invoice details as required by GST regulations.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
                    {[
                      { key: 'showShopName', label: 'Shop Name' },
                      { key: 'showShopAddress', label: 'Shop Address' },
                      { key: 'showPhone', label: 'Phone Number' },
                      { key: 'showShopGstin', label: 'Shop GSTIN' },
                      { key: 'showShopState', label: 'Shop State' },
                      { key: 'showTitle', label: 'Document Title' },
                      { key: 'showBillerName', label: 'Biller Name' },
                      { key: 'showCustomerName', label: 'Customer Name' },
                      { key: 'showCustomerPhone', label: 'Customer Phone' },
                      { key: 'showCustomerAddress', label: 'Customer Address' },
                      { key: 'showCustomerGstin', label: 'Customer GSTIN' },
                      { key: 'showCustomerState', label: 'Customer State' },
                      { key: 'showDescription', label: 'Bill Description / Remarks' },
                      { key: 'showTransporterDetails', label: 'Transporter & E-Way Bill Details' },
                      { key: 'showBosTaxBreakup', label: 'Tax Breakup on Bill of Supply' },
                      { key: 'printFullName', label: 'Full Product Name' },
                      { key: 'showBrandName', label: 'Product Brand Name' },
                      { key: 'showWeightDetails', label: 'Weight & Per-Weight Rate (Weight Items)' },
                      { key: 'showPcsForWeightProducts', label: 'Show Weight Items in PCS (Pieces)' },
                      { key: 'showPcsUnit', label: 'Show "PCS" Suffix on Quantities' },
                      { key: 'showCreditBalance', label: 'Show Customer Balance / Credit Breakdown (Sales, Cash Received, Balance)' },
                      { key: 'showBarcodeOnReceipt', label: 'Invoice Barcode on Receipts' },
                      { key: 'showAuthorisedSignatory', label: 'Authorised Signatory' },
                      { key: 'showForShopName', label: 'For {shop name}' },
                    ].map(({ key, label }) => {
                      const isChecked = (billSettings as any)[key] !== false;
                      return (
                        <label key={key} className="flex items-center gap-3 py-1.5 cursor-pointer group text-xs text-foreground font-medium select-none">
                          <button
                            type="button"
                            onClick={() => {
                              setBillSettings(s => ({ ...s, [key]: (s as any)[key] === false ? true : false }));
                            }}
                            className={clsx(
                              'w-4.5 h-4.5 rounded-lg border-2 flex items-center justify-center transition-all shrink-0',
                              isChecked ? 'bg-primary border-primary' : 'border-muted-foreground/30 group-hover:border-primary/50'
                            )}
                          >
                            {isChecked && <CheckCircle2 className="w-3 h-3 text-primary-foreground" />}
                          </button>
                          <span>{label}</span>
                        </label>
                      );
                    })}
                  </div>

                  {billSettings.showBosTaxBreakup && (
                    <div className="mt-4 pt-4 border-t border-border/40 space-y-4 animate-in slide-in-from-top-2 duration-200">
                      <div className="flex items-center gap-3">
                        <label className="text-xs text-foreground shrink-0 font-bold">CGST/SGST Rate %</label>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.1"
                          value={billSettings.bosTaxRatePercent}
                          onChange={e => {
                            const v = parseFloat(e.target.value) || 0;
                            setBillSettings(s => ({ ...s, bosTaxRatePercent: Math.max(0, Math.min(100, v)) }));
                          }}
                          className="w-20 px-3 py-1.5 text-xs border border-border/80 rounded-xl bg-background text-foreground text-center font-mono font-bold"
                        />
                        <span className="text-[10px] text-muted-foreground/70">Split equally as CGST + SGST</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <label className="text-xs text-foreground shrink-0 font-bold">Tax Type</label>
                        <div className="flex rounded-xl border border-border/80 overflow-hidden bg-background/50 shadow-inner">
                          <button
                            type="button"
                            onClick={() => setBillSettings(s => ({ ...s, bosTaxInclusive: false }))}
                            className={clsx(
                              'px-4 py-1.5 text-xs font-bold transition-all cursor-pointer',
                              !billSettings.bosTaxInclusive ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-transparent text-muted-foreground hover:text-foreground'
                            )}
                          >
                            Exclusive
                          </button>
                          <button
                            type="button"
                            onClick={() => setBillSettings(s => ({ ...s, bosTaxInclusive: true }))}
                            className={clsx(
                              'px-4 py-1.5 text-xs font-bold transition-all cursor-pointer',
                              billSettings.bosTaxInclusive ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-transparent text-muted-foreground hover:text-foreground'
                            )}
                          >
                            Inclusive
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="border-t border-border/40 my-3.5 pt-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-card/60 border border-border/60 rounded-xl">
                      <div>
                        <span className="text-xs text-foreground font-bold flex items-center gap-1.5">
                          <FileText className="w-3.5 h-3.5 text-primary" />
                          Bill Document Title (Non-GST / Regular Bill)
                        </span>
                        <p className="text-[10px] text-muted-foreground/75 mt-0.5">Choose whether regular bills display "BILL OF SUPPLY" or "ESTIMATE" as document title.</p>
                      </div>
                      <div className="flex rounded-xl border border-border/80 overflow-hidden bg-background/50 shadow-inner shrink-0">
                        <button
                          type="button"
                          onClick={() => setBillSettings(s => ({ ...s, nonGstBillTitle: 'BILL_OF_SUPPLY', estimateMode: false }))}
                          className={clsx(
                            'px-3.5 py-1.5 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5',
                            (billSettings.nonGstBillTitle !== 'ESTIMATE' && !billSettings.estimateMode)
                              ? 'bg-primary text-primary-foreground shadow-sm'
                              : 'bg-transparent text-muted-foreground hover:text-foreground'
                          )}
                        >
                          {(billSettings.nonGstBillTitle !== 'ESTIMATE' && !billSettings.estimateMode) && <CheckCircle2 className="w-3 h-3" />}
                          BILL OF SUPPLY
                        </button>
                        <button
                          type="button"
                          onClick={() => setBillSettings(s => ({ ...s, nonGstBillTitle: 'ESTIMATE', estimateMode: true }))}
                          className={clsx(
                            'px-3.5 py-1.5 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5',
                            (billSettings.nonGstBillTitle === 'ESTIMATE' || billSettings.estimateMode)
                              ? 'bg-primary text-primary-foreground shadow-sm'
                              : 'bg-transparent text-muted-foreground hover:text-foreground'
                          )}
                        >
                          {(billSettings.nonGstBillTitle === 'ESTIMATE' || billSettings.estimateMode) && <CheckCircle2 className="w-3 h-3" />}
                          ESTIMATE
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-4.5 bg-muted/30 border border-border rounded-2xl hover:border-primary/20 transition-all duration-300">
                  <label className="text-xs font-bold text-foreground mb-3 block">Bill Instructions (T&amp;C)</label>
                  <textarea
                    value={billSettings.instructions || ''}
                    onChange={e => setBillSettings(s => ({ ...s, instructions: e.target.value }))}
                    placeholder="e.g. 1. Goods once sold will not be taken back.&#10;2. Subject to local jurisdiction.&#10;3. E. &amp; O. E."
                    rows={4}
                    className="w-full bg-background border border-border/80 rounded-xl px-4 py-3 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 focus:bg-background transition-all resize-none text-sm font-medium"
                  />
                  <p className="text-[10px] text-muted-foreground/70 mt-1.5">These instructions will appear at the bottom of thermal receipts, A5 estimates, and A4 invoices.</p>
                </div>

                <div className="p-4.5 bg-muted/30 border border-border rounded-2xl hover:border-primary/20 transition-all duration-300">
                  <label className="text-xs font-bold text-foreground mb-1 block">Certification Statement / Declaration</label>
                  <p className="text-[10px] text-muted-foreground/75 mb-3">Appears at the bottom left of boxed GST A4 invoices.</p>
                  <input
                    type="text"
                    value={billSettings.certificationText !== undefined ? billSettings.certificationText : 'Certified that the Particulars given above are true and correct'}
                    onChange={e => setBillSettings(s => ({ ...s, certificationText: e.target.value }))}
                    placeholder="Certified that the Particulars given above are true and correct"
                    className="w-full bg-background border border-border/80 rounded-xl px-4 py-2.5 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all text-sm font-medium"
                  />
                </div>

                <div className="p-4.5 bg-muted/30 border border-border rounded-2xl hover:border-primary/20 transition-all duration-300">
                  <label className="text-xs font-bold text-foreground mb-1 block">Electronic Reference Number (IRN / e-Invoice No)</label>
                  <p className="text-[10px] text-muted-foreground/75 mb-3">Optional e-invoice / electronic reference number printed on GST invoices.</p>
                  <input
                    type="text"
                    value={billSettings.electronicRefNumber || ''}
                    onChange={e => setBillSettings(s => ({ ...s, electronicRefNumber: e.target.value }))}
                    placeholder="e.g. 4d1693f213284395b6aa536df37a9a5"
                    className="w-full bg-background border border-border/80 rounded-xl px-4 py-2.5 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all text-sm font-medium"
                  />
                </div>

                <div className="p-4.5 bg-muted/30 border border-border rounded-2xl hover:border-primary/20 transition-all duration-300">
                  <label className="text-xs font-bold text-foreground mb-1 block">Scrap Bill Item Columns Order</label>
                  <p className="text-[10px] text-muted-foreground/75 mb-3">Choose column order for items in scrap receipts and bills.</p>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setScrapBillSettings(s => ({ ...s, itemColumnOrder: 'qty_rate' }))}
                      className={clsx(
                        'flex items-center gap-3 p-3 rounded-xl border text-left transition-all cursor-pointer',
                        (scrapBillSettings.itemColumnOrder || 'qty_rate') === 'qty_rate'
                          ? 'bg-primary/10 border-primary text-primary font-semibold'
                          : 'bg-background border-border text-foreground hover:border-primary/30'
                      )}
                    >
                      <div className="w-4 h-4 rounded-full border-2 border-current flex items-center justify-center shrink-0">
                        {(scrapBillSettings.itemColumnOrder || 'qty_rate') === 'qty_rate' && <div className="w-2 h-2 rounded-full bg-current" />}
                      </div>
                      <div>
                        <div className="text-xs font-bold">Qty → Rate</div>
                        <div className="text-[10px] text-muted-foreground">Quantity first, then Rate</div>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setScrapBillSettings(s => ({ ...s, itemColumnOrder: 'rate_qty' }))}
                      className={clsx(
                        'flex items-center gap-3 p-3 rounded-xl border text-left transition-all cursor-pointer',
                        scrapBillSettings.itemColumnOrder === 'rate_qty'
                          ? 'bg-primary/10 border-primary text-primary font-semibold'
                          : 'bg-background border-border text-foreground hover:border-primary/30'
                      )}
                    >
                      <div className="w-4 h-4 rounded-full border-2 border-current flex items-center justify-center shrink-0">
                        {scrapBillSettings.itemColumnOrder === 'rate_qty' && <div className="w-2 h-2 rounded-full bg-current" />}
                      </div>
                      <div>
                        <div className="text-xs font-bold">Rate → Qty</div>
                        <div className="text-[10px] text-muted-foreground">Rate first, then Quantity</div>
                      </div>
                    </button>
                  </div>
                </div>

                <div className="p-4.5 bg-muted/30 border border-border rounded-2xl hover:border-primary/20 transition-all duration-300">
                  <label className="text-xs font-bold text-foreground mb-3 block">Scrap Bill Content</label>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
                    {[
                      { key: 'showScrapHeading', label: 'Scrap Bill Heading' },
                      { key: 'showShopName', label: 'Shop Name' },
                      { key: 'showShopAddress', label: 'Shop Address' },
                      { key: 'showPhone', label: 'Phone Number' },
                      { key: 'showShopGstin', label: 'Shop GSTIN' },
                      { key: 'showTitle', label: 'Document Title' },
                      { key: 'showBillerName', label: 'Biller Name' },
                      { key: 'showCustomerName', label: 'Customer Name' },
                      { key: 'showCustomerPhone', label: 'Customer Phone' },
                      { key: 'showCustomerAddress', label: 'Customer Address' },
                      { key: 'showCustomerState', label: 'Customer State' },
                      { key: 'showBarcodeOnReceipt', label: 'Invoice Barcode on Receipts' },
                      { key: 'showAuthorisedSignatory', label: 'Authorised Signatory' },
                      { key: 'showForShopName', label: 'For {shop name}' },
                    ].map(({ key, label }) => {
                      const isChecked = (scrapBillSettings as any)[key] !== false;
                      return (
                        <label key={key} className="flex items-center gap-3 cursor-pointer group text-xs text-foreground font-medium select-none">
                          <button
                            type="button"
                            onClick={() => setScrapBillSettings(s => ({ ...s, [key]: (s as any)[key] === false ? true : false }))}
                            className={clsx(
                              'w-4.5 h-4.5 rounded-lg border-2 flex items-center justify-center transition-all shrink-0',
                              isChecked ? 'bg-primary border-primary' : 'border-muted-foreground/30 group-hover:border-primary/50'
                            )}
                          >
                            {isChecked && <CheckCircle2 className="w-3 h-3 text-primary-foreground" />}
                          </button>
                          <span>{label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="p-4.5 bg-muted/30 border border-border rounded-2xl hover:border-primary/20 transition-all duration-300">
                  <label className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider mb-3 block">Bill / Receipt Font</label>
                  <div className="flex flex-wrap gap-2.5">
                    {FONT_OPTIONS.map(f => (
                      <button
                        type="button"
                        key={f.id}
                        onClick={() => setReceiptFont(f.id)}
                        className={clsx(
                          'px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 active:scale-95 cursor-pointer border',
                          receiptFont === f.id
                            ? 'bg-primary text-primary-foreground shadow-md shadow-primary/10 border-transparent scale-100 font-extrabold'
                            : 'bg-background text-muted-foreground hover:bg-muted hover:text-foreground border-border/60'
                        )}
                        style={{ fontFamily: receiptFont === f.id ? f.family : undefined }}
                      >
                        {f.name}
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] text-muted-foreground/70 mt-2.5">Font used when printing receipts &amp; bills.</p>
                </div>

                <div className="p-4 bg-amber-500/[0.04] border border-amber-500/20 rounded-2xl flex items-start gap-3">
                  <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700 dark:text-amber-400 font-medium leading-relaxed">
                    Changes apply only to new invoices. Previously generated invoices remain unaffected.
                  </p>
                </div>
              </div>
            </div>

            {/* Card 2: Label Format */}
            <div className="bg-card border border-border rounded-[28px] p-6 md:p-8 shadow-sm hover:shadow-md hover:border-purple-500/20 transition-all duration-300">
              <div className="flex items-center gap-3 mb-6 pb-4 border-b border-border">
                <div className="p-2.5 rounded-2xl bg-purple-500/10 text-purple-600 shadow-[0_4px_12px_rgba(168,85,247,0.1)] shrink-0">
                  <Tags className="w-4.5 h-4.5" />
                </div>
                <span className="text-xs font-black text-purple-600 uppercase tracking-widest">Product Label Codes</span>
              </div>
              <div className="space-y-5">
                <div>
                  <label className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider mb-3 block">Default Code Type</label>
                  <div className="grid grid-cols-2 gap-4">
                    {CODE_TYPES.map((ct) => (
                      <button
                        type="button"
                        key={ct.id}
                        onClick={() => setLabelCodeType(ct.id)}
                        className={clsx(
                          "relative flex items-center gap-3.5 p-4.5 rounded-2xl border-2 transition-all duration-300 cursor-pointer text-left",
                          labelCodeType === ct.id
                            ? "border-primary bg-primary/5 shadow-md ring-1 ring-primary/10"
                            : "border-border/80 hover:border-primary/35 hover:bg-muted/20"
                        )}
                      >
                        <div className={clsx(
                          "p-2.5 rounded-xl shrink-0",
                          labelCodeType === ct.id ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                        )}>
                          {ct.id === 'barcode' ? (
                            <svg className="w-5 h-5 text-current" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M2 4h2v16H2zM6 4h1v16H6zM9 4h2v16H9zM13 4h1v16h-1zM16 4h2v16h-2zM20 4h2v16h-2z" />
                            </svg>
                          ) : (
                            <svg className="w-5 h-5 text-current" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="3" y="3" width="18" height="18" rx="2" />
                              {[7,9,11,13,15].map(x => (
                                <g key={x}>
                                  <rect x={x} y="7" width="1" height="2" fill="currentColor" />
                                  <rect x={x} y="11" width="1" height="2" fill="currentColor" />
                                  <rect x={x} y="15" width="1" height="2" fill="currentColor" />
                                </g>
                              ))}
                              <rect x="17" y="7" width="1" height="10" fill="currentColor" />
                            </svg>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-foreground truncate">{ct.label}</p>
                          <p className="text-xs text-muted-foreground/75 truncate mt-0.5">{ct.description}</p>
                        </div>
                        {labelCodeType === ct.id && (
                          <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center shrink-0 shadow-sm shadow-primary/20">
                            <CheckCircle2 className="w-3.5 h-3.5 text-primary-foreground" />
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-4 p-4.5 bg-muted/30 border border-border rounded-2xl hover:border-primary/20 transition-all duration-300">
                  <div className="flex-1">
                    <label className="text-xs font-bold text-foreground cursor-pointer select-none" onClick={() => setLabelShowShopName(!labelShowShopName)}>Show Shop Name on Labels</label>
                    <p className="text-[10px] text-muted-foreground/75 mt-0.5">Print the shop name at the top of product barcode and QR labels.</p>
                  </div>
                  <button type="button" onClick={() => setLabelShowShopName(!labelShowShopName)} className={clsx('relative w-11 h-6 rounded-full transition-all duration-300 shrink-0 cursor-pointer', labelShowShopName ? 'bg-primary shadow-[0_2px_8px_rgba(79,70,229,0.3)]' : 'bg-muted-foreground/20')}>
                    <span className={clsx('absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all duration-300', labelShowShopName ? 'translate-x-5' : 'translate-x-0')} />
                  </button>
                </div>

                <div className="p-4 bg-blue-500/[0.04] border border-blue-500/20 rounded-2xl flex items-start gap-3">
                  <AlertCircle className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-blue-700 dark:text-blue-400 font-medium leading-relaxed">
                    The selected code type will be used as the default for generating, previewing, and printing product labels. Existing labels remain unaffected.
                  </p>
                </div>
              </div>
            </div>

            {/* Card 3: Billing Security & Actions */}
            <div className="bg-card border border-border rounded-[28px] p-6 md:p-8 shadow-sm hover:shadow-md hover:border-primary/20 transition-all duration-300">
              <div className="flex items-center gap-3 mb-6 pb-4 border-b border-border">
                <div className="p-2.5 rounded-2xl bg-primary/10 text-primary shadow-[0_4px_12px_rgba(79,70,229,0.1)] shrink-0">
                  <Shield className="w-4.5 h-4.5" />
                </div>
                <span className="text-xs font-black text-primary uppercase tracking-widest">Billing Security &amp; Actions</span>
              </div>

              <div className="space-y-3.5">
                {/* Convert to GST Toggle */}
                <div className="flex items-center justify-between gap-4 p-4 rounded-2xl border bg-muted/20 border-border/60">
                  <div className="flex-1 min-w-0">
                    <label className="text-xs font-bold text-foreground block">Convert to GST in Sales History</label>
                    <p className="text-[10px] text-muted-foreground/80 mt-0.5 leading-relaxed">
                      Show "Convert to GST" button in Sales History to convert Bill of Supply invoices to GST invoices.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEnableConvertToGst(!enableConvertToGst)}
                    className={clsx('relative w-11 h-6 rounded-full transition-all duration-300 shrink-0 cursor-pointer', enableConvertToGst ? 'bg-primary shadow-[0_2px_8px_rgba(79,70,229,0.3)]' : 'bg-muted-foreground/20')}
                    title={enableConvertToGst ? 'Enabled' : 'Disabled'}
                  >
                    <span className={clsx('absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all duration-300', enableConvertToGst ? 'translate-x-5' : 'translate-x-0')} />
                  </button>
                </div>

                {/* Biller PIN Protection Toggle */}
                <div className="flex items-center justify-between gap-4 p-4 rounded-2xl border bg-muted/20 border-border/60">
                  <div className="flex-1 min-w-0">
                    <label className="text-xs font-bold text-foreground block">Biller PIN Protection</label>
                    <p className="text-[10px] text-muted-foreground/80 mt-0.5 leading-relaxed">Require security PIN before switching biller or completing billing actions</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFeatureFlags({ ...featureFlags, biller_pin: !featureFlags.biller_pin })}
                    className={clsx('relative w-11 h-6 rounded-full transition-all duration-300 shrink-0 cursor-pointer', featureFlags.biller_pin ? 'bg-primary shadow-[0_2px_8px_rgba(79,70,229,0.3)]' : 'bg-muted-foreground/20')}
                    title={featureFlags.biller_pin ? 'Enabled' : 'Disabled'}
                  >
                    <span className={clsx('absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all duration-300', featureFlags.biller_pin ? 'translate-x-5' : 'translate-x-0')} />
                  </button>
                </div>

                {/* Sales Staff Tracking Toggle */}
                <div className="flex items-center justify-between gap-4 p-4 rounded-2xl border bg-muted/20 border-border/60">
                  <div className="flex-1 min-w-0">
                    <label className="text-xs font-bold text-foreground block">Sales Staff Tracking</label>
                    <p className="text-[10px] text-muted-foreground/80 mt-0.5 leading-relaxed">Track sales staff per invoice for performance and commission reporting</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFeatureFlags({ ...featureFlags, sales_staff: !featureFlags.sales_staff })}
                    className={clsx('relative w-11 h-6 rounded-full transition-all duration-300 shrink-0 cursor-pointer', featureFlags.sales_staff ? 'bg-primary shadow-[0_2px_8px_rgba(79,70,229,0.3)]' : 'bg-muted-foreground/20')}
                    title={featureFlags.sales_staff ? 'Enabled' : 'Disabled'}
                  >
                    <span className={clsx('absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all duration-300', featureFlags.sales_staff ? 'translate-x-5' : 'translate-x-0')} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      case 'system':
        return (
          <div className="space-y-6 animate-in fade-in duration-300">
            {/* Card 1: Appearance */}
            <div className="bg-card border border-border rounded-[28px] p-6 md:p-8 shadow-sm hover:shadow-md hover:border-primary/20 transition-all duration-300">
              <div className="flex items-center gap-3 mb-6 pb-4 border-b border-border">
                <div className="p-2.5 rounded-2xl bg-primary/10 text-primary shadow-[0_4px_12px_rgba(79,70,229,0.1)] shrink-0">
                  <Type className="w-4.5 h-4.5" />
                </div>
                <span className="text-xs font-black text-primary uppercase tracking-widest">Appearance</span>
              </div>
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-bold text-foreground">Font Size</p>
                    <p className="text-xs text-muted-foreground/75 mt-0.5">Scale the entire UI text size</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <button type="button" onClick={decreaseFontScale} disabled={fontScale <= 70} className="w-11 h-11 flex items-center justify-center rounded-2xl bg-background border border-border/80 text-muted-foreground hover:text-foreground hover:bg-muted/40 shadow-[0_0_6px_rgba(0,0,0,0.06)] dark:shadow-[0_0_6px_rgba(255,255,255,0.04)] hover:shadow-[0_0_12px_rgba(0,0,0,0.12)] dark:hover:shadow-[0_0_12px_rgba(255,255,255,0.08)] hover:border-foreground/20 transition-all duration-200 active:scale-90 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"><Minus className="w-4 h-4" /></button>
                    <div className="w-20 text-center select-none">
                      <span className="text-2xl font-black text-foreground font-mono">{fontScale}%</span>
                      <div className="flex items-center justify-center gap-1 mt-1">
                        <span className={clsx('w-2 h-2 rounded-full shrink-0', fontScale <= 80 ? 'bg-blue-500 animate-pulse' : fontScale <= 100 ? 'bg-emerald-500' : fontScale <= 120 ? 'bg-amber-500' : 'bg-red-500')} />
                        <span className="text-[9px] font-bold text-muted-foreground/80">{fontScale <= 80 ? 'Small' : fontScale <= 100 ? 'Normal' : fontScale <= 120 ? 'Large' : 'X-Large'}</span>
                      </div>
                    </div>
                    <button type="button" onClick={increaseFontScale} disabled={fontScale >= 140} className="w-11 h-11 flex items-center justify-center rounded-2xl bg-background border border-border/80 text-muted-foreground hover:text-foreground hover:bg-muted/40 shadow-[0_0_6px_rgba(0,0,0,0.06)] dark:shadow-[0_0_6px_rgba(255,255,255,0.04)] hover:shadow-[0_0_12px_rgba(0,0,0,0.12)] dark:hover:shadow-[0_0_12px_rgba(255,255,255,0.08)] hover:border-foreground/20 transition-all duration-200 active:scale-90 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"><Plus className="w-4 h-4" /></button>
                  </div>
                </div>
                <div className="p-5 bg-muted/20 dark:bg-muted/10 border border-border/50 rounded-2xl">
                  <div className="flex items-center gap-2 mb-3"><Type className="w-4 h-4 text-primary" /><span className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider">Preview</span></div>
                  <p className="text-xs text-foreground font-semibold leading-relaxed">The quick brown fox jumps over the lazy dog.</p>
                  <p className="text-[10px] text-muted-foreground/70 mt-1">This is how your receipts, invoices, and product labels will appear.</p>
                </div>
                <button type="button" onClick={() => setFontScale(100)} disabled={fontScale === 100} className="px-4 py-2.5 text-xs font-bold text-muted-foreground hover:text-foreground bg-muted/60 hover:bg-muted border border-border/80 rounded-xl transition-all duration-200 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer shadow-sm">Reset to Default</button>
              </div>
            </div>

            {/* Card 2: Security */}
            <div className="bg-card border border-border rounded-[28px] p-6 md:p-8 shadow-sm hover:shadow-md hover:border-primary/20 transition-all duration-300">
              <div className="flex items-center gap-3 mb-6 pb-4 border-b border-border">
                <div className="p-2.5 rounded-2xl bg-primary/10 text-primary shadow-[0_4px_12px_rgba(79,70,229,0.1)] shrink-0">
                  <Shield className="w-4.5 h-4.5" />
                </div>
                <span className="text-xs font-black text-primary uppercase tracking-widest">Security</span>
              </div>
              <div className="space-y-4">
                <div>
                  <h3 className="font-bold text-foreground text-sm">Change Password</h3>
                  <p className="text-xs text-muted-foreground/75 mt-1 leading-relaxed">Update your account password regularly to keep your shop secure.</p>
                </div>
                <div className="relative flex items-center">
                  <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-muted-foreground/50 pointer-events-none" />
                  <Input type={showOldPass ? "text" : "password"} placeholder="Current Password" className="pl-11 pr-11 bg-background/50 focus:bg-background border-border/80 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all rounded-xl py-2.5" value={pass.old} onChange={(e) => setPass({ ...pass, old: e.target.value })} />
                  <button type="button" onClick={() => setShowOldPass(p => !p)} className="absolute right-3.5 p-1 text-muted-foreground hover:text-foreground transition-colors focus:outline-none" title={showOldPass ? "Hide password" : "View password"}>
                    {showOldPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="relative flex items-center">
                    <Input type={showNewPass ? "text" : "password"} placeholder="New Password" value={pass.new} onChange={(e) => setPass({ ...pass, new: e.target.value })} className="pr-10 bg-background/50 focus:bg-background border-border/80 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all rounded-xl py-2.5 w-full" />
                    <button type="button" onClick={() => setShowNewPass(p => !p)} className="absolute right-3 p-1 text-muted-foreground hover:text-foreground transition-colors focus:outline-none" title={showNewPass ? "Hide password" : "View password"}>
                      {showNewPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <div className="relative flex items-center">
                    <Input type={showConfirmPass ? "text" : "password"} placeholder="Confirm New Password" value={pass.confirm} onChange={(e) => setPass({ ...pass, confirm: e.target.value })} className="pr-10 bg-background/50 focus:bg-background border-border/80 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all rounded-xl py-2.5 w-full" />
                    <button type="button" onClick={() => setShowConfirmPass(p => !p)} className="absolute right-3 p-1 text-muted-foreground hover:text-foreground transition-colors focus:outline-none" title={showConfirmPass ? "Hide password" : "View password"}>
                      {showConfirmPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <button type="button" disabled={changingPass} onClick={handleChangePassword}
                  className="w-full flex items-center justify-center gap-2 px-5 py-3 text-xs font-bold bg-primary/10 hover:bg-primary hover:text-primary-foreground rounded-2xl transition-all duration-200 active:scale-95 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed border border-primary/20 hover:border-primary shadow-sm">
                  {changingPass ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : <Shield className="w-4 h-4 shrink-0" />}
                  Update Password
                </button>
              </div>
            </div>

            {/* Card 3: Updates */}
            <div className="bg-card border border-border rounded-[28px] p-6 md:p-8 shadow-sm hover:shadow-md hover:border-primary/20 transition-all duration-300">
              <div className="flex items-center gap-3 mb-6 pb-4 border-b border-border">
                <div className="p-2.5 rounded-2xl bg-primary/10 text-primary shadow-[0_4px_12px_rgba(79,70,229,0.1)] shrink-0">
                  <RefreshCw className="w-4.5 h-4.5" />
                </div>
                <span className="text-xs font-black text-primary uppercase tracking-widest">System Updates</span>
              </div>
              <div className="space-y-5">
                <div className="relative overflow-hidden rounded-[24px] border border-primary/25 bg-gradient-to-br from-primary/10 via-primary/[0.02] to-transparent shadow-sm">
                  <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(59,130,246,0.06),transparent_70%)]" />
                  <div className="relative p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-4">
                        <div className="p-3.5 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 text-primary shadow-[0_4px_20px_rgba(59,130,246,0.15)]"><RefreshCw className="w-5 h-5 animate-pulse" /></div>
                        <div>
                          <p className="text-[10px] font-bold text-muted-foreground/75 uppercase tracking-wider">Current Version</p>
                          <p className="text-3xl font-black text-foreground font-mono tracking-tight mt-0.5">{appVersion}</p>
                          {lastChecked && (<p className="text-[10px] text-muted-foreground/60 mt-1">Last checked {formatTimeAgo(lastChecked)}</p>)}
                        </div>
                      </div>
                      {updateStatus && (
                        updateStatus === 'Download failed'
                          ? (
                            <button
                              type="button"
                              onClick={handleRetryDownload}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-extrabold border shrink-0 uppercase tracking-wider bg-red-500/10 border-red-500/20 text-red-600 dark:text-red-400 hover:bg-red-500 hover:text-white hover:border-red-500 transition-all duration-200 active:scale-95 cursor-pointer"
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                              Retry Download
                            </button>
                          ) : (
                            <div className={clsx("flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-extrabold border shrink-0 uppercase tracking-wider", updateStatus === 'Up to date' ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400" : updateStatus === 'Update available' || updateStatus === 'Update ready to install' ? "bg-blue-500/10 border-blue-500/20 text-blue-600 dark:text-blue-400 animate-bounce" : updateStatus === 'Downloading...' || isDownloading ? "bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400" : "bg-muted/50 border-border text-muted-foreground")}>
                              {isDownloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : updateStatus === 'Up to date' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Download className="w-3.5 h-3.5" />}
                              {updateStatus}
                            </div>
                          )
                      )}
                    </div>
                  </div>
                </div>
                {updateStatus === 'Up to date' && !updateInfo && (
                  <div className="rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/[0.04] to-transparent overflow-hidden shadow-sm">
                    <div className="flex items-center gap-4.5 px-5 py-4.5">
                      <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shadow-sm shrink-0"><CheckCircle2 className="w-5 h-5" /></div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-foreground">{appVersion} â€” You're on the latest version</p>
                        <p className="text-xs text-muted-foreground/75 mt-0.5">No updates available at this time.</p>
                      </div>
                      <span className="px-2.5 py-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[9px] font-extrabold rounded-lg border border-emerald-500/20 shrink-0 uppercase tracking-wider">UP TO DATE</span>
                    </div>
                  </div>
                )}
                {updateInfo && (
                  <div className="rounded-2xl border border-blue-500/20 bg-gradient-to-br from-blue-500/[0.04] to-transparent overflow-hidden shadow-sm">
                    <div className="flex items-center gap-4.5 px-5 py-4.5 border-b border-blue-500/10">
                      <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 shrink-0"><Download className="w-4.5 h-4.5" /></div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-foreground">v{updateInfo.version} {updateReady ? 'Ready to Install' : isDownloading ? 'Downloading...' : 'Available'}</p>
                        {updateInfo.releaseDate && (<p className="text-xs text-muted-foreground/70 mt-0.5">Released {new Date(updateInfo.releaseDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>)}
                      </div>
                      <span className="px-2.5 py-1 bg-blue-500/10 text-blue-600 dark:text-blue-400 text-[9px] font-extrabold rounded-lg border border-blue-500/20 shrink-0 uppercase tracking-wider">{updateReady ? 'READY' : isDownloading ? 'DOWNLOADING' : 'NEW'}</span>
                    </div>
                    {updateInfo.releaseNotes && (
                      <div className="px-5 py-4.5 bg-muted/20">
                        <p className="text-[10px] font-extrabold text-muted-foreground/80 uppercase tracking-widest mb-3">What's New</p>
                        <div className="text-xs text-muted-foreground/80 max-h-36 overflow-y-auto leading-relaxed space-y-2 font-medium">
                          {typeof updateInfo.releaseNotes === 'string'
                            ? updateInfo.releaseNotes.split('\n').filter(Boolean).map((line: string, i: number) => (<p key={i} className="flex items-start gap-2.5"><span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-blue-500/60 shrink-0" /><span>{line}</span></p>))
                            : <p className="text-muted-foreground">{JSON.stringify(updateInfo.releaseNotes)}</p>}
                        </div>
                      </div>
                    )}
                    {isDownloading && downloadProgress && (
                      <div className="px-5 pb-4.5">
                        <div className="w-full bg-border/50 rounded-full h-2 overflow-hidden shadow-inner"><div className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-300" style={{ width: `${Math.min(downloadProgress.percent, 100)}%` }} /></div>
                        <div className="flex items-center justify-between mt-2"><p className="text-[10px] font-bold text-muted-foreground/80">{Math.round(downloadProgress.percent)}%</p><p className="text-[10px] font-bold text-muted-foreground/80 font-mono">{formatBytes(downloadProgress.transferred)} / {formatBytes(downloadProgress.total)}</p></div>
                      </div>
                    )}
                    {updateReady && (
                      <div className="px-5 pb-4.5">
                        <button type="button" onClick={handleInstallUpdate} className="flex items-center justify-center gap-2 w-full h-11 rounded-2xl font-bold text-xs bg-primary/10 hover:bg-primary hover:text-primary-foreground border border-primary/20 hover:border-primary transition-all duration-200 active:scale-95 cursor-pointer shadow-sm">
                          <RotateCcw className="w-4 h-4 shrink-0" /> Restart & Install Update
                        </button>
                      </div>
                    )}
                  </div>
                )}
                {updateStatus === 'Download failed' && (
                  <div className="rounded-2xl border border-red-500/20 bg-gradient-to-br from-red-500/[0.04] to-transparent overflow-hidden shadow-sm">
                    <div className="flex items-center gap-4.5 px-5 py-4.5">
                      <div className="p-2.5 rounded-xl bg-red-500/10 text-red-600 dark:text-red-400 shrink-0"><AlertCircle className="w-5 h-5" /></div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-foreground">Update Download Failed</p>
                        <p className="text-xs text-muted-foreground/75 mt-0.5">Check your internet connection and try again.</p>
                      </div>
                      <button
                        type="button"
                        onClick={handleRetryDownload}
                        className="flex items-center gap-2 px-4 py-2.5 text-xs font-bold bg-red-500/10 hover:bg-red-500 hover:text-white rounded-2xl transition-all duration-200 active:scale-95 cursor-pointer border border-red-500/20 hover:border-red-500 shadow-sm shrink-0"
                      >
                        <RefreshCw className="w-4 h-4 shrink-0" /> Try Again
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Card 4: Stock Report Default View */}
            <div className="bg-card border border-border rounded-[28px] p-6 md:p-8 shadow-sm hover:shadow-md hover:border-primary/20 transition-all duration-300">
              <div className="flex items-center gap-3 mb-6 pb-4 border-b border-border">
                <div className="p-2.5 rounded-2xl bg-primary/10 text-primary shadow-[0_4px_12px_rgba(79,70,229,0.1)] shrink-0">
                  <FileText className="w-4.5 h-4.5" />
                </div>
                <span className="text-xs font-black text-primary uppercase tracking-widest">Stock Report</span>
              </div>
              <div className="space-y-4">
                <label className="text-sm font-bold text-foreground">Default View</label>
                <p className="text-xs text-muted-foreground">Choose which tab opens by default when you open the stock report.</p>
                <DefaultStockReportViewSelector value={stockReportDefaultView} onChange={setStockReportDefaultView} />
              </div>
            </div>

            {/* Card 5: Inventory Default View */}
            <div className="bg-card border border-border rounded-[28px] p-6 md:p-8 shadow-sm hover:shadow-md hover:border-primary/20 transition-all duration-300">
              <div className="flex items-center gap-3 mb-6 pb-4 border-b border-border">
                <div className="p-2.5 rounded-2xl bg-primary/10 text-primary shadow-[0_4px_12px_rgba(79,70,229,0.1)] shrink-0">
                  <Package className="w-4.5 h-4.5" />
                </div>
                <span className="text-xs font-black text-primary uppercase tracking-widest">Inventory</span>
              </div>
              <div className="space-y-4">
                <label className="text-sm font-bold text-foreground">Default View</label>
                <p className="text-xs text-muted-foreground">Choose which tab opens by default when you open the inventory manager.</p>
                <DefaultStockReportViewSelector value={inventoryDefaultView} onChange={setInventoryDefaultView} />
              </div>
            </div>
          </div>
        );
      case 'features':
        return (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div className="bg-card/45 dark:bg-card/25 border border-border/50 rounded-[28px] p-6 md:p-8 shadow-sm hover:shadow-md hover:border-primary/20 hover:bg-card/65 transition-all duration-300 backdrop-blur-sm">
              <div className="flex items-center gap-3 mb-6 pb-4 border-b border-border/40">
                <div className="p-2.5 rounded-2xl bg-primary/10 text-primary shadow-[0_4px_12px_rgba(79,70,229,0.1)] shrink-0">
                  <Power className="w-4.5 h-4.5" />
                </div>
                <span className="text-xs font-black text-primary uppercase tracking-widest">Features &amp; Modules</span>
                <div className="ml-auto flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmTurnOffAllModalOpen(true)}
                    className="px-3 py-1.5 text-[10px] font-bold text-destructive bg-destructive/10 hover:bg-destructive/15 border border-destructive/25 rounded-xl transition-all duration-200 active:scale-95 cursor-pointer"
                  >
                    Turn Off All
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFeatureFlags(sanitizeFeatureFlags(Object.fromEntries(FEATURE_LIST.map(f => [f.key, true])) as FeatureFlags));
                      setShowCashRegister(true);
                    }}
                    className="px-3 py-1.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/15 border border-emerald-500/25 rounded-xl transition-all duration-200 active:scale-95 cursor-pointer"
                  >
                    Turn On All
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {FEATURE_LIST.map(def => {
                  const enabled = featureFlags[def.key];
                  return (
                    <div
                      key={def.key}
                      className={clsx(
                        'flex items-center justify-between gap-4 p-4.5 rounded-2xl border transition-all duration-300',
                        enabled ? 'bg-muted/20 dark:bg-muted/10 border-border/60 hover:border-primary/25' : 'bg-background border-border/40 opacity-75 hover:border-destructive/25'
                      )}
                    >
                      <div className="flex-1 min-w-0">
                        <label className="text-xs font-bold text-foreground cursor-pointer select-none" onClick={() => handleToggleFeatureFlag(def.key)}>{def.label}</label>
                        <p className="text-[10px] text-muted-foreground/75 mt-0.5 leading-relaxed">{def.desc}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleToggleFeatureFlag(def.key)}
                        className={clsx('relative w-11 h-6 rounded-full transition-all duration-300 shrink-0 cursor-pointer', enabled ? 'bg-primary shadow-[0_2px_8px_rgba(79,70,229,0.3)]' : 'bg-muted-foreground/20')}
                        title={enabled ? 'Enabled' : 'Disabled'}
                      >
                        <span className={clsx('absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all duration-300', enabled ? 'translate-x-5' : 'translate-x-0')} />
                      </button>
                    </div>
                  );
                })}
              </div>

              <div className="mt-6 p-4 bg-blue-500/[0.04] border border-blue-500/20 rounded-2xl flex items-start gap-3">
                <AlertCircle className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                <p className="text-xs text-blue-700 dark:text-blue-400 font-medium leading-relaxed">
                  Disabled features are hidden everywhere — dashboards, billing page buttons, and manager screens. Existing data is never deleted; re-enabling a feature restores it. Changes apply after saving.
                </p>
              </div>

              {/* Party Ledger Balance Modes Card */}
              <div className="mt-6 bg-card border border-border rounded-[28px] p-6 shadow-sm">
                <div className="flex items-center gap-3 mb-4 pb-3 border-b border-border">
                  <div className="p-2.5 rounded-2xl bg-primary/10 text-primary shadow-[0_4px_12px_rgba(79,70,229,0.1)] shrink-0">
                    <Handshake className="w-4.5 h-4.5" />
                  </div>
                  <div>
                    <h3 className="text-xs font-black text-foreground uppercase tracking-widest">Party Ledger Balance Modes</h3>
                    <p className="text-[11px] text-muted-foreground font-medium mt-0.5">Control whether party ledgers track separate GST &amp; Estimate balances or a single balance</p>
                  </div>
                </div>

                <div className="space-y-3.5">
                  {/* GST Balance Toggle */}
                  <div className="flex items-center justify-between gap-4 p-4 rounded-2xl border bg-muted/20 border-border/60">
                    <div className="flex-1 min-w-0">
                      <label className="text-xs font-bold text-foreground block">Track GST Balance in Ledger</label>
                      <p className="text-[10px] text-muted-foreground/80 mt-0.5 leading-relaxed">Maintain separate GST tax invoice balance for ledger accounts</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (enablePartyGst && !enablePartyEstimate) {
                          setMessage({ type: 'error', text: 'Cannot turn off both GST and Estimate balance tracking. At least one must remain active.' });
                          return;
                        }
                        setEnablePartyGst(!enablePartyGst);
                      }}
                      className={clsx('relative w-11 h-6 rounded-full transition-all duration-300 shrink-0 cursor-pointer', enablePartyGst ? 'bg-primary shadow-[0_2px_8px_rgba(79,70,229,0.3)]' : 'bg-muted-foreground/20')}
                      title={enablePartyGst ? 'Enabled' : 'Disabled'}
                    >
                      <span className={clsx('absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all duration-300', enablePartyGst ? 'translate-x-5' : 'translate-x-0')} />
                    </button>
                  </div>

                  {/* Estimate Balance Toggle */}
                  <div className="flex items-center justify-between gap-4 p-4 rounded-2xl border bg-muted/20 border-border/60">
                    <div className="flex-1 min-w-0">
                      <label className="text-xs font-bold text-foreground block">Track Estimate Balance in Ledger</label>
                      <p className="text-[10px] text-muted-foreground/80 mt-0.5 leading-relaxed">Maintain separate Estimate / Non-GST invoice balance for ledger accounts</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (enablePartyEstimate && !enablePartyGst) {
                          setMessage({ type: 'error', text: 'Cannot turn off both GST and Estimate balance tracking. At least one must remain active.' });
                          return;
                        }
                        setEnablePartyEstimate(!enablePartyEstimate);
                      }}
                      className={clsx('relative w-11 h-6 rounded-full transition-all duration-300 shrink-0 cursor-pointer', enablePartyEstimate ? 'bg-primary shadow-[0_2px_8px_rgba(79,70,229,0.3)]' : 'bg-muted-foreground/20')}
                      title={enablePartyEstimate ? 'Enabled' : 'Disabled'}
                    >
                      <span className={clsx('absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all duration-300', enablePartyEstimate ? 'translate-x-5' : 'translate-x-0')} />
                    </button>
                  </div>

                  {(!enablePartyGst || !enablePartyEstimate) && (
                    <div className="p-3.5 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center gap-2.5 text-xs text-amber-700 dark:text-amber-300 font-medium leading-relaxed">
                      <Info className="w-4 h-4 shrink-0 text-amber-500" />
                      <span>
                        {enablePartyGst
                          ? 'Estimate Balance is turned OFF. Ledger UI will show a single main balance without GST or Estimate labels, and form selection is hidden.'
                          : 'GST Balance is turned OFF. Ledger UI will show a single main balance without GST or Estimate labels, and form selection is hidden.'}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      case 'network':
        return (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div className="bg-card border border-border rounded-[28px] p-6 md:p-8 shadow-sm hover:shadow-md hover:border-primary/20 transition-all duration-300">
              <div className="flex items-center justify-between gap-3 mb-6 pb-4 border-b border-border">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-2xl bg-primary/10 text-primary shadow-[0_4px_12px_rgba(79,70,229,0.1)] shrink-0">
                    <Wifi className="w-4.5 h-4.5" />
                  </div>
                  <div>
                    <span className="text-xs font-black text-foreground uppercase tracking-widest block">Network & Connectivity Mode</span>
                    <span className="text-[11px] text-muted-foreground font-medium">Choose how POS terminals sync all store data (Products, Invoices, Stock, Customers & Ledger)</span>
                  </div>
                </div>

                {/* Question Mark (?) Help Button with Hover Tooltip */}
                <div className="relative group shrink-0">
                  <button
                    type="button"
                    onClick={() => setShowLanHelpModal(true)}
                    className="p-2.5 rounded-2xl bg-primary/10 hover:bg-primary text-primary hover:text-primary-foreground border border-primary/20 transition-all duration-200 cursor-pointer shadow-sm active:scale-95 flex items-center gap-1.5"
                    title="View Wi-Fi / LAN Sync Setup Manual"
                  >
                    <HelpCircle className="w-4.5 h-4.5" />
                    <span className="text-[10px] font-extrabold uppercase tracking-wider hidden sm:inline">Setup Manual</span>
                  </button>

                  {/* Hover Tooltip Card */}
                  <div className="absolute right-0 top-12 w-72 p-4 bg-popover border border-border rounded-2xl shadow-2xl opacity-0 group-hover:opacity-100 transition-all duration-200 pointer-events-none group-hover:pointer-events-auto z-40 space-y-2 text-left backdrop-blur-md">
                    <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                      <BookOpen className="w-4 h-4 text-primary shrink-0" />
                      <span>Wi-Fi / LAN Setup Manual</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      Step-by-step guide to connect Primary Host &amp; Secondary Billing Terminals over Wi-Fi, setup firewall rules, and fix connection issues.
                    </p>
                    <button
                      type="button"
                      onClick={() => setShowLanHelpModal(true)}
                      className="w-full py-2 px-3 bg-primary hover:bg-primary/90 text-primary-foreground text-[10px] font-extrabold rounded-xl uppercase tracking-wider transition cursor-pointer flex items-center justify-center gap-1 mt-1 shadow-sm"
                    >
                      <span>Open Complete Guide</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Effective Cloud Access Status Banner */}
              {effectiveCloudState && (
                <div className="mb-6 p-4 rounded-2xl border bg-muted/20 border-border space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className={clsx(
                        "p-2 rounded-xl text-white font-bold shrink-0",
                        effectiveCloudState.stateName === 'LOCAL_PLUS_CLOUD' ? "bg-emerald-500" :
                        effectiveCloudState.stateName === 'LOCAL_WITH_PENDING_CLOUD_QUEUE' ? "bg-amber-500" : "bg-slate-600"
                      )}>
                        <Cloud className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-xs font-bold text-foreground">
                            {effectiveCloudState.stateName === 'LOCAL_PLUS_CLOUD' && 'Cloud Sync Allowed & Active'}
                            {effectiveCloudState.stateName === 'LOCAL_WITH_PENDING_CLOUD_QUEUE' && 'Cloud Sync Paused — Local DB & LAN Sync Active'}
                            {effectiveCloudState.stateName === 'LOCAL_ONLY' && 'Local-Only Operational Mode'}
                          </h4>
                          <span className={clsx(
                            "px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide",
                            effectiveCloudState.stateName === 'LOCAL_PLUS_CLOUD' ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20" :
                            effectiveCloudState.stateName === 'LOCAL_WITH_PENDING_CLOUD_QUEUE' ? "bg-amber-500/10 text-amber-600 border border-amber-500/20 animate-pulse" :
                            "bg-slate-500/10 text-slate-600 border border-slate-500/20"
                          )}>
                            {effectiveCloudState.stateName}
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {effectiveCloudState.activeReason} • Outbox Pending: <strong>{effectiveCloudState.pendingCount}</strong> records
                        </p>
                      </div>
                    </div>

                    {effectiveCloudState.isCloudAllowed && effectiveCloudState.pendingCount > 0 && (
                      <button
                        type="button"
                        onClick={handleManualQueueDrain}
                        disabled={drainingQueue}
                        className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold rounded-xl text-xs flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                      >
                        <RefreshCw className={clsx("w-3.5 h-3.5", drainingQueue && "animate-spin")} />
                        {drainingQueue ? 'Draining Queue...' : `Drain Queue (${effectiveCloudState.pendingCount})`}
                      </button>
                    )}
                  </div>

                  {effectiveCloudState.config?.cloud_access_enabled === false && (
                    <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-2 text-xs text-red-600 dark:text-red-400 font-medium">
                      <Lock className="w-4 h-4 shrink-0" />
                      <span>Cloud Sync Access is disabled by Super Admin for this store. Local database operations and LAN synchronization remain fully available.</span>
                    </div>
                  )}
                </div>
              )}

              {/* Mode Selector Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                {/* Option 1: Cloud Sync */}
                <button
                  type="button"
                  onClick={() => setSyncMode('CLOUD')}
                  className={clsx(
                    'p-5 rounded-2xl border-2 text-left transition-all cursor-pointer flex flex-col justify-between space-y-3',
                    syncMode === 'CLOUD'
                      ? 'border-primary bg-primary/5 text-primary shadow-sm ring-2 ring-primary/20'
                      : 'border-border bg-background hover:border-primary/40 text-muted-foreground'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <Globe className="w-5 h-5 text-indigo-500" />
                    {syncMode === 'CLOUD' && <CheckCircle2 className="w-4 h-4 text-primary" />}
                  </div>
                  <div>
                    <h4 className="text-xs font-extrabold text-foreground mb-1">Cloud API Sync</h4>
                    <p className="text-[10px] opacity-80 leading-relaxed">Direct internet sync to cloud API. Best for multi-branch stores or remote monitoring.</p>
                  </div>
                </button>

                {/* Option 2: Local Wi-Fi Direct (LAN) */}
                <button
                  type="button"
                  onClick={() => setSyncMode('LAN')}
                  className={clsx(
                    'p-5 rounded-2xl border-2 text-left transition-all cursor-pointer flex flex-col justify-between space-y-3',
                    syncMode === 'LAN'
                      ? 'border-primary bg-primary/5 text-primary shadow-sm ring-2 ring-primary/20'
                      : 'border-border bg-background hover:border-primary/40 text-muted-foreground'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <Wifi className="w-5 h-5 text-emerald-500" />
                    {syncMode === 'LAN' && <CheckCircle2 className="w-4 h-4 text-primary" />}
                  </div>
                  <div>
                    <h4 className="text-xs font-extrabold text-foreground mb-1">Local Wi-Fi Direct (LAN)</h4>
                    <p className="text-[10px] opacity-80 leading-relaxed">Direct terminal-to-terminal Wi-Fi sync for all store data. Zero internet cost & sub-1ms speed.</p>
                  </div>
                </button>

                {/* Option 3: Hybrid Smart Mode */}
                <button
                  type="button"
                  onClick={() => setSyncMode('HYBRID')}
                  className={clsx(
                    'p-5 rounded-2xl border-2 text-left transition-all cursor-pointer flex flex-col justify-between space-y-3',
                    syncMode === 'HYBRID'
                      ? 'border-primary bg-primary/5 text-primary shadow-sm ring-2 ring-primary/20'
                      : 'border-border bg-background hover:border-primary/40 text-muted-foreground'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <RefreshCw className="w-5 h-5 text-amber-500" />
                    {syncMode === 'HYBRID' && <CheckCircle2 className="w-4 h-4 text-primary" />}
                  </div>
                  <div>
                    <h4 className="text-xs font-extrabold text-foreground mb-1">Hybrid Smart Mode</h4>
                    <p className="text-[10px] opacity-80 leading-relaxed">Auto-detects local Wi-Fi for instant in-store data sync; falls back to cloud API when remote.</p>
                  </div>
                </button>
              </div>

              {/* LAN Configuration Settings */}
              {(syncMode === 'LAN' || syncMode === 'HYBRID') && (
                <div className="p-5 bg-muted/30 border border-border rounded-2xl space-y-4 mb-6 animate-in fade-in duration-200">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">Local Store Server & Data Sync Settings</h4>
                    <span className="text-[10px] font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full">Full Database Sync</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Terminal Role</label>
                      <Select
                        value={lanRole}
                        onChange={(val) => {
                          setLanRole(val as any);
                          if (val === 'PRIMARY' && detectedLocalIp) setLanHostIp(detectedLocalIp);
                        }}
                        options={[
                          { value: 'PRIMARY', label: 'Primary Master Server (Main Store PC - Syncs All Data)' },
                          { value: 'SECONDARY', label: 'Secondary Store Terminal (Connects to Master PC)' },
                        ]}
                      />
                    </div>
                    {lanRole === 'PRIMARY' ? (
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">This PC (Master Server) Local IP Address</label>
                        <div className="flex items-center gap-2 p-2.5 bg-background border border-border rounded-xl font-mono text-xs font-bold text-primary">
                          <span>{detectedLocalIp || lanHostIp || '192.168.1.100'}</span>
                          <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded-full ml-auto">Server Host</span>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Primary Master Server (PC 1) IP Address</label>
                        <Input
                          type="text"
                          value={lanHostIp}
                          onChange={(e) => setLanHostIp(e.target.value)}
                          placeholder="e.g. 192.168.1.100"
                          className="font-mono text-xs font-semibold"
                        />
                      </div>
                    )}
                  </div>

                  {lanRole === 'PRIMARY' ? (
                    <div className="p-3 bg-primary/5 border border-primary/15 rounded-xl flex items-center gap-2.5">
                      <span className="text-xs shrink-0">💡</span>
                      <p className="text-[11px] text-muted-foreground font-medium leading-relaxed">
                        Enter this IP address <strong className="text-primary font-bold">{detectedLocalIp || lanHostIp || '192.168.1.100'}</strong> on Secondary Store Terminals (PC 2) so they connect to this Master Server.
                      </p>
                    </div>
                  ) : (
                    <div className="p-3 bg-primary/5 border border-primary/15 rounded-xl flex flex-col gap-1.5">
                      <div className="flex items-center gap-2.5">
                        <span className="text-xs shrink-0">💡</span>
                        <p className="text-[11px] text-muted-foreground font-medium leading-relaxed">
                          Enter the exact IP address displayed on Primary PC 1 (Settings → Network & Connectivity).
                        </p>
                      </div>
                      <p className="text-[10px] text-amber-600 dark:text-amber-400 font-medium pl-6">
                        If Wi-Fi test fails: Ensure Windows Firewall on PC 1 allows Port 3888, Wi-Fi profile is set to Private, or select <strong>Hybrid Smart Mode</strong>.
                      </p>
                    </div>
                  )}

                  <p className="text-[10px] text-muted-foreground/80 leading-relaxed font-medium">
                    * Real-time synchronization of all store data: Invoices, Products, Stock, Inventory, Customers, Ledger & Cashier settlement across all terminals.
                  </p>
                </div>
              )}

              {/* Heartbeat Sync Frequency */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-foreground uppercase tracking-wider block">Sync Heartbeat Rate</label>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { id: 'NORMAL', label: 'Normal (60s)', desc: 'Lowest data usage & maximum server efficiency' },
                    { id: 'BALANCED', label: 'Balanced (30s)', desc: 'Standard multi-terminal store sync' },
                    { id: 'HIGH', label: 'Power Sync (15s)', desc: 'Fastest refresh for heavy checkout counters' },
                  ].map((rate) => (
                    <button
                      key={rate.id}
                      type="button"
                      onClick={() => setSyncFrequency(rate.id as any)}
                      className={clsx(
                        'p-3.5 rounded-xl border text-left transition-all cursor-pointer',
                        syncFrequency === rate.id
                          ? 'border-primary bg-primary/10 text-primary font-bold shadow-xs'
                          : 'border-border bg-background hover:border-primary/30 text-muted-foreground'
                      )}
                    >
                      <span className="text-xs font-bold block">{rate.label}</span>
                      <span className="text-[10px] opacity-75 mt-0.5 block">{rate.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Network Health Check & Live Toast Notification Action */}
              <div className="p-4 bg-primary/5 border border-primary/20 rounded-2xl flex items-center justify-between gap-4 mt-6">
                <div>
                  <h4 className="text-xs font-bold text-foreground">Test Network Connection</h4>
                  <p className="text-[10px] text-muted-foreground font-medium mt-0.5">
                    Click to test connectivity and trigger live status toast notification.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleTestNetworkConnection}
                  disabled={testingNetwork}
                  className="flex items-center gap-2 text-xs font-bold px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl transition-all shadow-xs disabled:opacity-50 cursor-pointer shrink-0"
                >
                  <RefreshCw className={clsx("w-3.5 h-3.5", testingNetwork && "animate-spin")} />
                  <span>{testingNetwork ? 'Testing Connection...' : 'Test Connection Status'}</span>
                </button>
              </div>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-background font-sans">
      {renderMessage()}
      {showBulkSheet && <BulkOnboardingSheet onClose={() => setShowBulkSheet(false)} />}

      {/* â”€â”€ Premium Header â”€â”€ */}
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
          {hasChanges && (
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className={clsx(
                "flex items-center gap-1.5 px-4 py-2.5 text-xs font-black rounded-2xl transition-all duration-200 active:scale-95 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-sm border",
                "text-primary-foreground bg-primary hover:bg-primary/90 border-primary shadow-primary/20 ring-2 ring-primary/20 animate-pulse"
              )}
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

      {/* â”€â”€ Sidebar + Content â”€â”€ */}
      <div className="flex-1 flex overflow-hidden">

        {/* â”€â”€ Left Sidebar Navigation â”€â”€ */}
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

        {/* â”€â”€ Mobile Section Picker â”€â”€ */}
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
                  {activeItem.id === 'store' && 'Manage your shop profile, GST registration, invoice counters, and features.'}
                  {activeItem.id === 'terminology' && 'Customise how Receivable, Payable, Received, and Paid terms are displayed across ledgers and reports.'}
                  {activeItem.id === 'hardware' && 'Configure receipt printers, barcode label printers, scales, and hardware connections.'}
                  {activeItem.id === 'products' && 'Manage product categories, grade pricing, and price coding alphabets.'}
                  {activeItem.id === 'printing' && 'Select paper formats for normal print (BOS/Estimate) and customize invoice & thermal template styles.'}
                  {activeItem.id === 'print_options' && 'Configure bill content checklists, T&C instructions, BOS tax rate, receipt typography, and label codes.'}
                  {activeItem.id === 'billing_ui' && 'Rearrange POS billing columns, customize theme colors, adjust touchscreen target density, and tailor layout for cashiers.'}
                  {activeItem.id === 'system' && 'Adjust UI scaling, security passwords, and manage system updates.'}
                  {activeItem.id === 'network' && 'Configure Cloud API sync, Local Wi-Fi direct connections, and hybrid store networks.'}
                  {activeItem.id === 'features' && 'Turn individual modules on or off across the app — dashboards, billing, and managers hide disabled features.'}
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
                setFeatureFlags(sanitizeFeatureFlags(Object.fromEntries(FEATURE_LIST.map(f => [f.key, false])) as FeatureFlags));
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

