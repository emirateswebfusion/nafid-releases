import { useState, useEffect, useRef, useMemo } from 'react';
import { Settings, Printer, Save, Loader2, CheckCircle2, AlertCircle, Wifi, X, EyeOff, Palette, Store, Package, Monitor, ChevronRight, Shield, FileText, Power, BookOpen, Layers, AlertOctagon, LayoutGrid } from 'lucide-react';
import { useCartStore } from '../store/cartStore';
import clsx from 'clsx';
import { useAuthStore } from '../store/authStore';
import { Skeleton } from './ui/Skeleton';
import { Modal } from './ui/Modal';
import { RedCrossButton } from './ui/RedCrossButton';
import { useCloseOnEscape } from '../hooks/useCloseOnEscape';
import { BulkOnboardingSheet } from './BulkOnboardingSheet';
import { PaperPreviewModal } from './PaperPreviewModal';
import { WhatsAppIcon } from './ui/WhatsAppIcon';
import { isAdminRole } from '../utils/permissions';

import { FEATURE_LIST, DEFAULT_FEATURE_FLAGS, sanitizeFeatureFlags, type FeatureFlags, type FeatureKey, useFeatureFlagsStore } from '../featureFlags';
import { appApi } from '../data/app';
import { hasBridge, isDesktopRuntime } from '../data/client';
import { bridgeEvents } from '../data/events';
import { printingApi } from '../data/printing';
import { syncApi } from '../data/sync';
import { useSettingsLoader } from './settings/hooks/useSettingsLoader';
import { useSettingsSave } from './settings/hooks/useSettingsSave';
import { useSettingsFormState } from './settings/hooks/useSettingsFormState';
import { SettingsSectionContent } from './settings/views/SettingsSectionContent';
import { LanSyncHelpModal } from './settings/views/LanSyncHelpModal';
import type { PrinterConfig } from './settings/settingsTypes';

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
  const form = useSettingsFormState();
  const {
    loading, setLoading, saving, saveRevision, message, setMessage,
    showBulkSheet, setShowBulkSheet, barcodePrinter, setBarcodePrinter, receiptPrinter, setReceiptPrinter,
    a4Printer, scale, setOsPrinters, setPrintersLoading, setActiveHardwareTab, setActiveProductsTab,
    setUpdateStatus, setUpdateInfo, setUpdateReady, setLastChecked, setIsDownloading, setDownloadProgress,
    pass, setPass, setChangingPass, confirmTurnOffAllModalOpen, setConfirmTurnOffAllModalOpen, appVersion,
    priceCoding, shopGstin, shopState, shopNameLocal, shopAddress, shopPhone,
    shopEmail, shopWebsite, storeTimezone, upiId, showUpiQr, showProductOffers,
    showPriceOverrideMrp, openCashDrawerOnPending, autoCloseCashDrawer, autoCloseCashDrawerTime, autoOpenCashDrawer, defaultOpeningBalance, receiptFont, billSettings,
    scrapBillSettings, printFormat, a5Orientation, labelCodeType, labelShowShopName, printWidth,
    thermalStyle, setThermalStyle, a4Style, setA4Style, previewFormat, setPreviewFormat,
    previewStyle, setPreviewStyle, bankName, bankAccount, bankIfsc, bankBranch,
    enableScrap, showCashRegister, setShowCashRegister, autoPrintBarcode, loyaltyEnabled, setLoyaltyEnabled,
    loyaltyEarningRate, loyaltyRedemptionRate, loyaltyAwardOnPending, enablePartyGst, enablePartyEstimate, enableRealPaperStock,
    showPaperStockInGst, showPaperStockInEstimate, showZeroPaperStock, showPaperOnlyProducts, enableConvertToGst, billingUIConfig,
    staffDataMaskingConfig, emergencyPanicConfig, shopClosingConfig, terminalCode, invoiceStartNumber, enableThreeInvoiceSeries,
    b2bPrefix, b2bStartNumber, b2cPrefix, b2cStartNumber, gstProfitPercentage, gstConversionTaxInclusive,
    returnPrefix, returnStartNumber, scrapPrefix, scrapStartNumber, quotationPrefix, quotationStartNumber,
    purchaseBillPrefix, purchaseBillStartNumber, stockReportDefaultView, inventoryDefaultView, showProductGstBadge, showPriceTiersInInventory,
    serviceChargeBarcode, timeFormat, syncMode, lanRole, lanHostIp, setDetectedLocalIp,
    setNetworkDetails, lanPort, syncFrequency, setEffectiveCloudState,
  } = form;

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => {
      setMessage(null);
    }, 4000);
    return () => clearTimeout(timer);
  }, [message, setMessage]);
  const [activeSection, setActiveSection] = useState(isAdminRole(role) ? 'store' : 'hardware');

  const shopDomain = useCartStore((state) => state.shopDomain);
  const [localDomain] = useState(shopDomain || 'GENERAL');
  const { flags: featureFlags, loadFlags } = useFeatureFlagsStore();

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
      syncApi.getCloudAccessState().then((state) => {
        if (state) setEffectiveCloudState(state);
      }).catch(() => {});
    }
    if (hasBridge('onCloudStateChanged')) {
      const unsub = bridgeEvents.onCloudStateChanged((state) => {
        if (state) setEffectiveCloudState(state);
      });
      return unsub;
    }
  }, [tenantId, setDetectedLocalIp, setEffectiveCloudState, setNetworkDetails]);

  const updateSnapshotField = (updater: (prevObj: Record<string, unknown>) => Record<string, unknown>) => {
    try {
      if (initialSnapshot.current) {
        const snap = JSON.parse(initialSnapshot.current);
        initialSnapshot.current = JSON.stringify(updater(snap));
      }
    } catch { /* ignore */ }
  };

  const fetchPrinters = async (showToast = false) => {
    if (!isDesktopRuntime()) return;
    setPrintersLoading(true);
    try {
      const pr = await printingApi.getPrinters();
      const printerList = Array.isArray(pr) ? pr : [];
      setOsPrinters(printerList);

      if (printerList.length > 0) {
        const defPr = printerList.find((p) => p.isDefault) || printerList[0];
        if (defPr && defPr.name) {
          setReceiptPrinter((prev: PrinterConfig) => {
            if (!prev?.deviceName) {
              updateSnapshotField(s => ({ ...s, receiptPrinter: { ...(s.receiptPrinter as Record<string, unknown>), deviceName: defPr.name } }));
              return { ...prev, deviceName: defPr.name };
            }
            return prev;
          });
          setBarcodePrinter((prev: PrinterConfig) => {
            if (!prev?.deviceName) {
              updateSnapshotField(s => ({ ...s, barcodePrinter: { ...(s.barcodePrinter as Record<string, unknown>), deviceName: defPr.name } }));
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
    } catch (err) {
      console.error('[SettingsManager] Failed to get printers', err);
      if (showToast) {
        setMessage({ type: 'error', text: `Failed to fetch printers: ${(err as Error).message || 'Unknown error'}` });
      }
    } finally {
      setPrintersLoading(false);
    }
  };

  const { buildSettingsSnapshot, loadSettings } = useSettingsLoader({
    form, featureFlags, fetchPrinters, initialSnapshot, loadFlags, returnPrefix, returnStartNumber,
    updateSnapshotField,
  });

  const getSettingsSnapshot = () => buildSettingsSnapshot();

  const hasChanges = useMemo(() => {
    if (!initialSnapshot.current) return false;
    return getSettingsSnapshot() !== initialSnapshot.current;
  }, [barcodePrinter, receiptPrinter, a4Printer, scale, priceCoding, shopGstin, shopState, shopNameLocal, shopAddress, shopPhone, shopEmail, shopWebsite, storeTimezone, upiId, showUpiQr, bankName, bankAccount, bankIfsc, bankBranch, showProductOffers, showPriceOverrideMrp, openCashDrawerOnPending, autoCloseCashDrawer, autoCloseCashDrawerTime, autoOpenCashDrawer, defaultOpeningBalance, receiptFont, printFormat, a5Orientation, printWidth, thermalStyle, a4Style, terminalCode, invoiceStartNumber, enableThreeInvoiceSeries, b2bPrefix, b2bStartNumber, b2cPrefix, b2cStartNumber, labelCodeType, labelShowShopName, enableScrap, showCashRegister, autoPrintBarcode, loyaltyEnabled, loyaltyEarningRate, loyaltyRedemptionRate, loyaltyAwardOnPending, billSettings, scrapBillSettings, gstProfitPercentage, gstConversionTaxInclusive, returnPrefix, returnStartNumber, scrapPrefix, scrapStartNumber, quotationPrefix, quotationStartNumber, purchaseBillPrefix, purchaseBillStartNumber, stockReportDefaultView, inventoryDefaultView, serviceChargeBarcode, timeFormat, syncMode, lanRole, lanHostIp, lanPort, syncFrequency, featureFlags, enablePartyGst, enablePartyEstimate, enableRealPaperStock, showZeroPaperStock, showPaperOnlyProducts, showPaperStockInGst, showPaperStockInEstimate, showProductGstBadge, showPriceTiersInInventory, enableConvertToGst, billingUIConfig, staffDataMaskingConfig, emergencyPanicConfig, shopClosingConfig, saveRevision]);

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
  }, [setLoading]);

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
      bridgeEvents.onUpdateInfo((info) => {
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
  }, [setDownloadProgress, setIsDownloading, setLastChecked, setUpdateInfo, setUpdateReady, setUpdateStatus]);

  const { handleSave } = useSettingsSave({
    form, activeSection, buildSettingsSnapshot, featureFlags, initialSnapshot, localDomain, returnPrefix,
    returnStartNumber, role, shopDomain, updateDomain,
  });

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
    } catch (err) { console.error('Change password error:', err); setMessage({ type: 'error', text: 'Failed to change password. Please try again.' }); setTimeout(() => setMessage(null), 3000); }
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
              <SettingsSectionContent
                activeSection={activeSection} featureFlags={featureFlags} fetchPrinters={fetchPrinters}
                handleChangePassword={handleChangePassword} handleInstallUpdate={handleInstallUpdate}
                handleRetryDownload={handleRetryDownload} handleToggleFeatureFlag={handleToggleFeatureFlag}
                returnPrefix={returnPrefix} returnStartNumber={returnStartNumber} role={role} sectionId={activeSection}
                setActiveSection={setActiveSection} tenantId={tenantId} form={form}
              />
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
        onSelectStyle={(s) => { if (previewFormat === 'thermal') setThermalStyle(s as Parameters<typeof setThermalStyle>[0]); else setA4Style(s as Parameters<typeof setA4Style>[0]); }}
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
      <LanSyncHelpModal
        form={form}
      />

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

