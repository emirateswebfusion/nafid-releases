import { useState, useEffect, useRef, useMemo } from 'react';
import {
  Settings, Printer, Scale, Save, Loader2, RefreshCw, Download,
  Key, Tags, Building, Receipt, Usb,
  CheckCircle2, AlertCircle, Globe, Upload, Type, Plus, Minus,
  Smartphone, X, RotateCcw, Maximize2, Eye,
  Store, Package, Monitor, ChevronRight, Shield, FileText, TrendingUp,
  Clock, Power
} from 'lucide-react';
import { useCartStore } from '../store/cartStore';
import { useThemeStore } from '../store/themeStore';
import clsx from 'clsx';
import { useAuthStore } from '../store/authStore';
import { Input } from './ui/Input';
import { Select } from './ui/Select';
import { Skeleton } from './ui/Skeleton';
import { useCloseOnEscape } from '../hooks/useCloseOnEscape';
import { BulkOnboardingSheet } from './BulkOnboardingSheet';
import { PaperPreviewModal } from './PaperPreviewModal';
import { DEFAULT_BILL_SETTINGS, type BillSettings, setAppTimeFormat } from '../utils/receiptGenerator';
import { CODE_TYPE_CONFIGS, CODE_TYPES, DEFAULT_CODE_TYPE, type CodeType } from '../labelCodeTypes';
import { FEATURE_LIST, DEFAULT_FEATURE_FLAGS, loadFeatureFlags, wereFeatureFlagsStored, setFeatureFlag, type FeatureFlags } from '../featureFlags';

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
    ],
  },
  {
    category: 'Application',
    icon: Settings,
    items: [
      { id: 'system', label: 'App Preferences', icon: Settings },
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
  const { role, updateDomain, tenantId: _tenantId } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveRevision, setSaveRevision] = useState(0);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [activeSection, setActiveSection] = useState(role === 'OWNER' ? 'store' : 'hardware');
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
  const [changingPass, setChangingPass] = useState(false);
  const [appVersion, setAppVersion] = useState('v1.0.0');
  const [priceCoding, setPriceCoding] = useState<Record<string, string>>({
    '0': '', '1': '', '2': '', '3': '', '4': '', '5': '', '6': '', '7': '', '8': '', '9': ''
  });
  const [shopGstin, setShopGstin] = useState('');
  const [shopState, setShopState] = useState('KL');
  const [shopNameLocal, setShopNameLocal] = useState('');
  const [shopAddress, setShopAddress] = useState('');
  const [shopPhone, setShopPhone] = useState('');
  const [upiId, setUpiId] = useState('');
  const [showUpiQr, setShowUpiQr] = useState(true);
  const [showProductOffers, setShowProductOffers] = useState(true);
  const [openCashDrawerOnPending, setOpenCashDrawerOnPending] = useState(false);
  const [receiptFont, setReceiptFont] = useState('courier');
  const [billSettings, setBillSettings] = useState<BillSettings>({ ...DEFAULT_BILL_SETTINGS });
  const [scrapBillSettings, setScrapBillSettings] = useState<BillSettings>({ ...DEFAULT_BILL_SETTINGS });
  const [printFormat, setPrintFormat] = useState<'thermal' | 'a4' | 'half-a4'>('thermal');
  const [labelCodeType, setLabelCodeType] = useState<CodeType>(DEFAULT_CODE_TYPE);
  const [labelShowShopName, setLabelShowShopName] = useState(true);
  const [printWidth, setPrintWidth] = useState<number>(58);
  const [thermalStyle, setThermalStyle] = useState<'standard' | 'compact' | 'modern' | 'classic' | 'clean' | 'dot' | 'slim' | 'luxe' | 'boxed'>('standard');
  const [a4Style, setA4Style] = useState<'standard' | 'modern' | 'classic'>('standard');
  const [previewFormat, setPreviewFormat] = useState<'thermal' | 'a4' | 'half-a4' | null>(null);
  const [previewStyle, setPreviewStyle] = useState<string | null>(null);
  const [enableScrap, setEnableScrap] = useState(false);
  const [showCashRegister, setShowCashRegister] = useState(false);
  const [featureFlags, setFeatureFlags] = useState<FeatureFlags>({ ...DEFAULT_FEATURE_FLAGS });
  const [autoPrintBarcode, setAutoPrintBarcode] = useState(true);
  const [loyaltyEnabled, setLoyaltyEnabled] = useState(false);
  const [loyaltyEarningRate, setLoyaltyEarningRate] = useState(100);
  const [loyaltyRedemptionRate, setLoyaltyRedemptionRate] = useState(1);
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
  const initialSnapshot = useRef<string>('');

  const hasChanges = useMemo(() => {
    if (!initialSnapshot.current) return false;
    const current = JSON.stringify({ barcodePrinter, receiptPrinter, a4Printer, scale, priceCoding, shopGstin, shopState, shopNameLocal, shopAddress, shopPhone, upiId, showUpiQr, showProductOffers, openCashDrawerOnPending, receiptFont, printFormat, printWidth, thermalStyle, a4Style, terminalCode, invoiceStartNumber, enableThreeInvoiceSeries, b2bPrefix: enableThreeInvoiceSeries ? b2bPrefix : '', b2bStartNumber: enableThreeInvoiceSeries ? b2bStartNumber : '', b2cPrefix: enableThreeInvoiceSeries ? b2cPrefix : '', b2cStartNumber: enableThreeInvoiceSeries ? b2cStartNumber : '', labelCodeType, labelShowShopName, enableScrap, showCashRegister, autoPrintBarcode, loyaltyEnabled, loyaltyEarningRate, loyaltyRedemptionRate, billSettings, scrapBillSettings, gstProfitPercentage, returnPrefix, returnStartNumber, scrapPrefix, scrapStartNumber, quotationPrefix, quotationStartNumber, stockReportDefaultView, inventoryDefaultView, serviceChargeBarcode, timeFormat, features: JSON.stringify(featureFlags) });
    return current !== initialSnapshot.current;
  }, [barcodePrinter, receiptPrinter, a4Printer, scale, priceCoding, shopGstin, shopState, shopNameLocal, shopAddress, shopPhone, upiId, showUpiQr, showProductOffers, openCashDrawerOnPending, receiptFont, printFormat, printWidth, thermalStyle, a4Style, terminalCode, invoiceStartNumber, enableThreeInvoiceSeries, b2bPrefix, b2bStartNumber, b2cPrefix, b2cStartNumber, labelCodeType, labelShowShopName, enableScrap, showCashRegister, autoPrintBarcode, loyaltyEnabled, loyaltyEarningRate, loyaltyRedemptionRate, billSettings, scrapBillSettings, gstProfitPercentage, returnPrefix, returnStartNumber, scrapPrefix, scrapStartNumber, quotationPrefix, quotationStartNumber, stockReportDefaultView, inventoryDefaultView, serviceChargeBarcode, timeFormat, featureFlags, saveRevision]);

  useEffect(() => { loadSettings(); }, []);

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

  useEffect(() => {
    if (!loading) {
      initialSnapshot.current = JSON.stringify({ barcodePrinter, receiptPrinter, a4Printer, scale, priceCoding, shopGstin, shopState, shopNameLocal, shopAddress, shopPhone, upiId, showUpiQr, showProductOffers, openCashDrawerOnPending, receiptFont, printFormat, printWidth, thermalStyle, a4Style, terminalCode, invoiceStartNumber, enableThreeInvoiceSeries, b2bPrefix: enableThreeInvoiceSeries ? b2bPrefix : '', b2bStartNumber: enableThreeInvoiceSeries ? b2bStartNumber : '', b2cPrefix: enableThreeInvoiceSeries ? b2cPrefix : '', b2cStartNumber: enableThreeInvoiceSeries ? b2cStartNumber : '', labelCodeType, labelShowShopName, enableScrap, showCashRegister, autoPrintBarcode, loyaltyEnabled, loyaltyEarningRate, loyaltyRedemptionRate, billSettings, scrapBillSettings, gstProfitPercentage, stockReportDefaultView, inventoryDefaultView, serviceChargeBarcode, timeFormat, features: JSON.stringify(featureFlags) });
    }
  }, [loading]);

  const loadSettings = async () => {
    if (!window.electronAPI) return;
    const { tenantId } = useAuthStore.getState();
    const pBarcode = await window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'barcode_printer_config' });
    const pReceipt = await window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'receipt_printer_config' });
    const pA4 = await window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'a4_printer_config' });
    const pLegacy = await window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'printer_config' });
    const s = await window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'scale_config' });
    const pCoding = await window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'price_coding' });
    const gstinVal = await window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'shop_gstin' });
    const stateVal = await window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'shop_state' });
    const nameVal = await window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'shop_name' });
    const addressVal = await window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'shop_address' });
    const phoneVal = await window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'shop_phone' });
    const upiVal = await window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'upi_id' });
    const showQrVal = await window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'show_upi_qr' });
    const printFmt = await window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'print_format' });
    const labelType = await window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'label_code_type' });

    if (pBarcode && typeof pBarcode === 'object' && !Array.isArray(pBarcode)) {
      const cleanBarcode = { ...pBarcode };
      for (let i = 0; i <= 20; i++) delete cleanBarcode[String(i)];
      setBarcodePrinter({ type: 'usb', ip: '192.168.1.100', port: 9100, deviceName: '', ...cleanBarcode });
    } else if (pLegacy && typeof pLegacy === 'object' && !Array.isArray(pLegacy)) {
      const cleanLegacy = { ...pLegacy };
      for (let i = 0; i <= 20; i++) delete cleanLegacy[String(i)];
      setBarcodePrinter({ type: 'usb', ip: '192.168.1.100', port: 9100, deviceName: '', ...cleanLegacy });
    }

    if (pReceipt && typeof pReceipt === 'object' && !Array.isArray(pReceipt)) {
      const cleanReceipt = { ...pReceipt };
      for (let i = 0; i <= 20; i++) delete cleanReceipt[String(i)];
      setReceiptPrinter({ type: 'usb', ip: '192.168.1.100', port: 9100, deviceName: '', receiptWidthCm: 5.8, ...cleanReceipt });
    } else if (pLegacy && typeof pLegacy === 'object' && !Array.isArray(pLegacy)) {
      const cleanLegacy = { ...pLegacy };
      for (let i = 0; i <= 20; i++) delete cleanLegacy[String(i)];
      setReceiptPrinter({ type: 'usb', ip: '192.168.1.100', port: 9100, deviceName: '', receiptWidthCm: 5.8, ...cleanLegacy });
    }

    if (pA4 && typeof pA4 === 'object' && !Array.isArray(pA4)) {
      const cleanA4 = { ...pA4 };
      for (let i = 0; i <= 20; i++) delete cleanA4[String(i)];
      setA4Printer(cleanA4);
    }
    if (s && typeof s === 'object' && !Array.isArray(s)) setScale(s);
    if (pCoding && typeof pCoding === 'object' && !Array.isArray(pCoding)) setPriceCoding(pCoding);

    setShopGstin(typeof gstinVal === 'string' ? gstinVal : '');
    setShopState(typeof stateVal === 'string' ? stateVal : '');
    setShopNameLocal(typeof nameVal === 'string' ? nameVal : '');
    setShopAddress(typeof addressVal === 'string' ? addressVal : '');
    setShopPhone(typeof phoneVal === 'string' ? phoneVal : '');
    setUpiId(typeof upiVal === 'string' ? upiVal : '');
    if (showQrVal !== null && showQrVal !== undefined) setShowUpiQr(Boolean(showQrVal));
    const scrapEnabled = await window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'enable_scrap' });
    if (scrapEnabled !== null && scrapEnabled !== undefined) setEnableScrap(Boolean(scrapEnabled));

    const cashReg = await window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'show_cash_register' });
    if (cashReg !== null && cashReg !== undefined) setShowCashRegister(Boolean(cashReg));

    const flags = await loadFeatureFlags(tenantId || 'global');
    setFeatureFlags({ ...flags });
    if (wereFeatureFlagsStored()) {
      setEnableScrap(flags.scrap);
      setShowCashRegister(flags.cash_register);
    }

    const autoBarcode = await window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'auto_print_barcode' });
    if (autoBarcode !== null && autoBarcode !== undefined) setAutoPrintBarcode(Boolean(autoBarcode));

    const loyaltyCfg = await window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'loyalty_config' });
    if (loyaltyCfg) {
      setLoyaltyEnabled(Boolean(loyaltyCfg.enabled));
      if (loyaltyCfg.earningRate) setLoyaltyEarningRate(Number(loyaltyCfg.earningRate));
      if (loyaltyCfg.redemptionRate) setLoyaltyRedemptionRate(Number(loyaltyCfg.redemptionRate));
    }
    if (labelType && CODE_TYPE_CONFIGS[labelType as CodeType])     setLabelCodeType(labelType as CodeType);
    const labelShowName = await window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'label_show_shop_name' });
    if (labelShowName !== null && labelShowName !== undefined) setLabelShowShopName(Boolean(labelShowName));
    const srdv = await window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'stock_report_default_view' });
    if (srdv === 'estimate' || srdv === 'gst' || srdv === 'combined') setStockReportDefaultView(srdv);
    const invdv = await window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'inventory_default_view' });
    if (invdv === 'estimate' || invdv === 'gst' || invdv === 'combined') setInventoryDefaultView(invdv);

    const timeFmt = await window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'time_format' });
    if (timeFmt === '24h' || timeFmt === '12h') {
      setTimeFormat(timeFmt);
      setAppTimeFormat(timeFmt);
    } else {
      setTimeFormat('12h');
      setAppTimeFormat('12h');
    }
    if (printFmt) {
      if (printFmt.format === 'a4') {
        setPrintFormat('a4');
        if (printFmt.style) setA4Style(printFmt.style);
      } else if (printFmt.format === 'half-a4') {
        setPrintFormat('half-a4');
      } else {
        setPrintFormat('thermal');
        setPrintWidth(Number(printFmt.width) || 58);
        if (printFmt.style) setThermalStyle(printFmt.style);
      }
      if (printFmt.showProductOffers !== undefined) setShowProductOffers(Boolean(printFmt.showProductOffers));
      if (printFmt.openCashDrawerOnPending !== undefined) setOpenCashDrawerOnPending(Boolean(printFmt.openCashDrawerOnPending));
      if (printFmt.receiptFont) setReceiptFont(printFmt.receiptFont);
      if (printFmt.billSettings) setBillSettings({ ...DEFAULT_BILL_SETTINGS, ...printFmt.billSettings });
      if (printFmt.scrapBillSettings) setScrapBillSettings({ ...DEFAULT_BILL_SETTINGS, ...printFmt.scrapBillSettings });
    }

    let termCode = await window.electronAPI.settingsGet({ tenant_id: 'global', key: 'terminal_code' });
    if (!termCode || !/^[A-Z0-9]+$/i.test(termCode)) {
      // Auto-generate a unique terminal code like a new user — same charset as POS backend's getOrInitTerminalCode()
      const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
      termCode = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
      await window.electronAPI.settingsSet({ tenant_id: 'global', key: 'terminal_code', value: termCode });
    }
    setTerminalCode(termCode);

    const invCfg = await window.electronAPI.settingsGet({ tenant_id: 'global', key: 'invoice_counter_config' });
    if (invCfg) { setInvoiceStartNumber(invCfg.counter || 1); }

    const gstProfitPct = await window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'gst_profit_percentage' });
    if (gstProfitPct !== null && gstProfitPct !== undefined) setGstProfitPercentage(Number(gstProfitPct));

    const returnCfg = await window.electronAPI.settingsGet({ tenant_id: 'global', key: 'return_counter' });
    if (returnCfg) {
      if (returnCfg.prefix) setReturnPrefix(returnCfg.prefix.replace(/-$/, ''));
      if (returnCfg.counter) setReturnStartNumber(returnCfg.counter);
    }

    const scrapCfg = await window.electronAPI.settingsGet({ tenant_id: 'global', key: 'scrap_invoice_counter' });
    if (scrapCfg) {
      if (scrapCfg.prefix) setScrapPrefix(scrapCfg.prefix.replace(/-$/, ''));
      if (scrapCfg.counter) setScrapStartNumber(scrapCfg.counter);
    }

    const quotationCfg = await window.electronAPI.settingsGet({ tenant_id: 'global', key: 'quotation_counter' });
    if (quotationCfg) {
      if (quotationCfg.prefix) setQuotationPrefix(quotationCfg.prefix.replace(/-$/, ''));
      if (quotationCfg.counter) setQuotationStartNumber(quotationCfg.counter);
    }

    const tripleSeries = await window.electronAPI.settingsGet({ tenant_id: 'global', key: 'three_invoice_series' });
    if (tripleSeries) {
      setEnableThreeInvoiceSeries(Boolean(tripleSeries.enabled));
      if (tripleSeries.b2bPrefix) setB2bPrefix(tripleSeries.b2bPrefix);
      if (tripleSeries.b2bStartNumber) setB2bStartNumber(tripleSeries.b2bStartNumber);
      if (tripleSeries.b2cPrefix) setB2cPrefix(tripleSeries.b2cPrefix);
      if (tripleSeries.b2cStartNumber) setB2cStartNumber(tripleSeries.b2cStartNumber);
    } else {
      // Migrate from old dual_invoice_series
      const dualSeries = await window.electronAPI.settingsGet({ tenant_id: 'global', key: 'dual_invoice_series' });
      if (dualSeries && dualSeries.enabled) {
        setEnableThreeInvoiceSeries(true);
        setB2bPrefix(dualSeries.gstTerminalCode || 'B2B');
        setB2bStartNumber(dualSeries.gstStartNumber || 1);
        setB2cPrefix(dualSeries.gstTerminalCode || 'B2C');
        setB2cStartNumber(dualSeries.gstStartNumber || 1);
      }
    }

    try { const pr = await window.electronAPI.getPrinters(); setOsPrinters(pr || []); } catch (err) { console.error('Failed to get printers', err); }
    try { const v = await window.electronAPI.appGetVersion(); if (v) setAppVersion(`v${v}`); } catch (err) { console.error('Failed to get app version', err); }

    try {
      // Make sure the single canonical Service Charge row exists (dedupes legacy duplicates)
      await window.electronAPI.dbEnsureServiceItem({ tenant_id: tenantId || 'global' });
      const svcProducts = await window.electronAPI.dbGetProducts({ tenant_id: tenantId || 'global', search: 'Service Charge' });
      const svcProd = Array.isArray(svcProducts)
        ? svcProducts
            .filter((p: any) => Number(p.is_service_item) === 1 || String(p.name || '').trim() === 'Service Charge')
            .sort((a: any, b: any) => {
              const rank = (p: any) => (Number(p.is_service_item) === 1 ? (String(p.sku_barcode || '') === '99' ? 0 : 1) : 2);
              return rank(a) - rank(b) || String(a.created_at || '').localeCompare(String(b.created_at || ''));
            })[0]
        : null;
      if (svcProd) {
        setServiceChargeProduct(svcProd);
        setServiceChargeBarcode(svcProd.sku_barcode || '99');
      }
    } catch (err) {
      console.error('Failed to load Service Charge settings', err);
    }

    setLoading(false);
  };

  const handleSave = async () => {
    if (!window.electronAPI) return;
    setSaving(true); setMessage(null);
    try {
      const { tenantId } = useAuthStore.getState();
      if (localDomain !== shopDomain && role === 'OWNER') {
        const res = await updateDomain(localDomain);
        if (!res.success) throw new Error(res.error);
      }

      const formattedBarcodePrinter = { ...barcodePrinter, port: Number(barcodePrinter.port) || 9100, labelWidthMm: Number(barcodePrinter.labelWidthMm) || 50, labelHeightMm: Number(barcodePrinter.labelHeightMm) || 25, labelColumns: Number(barcodePrinter.labelColumns) || 1 };
      const formattedReceiptPrinter = { ...receiptPrinter, port: Number(receiptPrinter.port) || 9100, receiptWidthCm: Number(receiptPrinter.receiptWidthCm) || 5.8 };

      const checks: { promise: Promise<any>; name: string }[] = [
        { promise: window.electronAPI.settingsSet({ tenant_id: tenantId || 'global', key: 'barcode_printer_config', value: formattedBarcodePrinter }), name: 'barcode' },
        { promise: window.electronAPI.settingsSet({ tenant_id: tenantId || 'global', key: 'receipt_printer_config', value: formattedReceiptPrinter }), name: 'receipt' },
        { promise: window.electronAPI.settingsSet({ tenant_id: tenantId || 'global', key: 'a4_printer_config', value: a4Printer }), name: 'a4' },
        { promise: window.electronAPI.settingsSet({ tenant_id: tenantId || 'global', key: 'scale_config', value: scale }), name: 'scale' },
        { promise: window.electronAPI.settingsSet({ tenant_id: tenantId || 'global', key: 'price_coding', value: priceCoding }), name: 'price_coding' },
        { promise: window.electronAPI.settingsSet({ tenant_id: tenantId || 'global', key: 'shop_gstin', value: shopGstin }), name: 'gstin' },
        { promise: window.electronAPI.settingsSet({ tenant_id: tenantId || 'global', key: 'shop_state', value: shopState }), name: 'state' },
        { promise: window.electronAPI.settingsSet({ tenant_id: tenantId || 'global', key: 'shop_name', value: shopNameLocal }), name: 'name' },
        { promise: window.electronAPI.settingsSet({ tenant_id: tenantId || 'global', key: 'shop_address', value: shopAddress }), name: 'address' },
        { promise: window.electronAPI.settingsSet({ tenant_id: tenantId || 'global', key: 'shop_phone', value: shopPhone }), name: 'phone' },
        { promise: window.electronAPI.settingsSet({ tenant_id: tenantId || 'global', key: 'upi_id', value: upiId }), name: 'upi' },
        { promise: window.electronAPI.settingsSet({ tenant_id: tenantId || 'global', key: 'show_upi_qr', value: showUpiQr }), name: 'qr' },
        { promise: window.electronAPI.settingsSet({ tenant_id: tenantId || 'global', key: 'enable_scrap', value: Boolean(featureFlags.scrap) }), name: 'enable_scrap' },
        { promise: window.electronAPI.settingsSet({ tenant_id: tenantId || 'global', key: 'show_cash_register', value: featureFlags.cash_register }), name: 'show_cash_register' },
        { promise: window.electronAPI.settingsSet({ tenant_id: tenantId || 'global', key: 'feature_flags', value: { ...featureFlags } }), name: 'feature_flags' },
        { promise: window.electronAPI.settingsSet({ tenant_id: tenantId || 'global', key: 'auto_print_barcode', value: autoPrintBarcode }), name: 'auto_print_barcode' },
        { promise: window.electronAPI.settingsSet({ tenant_id: tenantId || 'global', key: 'gst_profit_percentage', value: gstProfitPercentage }), name: 'gst_profit_percentage' },
        { promise: window.electronAPI.settingsSet({ tenant_id: tenantId || 'global', key: 'loyalty_config', value: { enabled: loyaltyEnabled, earningRate: Number(loyaltyEarningRate) || 100, redemptionRate: Number(loyaltyRedemptionRate) || 1 } }), name: 'loyalty_config' },
        { promise: window.electronAPI.settingsSet({ tenant_id: tenantId || 'global', key: 'label_code_type', value: labelCodeType }), name: 'label_code_type' },
        { promise: window.electronAPI.settingsSet({ tenant_id: tenantId || 'global', key: 'label_show_shop_name', value: labelShowShopName }), name: 'label_show_shop_name' },
        { promise: window.electronAPI.settingsSet({ tenant_id: tenantId || 'global', key: 'print_format', value: { format: printFormat, width: printWidth, style: printFormat === 'thermal' ? thermalStyle : printFormat === 'a4' ? a4Style : undefined, showProductOffers, openCashDrawerOnPending, receiptFont, billSettings, scrapBillSettings } }), name: 'print_format' },
        { promise: window.electronAPI.settingsSet({ tenant_id: 'global', key: 'terminal_code', value: terminalCode }), name: 'terminal_code' },
        { promise: window.electronAPI.settingsSet({ tenant_id: 'global', key: 'invoice_counter_config', value: { prefix: `${terminalCode || 'POS1'}-`, counter: Number(invoiceStartNumber) || 1 } }), name: 'invoice' },
        { promise: window.electronAPI.settingsSet({ tenant_id: 'global', key: 'return_counter', value: { prefix: `${returnPrefix || `${terminalCode || 'POS1'}-RTN`}-`, counter: Number(returnStartNumber) || 1 } }), name: 'return_counter' },
        { promise: window.electronAPI.settingsSet({ tenant_id: 'global', key: 'scrap_invoice_counter', value: { prefix: `${scrapPrefix || `${terminalCode || 'POS1'}-SCR`}-`, counter: Number(scrapStartNumber) || 1 } }), name: 'scrap_invoice_counter' },
        { promise: window.electronAPI.settingsSet({ tenant_id: 'global', key: 'quotation_counter', value: { prefix: `${quotationPrefix || `${terminalCode || 'POS1'}-QTN`}-`, counter: Number(quotationStartNumber) || 1 } }), name: 'quotation_counter' },
        { promise: window.electronAPI.settingsSet({ tenant_id: 'global', key: 'three_invoice_series', value: { enabled: enableThreeInvoiceSeries, b2bPrefix: enableThreeInvoiceSeries ? b2bPrefix : '', b2bStartNumber: enableThreeInvoiceSeries ? Number(b2bStartNumber) || 1 : 1, b2cPrefix: enableThreeInvoiceSeries ? b2cPrefix : '', b2cStartNumber: enableThreeInvoiceSeries ? Number(b2cStartNumber) || 1 : 1 } }), name: 'three_invoice_series' },
        ...(enableThreeInvoiceSeries ? [
          { promise: window.electronAPI.settingsSet({ tenant_id: 'global', key: 'gst_b2b_invoice_counter_config', value: { prefix: `${b2bPrefix}-`, counter: Number(b2bStartNumber) || 1 } }), name: 'gst_b2b_invoice' },
          { promise: window.electronAPI.settingsSet({ tenant_id: 'global', key: 'gst_b2c_invoice_counter_config', value: { prefix: `${b2cPrefix}-`, counter: Number(b2cStartNumber) || 1 } }), name: 'gst_b2c_invoice' },
        ] : []),
        { promise: window.electronAPI.settingsSet({ tenant_id: tenantId || 'global', key: 'stock_report_default_view', value: stockReportDefaultView }), name: 'stock_report_default_view' },
        { promise: window.electronAPI.settingsSet({ tenant_id: tenantId || 'global', key: 'inventory_default_view', value: inventoryDefaultView }), name: 'inventory_default_view' },
        { promise: window.electronAPI.settingsSet({ tenant_id: tenantId || 'global', key: 'time_format', value: timeFormat }), name: 'time_format' },
      ];

      for (const { promise, name } of checks) {
        const res = await promise;
        if (!res.success) throw new Error(`${name}: ${res.error}`);
      }

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

      setAppTimeFormat(timeFormat);
      useCartStore.setState({ shopState });
      for (const def of FEATURE_LIST) setFeatureFlag(def.key, featureFlags[def.key]);
      setEnableScrap(Boolean(featureFlags.scrap));
      setMessage({ type: 'success', text: 'All settings saved successfully!' });
      initialSnapshot.current = JSON.stringify({ barcodePrinter, receiptPrinter, a4Printer, scale, priceCoding, shopGstin, shopState, shopNameLocal, shopAddress, shopPhone, upiId, showUpiQr, showProductOffers, openCashDrawerOnPending, receiptFont, printFormat, printWidth, thermalStyle, a4Style, terminalCode, invoiceStartNumber, enableThreeInvoiceSeries, b2bPrefix: enableThreeInvoiceSeries ? b2bPrefix : '', b2bStartNumber: enableThreeInvoiceSeries ? b2bStartNumber : '', b2cPrefix: enableThreeInvoiceSeries ? b2cPrefix : '', b2cStartNumber: enableThreeInvoiceSeries ? b2cStartNumber : '', labelCodeType, labelShowShopName, enableScrap: featureFlags.scrap, showCashRegister, autoPrintBarcode, loyaltyEnabled, loyaltyEarningRate, loyaltyRedemptionRate, billSettings, scrapBillSettings, gstProfitPercentage, returnPrefix, returnStartNumber, scrapPrefix, scrapStartNumber, quotationPrefix, quotationStartNumber, stockReportDefaultView, inventoryDefaultView, serviceChargeBarcode, timeFormat, features: JSON.stringify(featureFlags) });
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
      <div className={clsx(
        "fixed bottom-6 right-6 z-50 px-5 py-3.5 rounded-xl border shadow-lg flex items-center gap-3 text-sm animate-in fade-in slide-in-from-bottom-2 max-w-md",
        message.type === 'success' ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400" : "bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400"
      )}>
        {message.type === 'success' ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <AlertCircle className="w-5 h-5 shrink-0" />}
        <p className="flex-1 font-medium">{message.text}</p>
        <button onClick={() => setMessage(null)} className="shrink-0 opacity-60 hover:opacity-100 transition-opacity">
          <X className="w-4 h-4" />
        </button>
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
            <Skeleton className="h-9 w-28 rounded-xl" />
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

  const activeItem = SIDEBAR_GROUPS.flatMap(g => g.items).find(i => i.id === activeSection);

  const renderSectionContent = (sectionId: string) => {
    switch (sectionId) {
      case 'store':
        return (
          <div className="space-y-6 animate-in fade-in duration-300">
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
                <div className="col-span-2 space-y-2">
                  <label className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider mb-1.5 block">Shop Address</label>
                  <textarea value={shopAddress} onChange={(e) => setShopAddress(e.target.value)} placeholder="Enter your business address..." rows={3} className="w-full bg-background/50 border border-border/80 rounded-xl px-4 py-3 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 focus:bg-background transition-all resize-none text-sm font-medium" />
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
                  <Input type="text" value={terminalCode} onChange={(e) => setTerminalCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))} placeholder="Auto-generated" className="font-mono font-bold uppercase tracking-wider bg-background/50 focus:bg-background border-border/80 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all rounded-xl py-2.5" maxLength={6} />
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
                        <Input type="text" value={scrapPrefix || `${terminalCode}-SCR`} onChange={(e) => setScrapPrefix(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10))} className="font-mono font-bold uppercase bg-background focus:ring-4 focus:ring-orange-500/10 rounded-xl" maxLength={10} placeholder="Auto-generated" />
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
                        <Input type="text" value={quotationPrefix || `${terminalCode}-QTN`} onChange={(e) => setQuotationPrefix(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10))} className="font-mono font-bold uppercase bg-background focus:ring-4 focus:ring-blue-500/10 rounded-xl" maxLength={10} placeholder="Auto-generated" />
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
                        <Input type="text" value={returnPrefix || `${terminalCode}-RTN`} onChange={(e) => setReturnPrefix(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10))} className="font-mono font-bold uppercase bg-background focus:ring-4 focus:ring-rose-500/10 rounded-xl" maxLength={10} placeholder="Auto-generated" />
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
                {/* Cash Register Toggle */}
                <div className="flex items-center justify-between gap-4 p-4.5 bg-muted/30 border border-border rounded-2xl hover:border-primary/20 transition-all duration-300">
                  <div className="flex-1">
                    <label className="text-xs font-bold text-foreground cursor-pointer select-none" onClick={() => { const v = !featureFlags.cash_register; setFeatureFlags({ ...featureFlags, cash_register: v }); setShowCashRegister(v); }}>Show Cash Register on Billing Page</label>
                    <p className="text-[10px] text-muted-foreground/75 mt-0.5">When enabled, a Cash Register button appears on the billing page for quick cash-in/cash-out entries.</p>
                  </div>
                  <button type="button" onClick={() => { const v = !featureFlags.cash_register; setFeatureFlags({ ...featureFlags, cash_register: v }); setShowCashRegister(v); }} className={clsx('relative w-11 h-6 rounded-full transition-all duration-300 shrink-0 cursor-pointer', featureFlags.cash_register ? 'bg-primary shadow-[0_2px_8px_rgba(79,70,229,0.3)]' : 'bg-muted-foreground/20')}>
                    <span className={clsx('absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all duration-300', featureFlags.cash_register ? 'translate-x-5' : 'translate-x-0')} />
                  </button>
                </div>

                {/* Loyalty Toggle & Configs */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-4 p-4.5 bg-muted/30 border border-border rounded-2xl hover:border-primary/20 transition-all duration-300">
                    <div className="flex-1">
                      <label className="text-xs font-bold text-foreground cursor-pointer select-none" onClick={() => setLoyaltyEnabled(!loyaltyEnabled)}>Enable Loyalty Points System</label>
                      <p className="text-[10px] text-muted-foreground/75 mt-0.5">When enabled, customers will earn loyalty points on every purchase which can be redeemed for future discounts.</p>
                    </div>
                    <button type="button" onClick={() => setLoyaltyEnabled(!loyaltyEnabled)} className={clsx('relative w-11 h-6 rounded-full transition-all duration-300 shrink-0 cursor-pointer', loyaltyEnabled ? 'bg-primary shadow-[0_2px_8px_rgba(79,70,229,0.3)]' : 'bg-muted-foreground/20')}>
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
                      <label className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider mb-1 block">Receipt Width (cm)</label>
                      <Input type="text" inputMode="decimal" value={receiptPrinter.receiptWidthCm ?? 5.8} onChange={(e) => setReceiptPrinter({ ...receiptPrinter, receiptWidthCm: e.target.value === '' ? '' : e.target.value.replace(/[^\d.]/g, '') })} placeholder="e.g. 5.8 or 8.0" className="bg-background/50 focus:bg-background border-border/80 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all rounded-xl py-2.5 font-mono" />
                      <p className="text-[10px] text-muted-foreground/70 mt-1">Standard sizes: 5.8cm (58mm) and 8.0cm (80mm).</p>
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
        const productTabs = [
          { id: 'coding', label: 'Price Coding', icon: Key, ownerOnly: true },
          { id: 'bulk', label: 'Bulk Import', icon: Upload, ownerOnly: true },
        ].filter(t => !t.ownerOnly || role === 'OWNER');

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
          </div>
        );
      case 'printing':
        return (
          <div className="space-y-6 animate-in fade-in duration-300">
            {/* Card 1: Receipt & Invoice Format */}
            <div className="bg-card border border-border rounded-[28px] p-6 md:p-8 shadow-sm hover:shadow-md hover:border-primary/20 transition-all duration-300">
              <div className="flex items-center gap-3 mb-6 pb-4 border-b border-border">
                <div className="p-2.5 rounded-2xl bg-primary/10 text-primary shadow-[0_4px_12px_rgba(79,70,229,0.1)] shrink-0">
                  <FileText className="w-4.5 h-4.5" />
                </div>
                <span className="text-xs font-black text-primary uppercase tracking-widest">Receipt &amp; Invoice Format</span>
              </div>
              <div className="space-y-6">
                {/* Format Toggle: Thermal vs Half A4 vs A4 */}
                <div>
                  <label className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider mb-3 block">Paper Format</label>
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
                        <p className="text-sm font-bold text-foreground truncate">A5 Paper</p>
                        <p className="text-xs text-muted-foreground/75 mt-0.5 truncate">Estimate &amp; bill format</p>
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
                        <p className="text-sm font-bold text-foreground truncate">A4 Invoice</p>
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

                {/* Format Specific Options: Style Selectors */}
                {printFormat === 'thermal' && (
                  <div className="space-y-6 pt-4 border-t border-border/40 animate-in fade-in duration-300">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider">Paper Width</span>
                      <div className="flex items-center gap-1.5 p-1 bg-muted/60 dark:bg-muted/30 rounded-xl border border-border">
                        <button type="button" onClick={() => setPrintWidth(58)}
                          className={clsx("px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 cursor-pointer active:scale-95", printWidth === 58 ? "bg-background shadow-sm text-foreground font-extrabold" : "text-muted-foreground hover:text-foreground")}>58mm</button>
                        <button type="button" onClick={() => setPrintWidth(80)}
                          className={clsx("px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 cursor-pointer active:scale-95", printWidth === 80 ? "bg-background shadow-sm text-foreground font-extrabold" : "text-muted-foreground hover:text-foreground")}>80mm</button>
                      </div>
                    </div>

                    <div>
                      <span className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider mb-3 block">Receipt Style</span>
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
                                  <button type="button" onClick={(e) => { e.stopPropagation(); setPreviewStyle(style.id); setPreviewFormat('thermal'); }} className="absolute bottom-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 bg-primary text-primary-foreground rounded-lg shadow-lg hover:bg-primary/95 cursor-pointer"><Maximize2 className="w-3.5 h-3.5 text-primary-foreground" /></button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {printFormat === 'half-a4' && (
                  /* A5 Options: Styles */
                  <div className="space-y-6 pt-4 border-t border-border/40 animate-in fade-in duration-300">
                    <div>
                      <span className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider mb-3 block">A5 Estimate &amp; Bill Style</span>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="relative rounded-2xl border-2 border-primary shadow-md ring-2 ring-primary/5 bg-card overflow-hidden transition-all duration-300 hover:shadow-md">
                          <div className="absolute top-2.5 right-2.5 z-10 w-5 h-5 rounded-full bg-primary flex items-center justify-center shadow-sm shadow-primary/20">
                            <CheckCircle2 className="w-3.5 h-3.5 text-primary-foreground" />
                          </div>
                          <div className="p-3 border-b border-border bg-gradient-to-r from-amber-500/10 to-amber-500/5">
                            <span className="text-xs font-extrabold text-foreground">Standard A5 Layout</span>
                          </div>
                          <div className="bg-muted/20 dark:bg-muted/5 flex justify-center py-4">
                            <div className="relative group flex justify-center">
                              <button
                                type="button"
                                onClick={() => { setPreviewFormat('half-a4'); }}
                                className="bg-card shadow-inner font-mono overflow-hidden border border-border w-36 rounded-md cursor-pointer hover:border-primary/50 transition-colors"
                              >
                                <div className="text-[8px] text-center p-2.5 text-muted-foreground/60 font-semibold select-none">A5 Estimate Preview</div>
                              </button>
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); setPreviewFormat('half-a4'); }}
                                className="absolute bottom-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 bg-primary text-primary-foreground rounded-lg shadow-lg hover:bg-primary/95 cursor-pointer"
                                title="Full Preview"
                              >
                                <Maximize2 className="w-3.5 h-3.5 text-primary-foreground" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {printFormat === 'a4' && (
                  /* A4 Options: Styles */
                  <div className="space-y-6 pt-4 border-t border-border/40 animate-in fade-in duration-300">
                    <div>
                      <span className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider mb-3 block">Invoice Style</span>
                      <div className="grid grid-cols-3 gap-4">
                        {[
                          { id: 'standard', name: 'Standard', color: 'from-blue-500/10 to-blue-500/5' },
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
                                  <button type="button" onClick={(e) => { e.stopPropagation(); setPreviewStyle(style.id); setPreviewFormat('a4'); }} className="absolute bottom-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 bg-primary text-primary-foreground rounded-lg shadow-lg hover:bg-primary/95 cursor-pointer"><Maximize2 className="w-3.5 h-3.5 text-primary-foreground" /></button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {/* General Bill Settings — ALWAYS VISIBLE for Thermal, A5 & A4 */}
                <div className="space-y-6 pt-6 border-t border-border/40">
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
                      <label className="text-xs font-bold text-foreground cursor-pointer select-none" onClick={() => setShowProductOffers(!showProductOffers)}>Show Per-Product Offers on Bills</label>
                      <p className="text-[10px] text-muted-foreground/75 mt-0.5">When enabled, items with discounts will show MRP, offer price, and discount labels.</p>
                    </div>
                    <button type="button" onClick={() => setShowProductOffers(!showProductOffers)} className={clsx('relative w-11 h-6 rounded-full transition-all duration-300 shrink-0 cursor-pointer', showProductOffers ? 'bg-primary shadow-[0_2px_8px_rgba(79,70,229,0.3)]' : 'bg-muted-foreground/20')}>
                      <span className={clsx('absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all duration-300', showProductOffers ? 'translate-x-5' : 'translate-x-0')} />
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

                  <div className="p-4.5 bg-muted/30 border border-border rounded-2xl hover:border-primary/20 transition-all duration-300">
                    <label className="text-xs font-bold text-foreground mb-3 block">Bill Content Checklist</label>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
                      {[
                        { key: 'showShopName', label: 'Shop Name' },
                        { key: 'showShopAddress', label: 'Shop Address' },
                        { key: 'showPhone', label: 'Phone Number' },
                        { key: 'showShopGstin', label: 'Shop GSTIN' },
                        { key: 'showShopState', label: 'Shop State' },
                        { key: 'showTitle', label: 'Document Title' },
                        { key: 'showCustomerName', label: 'Customer Name' },
                        { key: 'showCustomerGstin', label: 'Customer GSTIN' },
                        { key: 'showBosTaxBreakup', label: 'Tax Breakup on Bill of Supply' },
                        { key: 'printFullName', label: 'Full Product Name' },
                        { key: 'showBrandName', label: 'Product Brand Name' },
                        { key: 'showWeightDetails', label: 'Weight & Per-Weight Rate (Weight Items)' },
                        { key: 'showPcsForWeightProducts', label: 'Show Weight Items in PCS (Pieces)' },
                        { key: 'showPcsUnit', label: 'Show "PCS" Suffix on Quantities' },
                        { key: 'showCreditBalance', label: 'Show Customer Balance / Credit Breakdown (Sales, Cash Received, Balance)' },
                      ].map(({ key, label }) => {
                        const forcedOn = key === 'showTitle' && billSettings.estimateMode;
                        return (
                          <label key={key} className={`flex items-center gap-3 py-1.5 ${forcedOn ? '' : 'cursor-pointer group text-xs text-foreground font-medium select-none'}`}>
                            <button
                              type="button"
                              onClick={() => {
                                if (forcedOn) return;
                                setBillSettings(s => ({ ...s, [key]: !(s as any)[key] }));
                              }}
                              className={clsx(
                                'w-4.5 h-4.5 rounded-lg border-2 flex items-center justify-center transition-all shrink-0',
                                (billSettings as any)[key] || forcedOn ? 'bg-primary border-primary' : 'border-muted-foreground/30 group-hover:border-primary/50',
                                forcedOn && 'opacity-50'
                              )}
                            >
                              {((billSettings as any)[key] || forcedOn) && <CheckCircle2 className="w-3 h-3 text-primary-foreground" />}
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

                    <div className="border-t border-border/40 my-3.5" />
                    <label className="flex items-center gap-3 cursor-pointer group select-none">
                      <button
                        type="button"
                        onClick={() => setBillSettings(s => ({ ...s, estimateMode: !s.estimateMode, showTitle: !s.estimateMode ? true : s.showTitle }))}
                        className={clsx(
                          'w-4.5 h-4.5 rounded-lg border-2 flex items-center justify-center transition-all shrink-0',
                          billSettings.estimateMode ? 'bg-primary border-primary' : 'border-muted-foreground/30 group-hover:border-primary/50'
                        )}
                      >
                        {billSettings.estimateMode && <CheckCircle2 className="w-3 h-3 text-primary-foreground" />}
                      </button>
                      <div>
                        <span className="text-xs text-foreground font-bold">Force "BILL OF SUPPLY" title</span>
                        <p className="text-[10px] text-muted-foreground/75 mt-0.5">Overrides document title to BILL OF SUPPLY.</p>
                      </div>
                    </label>
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
                    <label className="text-xs font-bold text-foreground mb-3 block">Scrap Bill Content</label>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
                      {[
                        { key: 'showScrapHeading', label: 'Scrap Bill Heading' },
                        { key: 'showShopName', label: 'Shop Name' },
                        { key: 'showShopAddress', label: 'Shop Address' },
                        { key: 'showPhone', label: 'Phone Number' },
                        { key: 'showShopGstin', label: 'Shop GSTIN' },
                        { key: 'showTitle', label: 'Document Title' },
                        { key: 'showCustomerName', label: 'Customer Name' },
                      ].map(({ key, label }) => (
                        <label key={key} className="flex items-center gap-3 cursor-pointer group text-xs text-foreground font-medium select-none">
                          <button
                            type="button"
                            onClick={() => setScrapBillSettings(s => ({ ...s, [key]: !(s as any)[key] }))}
                            className={clsx(
                              'w-4.5 h-4.5 rounded-lg border-2 flex items-center justify-center transition-all shrink-0',
                              (scrapBillSettings as any)[key] ? 'bg-primary border-primary' : 'border-muted-foreground/30 group-hover:border-primary/50'
                            )}
                          >
                            {(scrapBillSettings as any)[key] && <CheckCircle2 className="w-3 h-3 text-primary-foreground" />}
                          </button>
                          <span>{label}</span>
                        </label>
                      ))}
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
                <div className="relative">
                  <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-muted-foreground/50" />
                  <Input type="password" placeholder="Current Password" className="pl-11 bg-background/50 focus:bg-background border-border/80 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all rounded-xl py-2.5" value={pass.old} onChange={(e) => setPass({ ...pass, old: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Input type="password" placeholder="New Password" value={pass.new} onChange={(e) => setPass({ ...pass, new: e.target.value })} className="bg-background/50 focus:bg-background border-border/80 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all rounded-xl py-2.5" />
                  <Input type="password" placeholder="Confirm New Password" value={pass.confirm} onChange={(e) => setPass({ ...pass, confirm: e.target.value })} className="bg-background/50 focus:bg-background border-border/80 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all rounded-xl py-2.5" />
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
                    onClick={() => { if (window.confirm('Turn OFF all features? Only Settings will remain accessible.')) setFeatureFlags(Object.fromEntries(FEATURE_LIST.map(f => [f.key, false])) as FeatureFlags); }}
                    className="px-3 py-1.5 text-[10px] font-bold text-destructive bg-destructive/10 hover:bg-destructive/15 border border-destructive/25 rounded-xl transition-all duration-200 active:scale-95 cursor-pointer"
                  >
                    Turn Off All
                  </button>
                  <button
                    type="button"
                    onClick={() => setFeatureFlags(Object.fromEntries(FEATURE_LIST.map(f => [f.key, true])) as FeatureFlags)}
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
                        <label className="text-xs font-bold text-foreground cursor-pointer select-none" onClick={() => setFeatureFlags({ ...featureFlags, [def.key]: !enabled })}>{def.label}</label>
                        <p className="text-[10px] text-muted-foreground/75 mt-0.5 leading-relaxed">{def.desc}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setFeatureFlags({ ...featureFlags, [def.key]: !enabled })}
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
            <button onClick={handleSave} disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-black text-primary bg-primary/10 hover:bg-primary hover:text-primary-foreground rounded-2xl transition-all duration-200 active:scale-95 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed animate-in fade-in border border-primary/20 hover:border-primary shadow-sm">
              {saving ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : <Save className="w-4 h-4 shrink-0" />}
              <span className="hidden sm:inline">{saving ? 'Saving...' : 'Save Changes'}</span>
              <span className="sm:hidden">Save</span>
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
              const visibleItems = group.items.filter(item => !item.ownerOnly || role === 'OWNER');
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
            {SIDEBAR_GROUPS.flatMap(g => g.items).filter(item => !item.ownerOnly || role === 'OWNER').map((item) => {
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

        {/* â”€â”€ Main Content Area â”€â”€ */}
        <main className="flex-1 overflow-y-auto bg-background" style={{ scrollbarGutter: 'stable' }}>
          <div className="max-w-3xl mx-auto p-6 lg:p-8 animate-in fade-in duration-300">

            {/* Section Header */}
            {activeItem && (
              <div className="mb-8 flex justify-center text-center">
                <div className="flex items-center gap-3.5 mb-1 select-none max-w-xl text-left">
                  <div className="p-2.5 rounded-2xl bg-primary/10 text-primary shadow-[0_4px_12px_rgba(79,70,229,0.1)] shrink-0">
                    <activeItem.icon className="w-4.5 h-4.5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-black text-foreground uppercase tracking-widest">{activeItem.label}</h2>
                    <p className="text-xs text-muted-foreground mt-1">
                      {activeItem.id === 'store' && 'Manage your shop profile, GST registration, invoice counters, and features.'}
                      {activeItem.id === 'hardware' && 'Configure receipt printers, barcode label printers, scales, and hardware connections.'}
                      {activeItem.id === 'products' && 'Manage product categories, grade pricing, and price coding alphabets.'}
                      {activeItem.id === 'printing' && 'Choose print formats, invoice styles, receipt typography, and barcode layouts.'}
                      {activeItem.id === 'system' && 'Adjust UI scaling, security passwords, and manage system updates.'}
                      {activeItem.id === 'features' && 'Turn individual modules on or off across the app — dashboards, billing, and managers hide disabled features.'}
                    </p>
                  </div>
                  {activeItem.ownerOnly && (
                    <span className="ml-4 px-2.5 py-1 bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[9px] font-bold rounded-full border border-amber-500/20 shrink-0 uppercase tracking-wider select-none">OWNER ONLY</span>
                  )}
                </div>
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
      />
    </div>
  );
}

