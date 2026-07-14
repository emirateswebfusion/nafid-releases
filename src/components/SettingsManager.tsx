import { useState, useEffect, useRef, useMemo } from 'react';
import {
  Settings, Printer, Scale, Save, Loader2, RefreshCw, Download,
  Key, Tags, Building, Receipt, Usb,
  CheckCircle2, AlertCircle, Globe, Upload, Type, Plus, Minus,
  Smartphone, X, RotateCcw, Maximize2,
  Store, Package, Monitor, ChevronRight, Shield, FileText, Recycle, TrendingUp
} from 'lucide-react';
import { useCartStore } from '../store/cartStore';
import { useThemeStore } from '../store/themeStore';
import clsx from 'clsx';
import { useAuthStore } from '../store/authStore';
import { Input } from './ui/Input';
import { Select } from './ui/Select';
import { SettingsGrades } from './SettingsGrades';
import { BulkOnboardingSheet } from './BulkOnboardingSheet';
import { PaperPreviewModal } from './PaperPreviewModal';
import { DEFAULT_BILL_SETTINGS, type BillSettings } from '../utils/receiptGenerator';
import { CODE_TYPE_CONFIGS, CODE_TYPES, DEFAULT_CODE_TYPE, type CodeType } from '../labelCodeTypes';

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
    category: 'Business',
    icon: Store,
    items: [
      { id: 'invoice', label: 'Invoice Numbering', icon: Receipt, ownerOnly: true },
      { id: 'gst', label: 'GST Details', icon: Building, ownerOnly: true },
      { id: 'shop', label: 'Shop Details', icon: Building, ownerOnly: true },
      { id: 'bulk', label: 'Bulk Import', icon: Upload, ownerOnly: true },
      { id: 'scrap', label: 'Scrap Settings', icon: Recycle, ownerOnly: true },
      { id: 'loyalty', label: 'Loyalty Points', icon: TrendingUp, ownerOnly: true },
    ],
  },
  {
    category: 'Hardware',
    icon: Monitor,
    items: [
      { id: 'barcode-printer', label: 'Barcode Printer', icon: Printer },
      { id: 'receipt-printer', label: 'Receipt Printer', icon: Printer },
      { id: 'a4-printer', label: 'A4 Printer', icon: FileText },
      { id: 'scale', label: 'Weighing Scale', icon: Scale },
    ],
  },
  {
    category: 'Products',
    icon: Package,
    items: [
      { id: 'coding', label: 'Price Coding', icon: Tags, ownerOnly: true },
      { id: 'grades', label: 'Categories & Grades', icon: Tags },
    ],
  },
  {
    category: 'Printing',
    icon: Printer,
    items: [
      { id: 'print-format', label: 'Print Format', icon: FileText, ownerOnly: true },
      { id: 'label-settings', label: 'Label Settings', icon: Tags, ownerOnly: true },
    ],
  },
  {
    category: 'System',
    icon: Monitor,
    items: [
      { id: 'updates', label: 'System Updates', icon: RefreshCw },
      { id: 'appearance', label: 'Appearance', icon: Type },
      { id: 'security', label: 'Security', icon: Shield },
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

export function SettingsManager({ onClose, isRestricted }: { onClose: () => void; isRestricted?: boolean }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveRevision, setSaveRevision] = useState(0);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [activeSection, setActiveSection] = useState('invoice');
  const [showBulkSheet, setShowBulkSheet] = useState(false);

  const [barcodePrinter, setBarcodePrinter] = useState<any>({ type: 'usb', ip: '192.168.1.100', port: 9100, deviceName: '' });
  const [receiptPrinter, setReceiptPrinter] = useState<any>({ type: 'usb', ip: '192.168.1.100', port: 9100, deviceName: '', receiptWidthCm: 5.8 });
  const [a4Printer, setA4Printer] = useState<any>({ deviceName: '' });
  const [scale, setScale] = useState({ path: 'COM3', baudRate: 9600 });
  const [osPrinters, setOsPrinters] = useState<any[]>([]);
  const { shopDomain } = useCartStore();
  const { role, updateDomain } = useAuthStore();
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
  const [printFormat, setPrintFormat] = useState<'thermal' | 'a4'>('thermal');
  const [labelCodeType, setLabelCodeType] = useState<CodeType>(DEFAULT_CODE_TYPE);
  const [printWidth, setPrintWidth] = useState<number>(58);
  const [thermalStyle, setThermalStyle] = useState<'standard' | 'compact' | 'modern' | 'classic' | 'clean' | 'dot' | 'slim' | 'luxe'>('standard');
  const [a4Style, setA4Style] = useState<'standard' | 'modern' | 'classic'>('standard');
  const [previewFormat, setPreviewFormat] = useState<'thermal' | 'a4' | null>(null);
  const [enableScrap, setEnableScrap] = useState(false);
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
  const initialSnapshot = useRef<string>('');

  const hasChanges = useMemo(() => {
    if (!initialSnapshot.current) return false;
    const current = JSON.stringify({ barcodePrinter, receiptPrinter, a4Printer, scale, priceCoding, shopGstin, shopState, shopNameLocal, shopAddress, shopPhone, upiId, showUpiQr, showProductOffers, openCashDrawerOnPending, receiptFont, printFormat, printWidth, thermalStyle, a4Style, terminalCode, invoiceStartNumber, enableThreeInvoiceSeries, b2bPrefix: enableThreeInvoiceSeries ? b2bPrefix : '', b2bStartNumber: enableThreeInvoiceSeries ? b2bStartNumber : '', b2cPrefix: enableThreeInvoiceSeries ? b2cPrefix : '', b2cStartNumber: enableThreeInvoiceSeries ? b2cStartNumber : '', labelCodeType, enableScrap, billSettings, scrapBillSettings, gstProfitPercentage });
    return current !== initialSnapshot.current;
  }, [barcodePrinter, receiptPrinter, a4Printer, scale, priceCoding, shopGstin, shopState, shopNameLocal, shopAddress, shopPhone, upiId, showUpiQr, showProductOffers, openCashDrawerOnPending, receiptFont, printFormat, printWidth, thermalStyle, a4Style, terminalCode, invoiceStartNumber, enableThreeInvoiceSeries, b2bPrefix, b2bStartNumber, b2cPrefix, b2cStartNumber, labelCodeType, enableScrap, billSettings, scrapBillSettings, saveRevision]);

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
      initialSnapshot.current = JSON.stringify({ barcodePrinter, receiptPrinter, a4Printer, scale, priceCoding, shopGstin, shopState, shopNameLocal, shopAddress, shopPhone, upiId, showUpiQr, showProductOffers, openCashDrawerOnPending, receiptFont, printFormat, printWidth, thermalStyle, a4Style, terminalCode, invoiceStartNumber, enableThreeInvoiceSeries, b2bPrefix: enableThreeInvoiceSeries ? b2bPrefix : '', b2bStartNumber: enableThreeInvoiceSeries ? b2bStartNumber : '', b2cPrefix: enableThreeInvoiceSeries ? b2cPrefix : '', b2cStartNumber: enableThreeInvoiceSeries ? b2cStartNumber : '', labelCodeType, enableScrap, loyaltyEnabled, loyaltyEarningRate, loyaltyRedemptionRate, billSettings, scrapBillSettings, gstProfitPercentage });
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

    if (pBarcode) setBarcodePrinter({ type: 'usb', ip: '192.168.1.100', port: 9100, deviceName: '', ...pBarcode });
    else if (pLegacy) setBarcodePrinter({ type: 'usb', ip: '192.168.1.100', port: 9100, deviceName: '', ...pLegacy });
    if (pReceipt) setReceiptPrinter({ type: 'usb', ip: '192.168.1.100', port: 9100, deviceName: '', receiptWidthCm: 5.8, ...pReceipt });
    else if (pLegacy) setReceiptPrinter({ type: 'usb', ip: '192.168.1.100', port: 9100, deviceName: '', receiptWidthCm: 5.8, ...pLegacy });
    if (pA4) setA4Printer(pA4);
    if (s) setScale(s);
    if (pCoding) setPriceCoding(pCoding);
    if (gstinVal) setShopGstin(gstinVal);
    if (stateVal) setShopState(stateVal);
    if (nameVal) setShopNameLocal(nameVal);
    if (addressVal) setShopAddress(addressVal);
    if (phoneVal) setShopPhone(phoneVal);
    if (upiVal) setUpiId(upiVal);
    if (showQrVal !== null && showQrVal !== undefined) setShowUpiQr(Boolean(showQrVal));
    const scrapEnabled = await window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'enable_scrap' });
    if (scrapEnabled !== null && scrapEnabled !== undefined) setEnableScrap(Boolean(scrapEnabled));

    const loyaltyCfg = await window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'loyalty_config' });
    if (loyaltyCfg) {
      setLoyaltyEnabled(Boolean(loyaltyCfg.enabled));
      if (loyaltyCfg.earningRate) setLoyaltyEarningRate(Number(loyaltyCfg.earningRate));
      if (loyaltyCfg.redemptionRate) setLoyaltyRedemptionRate(Number(loyaltyCfg.redemptionRate));
    }
    if (labelType && CODE_TYPE_CONFIGS[labelType as CodeType])     setLabelCodeType(labelType as CodeType);
    if (printFmt) {
      if (printFmt.format === 'a4') {
        setPrintFormat('a4');
        if (printFmt.style) setA4Style(printFmt.style);
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

    const termCode = await window.electronAPI.settingsGet({ tenant_id: 'global', key: 'terminal_code' });
    setTerminalCode(termCode || '');

    const invCfg = await window.electronAPI.settingsGet({ tenant_id: 'global', key: 'invoice_counter_config' });
    if (invCfg) { setInvoiceStartNumber(invCfg.counter || 1); }

    const gstProfitPct = await window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'gst_profit_percentage' });
    if (gstProfitPct !== null && gstProfitPct !== undefined) setGstProfitPercentage(Number(gstProfitPct));

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
        { promise: window.electronAPI.settingsSet({ tenant_id: tenantId || 'global', key: 'enable_scrap', value: enableScrap }), name: 'enable_scrap' },
        { promise: window.electronAPI.settingsSet({ tenant_id: tenantId || 'global', key: 'gst_profit_percentage', value: gstProfitPercentage }), name: 'gst_profit_percentage' },
        { promise: window.electronAPI.settingsSet({ tenant_id: tenantId || 'global', key: 'loyalty_config', value: { enabled: loyaltyEnabled, earningRate: Number(loyaltyEarningRate) || 100, redemptionRate: Number(loyaltyRedemptionRate) || 1 } }), name: 'loyalty_config' },
        { promise: window.electronAPI.settingsSet({ tenant_id: tenantId || 'global', key: 'label_code_type', value: labelCodeType }), name: 'label_code_type' },
        { promise: window.electronAPI.settingsSet({ tenant_id: tenantId || 'global', key: 'print_format', value: { format: printFormat, width: printWidth, style: printFormat === 'thermal' ? thermalStyle : printFormat === 'a4' ? a4Style : undefined, showProductOffers, openCashDrawerOnPending, receiptFont, billSettings, scrapBillSettings } }), name: 'print_format' },
        { promise: window.electronAPI.settingsSet({ tenant_id: 'global', key: 'terminal_code', value: terminalCode }), name: 'terminal_code' },
        { promise: window.electronAPI.settingsSet({ tenant_id: 'global', key: 'invoice_counter_config', value: { prefix: `${terminalCode}-`, counter: Number(invoiceStartNumber) || 1 } }), name: 'invoice' },
        { promise: window.electronAPI.settingsSet({ tenant_id: 'global', key: 'three_invoice_series', value: { enabled: enableThreeInvoiceSeries, b2bPrefix: enableThreeInvoiceSeries ? b2bPrefix : '', b2bStartNumber: enableThreeInvoiceSeries ? Number(b2bStartNumber) || 1 : 1, b2cPrefix: enableThreeInvoiceSeries ? b2cPrefix : '', b2cStartNumber: enableThreeInvoiceSeries ? Number(b2cStartNumber) || 1 : 1 } }), name: 'three_invoice_series' },
        ...(enableThreeInvoiceSeries ? [
          { promise: window.electronAPI.settingsSet({ tenant_id: 'global', key: 'gst_b2b_invoice_counter_config', value: { prefix: `${b2bPrefix}-`, counter: Number(b2bStartNumber) || 1 } }), name: 'gst_b2b_invoice' },
          { promise: window.electronAPI.settingsSet({ tenant_id: 'global', key: 'gst_b2c_invoice_counter_config', value: { prefix: `${b2cPrefix}-`, counter: Number(b2cStartNumber) || 1 } }), name: 'gst_b2c_invoice' },
        ] : []),
      ];

      for (const { promise, name } of checks) {
        const res = await promise;
        if (!res.success) throw new Error(`${name}: ${res.error}`);
      }

      useCartStore.setState({ shopState });
      setMessage({ type: 'success', text: 'All settings saved successfully!' });
      initialSnapshot.current = JSON.stringify({ barcodePrinter, receiptPrinter, a4Printer, scale, priceCoding, shopGstin, shopState, shopNameLocal, shopAddress, shopPhone, upiId, showUpiQr, showProductOffers, openCashDrawerOnPending, receiptFont, printFormat, printWidth, thermalStyle, a4Style, terminalCode, invoiceStartNumber, enableThreeInvoiceSeries, b2bPrefix: enableThreeInvoiceSeries ? b2bPrefix : '', b2bStartNumber: enableThreeInvoiceSeries ? b2bStartNumber : '', b2cPrefix: enableThreeInvoiceSeries ? b2cPrefix : '', b2cStartNumber: enableThreeInvoiceSeries ? b2cStartNumber : '', labelCodeType, enableScrap, loyaltyEnabled, loyaltyEarningRate, loyaltyRedemptionRate, billSettings, scrapBillSettings, gstProfitPercentage });
      setSaveRevision(v => v + 1);
      setTimeout(() => setMessage(null), 3000);
    } catch (err: any) {
      setMessage({ type: 'error', text: 'Failed to save settings: ' + err.message });
      setTimeout(() => setMessage(null), 3000);
    }
    setSaving(false);
  };

  const handleInstallUpdate = () => { setUpdateStatus('Restarting to install update...'); window.electronAPI?.appInstallUpdate(); };

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
    } catch (err: any) { setMessage({ type: 'error', text: err.message }); setTimeout(() => setMessage(null), 3000); }
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
      <div className="flex-1 flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
          <p className="text-muted-foreground text-sm font-medium">Loading configurations...</p>
        </div>
      </div>
    );
  }

  const activeItem = SIDEBAR_GROUPS.flatMap(g => g.items).find(i => i.id === activeSection);

  const renderSectionContent = (sectionId: string) => {
    switch (sectionId) {
      case 'invoice':
        return (
          <div className="space-y-6">
            <div className="bg-card border border-border/80 rounded-xl p-5 shadow-sm">
              <div className="flex items-center gap-2.5 mb-4 pb-3 border-b border-border/60">
                <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-500">
                  <Receipt className="w-4 h-4" />
                </div>
                <span className="text-xs font-black text-blue-500 uppercase tracking-wider">Invoice Series</span>
                <div className="ml-auto flex items-center gap-1.5 px-2 py-1 rounded-lg bg-muted/50">
                  <span className="text-[10px] font-mono font-bold text-foreground">{terminalCode || 'POS1'}-{String(Number(invoiceStartNumber) || 1).padStart(3, '0')}</span>
                  <span className="text-[9px] text-muted-foreground font-semibold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">NEXT</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-5">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-muted-foreground tracking-wide flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                    Terminal Code
                    <span className="text-[9px] font-normal text-muted-foreground bg-amber-500/10 text-amber-600 px-1.5 py-0.5 rounded-full ml-auto">Per computer</span>
                  </label>
                  <Input type="text" value={terminalCode} onChange={(e) => setTerminalCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))} placeholder="Auto-generated" className="font-mono font-bold uppercase tracking-wider" maxLength={6} />
                  <p className="text-[10px] text-muted-foreground/70">Format: <span className="font-mono text-foreground/80">{terminalCode || 'POS1'}-XXX</span></p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-muted-foreground tracking-wide flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    Starting Number
                  </label>
                  <Input type="number" min="1" value={invoiceStartNumber} onChange={(e) => setInvoiceStartNumber(e.target.value === '' ? '' : Number(e.target.value))} placeholder="e.g. 1" className="font-mono font-bold" />
                </div>
              </div>
            </div>

            <div className="bg-card border border-border/80 rounded-xl p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 rounded-lg bg-purple-500/10 text-purple-500">
                    <Receipt className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-xs font-black text-purple-500 uppercase tracking-wider">3 Invoice Series</span>
                    <p className="text-[10px] text-muted-foreground/70 mt-0.5">Separate counters for B2B &amp; B2C GST invoices</p>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" checked={enableThreeInvoiceSeries} onChange={(e) => setEnableThreeInvoiceSeries(e.target.checked)} className="sr-only peer" />
                  <div className="w-10 h-6 bg-muted rounded-full peer peer-checked:bg-purple-500 after:content-[''] after:absolute after:top-0.5 after:start-0.5 after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-4 shadow-inner" />
                </label>
              </div>

              {enableThreeInvoiceSeries && (
                <div className="mt-4 space-y-3">
                  <div className="rounded-xl border border-blue-500/25 bg-blue-500/[0.03] p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h5 className="text-xs font-black text-blue-600 dark:text-blue-400 uppercase tracking-wider flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-blue-500" />
                        GST B2B Invoice Series
                      </h5>
                      <span className="text-[10px] font-mono font-bold text-foreground bg-muted/80 px-2 py-0.5 rounded">{b2bPrefix || 'B2B'}-{String(Number(b2bStartNumber) || 1).padStart(3, '0')}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-muted-foreground tracking-wide">Prefix</label>
                        <Input type="text" value={b2bPrefix} onChange={(e) => setB2bPrefix(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))} className="font-mono font-bold uppercase" maxLength={6} placeholder="e.g. B2B" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-muted-foreground tracking-wide">Starting Number</label>
                        <Input type="number" min="1" value={b2bStartNumber} onChange={(e) => setB2bStartNumber(e.target.value === '' ? '' : Number(e.target.value))} placeholder="e.g. 1" className="font-mono font-bold" />
                      </div>
                    </div>
                  </div>
                  <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.03] p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h5 className="text-xs font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                        GST B2C Invoice Series
                      </h5>
                      <span className="text-[10px] font-mono font-bold text-foreground bg-muted/80 px-2 py-0.5 rounded">{b2cPrefix || 'B2C'}-{String(Number(b2cStartNumber) || 1).padStart(3, '0')}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-muted-foreground tracking-wide">Prefix</label>
                        <Input type="text" value={b2cPrefix} onChange={(e) => setB2cPrefix(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))} className="font-mono font-bold uppercase" maxLength={6} placeholder="e.g. B2C" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-muted-foreground tracking-wide">Starting Number</label>
                        <Input type="number" min="1" value={b2cStartNumber} onChange={(e) => setB2cStartNumber(e.target.value === '' ? '' : Number(e.target.value))} placeholder="e.g. 1" className="font-mono font-bold" />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      case 'bulk':
        return (
          <div>
            <button onClick={() => setShowBulkSheet(true)}
              className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold bg-primary/10 hover:bg-primary hover:text-primary-foreground rounded-xl transition-all duration-200 active:scale-95 cursor-pointer border border-primary/20 hover:border-primary">
              <Upload className="w-4 h-4" /> Open Bulk Import Sheet
            </button>
          </div>
        );
      case 'gst':
        return (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-5">
              <div className="space-y-2">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Shop GSTIN</label>
                <Input type="text" maxLength={15} value={shopGstin} onChange={(e) => setShopGstin(e.target.value.toUpperCase())} placeholder="e.g. 27AAAAA1111A1Z1" className="uppercase font-semibold font-mono" />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">State (Place of Business)</label>
                <Select value={shopState} onChange={setShopState} options={INDIAN_STATES.map(s => ({value:s.code,label:s.name+' ('+s.code+')'}))} />
              </div>
            </div>
            <div className="bg-card border border-border/80 rounded-xl p-5 shadow-sm">
              <div className="flex items-center gap-2.5 mb-4 pb-3 border-b border-border/60">
                <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-500">
                  <TrendingUp className="w-4 h-4" />
                </div>
                <span className="text-xs font-black text-amber-500 uppercase tracking-wider">Bill of Supply → GST Conversion</span>
              </div>
              <div className="grid grid-cols-2 gap-5">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-muted-foreground tracking-wide flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                    Profit Percentage
                  </label>
                  <div className="flex items-center gap-2">
                    <input type="number" min="0" max="999" value={gstProfitPercentage}
                      onChange={e => setGstProfitPercentage(e.target.value === '' ? 0 : Number(e.target.value))}
                      className="w-full bg-background border border-border/80 rounded-xl p-2.5 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all text-sm font-bold" />
                    <span className="text-xs font-bold text-muted-foreground">%</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground">GST sale price = GST purchase price + this % margin. Used when converting Bill of Supply invoices to GST Invoices.</p>
                </div>
              </div>
            </div>
          </div>
        );
      case 'shop':
        return (
          <div className="grid grid-cols-2 gap-5">
            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Shop Name</label>
              <Input type="text" value={shopNameLocal} onChange={(e) => setShopNameLocal(e.target.value)} placeholder="Your business name" className="font-semibold" />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Phone Number</label>
              <Input type="text" value={shopPhone} onChange={(e) => setShopPhone(e.target.value)} placeholder="e.g. +91 98765 43210" />
            </div>
            <div className="col-span-2 space-y-2">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Shop Address</label>
              <textarea value={shopAddress} onChange={(e) => setShopAddress(e.target.value)} placeholder="Enter your business address..." rows={3} className="w-full bg-background border border-border/80 rounded-xl px-4 py-3 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all resize-none text-sm font-medium" />
            </div>
            <div className="col-span-2 space-y-2">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                UPI ID
                <span className="ml-2 text-[10px] font-normal text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">Shown on receipts</span>
              </label>
              <div className="relative">
                <Smartphone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
                <Input type="text" value={upiId} onChange={(e) => setUpiId(e.target.value)} placeholder="e.g. shopname@upi" className="pl-10 font-mono font-semibold" />
              </div>
              <p className="text-[10px] text-muted-foreground mt-0.5">This UPI ID will appear on printed receipts for customer payments.</p>
            </div>
            <div className="col-span-2 flex items-center gap-3 p-3.5 bg-card border border-border/80 rounded-xl hover:border-primary/30 transition-all duration-200">
              <button onClick={() => setShowUpiQr(!showUpiQr)} className={clsx('relative w-12 h-6 rounded-full transition-all duration-200 shrink-0 cursor-pointer', showUpiQr ? 'bg-primary' : 'bg-muted-foreground/30')}>
                <span className={clsx('absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all duration-200', showUpiQr ? 'translate-x-6' : 'translate-x-0')} />
              </button>
              <div className="flex-1">
                <label className="text-xs font-bold text-foreground cursor-pointer" onClick={() => setShowUpiQr(!showUpiQr)}>Show UPI QR Code on Receipt</label>
                <p className="text-[10px] text-muted-foreground mt-0.5">When enabled, a QR code with the bill amount pre-filled will appear on printed receipts.</p>
              </div>
            </div>
          </div>
        );
      case 'scrap':
        return (
          <div>
            <div className="flex items-center gap-3 p-3.5 bg-card border border-border/80 rounded-xl hover:border-primary/30 transition-all duration-200">
              <button onClick={() => setEnableScrap(!enableScrap)} className={clsx('relative w-12 h-6 rounded-full transition-all duration-200 shrink-0 cursor-pointer', enableScrap ? 'bg-primary' : 'bg-muted-foreground/30')}>
                <span className={clsx('absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all duration-200', enableScrap ? 'translate-x-6' : 'translate-x-0')} />
              </button>
              <div className="flex-1">
                <label className="text-xs font-bold text-foreground cursor-pointer" onClick={() => setEnableScrap(!enableScrap)}>Enable Scrap Management</label>
                <p className="text-[10px] text-muted-foreground mt-0.5">When disabled, all scrap features are hidden globally — scrap mode, scrap deduction, scrap manager, and scrapers card. Use this for shops that do not deal with scrap (e.g. fruit shops).</p>
              </div>
            </div>
          </div>
        );
      case 'loyalty':
        return (
          <div className="space-y-6">
            <div className="flex items-center gap-3 p-3.5 bg-card border border-border/80 rounded-xl hover:border-primary/30 transition-all duration-200">
              <button onClick={() => setLoyaltyEnabled(!loyaltyEnabled)} className={clsx('relative w-12 h-6 rounded-full transition-all duration-200 shrink-0 cursor-pointer', loyaltyEnabled ? 'bg-primary' : 'bg-muted-foreground/30')}>
                <span className={clsx('absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all duration-200', loyaltyEnabled ? 'translate-x-6' : 'translate-x-0')} />
              </button>
              <div className="flex-1">
                <label className="text-xs font-bold text-foreground cursor-pointer" onClick={() => setLoyaltyEnabled(!loyaltyEnabled)}>Enable Loyalty Points System</label>
                <p className="text-[10px] text-muted-foreground mt-0.5">When enabled, customers will earn loyalty points on every purchase which can be redeemed for discounts on future purchases.</p>
              </div>
            </div>

            {loyaltyEnabled && (
              <div className="space-y-4">
                <div className="bg-card border border-border/80 rounded-xl p-5 shadow-sm">
                  <div className="flex items-center gap-2.5 mb-4 pb-3 border-b border-border/60">
                    <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500">
                      <TrendingUp className="w-4 h-4" />
                    </div>
                    <span className="text-xs font-black text-emerald-500 uppercase tracking-wider">Points Earning Rules</span>
                  </div>
                  <div className="grid grid-cols-2 gap-5">
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-muted-foreground tracking-wide">Earning Rate</label>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-muted-foreground">₹</span>
                        <input type="number" min="1" value={loyaltyEarningRate}
                          onChange={e => setLoyaltyEarningRate(e.target.value === '' ? 100 : Number(e.target.value))}
                          className="w-full bg-background border border-border/80 rounded-xl p-2.5 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all text-sm font-bold" />
                        <span className="text-xs font-bold text-muted-foreground">= 1 Point</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground">e.g. ₹100 = 1 Point means customer earns 1 point per ₹100 spent.</p>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-muted-foreground tracking-wide">Redemption Value</label>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-muted-foreground">1 Point = ₹</span>
                        <input type="number" min="0.5" step="0.5" value={loyaltyRedemptionRate}
                          onChange={e => setLoyaltyRedemptionRate(e.target.value === '' ? 1 : Number(e.target.value))}
                          className="w-full bg-background border border-border/80 rounded-xl p-2.5 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all text-sm font-bold" />
                      </div>
                      <p className="text-[10px] text-muted-foreground">e.g. 1 Point = ₹1 means each point gives ₹1 discount.</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      case 'print-format':
        return (
          <div className="space-y-5">
            {/* ── Format Toggle: Thermal vs A4 ── */}
            <div>
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 block">Paper Format</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setPrintFormat('thermal')}
                  className={clsx(
                    "relative flex items-center gap-3 p-3.5 rounded-xl border-2 transition-all duration-200 cursor-pointer text-left",
                    printFormat === 'thermal'
                      ? "border-primary bg-primary/5 shadow-sm"
                      : "border-border/80 hover:border-primary/40 hover:bg-muted/30"
                  )}
                >
                  <div className={clsx("p-2.5 rounded-xl", printFormat === 'thermal' ? "bg-blue-500/20 text-blue-600 dark:text-blue-400" : "bg-muted text-muted-foreground")}>
                    <Receipt className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-foreground">Thermal Receipt</p>
                    <p className="text-xs text-muted-foreground">58mm / 80mm roll paper</p>
                  </div>
                  {printFormat === 'thermal' && (
                    <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center shrink-0">
                      <CheckCircle2 className="w-3.5 h-3.5 text-primary-foreground" />
                    </div>
                  )}
                </button>
                <button
                  onClick={() => setPrintFormat('a4')}
                  className={clsx(
                    "relative flex items-center gap-3 p-3.5 rounded-xl border-2 transition-all duration-200 cursor-pointer text-left",
                    printFormat === 'a4'
                      ? "border-primary bg-primary/5 shadow-sm"
                      : "border-border/80 hover:border-primary/40 hover:bg-muted/30"
                  )}
                >
                  <div className={clsx("p-2.5 rounded-xl", printFormat === 'a4' ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400" : "bg-muted text-muted-foreground")}>
                    <FileText className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-foreground">A4 Invoice</p>
                    <p className="text-xs text-muted-foreground">Full-page A4 document</p>
                  </div>
                  {printFormat === 'a4' && (
                    <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center shrink-0">
                      <CheckCircle2 className="w-3.5 h-3.5 text-primary-foreground" />
                    </div>
                  )}
                </button>
              </div>
            </div>

            {/* ── A4 Style Selection ── */}
            {printFormat === 'a4' && (
              <div>
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 block">Invoice Style</span>
                <div className="grid grid-cols-3 gap-4">
                    {/* Standard A4 */}
                    <div className={clsx("relative rounded-xl border-2 transition-all overflow-hidden", a4Style === 'standard' ? "border-primary shadow-md ring-1 ring-primary/20" : "border-border/80 hover:border-primary/40")}>
                      {a4Style === 'standard' && <div className="absolute top-2 right-2 z-10 w-5 h-5 rounded-full bg-primary flex items-center justify-center"><CheckCircle2 className="w-3 h-3 text-primary-foreground" /></div>}
                      <button onClick={() => { setA4Style('standard'); setPreviewFormat('a4'); }} className="w-full cursor-pointer text-left">
                        <div className="p-2 bg-gradient-to-r from-blue-500/10 to-blue-500/5 border-b border-border/60">
                          <span className="text-[11px] font-bold text-foreground">Standard</span>
                        </div>
                      </button>
                      <div className="bg-gray-50 p-3 flex justify-center">
                        <div className="relative group">
                          <div className="bg-white shadow-sm w-full rounded-sm overflow-hidden border border-gray-200">
                            <div className="text-center border-b border-gray-300 px-2 py-1.5">
                              <div className="font-bold text-[6px] text-gray-900">YOUR SHOP NAME</div>
                              <div className="text-[4px] text-gray-500">123, Main Street</div>
                              <div className="font-bold text-[7px] text-blue-600 mt-0.5">TAX INVOICE</div>
                            </div>
                            <div className="flex justify-between px-2 py-1 text-[4px] border-b border-gray-200">
                              <div><span className="text-gray-500">#:</span> INV-001</div>
                              <div className="text-right"><span className="text-gray-500">Customer:</span> Walk-in</div>
                            </div>
                            <div className="px-2 py-1">
                              <table className="w-full text-[4px] border-collapse">
                                <thead><tr className="bg-gray-100">
                                  <th className="border border-gray-300 px-0.5 text-center">#</th>
                                  <th className="border border-gray-300 px-0.5">Item</th>
                                  <th className="border border-gray-300 px-0.5 text-center">Qty</th>
                                  <th className="border border-gray-300 px-0.5 text-right">Rate</th>
                                  <th className="border border-gray-300 px-0.5 text-right">Amount</th>
                                </tr></thead>
                                <tbody>
                                  {['Item A||2|₹25|₹50','Item B||1|₹30|₹30'].map(r => { const c = r.split('|'); return (
                                    <tr key={c[0]}><td className="border border-gray-300 text-center px-0.5">{c[0]}</td>
                                    <td className="border border-gray-300 px-0.5">{c[1]}</td>
                                    <td className="border border-gray-300 text-center px-0.5">{c[3]}</td>
                                    <td className="border border-gray-300 text-right px-0.5">{c[4]}</td>
                                    <td className="border border-gray-300 text-right px-0.5">{c[5]}</td></tr>); })}
                                </tbody>
                                <tfoot>
                                  <tr><td colSpan={4} className="border border-gray-300 text-right font-bold px-0.5">Subtotal</td><td className="border border-gray-300 text-right px-0.5">₹80</td></tr>
                                  <tr className="text-blue-600 font-bold"><td colSpan={4} className="border border-gray-300 text-right px-0.5">Grand Total</td><td className="border border-gray-300 text-right px-0.5">₹84</td></tr>
                                </tfoot>
                              </table>
                            </div>
                            <div className="border-t border-gray-300 px-2 py-0.5 text-[3px] text-gray-500">Terms & Conditions apply</div>
                          </div>
                          <button
                            onClick={() => { setA4Style('standard'); setPreviewFormat('a4'); }}
                            className="absolute bottom-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity p-1 bg-primary text-primary-foreground rounded-md shadow-lg hover:bg-primary/90 cursor-pointer"
                            title="View full preview"
                          >
                            <Maximize2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>

                  {/* Modern A4 */}
                  <div className={clsx("relative rounded-xl border-2 transition-all overflow-hidden", a4Style === 'modern' ? "border-primary shadow-md ring-1 ring-primary/20" : "border-border/80 hover:border-primary/40")}>
                    {a4Style === 'modern' && <div className="absolute top-2 right-2 z-10 w-5 h-5 rounded-full bg-primary flex items-center justify-center"><CheckCircle2 className="w-3 h-3 text-primary-foreground" /></div>}
                    <button onClick={() => { setA4Style('modern'); setPreviewFormat('a4'); }} className="w-full cursor-pointer text-left">
                        <div className="p-2 bg-gradient-to-r from-amber-500/10 to-amber-500/5 border-b border-border/60">
                          <span className="text-[11px] font-bold text-foreground">Modern</span>
                        </div>
                      </button>
                    <div className="bg-gray-50 p-3 flex justify-center">
                      <div className="relative group">
                        <div className="bg-white shadow-sm w-full overflow-hidden rounded-sm border border-gray-200">
                          <div className="bg-gradient-to-r from-emerald-500 to-emerald-600 px-2 py-1.5 text-white">
                            <div className="font-bold text-[6px]">YOUR SHOP NAME</div>
                            <div className="text-[4px] opacity-80">123, Main Street | GST: 27AAAAA1111A1Z1</div>
                            <div className="text-[6px] font-bold mt-0.5 opacity-90">TAX INVOICE</div>
                          </div>
                          <div className="flex justify-between px-2 py-1 text-[4px] border-b border-gray-200">
                            <div className="text-gray-500">INV-001</div>
                            <div className="text-gray-500">{new Date().toLocaleDateString('en-IN')}</div>
                          </div>
                          <div className="px-2 py-1">
                            <table className="w-full text-[4px] border-collapse">
                              <thead><tr className="bg-gray-50">
                                <th className="px-0.5 text-left font-semibold text-gray-500">Item</th>
                                <th className="px-0.5 text-center font-semibold text-gray-500">Qty</th>
                                <th className="px-0.5 text-right font-semibold text-gray-500">Amount</th>
                              </tr></thead>
                              <tbody>
                                {['Item A|2|₹50','Item B|1|₹30'].map(r => { const c = r.split('|'); return (
                                  <tr key={c[0]} className="border-b border-gray-200">
                                    <td className="px-0.5 py-0.5 text-gray-900">{c[0]}</td>
                                    <td className="px-0.5 py-0.5 text-center text-gray-900">{c[1]}</td>
                                    <td className="px-0.5 py-0.5 text-right text-gray-900">{c[2]}</td>
                                  </tr>); })}
                              </tbody>
                            </table>
                          </div>
                          <div className="px-2 py-1 bg-emerald-50">
                            <div className="flex justify-between text-[5px] font-bold text-emerald-700"><span>Grand Total</span><span>₹84.00</span></div>
                          </div>
                          <div className="px-2 py-0.5 text-[3px] text-gray-400 text-center border-t border-gray-200">Thank you for your business!</div>
                        </div>
                        <button
                          onClick={() => { setA4Style('modern'); setPreviewFormat('a4'); }}
                          className="absolute bottom-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity p-1 bg-primary text-primary-foreground rounded-md shadow-lg hover:bg-primary/90 cursor-pointer"
                          title="View full preview"
                        >
                          <Maximize2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Classic A4 */}
                  <div className={clsx("relative rounded-xl border-2 transition-all overflow-hidden", a4Style === 'classic' ? "border-primary shadow-md ring-1 ring-primary/20" : "border-border/80 hover:border-primary/40")}>
                    {a4Style === 'classic' && <div className="absolute top-2 right-2 z-10 w-5 h-5 rounded-full bg-primary flex items-center justify-center"><CheckCircle2 className="w-3 h-3 text-primary-foreground" /></div>}
                    <button onClick={() => { setA4Style('classic'); setPreviewFormat('a4'); }} className="w-full cursor-pointer text-left">
                        <div className="p-2 bg-gradient-to-r from-rose-500/10 to-rose-500/5 border-b border-border/60">
                          <span className="text-[11px] font-bold text-foreground">Classic</span>
                        </div>
                      </button>
                    <div className="bg-gray-50 p-3 flex justify-center">
                      <div className="relative group">
                        <div className="bg-white shadow-sm w-full overflow-hidden border-2 border-double border-gray-600">
                          <div className="text-center border-b-2 border-double border-gray-600 px-2 py-1">
                            <div className="font-bold text-[6px] tracking-widest text-gray-900">YOUR SHOP NAME</div>
                            <div className="text-[4px] text-gray-500">123, Main Street, City - 400001</div>
                            <div className="text-[4px] text-gray-500">Phone: +91 98765 43210 | GSTIN: 27AAAAA1111A1Z1</div>
                            <div className="font-bold text-[7px] tracking-widest mt-0.5 text-gray-900">TAX INVOICE</div>
                          </div>
                          <div className="flex justify-between px-2 py-1 text-[4px] border-b border-gray-300 text-gray-700">
                            <div>Invoice No: INV-001</div>
                            <div>Date: {new Date().toLocaleDateString('en-IN')}</div>
                          </div>
                          <div className="px-2 py-1">
                            <table className="w-full text-[4px] border-collapse">
                              <thead><tr className="bg-gray-100">
                                <th className="border border-gray-300 px-0.5 text-center text-gray-700">#</th>
                                <th className="border border-gray-300 px-0.5 text-gray-700">Particulars</th>
                                <th className="border border-gray-300 px-0.5 text-right text-gray-700">Amount</th>
                              </tr></thead>
                              <tbody>
                                {['1|Item A x 2|₹50.00','2|Item B x 1|₹30.00'].map(r => { const c = r.split('|'); return (
                                  <tr key={c[0]} className="text-gray-900">
                                    <td className="border border-gray-300 text-center px-0.5">{c[0]}</td>
                                    <td className="border border-gray-300 px-0.5">{c[1]}</td>
                                    <td className="border border-gray-300 text-right px-0.5">{c[2]}</td>
                                  </tr>); })}
                              </tbody>
                              <tfoot>
                                <tr className="text-gray-900 font-bold"><td colSpan={2} className="border border-gray-300 text-right px-0.5">Subtotal</td><td className="border border-gray-300 text-right px-0.5">₹80.00</td></tr>
                                <tr className="text-gray-700"><td colSpan={2} className="border border-gray-300 text-right px-0.5">CGST @2.5%</td><td className="border border-gray-300 text-right px-0.5">₹2.00</td></tr>
                                <tr className="text-gray-700"><td colSpan={2} className="border border-gray-300 text-right px-0.5">SGST @2.5%</td><td className="border border-gray-300 text-right px-0.5">₹2.00</td></tr>
                                <tr className="text-gray-900 font-bold"><td colSpan={2} className="border border-gray-300 text-right px-0.5">Grand Total</td><td className="border border-gray-300 text-right px-0.5">₹84.00</td></tr>
                              </tfoot>
                            </table>
                          </div>
                          <div className="text-center px-2 py-0.5 text-[3px] text-gray-500 border-t border-gray-300">This is a computer generated invoice</div>
                        </div>
                        <button
                          onClick={() => { setA4Style('classic'); setPreviewFormat('a4'); }}
                          className="absolute bottom-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity p-1 bg-primary text-primary-foreground rounded-md shadow-lg hover:bg-primary/90 cursor-pointer"
                          title="View full preview"
                        >
                          <Maximize2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── Thermal: Width Toggle + Style Selection ── */}
            {printFormat === 'thermal' && (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Paper Width</span>
                  <div className="flex items-center gap-1.5 p-0.5 bg-muted rounded-lg border border-border/60">
                    <button onClick={() => setPrintWidth(58)}
                      className={clsx("px-3.5 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer", printWidth === 58 ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")}>58mm</button>
                    <button onClick={() => setPrintWidth(80)}
                      className={clsx("px-3.5 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer", printWidth === 80 ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")}>80mm</button>
                  </div>
                </div>

                <div>
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 block">Receipt Style</span>
                  <div className="grid grid-cols-2 gap-4">
                    {/* Standard */}
                    <div className={clsx("relative rounded-xl border-2 transition-all overflow-hidden", thermalStyle === 'standard' ? "border-primary shadow-md ring-1 ring-primary/20" : "border-border/80 hover:border-primary/40")}>
                      {thermalStyle === 'standard' && <div className="absolute top-2 right-2 z-10 w-5 h-5 rounded-full bg-primary flex items-center justify-center"><CheckCircle2 className="w-3 h-3 text-primary-foreground" /></div>}
                      <button onClick={() => { setThermalStyle('standard'); setPreviewFormat('thermal'); }} className="w-full cursor-pointer text-left">
                        <div className="p-2 bg-gradient-to-r from-blue-500/10 to-blue-500/5 border-b border-border/60">
                          <span className="text-[11px] font-bold text-foreground">Standard</span>
                        </div>
                      </button>
                      <div className="bg-muted/30 flex justify-center py-3">
                        <div className="relative group flex justify-center">
                          <div className={clsx("bg-card shadow-inner font-mono overflow-hidden border border-border/40", printWidth === 58 ? "w-40" : "w-48")}>
                            <pre className="text-[4px] leading-[1.4] whitespace-pre text-foreground pl-16" style={{ fontFamily: FONT_OPTIONS.find(f => f.id === receiptFont)?.family || '"Courier New", monospace' }}>
{`════════════════════════════════
        VENDORA MART           
    123, Main Street          
    Ph: +91 98765 43210       
    GSTIN: 27AAAAA1111A1Z1    
    -- TAX INVOICE --         
════════════════════════════════
  INV No:  INV-001             
  Date:    03/07/2026          
────────────────────────────────
#  Item          Qty    Amount  
────────────────────────────────
1  Item A          2     50.00 
2  Item B          1     30.00 
────────────────────────────────
SUBTOTAL                   80.00
CGST                       43.00
SGST                       43.00
DISCOUNT                  -50.00
════════════════════════════════
         GRAND TOTAL            
          ₹ 116.00              
════════════════════════════════
     ++ You Saved ₹50 ++        
────────────────────────────────
   Thank you for your visit!    
        Have a great day!       
════════════════════════════════`}</pre>
                          </div>
                          <button
                            onClick={() => { setThermalStyle('standard'); setPreviewFormat('thermal'); }}
                            className="absolute bottom-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity p-1 bg-primary text-primary-foreground rounded-md shadow-lg hover:bg-primary/90 cursor-pointer"
                            title="View full preview"
                          >
                            <Maximize2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Compact */}
                    <div className={clsx("relative rounded-xl border-2 transition-all overflow-hidden", thermalStyle === 'compact' ? "border-primary shadow-md ring-1 ring-primary/20" : "border-border/80 hover:border-primary/40")}>
                      {thermalStyle === 'compact' && <div className="absolute top-2 right-2 z-10 w-5 h-5 rounded-full bg-primary flex items-center justify-center"><CheckCircle2 className="w-3 h-3 text-primary-foreground" /></div>}
                      <button onClick={() => { setThermalStyle('compact'); setPreviewFormat('thermal'); }} className="w-full cursor-pointer text-left">
                        <div className="p-2 bg-gradient-to-r from-violet-500/10 to-violet-500/5 border-b border-border/60">
                          <span className="text-[11px] font-bold text-foreground">Compact</span>
                        </div>
                      </button>
                      <div className="bg-muted/30 flex justify-center py-3">
                        <div className="relative group flex justify-center">
                          <div className={clsx("bg-card shadow-inner font-mono overflow-hidden border border-border/40", printWidth === 58 ? "w-40" : "w-48")}>
                            <pre className="text-[4px] leading-[1.4] whitespace-pre text-foreground pl-16" style={{ fontFamily: FONT_OPTIONS.find(f => f.id === receiptFont)?.family || '"Courier New", monospace' }}>
{`SHOP NAME
123, Main Street, City
GST: 27AAAAA1111A1Z1
────────────────────────────────
INV-001  03/07/2026
────────────────────────────────
Item A                    50.00
 2x25.00
Item B                    30.00
 1x30.00
────────────────────────────────
Subtotal                  80.00
CGST                      43.00
SGST                      43.00
Discount                 -50.00
────────────────────────────────
GRAND TOTAL              116.00
────────────────────────────────
  ** SAVED ₹50 **
────────────────────────────────
         THANK YOU`}</pre>
                          </div>
                          <button
                            onClick={() => { setThermalStyle('compact'); setPreviewFormat('thermal'); }}
                            className="absolute bottom-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity p-1 bg-primary text-primary-foreground rounded-md shadow-lg hover:bg-primary/90 cursor-pointer"
                            title="View full preview"
                          >
                            <Maximize2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Modern */}
                    <div className={clsx("relative rounded-xl border-2 transition-all overflow-hidden", thermalStyle === 'modern' ? "border-primary shadow-md ring-1 ring-primary/20" : "border-border/80 hover:border-primary/40")}>
                      {thermalStyle === 'modern' && <div className="absolute top-2 right-2 z-10 w-5 h-5 rounded-full bg-primary flex items-center justify-center"><CheckCircle2 className="w-3 h-3 text-primary-foreground" /></div>}
                      <button onClick={() => { setThermalStyle('modern'); setPreviewFormat('thermal'); }} className="w-full cursor-pointer text-left">
                        <div className="p-2 bg-gradient-to-r from-amber-500/10 to-amber-500/5 border-b border-border/60">
                          <span className="text-[11px] font-bold text-foreground">Modern</span>
                        </div>
                      </button>
                      <div className="bg-muted/30 flex justify-center py-3">
                        <div className="relative group flex justify-center">
                          <div className={clsx("bg-card shadow-inner font-mono overflow-hidden border border-border/40", printWidth === 58 ? "w-40" : "w-48")}>
                            <pre className="text-[4px] leading-[1.4] whitespace-pre text-foreground pl-16" style={{ fontFamily: FONT_OPTIONS.find(f => f.id === receiptFont)?.family || '"Courier New", monospace' }}>
{`    ✦ VENDORA MART ✦    
   123, Main Street       
  📞 +91 98765 43210      
  GST: 27AAAAA1111A1Z1    
   [ TAX INVOICE ]        
════════════════════════════════
  INV:  INV-001                  
  Date: 03/07/2026               
────────────────────────────────
▸ Item A                   50.00 
 2 x 25.00                       
▸ Item B                   30.00 
 1 x 30.00                       
────────────────────────────────
SUBTOTAL                   80.00 
CGST                       43.00 
SGST                       43.00 
DISCOUNT                  -50.00 
────────────────────────────────
      >> GRAND TOTAL <<           
            ₹ 116.00              
────────────────────────────────
      ✦ Saved 50.00 ✦            
────────────────────────────────
        ✦ Thank You! ✦           
         Visit Again             
`}</pre>
                          </div>
                          <button
                            onClick={() => { setThermalStyle('modern'); setPreviewFormat('thermal'); }}
                            className="absolute bottom-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity p-1 bg-primary text-primary-foreground rounded-md shadow-lg hover:bg-primary/90 cursor-pointer"
                            title="View full preview"
                          >
                            <Maximize2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Classic */}
                    <div className={clsx("relative rounded-xl border-2 transition-all overflow-hidden", thermalStyle === 'classic' ? "border-primary shadow-md ring-1 ring-primary/20" : "border-border/80 hover:border-primary/40")}>
                      {thermalStyle === 'classic' && <div className="absolute top-2 right-2 z-10 w-5 h-5 rounded-full bg-primary flex items-center justify-center"><CheckCircle2 className="w-3 h-3 text-primary-foreground" /></div>}
                      <button onClick={() => { setThermalStyle('classic'); setPreviewFormat('thermal'); }} className="w-full cursor-pointer text-left">
                        <div className="p-2 bg-gradient-to-r from-rose-500/10 to-rose-500/5 border-b border-border/60">
                          <span className="text-[11px] font-bold text-foreground">Classic</span>
                        </div>
                      </button>
                      <div className="bg-muted/30 flex justify-center py-3">
                        <div className="relative group flex justify-center">
                          <div className={clsx("bg-card shadow-inner font-mono overflow-hidden border-2 border-border/60", printWidth === 58 ? "w-40" : "w-48")}>
                            <pre className="text-[4px] leading-[1.4] whitespace-pre text-foreground pl-16" style={{ fontFamily: FONT_OPTIONS.find(f => f.id === receiptFont)?.family || '"Courier New", monospace' }}>
{`════════════════════════════════
     *** VENDORA MART ***       
    123, Main Street            
    Phone: +91 98765 43210      
    GSTIN: 27AAAAA1111A1Z1      
    --- TAX INVOICE ---         
════════════════════════════════
  Invoice No:  INV-001          
  Date:        03/07/2026       
────────────────────────────────
1. Item A                  50.00
    2 x 25.00
2. Item B                  30.00
    1 x 30.00
────────────────────────────────
Subtotal:                  80.00
CGST @2.5%:                43.00
SGST @2.5%:                43.00
Discount:                 -50.00
════════════════════════════════
       *** GRAND TOTAL ***       
            ₹ 116.00             
════════════════════════════════
     *** YOU SAVED ₹50 ***       
────────────────────────────────
   * Thank you, visit again! *   
════════════════════════════════`}</pre>
                          </div>
                          <button
                            onClick={() => { setThermalStyle('classic'); setPreviewFormat('thermal'); }}
                            className="absolute bottom-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity p-1 bg-primary text-primary-foreground rounded-md shadow-lg hover:bg-primary/90 cursor-pointer"
                            title="View full preview"
                          >
                            <Maximize2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Clean */}
                    <div className={clsx("relative rounded-xl border-2 transition-all overflow-hidden", thermalStyle === 'clean' ? "border-primary shadow-md ring-1 ring-primary/20" : "border-border/80 hover:border-primary/40")}>
                      {thermalStyle === 'clean' && <div className="absolute top-2 right-2 z-10 w-5 h-5 rounded-full bg-primary flex items-center justify-center"><CheckCircle2 className="w-3 h-3 text-primary-foreground" /></div>}
                      <button onClick={() => { setThermalStyle('clean'); setPreviewFormat('thermal'); }} className="w-full cursor-pointer text-left">
                        <div className="p-2 bg-gradient-to-r from-teal-500/10 to-teal-500/5 border-b border-border/60">
                          <span className="text-[11px] font-bold text-foreground">Clean</span>
                        </div>
                      </button>
                      <div className="bg-muted/30 flex justify-center py-3">
                        <div className="relative group flex justify-center">
                          <div className={clsx("bg-card shadow-inner font-mono overflow-hidden border border-border/40", printWidth === 58 ? "w-40" : "w-48")}>
                            <pre className="text-[4px] leading-[1.4] whitespace-pre text-foreground pl-16" style={{ fontFamily: FONT_OPTIONS.find(f => f.id === receiptFont)?.family || '"Courier New", monospace' }}>
{`          VENDORA MART
       123, Main Street
      Ph: +91 98765 43210
    GSTIN: 27AAAAA1111A1Z1

Date: 03/07/2026
Receipt No: INV-001

ITEM       QTY   RATE   AMOUNT
Item A       2  25.00    50.00
Item B       1  30.00    30.00

SUB TOTAL :            ₹80.00
CGST :                 ₹43.00
SGST :                 ₹43.00
DISCOUNT :           ₹-50.00
NET PAYABLE :         ₹116.00

       YOU SAVED ₹50.00

  Thank You, Visit Again!`}
                            </pre>
                          </div>
                          <button
                            onClick={() => { setThermalStyle('clean'); setPreviewFormat('thermal'); }}
                            className="absolute bottom-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity p-1 bg-primary text-primary-foreground rounded-md shadow-lg hover:bg-primary/90 cursor-pointer"
                            title="View full preview"
                          >
                            <Maximize2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Dot */}
                    <div className={clsx("relative rounded-xl border-2 transition-all overflow-hidden", thermalStyle === 'dot' ? "border-primary shadow-md ring-1 ring-primary/20" : "border-border/80 hover:border-primary/40")}>
                      {thermalStyle === 'dot' && <div className="absolute top-2 right-2 z-10 w-5 h-5 rounded-full bg-primary flex items-center justify-center"><CheckCircle2 className="w-3 h-3 text-primary-foreground" /></div>}
                      <button onClick={() => { setThermalStyle('dot'); setPreviewFormat('thermal'); }} className="w-full cursor-pointer text-left">
                        <div className="p-2 bg-gradient-to-r from-cyan-500/10 to-cyan-500/5 border-b border-border/60">
                          <span className="text-[11px] font-bold text-foreground">Dot</span>
                        </div>
                      </button>
                      <div className="bg-muted/30 flex justify-center py-3">
                        <div className="relative group flex justify-center">
                          <div className={clsx("bg-card shadow-inner font-mono overflow-hidden border border-border/40", printWidth === 58 ? "w-40" : "w-48")}>
                            <pre className="text-[4px] leading-[1.4] whitespace-pre text-foreground pl-16" style={{ fontFamily: FONT_OPTIONS.find(f => f.id === receiptFont)?.family || '"Courier New", monospace' }}>
{`       VENDORA MART
     123, Main Street
    Ph: +91 98765 43210
    GST: 27AAAAA1111A1Z1
     TAX INVOICE

INV-001     03/07/2026

Item A ................ 50.00
  2x25.00
Item B ................ 30.00
  1x30.00
--------------------------------
SUBTOTAL .............. 80.00
CGST ................. 43.00
SGST ................. 43.00
DISCOUNT ............ -50.00
GRAND TOTAL .......... 116.00
--------------------------------
   Thank you, visit again!`}
                            </pre>
                          </div>
                          <button
                            onClick={() => { setThermalStyle('dot'); setPreviewFormat('thermal'); }}
                            className="absolute bottom-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity p-1 bg-primary text-primary-foreground rounded-md shadow-lg hover:bg-primary/90 cursor-pointer"
                            title="View full preview"
                          >
                            <Maximize2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Slim */}
                    <div className={clsx("relative rounded-xl border-2 transition-all overflow-hidden", thermalStyle === 'slim' ? "border-primary shadow-md ring-1 ring-primary/20" : "border-border/80 hover:border-primary/40")}>
                      {thermalStyle === 'slim' && <div className="absolute top-2 right-2 z-10 w-5 h-5 rounded-full bg-primary flex items-center justify-center"><CheckCircle2 className="w-3 h-3 text-primary-foreground" /></div>}
                      <button onClick={() => { setThermalStyle('slim'); setPreviewFormat('thermal'); }} className="w-full cursor-pointer text-left">
                        <div className="p-2 bg-gradient-to-r from-stone-500/10 to-stone-500/5 border-b border-border/60">
                          <span className="text-[11px] font-bold text-foreground">Slim</span>
                        </div>
                      </button>
                      <div className="bg-muted/30 flex justify-center py-3">
                        <div className="relative group flex justify-center">
                          <div className={clsx("bg-card shadow-inner font-mono overflow-hidden border border-border/40", printWidth === 58 ? "w-40" : "w-48")}>
                            <pre className="text-[4px] leading-[1.4] whitespace-pre text-foreground pl-16" style={{ fontFamily: FONT_OPTIONS.find(f => f.id === receiptFont)?.family || '"Courier New", monospace' }}>
{`VENDORA MART
123, Main Street
GST: 27AAAAA1111A1Z1

INV-001  03/07/2026

Item A               50.00
  2x25.00
Item B               30.00
  1x30.00

SUBTOTAL             80.00
CGST                 43.00
SGST                 43.00
DISCOUNT            -50.00
GRAND TOTAL         116.00

Thank You`}
                            </pre>
                          </div>
                          <button
                            onClick={() => { setThermalStyle('slim'); setPreviewFormat('thermal'); }}
                            className="absolute bottom-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity p-1 bg-primary text-primary-foreground rounded-md shadow-lg hover:bg-primary/90 cursor-pointer"
                            title="View full preview"
                          >
                            <Maximize2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Luxe */}
                    <div className={clsx("relative rounded-xl border-2 transition-all overflow-hidden", thermalStyle === 'luxe' ? "border-primary shadow-md ring-1 ring-primary/20" : "border-border/80 hover:border-primary/40")}>
                      {thermalStyle === 'luxe' && <div className="absolute top-2 right-2 z-10 w-5 h-5 rounded-full bg-primary flex items-center justify-center"><CheckCircle2 className="w-3 h-3 text-primary-foreground" /></div>}
                      <button onClick={() => { setThermalStyle('luxe'); setPreviewFormat('thermal'); }} className="w-full cursor-pointer text-left">
                        <div className="p-2 bg-gradient-to-r from-purple-500/10 to-purple-500/5 border-b border-border/60">
                          <span className="text-[11px] font-bold text-foreground">Luxe</span>
                        </div>
                      </button>
                      <div className="bg-muted/30 flex justify-center py-3">
                        <div className="relative group flex justify-center">
                          <div className={clsx("bg-card shadow-inner font-mono overflow-hidden border-2 border-border/60", printWidth === 58 ? "w-40" : "w-48")}>
                            <pre className="text-[4px] leading-[1.4] whitespace-pre text-foreground pl-16" style={{ fontFamily: FONT_OPTIONS.find(f => f.id === receiptFont)?.family || '"Courier New", monospace' }}>
{`════════════════════════════════
      VENDORA MART
   123, Main Street
  Ph: +91 98765 43210
  GSTIN: 27AAAAA1111A1Z1
════════════════════════════════
  Invoice: INV-001
  Date:    03/07/2026
────────────────────────────────
           ITEMS
────────────────────────────────
1. Item A                 50.00
    2 x 25.00
2. Item B                 30.00
    1 x 30.00
────────────────────────────────
Subtotal           ₹80.00
CGST               ₹43.00
SGST               ₹43.00
Discount          ₹-50.00
════════════════════════════════
       GRAND TOTAL
        ₹ 116.00
════════════════════════════════
  Thank You, Visit Again!
────────────────────────────────`}
                            </pre>
                          </div>
                          <button
                            onClick={() => { setThermalStyle('luxe'); setPreviewFormat('thermal'); }}
                            className="absolute bottom-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity p-1 bg-primary text-primary-foreground rounded-md shadow-lg hover:bg-primary/90 cursor-pointer"
                            title="View full preview"
                          >
                            <Maximize2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 p-3.5 bg-card border border-border/80 rounded-xl hover:border-primary/30 transition-all duration-200 mt-4">
                    <button onClick={() => setShowProductOffers(!showProductOffers)} className={clsx('relative w-12 h-6 rounded-full transition-all duration-200 shrink-0 cursor-pointer', showProductOffers ? 'bg-primary' : 'bg-muted-foreground/30')}>
                      <span className={clsx('absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all duration-200', showProductOffers ? 'translate-x-6' : 'translate-x-0')} />
                    </button>
                    <div className="flex-1">
                      <label className="text-xs font-bold text-foreground cursor-pointer" onClick={() => setShowProductOffers(!showProductOffers)}>Show Per-Product Offers on Receipt</label>
                      <p className="text-[10px] text-muted-foreground mt-0.5">When enabled, items with discounts will show MRP, offer price, and discount labels on printed receipts.</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 p-3.5 bg-card border border-border/80 rounded-xl hover:border-primary/30 transition-all duration-200 mt-4">
                    <button onClick={() => setOpenCashDrawerOnPending(!openCashDrawerOnPending)} className={clsx('relative w-12 h-6 rounded-full transition-all duration-200 shrink-0 cursor-pointer', openCashDrawerOnPending ? 'bg-primary' : 'bg-muted-foreground/30')}>
                      <span className={clsx('absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all duration-200', openCashDrawerOnPending ? 'translate-x-6' : 'translate-x-0')} />
                    </button>
                    <div className="flex-1">
                      <label className="text-xs font-bold text-foreground cursor-pointer" onClick={() => setOpenCashDrawerOnPending(!openCashDrawerOnPending)}>Open Cash Drawer on Pending Payment</label>
                      <p className="text-[10px] text-muted-foreground mt-0.5">When billing with Pending payment method, automatically open the cash drawer after printing. Enable this only if you collect cash at the billing counter.</p>
                    </div>
                  </div>

                  <div className="p-3.5 bg-card border border-border/80 rounded-xl hover:border-primary/30 transition-all duration-200 mt-4">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 block">Bill Content</label>
                    <p className="text-[10px] text-muted-foreground mb-3">Tick what to show on printed bills & invoices</p>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-1">
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
                      ].map(({ key, label }) => {
                        const forcedOn = key === 'showTitle' && billSettings.estimateMode;
                        return (
                          <label key={key} className={`flex items-center gap-2.5 py-1.5 ${forcedOn ? '' : 'cursor-pointer group'}`}>
                            <button
                              onClick={() => {
                                if (forcedOn) return;
                                setBillSettings(s => ({ ...s, [key]: !(s as any)[key] }));
                              }}
                              className={clsx(
                                'w-4 h-4 rounded border-2 flex items-center justify-center transition-all shrink-0',
                                (billSettings as any)[key] || forcedOn ? 'bg-primary border-primary' : 'border-muted-foreground/40 group-hover:border-primary/50',
                                forcedOn && 'opacity-50'
                              )}
                            >
                              {((billSettings as any)[key] || forcedOn) && <CheckCircle2 className="w-3 h-3 text-primary-foreground" />}
                            </button>
                            <span className={`text-xs select-none ${forcedOn ? 'text-muted-foreground' : 'text-foreground'}`}>
                              {label}
                            </span>
                          </label>
                        );
                      })}
                      {billSettings.showBosTaxBreakup && (<>
                        <div className="col-span-2 flex items-center gap-3 py-2 border-b border-border/40 mb-1">
                          <label className="text-xs text-foreground shrink-0">CGST/SGST Rate %</label>
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
                            className="w-20 px-2 py-1 text-xs border border-border/60 rounded bg-background text-foreground text-center"
                          />
                          <span className="text-[10px] text-muted-foreground">Total tax is split equally as CGST + SGST (or IGST for inter-state)</span>
                        </div>
                        <div className="col-span-2 flex items-center gap-3 pb-2">
                          <label className="text-xs text-foreground shrink-0">Tax Type</label>
                          <div className="flex rounded-lg border border-border/60 overflow-hidden">
                            <button
                              onClick={() => setBillSettings(s => ({ ...s, bosTaxInclusive: false }))}
                              className={clsx(
                                'px-3 py-1 text-xs font-medium transition-all cursor-pointer',
                                !billSettings.bosTaxInclusive ? 'bg-primary text-primary-foreground' : 'bg-background text-foreground hover:bg-muted'
                              )}
                            >
                              Exclusive (tax extra)
                            </button>
                            <button
                              onClick={() => setBillSettings(s => ({ ...s, bosTaxInclusive: true }))}
                              className={clsx(
                                'px-3 py-1 text-xs font-medium transition-all cursor-pointer',
                                billSettings.bosTaxInclusive ? 'bg-primary text-primary-foreground' : 'bg-background text-foreground hover:bg-muted'
                              )}
                            >
                              Inclusive (tax included)
                            </button>
                          </div>
                        </div>
                      </>)}
                      <div className="col-span-2 border-t border-border/60 my-1.5" />
                      <label className="flex items-center gap-2.5 py-1.5 cursor-pointer group col-span-2">
                        <button
                          onClick={() => {
                            if (!billSettings.estimateMode) {
                              setBillSettings(s => ({ ...s, estimateMode: true, showTitle: true }));
                            } else {
                              setBillSettings(s => ({ ...s, estimateMode: false }));
                            }
                          }}
                          className={clsx(
                            'w-4 h-4 rounded border-2 flex items-center justify-center transition-all shrink-0',
                            billSettings.estimateMode ? 'bg-primary border-primary' : 'border-muted-foreground/40 group-hover:border-primary/50'
                          )}
                        >
                          {billSettings.estimateMode && <CheckCircle2 className="w-3 h-3 text-primary-foreground" />}
                        </button>
                        <div>
                          <span className="text-xs text-foreground select-none font-bold">Force "BILL OF SUPPLY" title</span>
                          <p className="text-[10px] text-muted-foreground">Overrides document title to BILL OF SUPPLY. Automatically enables Document Title.</p>
                        </div>
                      </label>
                    </div>
                  </div>

                  <div className="p-3.5 bg-card border border-border/80 rounded-xl hover:border-primary/30 transition-all duration-200 mt-4">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 block">Scrap Bill Content</label>
                    <p className="text-[10px] text-muted-foreground mb-3">Separate settings for scrap bill receipts</p>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                      {[
                        { key: 'showScrapHeading', label: 'Scrap Bill Heading' },
                        { key: 'showShopName', label: 'Shop Name' },
                        { key: 'showShopAddress', label: 'Shop Address' },
                        { key: 'showPhone', label: 'Phone Number' },
                        { key: 'showShopGstin', label: 'Shop GSTIN' },
                        { key: 'showTitle', label: 'Document Title' },
                        { key: 'showCustomerName', label: 'Customer Name' },
                      ].map(({ key, label }) => (
                        <label key={key} className="flex items-center gap-2.5 py-1.5 cursor-pointer group">
                          <button
                            onClick={() => setScrapBillSettings(s => ({ ...s, [key]: !(s as any)[key] }))}
                            className={clsx(
                              'w-4 h-4 rounded border-2 flex items-center justify-center transition-all shrink-0',
                              (scrapBillSettings as any)[key] ? 'bg-primary border-primary' : 'border-muted-foreground/40 group-hover:border-primary/50'
                            )}
                          >
                            {(scrapBillSettings as any)[key] && <CheckCircle2 className="w-3 h-3 text-primary-foreground" />}
                          </button>
                          <span className="text-xs text-foreground select-none">{label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="p-3.5 bg-card border border-border/80 rounded-xl hover:border-primary/30 transition-all duration-200 mt-4">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 block">Receipt Font</label>
                    <div className="flex flex-wrap gap-2">
                      {FONT_OPTIONS.map(f => (
                        <button
                          key={f.id}
                          onClick={() => setReceiptFont(f.id)}
                          className={clsx(
                            'px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer',
                            receiptFont === f.id
                              ? 'bg-primary text-primary-foreground shadow-sm'
                              : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground border border-border/60'
                          )}
                          style={{ fontFamily: receiptFont === f.id ? f.family : undefined }}
                        >
                          {f.name}
                        </button>
                      ))}
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-2">Font used when printing thermal receipts. Pick one installed on your system.</p>
                  </div>
                </div>
                </>
              )}
  
              <div className="p-3.5 bg-amber-500/5 border border-amber-500/20 rounded-xl flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                Changes apply only to new invoices. Previously generated invoices remain unaffected.
              </p>
            </div>
          </div>
        );
      case 'coding':
        return (
          <div className="grid grid-cols-5 gap-3">
            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => (
              <div key={digit} className="flex items-center gap-1.5 bg-card p-2.5 rounded-xl border border-border/80 hover:border-primary/30 transition-all duration-200">
                <span className="font-bold text-base w-5 text-center text-muted-foreground">{digit}</span>
                <span className="text-muted-foreground text-xs">=</span>
                <Input type="text" maxLength={1} value={priceCoding[digit.toString()] || ''} onChange={(e) => setPriceCoding({ ...priceCoding, [digit.toString()]: e.target.value.toUpperCase() })} className="text-center font-bold text-sm" />
              </div>
            ))}
          </div>
        );
      case 'barcode-printer':
        return (
          <div className="grid grid-cols-2 gap-5">
            <div className="col-span-2 space-y-2">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Connection Type</label>
              <div className="flex gap-3">
                <button className={clsx("flex items-center gap-2 px-5 py-3 rounded-xl border text-sm font-bold transition-all duration-200 active:scale-95 flex-1 cursor-pointer", barcodePrinter.type === 'network' ? "border-primary bg-primary/5 text-primary shadow-sm" : "border-border/80 text-muted-foreground hover:text-foreground hover:bg-muted/40")} onClick={() => setBarcodePrinter({ ...barcodePrinter, type: 'network' })}>
                  <Globe className="w-4 h-4" /> Network (TCP/IP)
                </button>
                <button className={clsx("flex items-center gap-2 px-5 py-3 rounded-xl border text-sm font-bold transition-all duration-200 active:scale-95 flex-1 cursor-pointer", barcodePrinter.type === 'usb' ? "border-primary bg-primary/5 text-primary shadow-sm" : "border-border/80 text-muted-foreground hover:text-foreground hover:bg-muted/40")} onClick={() => setBarcodePrinter({ ...barcodePrinter, type: 'usb' })}>
                  <Usb className="w-4 h-4" /> USB (OS Print Queue)
                </button>
              </div>
            </div>
            {barcodePrinter.type === 'network' ? (
              <>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Printer IP Address</label>
                  <Input type="text" value={barcodePrinter.ip} onChange={(e) => setBarcodePrinter({ ...barcodePrinter, ip: e.target.value })} placeholder="192.168.1.100" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Port</label>
                  <Input type="text" inputMode="numeric" value={barcodePrinter.port ?? 9100} onChange={(e) => setBarcodePrinter({ ...barcodePrinter, port: e.target.value === '' ? '' : e.target.value.replace(/\D/g, '') })} />
                </div>
              </>
            ) : (
              <div className="col-span-2 space-y-2">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Select USB Printer</label>
                <Select value={barcodePrinter.deviceName} placeholder="-- Select a printer --" onChange={v => setBarcodePrinter({ ...barcodePrinter, deviceName: v })} options={osPrinters.map(p => ({value:p.name,label:p.name}))} />
              </div>
            )}
            {barcodePrinter.type === 'usb' && (
              <div className="col-span-2 grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Label Width (mm)</label>
                  <Input type="text" inputMode="numeric" value={barcodePrinter.labelWidthMm ?? 50} onChange={(e) => setBarcodePrinter({ ...barcodePrinter, labelWidthMm: e.target.value === '' ? '' : e.target.value.replace(/\D/g, '') })} />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Label Height (mm)</label>
                  <Input type="text" inputMode="numeric" value={barcodePrinter.labelHeightMm ?? 25} onChange={(e) => setBarcodePrinter({ ...barcodePrinter, labelHeightMm: e.target.value === '' ? '' : e.target.value.replace(/\D/g, '') })} />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Label Columns</label>
                  <Input type="text" inputMode="numeric" value={barcodePrinter.labelColumns ?? 1} onChange={(e) => setBarcodePrinter({ ...barcodePrinter, labelColumns: e.target.value === '' ? '' : e.target.value.replace(/\D/g, '') })} />
                </div>
              </div>
            )}
          </div>
        );
      case 'receipt-printer':
        return (
          <div className="grid grid-cols-2 gap-5">
            <div className="col-span-2 space-y-2">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Connection Type</label>
              <div className="flex gap-3">
                <button className={clsx("flex items-center gap-2 px-5 py-3 rounded-xl border text-sm font-bold transition-all duration-200 active:scale-95 flex-1 cursor-pointer", receiptPrinter.type === 'network' ? "border-primary bg-primary/5 text-primary shadow-sm" : "border-border/80 text-muted-foreground hover:text-foreground hover:bg-muted/40")} onClick={() => setReceiptPrinter({ ...receiptPrinter, type: 'network' })}>
                  <Globe className="w-4 h-4" /> Network (TCP/IP)
                </button>
                <button className={clsx("flex items-center gap-2 px-5 py-3 rounded-xl border text-sm font-bold transition-all duration-200 active:scale-95 flex-1 cursor-pointer", receiptPrinter.type === 'usb' ? "border-primary bg-primary/5 text-primary shadow-sm" : "border-border/80 text-muted-foreground hover:text-foreground hover:bg-muted/40")} onClick={() => setReceiptPrinter({ ...receiptPrinter, type: 'usb' })}>
                  <Usb className="w-4 h-4" /> USB (OS Print Queue)
                </button>
              </div>
            </div>
            {receiptPrinter.type === 'network' ? (
              <>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Printer IP Address</label>
                  <Input type="text" value={receiptPrinter.ip} onChange={(e) => setReceiptPrinter({ ...receiptPrinter, ip: e.target.value })} placeholder="192.168.1.100" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Port</label>
                  <Input type="text" inputMode="numeric" value={receiptPrinter.port ?? 9100} onChange={(e) => setReceiptPrinter({ ...receiptPrinter, port: e.target.value === '' ? '' : e.target.value.replace(/\D/g, '') })} />
                </div>
              </>
            ) : (
              <div className="col-span-2 space-y-2">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Select USB Printer</label>
                <Select value={receiptPrinter.deviceName} placeholder="-- Select a printer --" onChange={v => setReceiptPrinter({ ...receiptPrinter, deviceName: v })} options={osPrinters.map(p => ({value:p.name,label:p.name}))} />
              </div>
            )}
            <div className="col-span-2 space-y-2">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Receipt Width (cm)</label>
              <Input type="text" inputMode="decimal" value={receiptPrinter.receiptWidthCm ?? 5.8} onChange={(e) => setReceiptPrinter({ ...receiptPrinter, receiptWidthCm: e.target.value === '' ? '' : e.target.value.replace(/[^\d.]/g, '') })} placeholder="e.g. 5.8 or 8.0" />
              <p className="text-[10px] text-muted-foreground mt-1">Standard sizes: 5.8cm (58mm) and 8.0cm (80mm).</p>
            </div>
          </div>
        );
      case 'a4-printer':
        return (
          <div className="space-y-5">
            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Select A4 Printer</label>
              <Select value={a4Printer.deviceName} placeholder="-- Use default system printer --" onChange={v => setA4Printer({ ...a4Printer, deviceName: v })} options={osPrinters.map(p => ({value:p.name,label:p.name}))} />
              <p className="text-[10px] text-muted-foreground mt-1">Choose a printer for A4 documents (quotations, invoices, reports). Leave as default to use system printer dialog.</p>
            </div>
          </div>
        );
      case 'scale':
        return (
          <div className="grid grid-cols-2 gap-5">
            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Serial Port (COM/tty)</label>
              <Input type="text" value={scale.path} onChange={(e) => setScale({ ...scale, path: e.target.value })} placeholder="COM3" />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Baud Rate</label>
              <Select value={String(scale.baudRate)} onChange={v => setScale({ ...scale, baudRate: parseInt(v) })} options={['2400','4800','9600','19200','38400','115200'].map(b => ({value:b,label:b}))} />
            </div>
          </div>
        );
      case 'updates':
        return (
          <div className="space-y-5">
            <div className="relative overflow-hidden rounded-xl border border-border bg-gradient-to-br from-primary/[0.04] to-transparent">
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(59,130,246,0.06),transparent_70%)]" />
              <div className="relative p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="p-3 rounded-xl bg-primary/10 text-primary shadow-sm"><RefreshCw className="w-5 h-5" /></div>
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Current Version</p>
                      <p className="text-2xl font-bold text-foreground font-mono tracking-tight mt-0.5">{appVersion}</p>
                      {lastChecked && (<p className="text-[11px] text-muted-foreground/70 mt-1">Last checked {formatTimeAgo(lastChecked)}</p>)}
                    </div>
                  </div>
                  {updateStatus && (
                    <div className={clsx("flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold border shrink-0", updateStatus === 'Up to date' ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400" : updateStatus === 'Update available' || updateStatus === 'Update ready to install' ? "bg-blue-500/10 border-blue-500/20 text-blue-600 dark:text-blue-400" : updateStatus === 'Downloading...' || isDownloading ? "bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400" : "bg-muted/50 border-border text-muted-foreground")}>
                      {isDownloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : updateStatus === 'Up to date' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Download className="w-3.5 h-3.5" />}
                      {updateStatus}
                    </div>
                  )}
                </div>
              </div>
            </div>
            {updateStatus === 'Up to date' && !updateInfo && (
              <div className="rounded-xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/[0.04] to-transparent overflow-hidden">
                <div className="flex items-center gap-3 px-5 py-4 border-b border-emerald-500/10">
                  <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="w-5 h-5" /></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-foreground">{appVersion} — You're on the latest version</p>
                    <p className="text-xs text-muted-foreground mt-0.5">No updates available at this time.</p>
                  </div>
                  <span className="px-2.5 py-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold rounded-md border border-emerald-500/20">UP TO DATE</span>
                </div>
                {lastChecked && (<div className="px-5 py-2.5 bg-emerald-500/[0.02] border-t border-emerald-500/5"><p className="text-[11px] text-muted-foreground/70">Last checked {formatTimeAgo(lastChecked)}</p></div>)}
              </div>
            )}
            {updateInfo && (
              <div className="rounded-xl border border-blue-500/20 bg-gradient-to-br from-blue-500/[0.04] to-transparent overflow-hidden">
                <div className="flex items-center gap-3 px-5 py-4 border-b border-blue-500/10">
                  <div className="p-2 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400"><Download className="w-4 h-4" /></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-foreground">v{updateInfo.version} {updateReady ? 'Ready to Install' : isDownloading ? 'Downloading...' : 'Available'}</p>
                    {updateInfo.releaseDate && (<p className="text-xs text-muted-foreground mt-0.5">Released {new Date(updateInfo.releaseDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>)}
                  </div>
                  <span className="px-2.5 py-1 bg-blue-500/10 text-blue-600 dark:text-blue-400 text-[10px] font-bold rounded-md border border-blue-500/20">{updateReady ? 'READY' : isDownloading ? 'DOWNLOADING' : 'NEW'}</span>
                </div>
                {updateInfo.releaseNotes && (
                  <div className="px-5 py-4">
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-3">What's New</p>
                    <div className="text-xs text-muted-foreground max-h-36 overflow-y-auto leading-relaxed space-y-2">
                      {typeof updateInfo.releaseNotes === 'string'
                        ? updateInfo.releaseNotes.split('\n').filter(Boolean).map((line: string, i: number) => (<p key={i} className="flex items-start gap-2.5"><span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-blue-500/60 shrink-0" /><span>{line}</span></p>))
                        : <p className="text-muted-foreground">{JSON.stringify(updateInfo.releaseNotes)}</p>}
                    </div>
                  </div>
                )}
                {isDownloading && downloadProgress && (
                  <div className="px-5 pb-4">
                    <div className="w-full bg-border/50 rounded-full h-2.5 overflow-hidden"><div className="h-full bg-primary rounded-full transition-all duration-300" style={{ width: `${Math.min(downloadProgress.percent, 100)}%` }} /></div>
                    <div className="flex items-center justify-between mt-2"><p className="text-[11px] text-muted-foreground">{Math.round(downloadProgress.percent)}%</p><p className="text-[11px] text-muted-foreground">{formatBytes(downloadProgress.transferred)} / {formatBytes(downloadProgress.total)}</p></div>
                  </div>
                )}
                {updateReady && (
                  <div className="px-5 pb-4">
                    <button onClick={handleInstallUpdate} className="flex items-center justify-center gap-2 w-full h-11 rounded-xl font-bold text-sm bg-primary/10 hover:bg-primary hover:text-primary-foreground border border-primary/20 hover:border-primary transition-all duration-200 active:scale-95 cursor-pointer">
                      <RotateCcw className="w-4 h-4" /> Restart & Install Update
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      case 'appearance':
        return (
          <div className="space-y-4">
            <div className="bg-muted/30 border border-border rounded-xl p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-foreground">Font Size</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Scale the entire UI text size</p>
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={decreaseFontScale} disabled={fontScale <= 70} className="w-10 h-10 flex items-center justify-center rounded-xl bg-background border border-border/80 text-muted-foreground hover:text-foreground hover:bg-muted transition-all duration-200 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"><Minus className="w-4 h-4" /></button>
                  <div className="w-20 text-center">
                    <span className="text-2xl font-black text-foreground">{fontScale}%</span>
                    <div className="flex items-center justify-center gap-1 mt-1">
                      <span className={clsx('w-2 h-2 rounded-full', fontScale <= 80 ? 'bg-blue-500' : fontScale <= 100 ? 'bg-emerald-500' : fontScale <= 120 ? 'bg-amber-500' : 'bg-red-500')} />
                      <span className="text-[10px] font-semibold text-muted-foreground">{fontScale <= 80 ? 'Small' : fontScale <= 100 ? 'Normal' : fontScale <= 120 ? 'Large' : 'X-Large'}</span>
                    </div>
                  </div>
                  <button onClick={increaseFontScale} disabled={fontScale >= 140} className="w-10 h-10 flex items-center justify-center rounded-xl bg-background border border-border/80 text-muted-foreground hover:text-foreground hover:bg-muted transition-all duration-200 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"><Plus className="w-4 h-4" /></button>
                </div>
              </div>
              <div className="mt-5 p-4 bg-card border border-border/60 rounded-xl">
                <div className="flex items-center gap-3 mb-3"><Type className="w-4 h-4 text-primary" /><span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Preview</span></div>
                <p className="text-xs text-foreground font-medium">The quick brown fox jumps over the lazy dog.</p>
                <p className="text-[10px] text-muted-foreground mt-1.5">This is how your receipts, invoices, and product labels will appear.</p>
              </div>
              <button onClick={() => setFontScale(100)} disabled={fontScale === 100} className="mt-4 px-4 py-2 text-xs font-bold text-muted-foreground hover:text-foreground bg-muted hover:bg-muted/80 border border-border/80 rounded-xl transition-all duration-200 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer">Reset to Default</button>
            </div>
          </div>
        );
      case 'security':
        return (
          <div className="space-y-5">
            <div className="bg-muted/30 border border-border/80 rounded-xl p-6 space-y-5">
              <div>
                <h3 className="font-bold text-foreground">Change Password</h3>
                <p className="text-xs text-muted-foreground mt-1">Update your account password regularly to keep your shop secure.</p>
              </div>
              <div className="relative">
                <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input type="password" placeholder="Current Password" className="pl-11" value={pass.old} onChange={(e) => setPass({ ...pass, old: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Input type="password" placeholder="New Password" value={pass.new} onChange={(e) => setPass({ ...pass, new: e.target.value })} />
                <Input type="password" placeholder="Confirm New Password" value={pass.confirm} onChange={(e) => setPass({ ...pass, confirm: e.target.value })} />
              </div>
              <button type="button" disabled={changingPass} onClick={handleChangePassword}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold bg-primary/10 hover:bg-primary hover:text-primary-foreground rounded-xl transition-all duration-200 active:scale-95 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed border border-primary/20 hover:border-primary">
                {changingPass ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
                Update Password
              </button>
            </div>
          </div>
        );
      case 'label-settings':
        return (
          <div className="space-y-5">
            <div>
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 block">Code Type</label>
              <div className="grid grid-cols-2 gap-3">
                {CODE_TYPES.map((ct) => (
                  <button
                    key={ct.id}
                    onClick={() => setLabelCodeType(ct.id)}
                    className={clsx(
                      "relative flex items-center gap-3 p-4 rounded-xl border-2 transition-all duration-200 cursor-pointer text-left",
                      labelCodeType === ct.id
                        ? "border-primary bg-primary/5 shadow-sm"
                        : "border-border/80 hover:border-primary/40 hover:bg-muted/30"
                    )}
                  >
                    <div className={clsx(
                      "p-2.5 rounded-xl",
                      labelCodeType === ct.id ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                    )}>
                      {ct.id === 'barcode' ? (
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M2 4h2v16H2zM6 4h1v16H6zM9 4h2v16H9zM13 4h1v16h-1zM16 4h2v16h-2zM20 4h2v16h-2z" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
                    <div className="flex-1">
                      <p className="text-sm font-bold text-foreground">{ct.label}</p>
                      <p className="text-xs text-muted-foreground">{ct.description}</p>
                    </div>
                    {labelCodeType === ct.id && (
                      <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center shrink-0">
                        <CheckCircle2 className="w-3.5 h-3.5 text-primary-foreground" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-3.5 bg-blue-500/5 border border-blue-500/20 rounded-xl flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
              <p className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                The selected code type will be used as the default for generating, previewing, and printing product labels. Existing labels remain unaffected.
              </p>
            </div>
          </div>
        );
      case 'grades':
        return <SettingsGrades />;
      default:
        return null;
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-background overflow-hidden">
      {renderMessage()}
      {showBulkSheet && <BulkOnboardingSheet onClose={() => setShowBulkSheet(false)} />}

      {/* ── Premium Header ── */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-border bg-card shrink-0 gap-4 shadow-sm z-30">
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative">
            <div className="absolute inset-0 bg-primary/20 rounded-xl blur-sm" />
            <div className="relative p-2.5 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 text-primary ring-1 ring-primary/20">
              <Settings className="w-5 h-5" />
            </div>
          </div>
          <div className="min-w-0 leading-tight">
            <div className="flex items-center gap-2.5">
              <h1 className="text-sm font-bold text-foreground truncate">Settings</h1>
              <span className="hidden sm:inline-flex items-center gap-1.5 px-2 py-0.5 bg-muted/60 rounded-md text-[10px] text-muted-foreground font-mono font-semibold border border-border/40">
                {appVersion}
              </span>
            </div>
            <p className="text-xs text-muted-foreground font-medium mt-0.5">Configure your shop, hardware, and system preferences</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {activeSection !== 'grades' && hasChanges && (
            <button onClick={handleSave} disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-primary bg-primary/10 hover:bg-primary hover:text-primary-foreground rounded-xl transition-all duration-200 active:scale-95 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed animate-in fade-in border border-primary/20 hover:border-primary">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span className="hidden sm:inline">{saving ? 'Saving...' : 'Save Changes'}</span>
              <span className="sm:hidden">Save</span>
            </button>
          )}
          <button onClick={onClose}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-all duration-200 active:scale-95 cursor-pointer border border-destructive/30"
            title="Close">
            <X className="w-4 h-4 text-destructive" />
          </button>
        </div>
      </header>

      {/* ── Sidebar + Content ── */}
      <div className="flex-1 flex overflow-hidden">

        {/* ── Left Sidebar Navigation ── */}
        <aside className="w-56 lg:w-64 shrink-0 bg-muted/30 border-r border-border overflow-y-auto hidden md:block">
          <nav className="py-3 px-2 space-y-5">
            {SIDEBAR_GROUPS.map((group) => {
              const visibleItems = group.items.filter(item => !item.ownerOnly || role === 'OWNER');
              if (visibleItems.length === 0) return null;
              const GroupIcon = group.icon;
              return (
                <div key={group.category}>
                  <div className="flex items-center gap-2 px-3 py-1.5">
                    <GroupIcon className="w-3.5 h-3.5 text-muted-foreground/50" />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">{group.category}</span>
                  </div>
                  <div className="mt-0.5 space-y-0.5">
                    {visibleItems.map((item) => {
                      const ItemIcon = item.icon;
                      const isActive = activeSection === item.id;
                      return (
                        <button
                          key={item.id}
                          onClick={() => setActiveSection(item.id)}
                          className={clsx(
                            "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-150 cursor-pointer text-left group",
                            isActive
                              ? "bg-primary/10 text-primary shadow-sm border border-primary/15"
                              : "text-muted-foreground hover:text-foreground hover:bg-muted/60 border border-transparent"
                          )}
                        >
                          <ItemIcon className={clsx("w-4 h-4 shrink-0 transition-colors", isActive ? "text-primary" : "text-muted-foreground/60 group-hover:text-foreground/70")} />
                          <span className="flex-1 truncate">{item.label}</span>
                          {item.ownerOnly && (
                            <span className="px-1.5 py-0.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[8px] font-bold rounded border border-amber-500/20 shrink-0">O</span>
                          )}
                          {isActive && <ChevronRight className="w-3 h-3 text-primary/60 shrink-0" />}
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
          <div className="flex gap-1 p-2 whitespace-nowrap">
            {SIDEBAR_GROUPS.flatMap(g => g.items).filter(item => !item.ownerOnly || role === 'OWNER').map((item) => {
              const ItemIcon = item.icon;
              const isActive = activeSection === item.id;
              return (
                <button key={item.id} onClick={() => setActiveSection(item.id)}
                  className={clsx("flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 cursor-pointer border shrink-0",
                    isActive ? "bg-primary/10 text-primary border-primary/20 shadow-sm" : "bg-card text-muted-foreground border-border/60 hover:text-foreground hover:bg-muted"
                  )}>
                  <ItemIcon className="w-3.5 h-3.5" /> {item.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Main Content Area ── */}
        <main className="flex-1 overflow-y-auto bg-gradient-to-b from-background via-background to-muted/20" style={{ scrollbarGutter: 'stable' }}>
          <div className="max-w-3xl mx-auto p-6 lg:p-8">

            {/* Section Header */}
            {activeItem && (
              <div className="mb-8">
                <div className="flex items-center gap-3 mb-1">
                  <div className="p-2 rounded-lg bg-primary/10 text-primary shadow-sm">
                    <activeItem.icon className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-foreground tracking-tight">{activeItem.label}</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {activeItem.id === 'invoice' && 'Assign a unique code per computer. Invoice numbers use code - number format to avoid conflicts.'}
                      {activeItem.id === 'bulk' && 'Import products and print barcode labels in bulk.'}
                      {activeItem.id === 'gst' && 'Configure your business GSTIN and default state for GST invoices.'}
                      {activeItem.id === 'shop' && 'Manage your business name, address, phone, and UPI payment ID.'}
                      {activeItem.id === 'coding' && 'Assign alphabets to each digit to encode your purchase prices.'}
                      {activeItem.id === 'barcode-printer' && 'Configure your barcode label printer connection and label dimensions.'}
                      {activeItem.id === 'receipt-printer' && 'Configure your receipt printer connection and paper width.'}
                      {activeItem.id === 'a4-printer' && 'Select a printer for A4 document printing (quotations, invoices, reports).'}
                      {activeItem.id === 'scale' && 'Configure the serial port connection for your weighing scale.'}
                      {activeItem.id === 'updates' && 'Check for new versions and update your application.'}
                      {activeItem.id === 'appearance' && 'Adjust the UI font size for better readability.'}
                      {activeItem.id === 'security' && 'Manage your account password and security settings.'}
                      {activeItem.id === 'grades' && 'Manage product categories and grades.'}
                       {activeItem.id === 'print-format' && 'Choose between thermal receipt or A4 invoice as the default print format and select what details appear on the bill.'}
                      {activeItem.id === 'label-settings' && 'Choose the default code format (Barcode or QR Code) for product labels.'}
                      {activeItem.id === 'scrap' && 'Enable or disable scrap management for shops that do not deal with scrap.'}
                      {activeItem.id === 'loyalty' && 'Configure loyalty points: enable/disable, set earning rate (e.g. ₹100 = 1 point), and set redemption value (e.g. 1 point = ₹1 discount).'}
                    </p>
                  </div>
                  {activeItem.ownerOnly && (
                    <span className="ml-auto px-2.5 py-1 bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[9px] font-bold rounded-full border border-amber-500/20 shrink-0 self-start">OWNER ONLY</span>
                  )}
                </div>
              </div>
            )}

            {/* Section Content Card */}
            {activeSection === 'grades' ? (
              <div className="bg-card border border-border/80 rounded-2xl p-6 shadow-sm hover:border-primary/20 transition-colors duration-200">
                {renderSectionContent(activeSection)}
              </div>
            ) : activeSection === 'updates' ? (
              renderSectionContent(activeSection)
            ) : (
              <div className="bg-card border border-border/80 rounded-2xl p-6 lg:p-8 shadow-sm hover:border-primary/20 transition-colors duration-200">
                {renderSectionContent(activeSection)}
              </div>
            )}

          </div>
        </main>
      </div>

      <PaperPreviewModal
        isOpen={previewFormat !== null}
        onClose={() => setPreviewFormat(null)}
        format={previewFormat || 'thermal'}
        thermalStyle={thermalStyle}
        a4Style={a4Style}
        paperWidth={printWidth}
        showProductOffers={showProductOffers}
        receiptFont={receiptFont}
        billSettings={billSettings}
      />
    </div>
  );
}
