import { useState, useEffect, useRef, useMemo } from 'react';
import {
  Settings, Printer, Scale, Save, Loader2, RefreshCw, Download,
  Lock, Key, Tags, Building, Receipt, Usb,
  CheckCircle2, AlertCircle, Globe, Upload, Type, Plus, Minus,
  Smartphone, X, RotateCcw
} from 'lucide-react';
import { useCartStore } from '../store/cartStore';
import { useThemeStore } from '../store/themeStore';
import clsx from 'clsx';
import { useAuthStore } from '../store/authStore';
import { Input } from './ui/Input';
import { SettingsGrades } from './SettingsGrades';
import { BulkOnboardingSheet } from './BulkOnboardingSheet';

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

const TABS = [
  { id: 'general' as const, label: 'General', icon: Settings },
  { id: 'grades' as const, label: 'Categories & Grades', icon: Tags },
  { id: 'security' as const, label: 'Security', icon: Lock },
];

type SettingSection = {
  id: string;
  icon: typeof Printer;
  title: string;
  desc: string;
  ownerOnly?: boolean;
};

const GENERAL_SECTIONS: SettingSection[] = [
  { id: 'invoice', icon: Receipt, title: 'Invoice Numbering', desc: 'Set a starting number. The system auto-increments from here.', ownerOnly: true },
  { id: 'bulk', icon: Upload, title: 'Bulk Import & Printing', desc: 'Import products in bulk and print barcode labels', ownerOnly: true },
  { id: 'gst', icon: Building, title: 'Shop GST Details', desc: 'Configure your business GSTIN and default State for GST invoices.', ownerOnly: true },
  { id: 'shop', icon: Building, title: 'Shop Details', desc: 'Manage your business name, address, phone, and UPI payment ID.', ownerOnly: true },
  { id: 'coding', icon: Tags, title: 'Purchase Price Coding', desc: 'Assign alphabets to each digit to code your purchase prices.', ownerOnly: true },
  { id: 'barcode-printer', icon: Printer, title: 'Barcode Label Printer', desc: 'Configure your barcode label printer connection and label dimensions.' },
  { id: 'receipt-printer', icon: Printer, title: 'Bill Receipt Printer', desc: 'Configure your receipt printer connection and paper width.' },
  { id: 'scale', icon: Scale, title: 'Electronic Weighing Scale', desc: 'Configure the serial port connection for your weighing scale.' },
  { id: 'updates', icon: RefreshCw, title: 'System Updates', desc: 'Check for new versions and update your application.' },
  { id: 'appearance', icon: Type, title: 'Appearance & Font Size', desc: 'Adjust the UI font size for better readability.' },
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

export function SettingsManager({ onClose }: { onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [activeTab, setActiveTab] = useState<'general' | 'grades' | 'security'>('general');
  const [showBulkSheet, setShowBulkSheet] = useState(false);

  const [barcodePrinter, setBarcodePrinter] = useState<any>({ type: 'usb', ip: '192.168.1.100', port: 9100, deviceName: '' });
  const [receiptPrinter, setReceiptPrinter] = useState<any>({ type: 'usb', ip: '192.168.1.100', port: 9100, deviceName: '', receiptWidthCm: 5.8 });
  const [scale, setScale] = useState({ path: 'COM3', baudRate: 9600 });
  const [osPrinters, setOsPrinters] = useState<any[]>([]);
  const { shopDomain } = useCartStore();
  const { role, updateDomain } = useAuthStore();
  const { fontScale, increaseFontScale, decreaseFontScale, setFontScale } = useThemeStore();
  const [checkingUpdate, setCheckingUpdate] = useState(false);
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
  const [shopState, setShopState] = useState('MH');
  const [shopNameLocal, setShopNameLocal] = useState('');
  const [shopAddress, setShopAddress] = useState('');
  const [shopPhone, setShopPhone] = useState('');
  const [upiId, setUpiId] = useState('');
  const [showUpiQr, setShowUpiQr] = useState(true);
  const [invoicePrefix, setInvoicePrefix] = useState('INV-');
  const [invoiceStartNumber, setInvoiceStartNumber] = useState<number | string>(1);

  // Track initial loaded values to detect unsaved changes
  const initialSnapshot = useRef<string>('');

  const hasChanges = useMemo(() => {
    if (!initialSnapshot.current) return false;
    const current = JSON.stringify({
      barcodePrinter,
      receiptPrinter,
      scale,
      priceCoding,
      shopGstin,
      shopState,
      invoicePrefix,
      invoiceStartNumber,
    });
    return current !== initialSnapshot.current;
  }, [barcodePrinter, receiptPrinter, scale, priceCoding, shopGstin, shopState, shopNameLocal, shopAddress, shopPhone, upiId, showUpiQr, invoicePrefix, invoiceStartNumber]);

  useEffect(() => {
    loadSettings();
  }, []);

  // Listen for live update status from main process
  useEffect(() => {
    if (!window.electronAPI) return;
    if (window.electronAPI.onUpdateStatus) {
      window.electronAPI.onUpdateStatus((status: string) => {
        if (status === 'ready-to-install') {
          setUpdateReady(true);
          setIsDownloading(false);
          setDownloadProgress(null);
          setUpdateStatus('Update ready to install');
        } else if (status === 'update-available') {
          setUpdateStatus('Update available');
        } else if (status === 'error') {
          setIsDownloading(false);
          setUpdateStatus('Download failed');
        } else {
          setUpdateStatus(status);
        }
      });
    }
    if (window.electronAPI.onUpdateProgress) {
      window.electronAPI.onUpdateProgress((progress) => {
        setDownloadProgress(progress);
      });
    }
    if (window.electronAPI.onUpdateInfo) {
      window.electronAPI.onUpdateInfo((info: any) => {
        if (info) {
          setUpdateInfo({ version: info.version, releaseDate: info.releaseDate, releaseNotes: info.releaseNotes });
        }
      });
    }
  }, []);

  // After loadSettings, snapshot the initial values
  useEffect(() => {
    if (!loading) {
      initialSnapshot.current = JSON.stringify({
        barcodePrinter,
        receiptPrinter,
        scale,
        priceCoding,
        shopGstin,
        shopState,
        shopNameLocal,
        shopAddress,
        shopPhone,
        upiId,
        showUpiQr,
        invoicePrefix,
        invoiceStartNumber,
      });
    }
  }, [loading]);

  const loadSettings = async () => {
    if (window.electronAPI) {
      const { tenantId } = useAuthStore.getState();
      const pBarcode = await window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'barcode_printer_config' });
      const pReceipt = await window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'receipt_printer_config' });
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

      if (pBarcode) setBarcodePrinter({ type: 'usb', ip: '192.168.1.100', port: 9100, deviceName: '', ...pBarcode });
      else if (pLegacy) setBarcodePrinter({ type: 'usb', ip: '192.168.1.100', port: 9100, deviceName: '', ...pLegacy });

      if (pReceipt) setReceiptPrinter({ type: 'usb', ip: '192.168.1.100', port: 9100, deviceName: '', receiptWidthCm: 5.8, ...pReceipt });
      else if (pLegacy) setReceiptPrinter({ type: 'usb', ip: '192.168.1.100', port: 9100, deviceName: '', receiptWidthCm: 5.8, ...pLegacy });
      if (s) setScale(s);
      if (pCoding) setPriceCoding(pCoding);
      if (gstinVal) setShopGstin(gstinVal);
      if (stateVal) setShopState(stateVal);
      if (nameVal) setShopNameLocal(nameVal);
      if (addressVal) setShopAddress(addressVal);
      if (phoneVal) setShopPhone(phoneVal);
      if (upiVal) setUpiId(upiVal);
      if (showQrVal !== null && showQrVal !== undefined) setShowUpiQr(Boolean(showQrVal));

      const invCfg = await window.electronAPI.settingsGet({ tenant_id: 'global', key: 'invoice_counter_config' });
      if (invCfg) {
        setInvoicePrefix(invCfg.prefix || 'INV-');
        setInvoiceStartNumber(invCfg.counter || 1);
      }

      try {
        const pr = await window.electronAPI.getPrinters();
        setOsPrinters(pr || []);
      } catch (err) {
        console.error('Failed to get printers', err);
      }

      try {
        const v = await window.electronAPI.appGetVersion();
        if (v) setAppVersion(`v${v}`);
      } catch (err) {
        console.error('Failed to get app version', err);
      }

      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      if (window.electronAPI) {
        const { tenantId } = useAuthStore.getState();

        if (localDomain !== shopDomain && role === 'OWNER') {
          const res = await updateDomain(localDomain);
          if (!res.success) throw new Error(res.error);
        }

        const formattedBarcodePrinter = {
          ...barcodePrinter,
          port: Number(barcodePrinter.port) || 9100,
          labelWidthMm: Number(barcodePrinter.labelWidthMm) || 50,
          labelHeightMm: Number(barcodePrinter.labelHeightMm) || 25,
          labelColumns: Number(barcodePrinter.labelColumns) || 1,
        };

        const formattedReceiptPrinter = {
          ...receiptPrinter,
          port: Number(receiptPrinter.port) || 9100,
          receiptWidthCm: Number(receiptPrinter.receiptWidthCm) || 5.8,
        };

        const resBarcode = await window.electronAPI.settingsSet({
          tenant_id: tenantId || 'global',
          key: 'barcode_printer_config',
          value: formattedBarcodePrinter
        });
        if (!resBarcode.success) throw new Error(resBarcode.error);

        const resReceipt = await window.electronAPI.settingsSet({
          tenant_id: tenantId || 'global',
          key: 'receipt_printer_config',
          value: formattedReceiptPrinter
        });
        if (!resReceipt.success) throw new Error(resReceipt.error);

        const resScale = await window.electronAPI.settingsSet({
          tenant_id: tenantId || 'global',
          key: 'scale_config',
          value: scale
        });
        if (!resScale.success) throw new Error(resScale.error);

        const resPriceCoding = await window.electronAPI.settingsSet({
          tenant_id: tenantId || 'global',
          key: 'price_coding',
          value: priceCoding
        });
        if (!resPriceCoding.success) throw new Error(resPriceCoding.error);

        const resGstin = await window.electronAPI.settingsSet({
          tenant_id: tenantId || 'global',
          key: 'shop_gstin',
          value: shopGstin
        });
        if (!resGstin.success) throw new Error(resGstin.error);

        const resShopState = await window.electronAPI.settingsSet({
          tenant_id: tenantId || 'global',
          key: 'shop_state',
          value: shopState
        });
        if (!resShopState.success) throw new Error(resShopState.error);

        const resShopName = await window.electronAPI.settingsSet({
          tenant_id: tenantId || 'global',
          key: 'shop_name',
          value: shopNameLocal
        });
        if (!resShopName.success) throw new Error(resShopName.error);

        const resShopAddress = await window.electronAPI.settingsSet({
          tenant_id: tenantId || 'global',
          key: 'shop_address',
          value: shopAddress
        });
        if (!resShopAddress.success) throw new Error(resShopAddress.error);

        const resShopPhone = await window.electronAPI.settingsSet({
          tenant_id: tenantId || 'global',
          key: 'shop_phone',
          value: shopPhone
        });
        if (!resShopPhone.success) throw new Error(resShopPhone.error);

        const resUpiId = await window.electronAPI.settingsSet({
          tenant_id: tenantId || 'global',
          key: 'upi_id',
          value: upiId
        });
        if (!resUpiId.success) throw new Error(resUpiId.error);

        const resShowQr = await window.electronAPI.settingsSet({
          tenant_id: tenantId || 'global',
          key: 'show_upi_qr',
          value: showUpiQr
        });
        if (!resShowQr.success) throw new Error(resShowQr.error);

        const resInvNum = await window.electronAPI.settingsSet({
          tenant_id: 'global',
          key: 'invoice_counter_config',
          value: { prefix: invoicePrefix, counter: Number(invoiceStartNumber) || 1 },
        });
        if (!resInvNum.success) throw new Error(resInvNum.error);

        useCartStore.setState({ shopState });

        setMessage({ type: 'success', text: 'All settings saved successfully!' });
        // Update snapshot so save button disappears
        initialSnapshot.current = JSON.stringify({
          barcodePrinter,
          receiptPrinter,
          scale,
          priceCoding,
          shopGstin,
          shopState,
          shopNameLocal,
          shopAddress,
          shopPhone,
          upiId,
          showUpiQr,
          invoicePrefix,
          invoiceStartNumber,
        });
        setTimeout(() => setMessage(null), 3000);
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: 'Failed to save settings: ' + err.message });
      setTimeout(() => setMessage(null), 3000);
    }
    setSaving(false);
  };

  const handleCheckUpdate = async () => {
    if (!window.electronAPI) return;
    setCheckingUpdate(true);
    setUpdateStatus('Checking for updates...');
    setUpdateInfo(null);
    setUpdateReady(false);
    setIsDownloading(false);
    setDownloadProgress(null);
    setMessage(null);
    try {
      const res = await window.electronAPI.appCheckForUpdates();
      setLastChecked(new Date());
      if (res && res.success === false) {
        setUpdateStatus(null);
        setMessage({ type: 'error', text: res.error });
        setTimeout(() => setMessage(null), 3000);
      } else if (res.updateInfo && !updateInfo) {
        setUpdateInfo({ version: res.updateInfo.version, releaseDate: res.updateInfo.releaseDate, releaseNotes: res.updateInfo.releaseNotes });
        setUpdateStatus('Update available');
      } else if (!res.updateInfo && !updateInfo) {
        setUpdateStatus('Up to date');
      }
    } catch (err: any) {
      setUpdateStatus(null);
      setMessage({ type: 'error', text: `Update check failed: ${err.message || 'Unknown error'}` });
      setTimeout(() => setMessage(null), 3000);
    } finally {
      setCheckingUpdate(false);
    }
  };

  const handleDownloadUpdate = async () => {
    if (!window.electronAPI) return;
    setIsDownloading(true);
    setDownloadProgress(null);
    setUpdateStatus('Downloading...');
    const res = await window.electronAPI.appDownloadUpdate();
    if (!res.success) {
      setIsDownloading(false);
      setUpdateStatus('Download failed');
      setMessage({ type: 'error', text: res.error || 'Download failed' });
      setTimeout(() => setMessage(null), 3000);
    }
  };

  const handleInstallUpdate = () => {
    setUpdateStatus('Restarting to install update...');
    window.electronAPI?.appInstallUpdate();
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pass.old || !pass.new) {
      setMessage({ type: 'error', text: 'Current and new passwords are required.' });
      setTimeout(() => setMessage(null), 3000);
      return;
    }
    if (pass.new !== pass.confirm) {
      setMessage({ type: 'error', text: 'New passwords do not match.' });
      setTimeout(() => setMessage(null), 3000);
      return;
    }

    setChangingPass(true);
    setMessage(null);
    try {
      const { changePassword } = useAuthStore.getState();
      const res = await changePassword(pass.old, pass.new);
      if (res.success) {
        setMessage({ type: 'success', text: 'Password updated successfully!' });
        setPass({ old: '', new: '', confirm: '' });
        setTimeout(() => setMessage(null), 3000);
      } else {
        setMessage({ type: 'error', text: res.error || 'Failed to update password.' });
        setTimeout(() => setMessage(null), 3000);
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
      setTimeout(() => setMessage(null), 3000);
    } finally {
      setChangingPass(false);
    }
  };

  // ─── Toast notification ───
  const renderMessage = () => {
    if (!message) return null;
    return (
      <div className={clsx(
        "fixed bottom-6 right-6 z-50 px-5 py-3.5 rounded-xl border shadow-lg flex items-center gap-3 text-sm animate-in fade-in slide-in-from-bottom-2 max-w-md",
        message.type === 'success'
          ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
          : "bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400"
      )}>
        {message.type === 'success'
          ? <CheckCircle2 className="w-5 h-5 shrink-0" />
          : <AlertCircle className="w-5 h-5 shrink-0" />
        }
        <p className="flex-1 font-medium">{message.text}</p>
        <button onClick={() => setMessage(null)} className="shrink-0 opacity-60 hover:opacity-100 transition-opacity">
          <span className="text-lg leading-none">&times;</span>
        </button>
      </div>
    );
  };

  // ─── Loading state ───
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

  // ─── Render general section content ───
  const renderGeneralSection = (section: SettingSection) => {
    switch (section.id) {
      case 'invoice':
        return (
          <div className="mt-5 grid grid-cols-2 gap-5">
            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Invoice Prefix</label>
              <Input
                type="text"
                value={invoicePrefix}
                onChange={(e) => setInvoicePrefix(e.target.value)}
                placeholder="e.g. INV-"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Starting Number</label>
              <Input
                type="number"
                min="1"
                value={invoiceStartNumber}
                onChange={(e) => setInvoiceStartNumber(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="e.g. 100"
              />
            </div>
            <p className="col-span-2 -mt-2 text-xs text-muted-foreground">
              Next invoice: <span className="font-mono font-bold text-foreground bg-muted px-2 py-0.5 rounded">{invoicePrefix}{Number(invoiceStartNumber) || 1}</span>
            </p>
          </div>
        );

      case 'bulk':
        return (
          <div className="mt-5">
            <button onClick={() => setShowBulkSheet(true)}
              className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold bg-primary/10 hover:bg-primary hover:text-primary-foreground rounded-xl transition-all duration-200 active:scale-95 cursor-pointer border border-primary/20 hover:border-primary">
              <Upload className="w-4 h-4" />
              Open Bulk Import Sheet
            </button>
          </div>
        );

      case 'gst':
        return (
          <div className="mt-5 grid grid-cols-2 gap-5">
            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Shop GSTIN</label>
              <Input
                type="text"
                maxLength={15}
                value={shopGstin}
                onChange={(e) => setShopGstin(e.target.value.toUpperCase())}
                placeholder="e.g. 27AAAAA1111A1Z1"
                className="uppercase font-semibold font-mono"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">State (Place of Business)</label>
                <select
                  className="w-full bg-background border border-border/80 rounded-xl px-4 py-3 text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all appearance-none cursor-pointer text-sm font-medium"
                  value={shopState}
                  onChange={(e) => setShopState(e.target.value)}
                >
                  {INDIAN_STATES.map((state) => (
                    <option key={state.code} value={state.code}>
                      {state.name} ({state.code})
                    </option>
                  ))}
                </select>
            </div>
          </div>
        );

      case 'shop':
        return (
          <div className="mt-5 grid grid-cols-2 gap-5">
            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Shop Name</label>
              <Input
                type="text"
                value={shopNameLocal}
                onChange={(e) => setShopNameLocal(e.target.value)}
                placeholder="Your business name"
                className="font-semibold"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Phone Number</label>
              <Input
                type="text"
                value={shopPhone}
                onChange={(e) => setShopPhone(e.target.value)}
                placeholder="e.g. +91 98765 43210"
              />
            </div>
            <div className="col-span-2 space-y-2">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Shop Address</label>
              <textarea
                value={shopAddress}
                onChange={(e) => setShopAddress(e.target.value)}
                placeholder="Enter your business address..."
                rows={3}
                className="w-full bg-background border border-border/80 rounded-xl px-4 py-3 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all resize-none text-sm font-medium"
              />
            </div>
            <div className="col-span-2 space-y-2">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                UPI ID
                <span className="ml-2 text-[10px] font-normal text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">Shown on receipts</span>
              </label>
              <div className="relative">
                <Smartphone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
                <Input
                  type="text"
                  value={upiId}
                  onChange={(e) => setUpiId(e.target.value)}
                  placeholder="e.g. shopname@upi"
                  className="pl-10 font-mono font-semibold"
                />
              </div>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                This UPI ID will appear on printed receipts for customer payments.
              </p>
            </div>
            <div className="col-span-2 flex items-center gap-3 p-3.5 bg-card border border-border/80 rounded-xl hover:border-primary/30 transition-all duration-200">
              <button
                onClick={() => setShowUpiQr(!showUpiQr)}
                className={clsx(
                  'relative w-12 h-6 rounded-full transition-all duration-200 shrink-0 cursor-pointer',
                  showUpiQr ? 'bg-primary' : 'bg-muted-foreground/30'
                )}
              >
                <span className={clsx(
                  'absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all duration-200',
                  showUpiQr ? 'translate-x-6' : 'translate-x-0'
                )} />
              </button>
              <div className="flex-1">
                <label className="text-xs font-bold text-foreground cursor-pointer" onClick={() => setShowUpiQr(!showUpiQr)}>Show UPI QR Code on Receipt</label>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  When enabled, a QR code with the bill amount pre-filled will appear on printed receipts. Customers scan to pay directly.
                </p>
              </div>
            </div>
          </div>
        );

      case 'coding':
        return (
          <div className="mt-5 grid grid-cols-5 gap-3">
            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => (
              <div key={digit} className="flex items-center gap-1.5 bg-card p-2.5 rounded-xl border border-border/80 hover:border-primary/30 transition-all duration-200">
                <span className="font-bold text-base w-5 text-center text-muted-foreground">{digit}</span>
                <span className="text-muted-foreground text-xs">=</span>
                <Input
                  type="text"
                  maxLength={1}
                  value={priceCoding[digit.toString()] || ''}
                  onChange={(e) => setPriceCoding({ ...priceCoding, [digit.toString()]: e.target.value.toUpperCase() })}
                  className="text-center font-bold text-sm"
                />
              </div>
            ))}
          </div>
        );

      case 'barcode-printer':
        return (
          <div className="mt-5 grid grid-cols-2 gap-5">
            <div className="col-span-2 space-y-2">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Connection Type</label>
              <div className="flex gap-3">
                <button
                  className={clsx(
                    "flex items-center gap-2 px-5 py-3 rounded-xl border text-sm font-bold transition-all duration-200 active:scale-95 flex-1 cursor-pointer",
                    barcodePrinter.type === 'network'
                      ? "border-primary bg-primary/5 text-primary shadow-sm"
                      : "border-border/80 text-muted-foreground hover:text-foreground hover:bg-muted/40"
                  )}
                  onClick={() => setBarcodePrinter({ ...barcodePrinter, type: 'network' })}
                >
                  <Globe className="w-4 h-4" />
                  Network (TCP/IP)
                </button>
                <button
                  className={clsx(
                    "flex items-center gap-2 px-5 py-3 rounded-xl border text-sm font-bold transition-all duration-200 active:scale-95 flex-1 cursor-pointer",
                    barcodePrinter.type === 'usb'
                      ? "border-primary bg-primary/5 text-primary shadow-sm"
                      : "border-border/80 text-muted-foreground hover:text-foreground hover:bg-muted/40"
                  )}
                  onClick={() => setBarcodePrinter({ ...barcodePrinter, type: 'usb' })}
                >
                  <Usb className="w-4 h-4" />
                  USB (OS Print Queue)
                </button>
              </div>
            </div>

            {barcodePrinter.type === 'network' ? (
              <>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Printer IP Address</label>
                  <Input
                    type="text"
                    value={barcodePrinter.ip}
                    onChange={(e) => setBarcodePrinter({ ...barcodePrinter, ip: e.target.value })}
                    placeholder="192.168.1.100"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Port</label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={barcodePrinter.port ?? 9100}
                    onChange={(e) => setBarcodePrinter({ ...barcodePrinter, port: e.target.value === '' ? '' : e.target.value.replace(/\D/g, '') })}
                  />
                </div>
              </>
            ) : (
              <div className="col-span-2 space-y-2">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Select USB Printer</label>
                <select
                  className="w-full bg-background border border-border/80 rounded-xl px-4 py-3 text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all appearance-none text-sm font-medium cursor-pointer"
                  value={barcodePrinter.deviceName || ''}
                  onChange={(e) => setBarcodePrinter({ ...barcodePrinter, deviceName: e.target.value })}
                >
                  <option value="">-- Select a printer --</option>
                  {osPrinters.map(p => (
                    <option key={p.name} value={p.name}>{p.name}</option>
                  ))}
                </select>
              </div>
            )}
            {barcodePrinter.type === 'usb' && (
              <div className="col-span-2 grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Label Width (mm)</label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={barcodePrinter.labelWidthMm ?? 50}
                    onChange={(e) => setBarcodePrinter({ ...barcodePrinter, labelWidthMm: e.target.value === '' ? '' : e.target.value.replace(/\D/g, '') })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Label Height (mm)</label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={barcodePrinter.labelHeightMm ?? 25}
                    onChange={(e) => setBarcodePrinter({ ...barcodePrinter, labelHeightMm: e.target.value === '' ? '' : e.target.value.replace(/\D/g, '') })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Label Columns</label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={barcodePrinter.labelColumns ?? 1}
                    onChange={(e) => setBarcodePrinter({ ...barcodePrinter, labelColumns: e.target.value === '' ? '' : e.target.value.replace(/\D/g, '') })}
                  />
                </div>
              </div>
            )}
          </div>
        );

      case 'receipt-printer':
        return (
          <div className="mt-5 grid grid-cols-2 gap-5">
            <div className="col-span-2 space-y-2">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Connection Type</label>
              <div className="flex gap-3">
                <button
                  className={clsx(
                    "flex items-center gap-2 px-5 py-3 rounded-xl border text-sm font-bold transition-all duration-200 active:scale-95 flex-1 cursor-pointer",
                    receiptPrinter.type === 'network'
                      ? "border-primary bg-primary/5 text-primary shadow-sm"
                      : "border-border/80 text-muted-foreground hover:text-foreground hover:bg-muted/40"
                  )}
                  onClick={() => setReceiptPrinter({ ...receiptPrinter, type: 'network' })}
                >
                  <Globe className="w-4 h-4" />
                  Network (TCP/IP)
                </button>
                <button
                  className={clsx(
                    "flex items-center gap-2 px-5 py-3 rounded-xl border text-sm font-bold transition-all duration-200 active:scale-95 flex-1 cursor-pointer",
                    receiptPrinter.type === 'usb'
                      ? "border-primary bg-primary/5 text-primary shadow-sm"
                      : "border-border/80 text-muted-foreground hover:text-foreground hover:bg-muted/40"
                  )}
                  onClick={() => setReceiptPrinter({ ...receiptPrinter, type: 'usb' })}
                >
                  <Usb className="w-4 h-4" />
                  USB (OS Print Queue)
                </button>
              </div>
            </div>

            {receiptPrinter.type === 'network' ? (
              <>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Printer IP Address</label>
                  <Input
                    type="text"
                    value={receiptPrinter.ip}
                    onChange={(e) => setReceiptPrinter({ ...receiptPrinter, ip: e.target.value })}
                    placeholder="192.168.1.100"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Port</label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={receiptPrinter.port ?? 9100}
                    onChange={(e) => setReceiptPrinter({ ...receiptPrinter, port: e.target.value === '' ? '' : e.target.value.replace(/\D/g, '') })}
                  />
                </div>
              </>
            ) : (
              <div className="col-span-2 space-y-2">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Select USB Printer</label>
                <select
                  className="w-full bg-background border border-border/80 rounded-xl px-4 py-3 text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all appearance-none text-sm font-medium cursor-pointer"
                  value={receiptPrinter.deviceName || ''}
                  onChange={(e) => setReceiptPrinter({ ...receiptPrinter, deviceName: e.target.value })}
                >
                  <option value="">-- Select a printer --</option>
                  {osPrinters.map(p => (
                    <option key={p.name} value={p.name}>{p.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="col-span-2 space-y-2">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Receipt Width (cm)</label>
              <Input
                type="text"
                inputMode="decimal"
                value={receiptPrinter.receiptWidthCm ?? 5.8}
                onChange={(e) => setReceiptPrinter({ ...receiptPrinter, receiptWidthCm: e.target.value === '' ? '' : e.target.value.replace(/[^\d.]/g, '') })}
                placeholder="e.g. 5.8 or 8.0"
              />
              <p className="text-[10px] text-muted-foreground mt-1">Standard sizes: 5.8cm (58mm) and 8.0cm (80mm). This sets the layout character width.</p>
            </div>
          </div>
        );

      case 'scale':
        return (
          <div className="mt-5 grid grid-cols-2 gap-5">
            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Serial Port (COM/tty)</label>
              <Input
                type="text"
                value={scale.path}
                onChange={(e) => setScale({ ...scale, path: e.target.value })}
                placeholder="COM3"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Baud Rate</label>
                <select
                  className="w-full bg-background border border-border/80 rounded-xl px-4 py-3 text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all appearance-none text-sm font-medium cursor-pointer"
                  value={scale.baudRate}
                  onChange={(e) => setScale({ ...scale, baudRate: parseInt(e.target.value) })}
                >
                  <option value="2400">2400</option>
                  <option value="4800">4800</option>
                  <option value="9600">9600</option>
                  <option value="19200">19200</option>
                  <option value="38400">38400</option>
                  <option value="115200">115200</option>
                </select>
            </div>
          </div>
        );

      case 'updates':
        return (
          <div className="mt-6 space-y-5">
            {/* Version + Status Hero */}
            <div className="relative overflow-hidden rounded-xl border border-border bg-gradient-to-br from-primary/[0.04] to-transparent">
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(59,130,246,0.06),transparent_70%)]" />
              <div className="relative p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="p-3 rounded-xl bg-primary/10 text-primary shadow-sm">
                      <RefreshCw className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Current Version</p>
                      <p className="text-2xl font-bold text-foreground font-mono tracking-tight mt-0.5">{appVersion}</p>
                      {lastChecked && (
                        <p className="text-[11px] text-muted-foreground/70 mt-1">
                          Last checked {formatTimeAgo(lastChecked)}
                        </p>
                      )}
                    </div>
                  </div>

                    {updateStatus && (
                    <div className={clsx(
                      "flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold border shrink-0",
                      updateStatus === 'Up to date'
                        ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                        : updateStatus === 'Update available' || updateStatus === 'Update ready to install'
                          ? "bg-blue-500/10 border-blue-500/20 text-blue-600 dark:text-blue-400"
                          : updateStatus === 'Downloading...' || isDownloading
                            ? "bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400"
                            : "bg-muted/50 border-border text-muted-foreground"
                    )}>
                      {checkingUpdate ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : isDownloading ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : updateStatus === 'Up to date' ? (
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      ) : (
                        <Download className="w-3.5 h-3.5" />
                      )}
                      {updateStatus}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Up-to-date Confirmation Card */}
            {updateStatus === 'Up to date' && !updateInfo && (
              <div className="rounded-xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/[0.04] to-transparent overflow-hidden">
                <div className="flex items-center gap-3 px-5 py-4 border-b border-emerald-500/10">
                  <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-foreground">
                      {appVersion} — You're on the latest version
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      No updates available at this time. You'll be notified when a new version is released.
                    </p>
                  </div>
                  <span className="px-2.5 py-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold rounded-md border border-emerald-500/20">
                    UP TO DATE
                  </span>
                </div>
                {lastChecked && (
                  <div className="px-5 py-2.5 bg-emerald-500/[0.02] border-t border-emerald-500/5">
                    <p className="text-[11px] text-muted-foreground/70">
                      Last checked {formatTimeAgo(lastChecked)} &middot; Check again anytime
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Update Available Card */}
            {updateInfo && (
              <div className="rounded-xl border border-blue-500/20 bg-gradient-to-br from-blue-500/[0.04] to-transparent overflow-hidden">
                {/* Card header */}
                <div className="flex items-center gap-3 px-5 py-4 border-b border-blue-500/10">
                  <div className="p-2 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
                    <Download className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-foreground">
                      v{updateInfo.version} {updateReady ? 'Ready to Install' : isDownloading ? 'Downloading...' : 'Available'}
                    </p>
                    {updateInfo.releaseDate && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Released {new Date(updateInfo.releaseDate).toLocaleDateString('en-US', {
                          year: 'numeric', month: 'long', day: 'numeric'
                        })}
                      </p>
                    )}
                  </div>
                  <span className="px-2.5 py-1 bg-blue-500/10 text-blue-600 dark:text-blue-400 text-[10px] font-bold rounded-md border border-blue-500/20">
                    {updateReady ? 'READY' : isDownloading ? 'DOWNLOADING' : 'NEW'}
                  </span>
                </div>

                {/* Release notes */}
                {updateInfo.releaseNotes && (
                  <div className="px-5 py-4">
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-3">
                      What's New
                    </p>
                    <div className="text-xs text-muted-foreground max-h-36 overflow-y-auto leading-relaxed space-y-2">
                      {typeof updateInfo.releaseNotes === 'string'
                        ? updateInfo.releaseNotes.split('\n').filter(Boolean).map((line: string, i: number) => (
                            <p key={i} className="flex items-start gap-2.5">
                              <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-blue-500/60 shrink-0" />
                              <span>{line}</span>
                            </p>
                          ))
                        : <p className="text-muted-foreground">{JSON.stringify(updateInfo.releaseNotes)}</p>}
                    </div>
                  </div>
                )}

                {/* Download progress bar */}
                {isDownloading && downloadProgress && (
                  <div className="px-5 pb-4">
                    <div className="w-full bg-border/50 rounded-full h-2.5 overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all duration-300"
                        style={{ width: `${Math.min(downloadProgress.percent, 100)}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <p className="text-[11px] text-muted-foreground">
                        {Math.round(downloadProgress.percent)}%
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {formatBytes(downloadProgress.transferred)} / {formatBytes(downloadProgress.total)}
                      </p>
                    </div>
                  </div>
                )}

                {/* Download button (shown when update available but not yet downloading) */}
                {!updateReady && !isDownloading && (
                  <div className="px-5 pb-4">
                    <button
                      onClick={handleDownloadUpdate}
                      className="flex items-center justify-center gap-2 w-full h-11 rounded-xl font-bold text-sm bg-primary/10 hover:bg-primary hover:text-primary-foreground border border-primary/20 hover:border-primary transition-all duration-200 active:scale-95 cursor-pointer"
                    >
                      <Download className="w-4 h-4" />
                      Download Update
                    </button>
                  </div>
                )}

                {/* Install button */}
                {updateReady && (
                  <div className="px-5 pb-4">
                    <button
                      onClick={handleInstallUpdate}
                      className="flex items-center justify-center gap-2 w-full h-11 rounded-xl font-bold text-sm bg-primary/10 hover:bg-primary hover:text-primary-foreground border border-primary/20 hover:border-primary transition-all duration-200 active:scale-95 cursor-pointer"
                    >
                      <RotateCcw className="w-4 h-4" />
                      Restart & Install Update
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Check Button */}
            <button
              onClick={handleCheckUpdate}
              disabled={checkingUpdate}
              className="flex items-center justify-center gap-2.5 w-full h-11 rounded-xl font-bold text-sm border border-border/80 bg-card hover:bg-primary/5 hover:border-primary/30 hover:text-primary transition-all duration-200 active:scale-95 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {checkingUpdate ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              {checkingUpdate ? 'Checking for Updates...' : 'Check for Updates'}
            </button>
          </div>
        );

      case 'appearance':
        return (
          <div className="mt-5 space-y-4">
            <div className="bg-muted/30 border border-border rounded-xl p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-foreground">Font Size</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Scale the entire UI text size</p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={decreaseFontScale}
                    disabled={fontScale <= 70}
                    className="w-10 h-10 flex items-center justify-center rounded-xl bg-background border border-border/80 text-muted-foreground hover:text-foreground hover:bg-muted transition-all duration-200 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <div className="w-20 text-center">
                    <span className="text-2xl font-black text-foreground">{fontScale}%</span>
                    <div className="flex items-center justify-center gap-1 mt-1">
                      <span className={clsx(
                        'w-2 h-2 rounded-full',
                        fontScale <= 80 ? 'bg-blue-500' : fontScale <= 100 ? 'bg-emerald-500' : fontScale <= 120 ? 'bg-amber-500' : 'bg-red-500'
                      )} />
                      <span className="text-[10px] font-semibold text-muted-foreground">
                        {fontScale <= 80 ? 'Small' : fontScale <= 100 ? 'Normal' : fontScale <= 120 ? 'Large' : 'X-Large'}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={increaseFontScale}
                    disabled={fontScale >= 140}
                    className="w-10 h-10 flex items-center justify-center rounded-xl bg-background border border-border/80 text-muted-foreground hover:text-foreground hover:bg-muted transition-all duration-200 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Visual preview */}
              <div className="mt-5 p-4 bg-card border border-border/60 rounded-xl">
                <div className="flex items-center gap-3 mb-3">
                  <Type className="w-4 h-4 text-primary" />
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Preview</span>
                </div>
                <p className="text-xs text-foreground font-medium">
                  The quick brown fox jumps over the lazy dog.
                </p>
                <p className="text-[10px] text-muted-foreground mt-1.5">
                  This is how your receipts, invoices, and product labels will appear throughout the system.
                </p>
              </div>

              {/* Reset button */}
              <button
                onClick={() => setFontScale(100)}
                disabled={fontScale === 100}
                className="mt-4 px-4 py-2 text-xs font-bold text-muted-foreground hover:text-foreground bg-muted hover:bg-muted/80 border border-border/80 rounded-xl transition-all duration-200 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
              >
                Reset to Default
              </button>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  // ─── Main render ───
  return (
    <div className="flex-1 flex flex-col bg-background overflow-hidden">
      {renderMessage()}
      {showBulkSheet && <BulkOnboardingSheet onClose={() => setShowBulkSheet(false)} />}

      {/* ── Header ── */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-border bg-card shrink-0 gap-4 shadow-sm z-30">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2.5 rounded-xl bg-primary/10 text-primary shadow-inner">
            <Settings className="w-5 h-5" />
          </div>
          <div className="min-w-0 leading-tight">
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold text-foreground truncate block">Settings</h1>
              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" title="Active" />
            </div>
            <p className="text-xs text-muted-foreground font-medium mt-0.5">Configure hardware, invoice numbering, and system preferences</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 bg-muted/40 rounded-lg text-[10px] text-muted-foreground font-mono font-bold">
            <RefreshCw className="w-3 h-3" />
            v{appVersion.replace('v', '')}
          </span>
          <button onClick={onClose}
            className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-bold text-destructive hover:bg-destructive/10 rounded-xl transition-all duration-200 active:scale-95 cursor-pointer">
            <X className="w-4 h-4" />
            Close
          </button>
          {activeTab !== 'grades' && hasChanges && (
            <button onClick={handleSave} disabled={saving}
              className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-bold text-primary bg-primary/10 hover:bg-primary hover:text-primary-foreground rounded-xl transition-all duration-200 active:scale-95 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed animate-in fade-in">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? 'Saving...' : 'Save'}
            </button>
          )}
        </div>
      </header>

      {/* ── Pill Tab Bar ── */}
      <div className="flex items-center justify-center px-8 py-2.5 border-b border-border bg-muted/20 shrink-0">
        <div className="flex items-center gap-0.5 bg-muted/60 p-0.5 rounded-lg border border-border/40">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={clsx(
                  "flex items-center gap-2 px-4 py-1.5 rounded-md text-xs font-bold transition-all duration-200 cursor-pointer",
                  isActive
                    ? "bg-background text-foreground shadow-sm border border-border/60"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className={clsx("w-3.5 h-3.5", isActive ? "text-primary" : "")} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Content ── */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto p-8">

          {/* ── GENERAL TAB ── */}
          {activeTab === 'general' && (
            <div className="space-y-6">
              {GENERAL_SECTIONS
                .filter(s => !s.ownerOnly || role === 'OWNER')
                .map((section) => (
                  <section
                    key={section.id}
                    className="bg-card border border-border/80 hover:border-primary/30 rounded-2xl p-6 shadow-sm transition-all duration-200"
                  >
                    <div className="flex items-start gap-4">
                      <div className="p-2.5 rounded-xl bg-primary/10 text-primary shrink-0">
                        <section.icon className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h2 className="text-base font-bold text-foreground">{section.title}</h2>
                          {section.ownerOnly && (
                            <span className="px-2 py-0.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[9px] font-bold rounded-full border border-amber-500/20 shrink-0">
                              OWNER
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{section.desc}</p>
                      </div>
                    </div>
                    {renderGeneralSection(section)}
                  </section>
                ))}
            </div>
          )}

          {/* ── GRADES TAB ── */}
          {activeTab === 'grades' && (
            <div className="bg-card border border-border/80 hover:border-primary/30 rounded-2xl p-6 shadow-sm transition-all duration-200">
              <SettingsGrades />
            </div>
          )}

          {/* ── SECURITY TAB ── */}
          {activeTab === 'security' && (
            <div className="bg-card border border-border/80 hover:border-primary/30 rounded-2xl p-6 shadow-sm transition-all duration-200">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
                  <Lock className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-foreground">Security</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">Manage your account password and security settings.</p>
                </div>
              </div>

              <form onSubmit={handleChangePassword} className="bg-muted/30 border border-border/80 rounded-xl p-6 space-y-5">
                <div>
                  <h3 className="font-bold text-foreground">Change Password</h3>
                  <p className="text-xs text-muted-foreground mt-1">Update your account password regularly to keep your shop secure.</p>
                </div>

                <div className="relative">
                  <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    type="password"
                    placeholder="Current Password"
                    className="pl-11"
                    value={pass.old}
                    onChange={(e) => setPass({ ...pass, old: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Input
                    type="password"
                    placeholder="New Password"
                    value={pass.new}
                    onChange={(e) => setPass({ ...pass, new: e.target.value })}
                  />
                  <Input
                    type="password"
                    placeholder="Confirm New Password"
                    value={pass.confirm}
                    onChange={(e) => setPass({ ...pass, confirm: e.target.value })}
                  />
                </div>

                <button type="submit" disabled={changingPass}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold bg-primary/10 hover:bg-primary hover:text-primary-foreground rounded-xl transition-all duration-200 active:scale-95 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed border border-primary/20 hover:border-primary">
                  {changingPass ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                  Update Password
                </button>
              </form>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}
