import { FloatToast } from '../ui/FloatToast';
import { SettingsSaveSession } from './settingsSaveSession';
import { SettingsSaveContext } from './hooks/useSettingsSectionSave';
import { localizeTaxText } from '../../utils/localization/storeProfile';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { Settings, Save, Loader2, AlertCircle, X, Power } from 'lucide-react';
import { useCartStore } from '../../store/cartStore';
import { useAuthStore } from '../../store/authStore';
import { Skeleton } from '../ui/Skeleton';
import { Modal } from '../ui/Modal';
import { RedCrossButton } from '../ui/RedCrossButton';
import { useCloseOnEscape } from '../../hooks/useCloseOnEscape';
import { BulkOnboardingSheet } from './BulkOnboardingSheet';
import { PaperPreviewModal } from './PaperPreviewModal';
import { isAdminRole } from '../../utils/security/permissions';

import { FEATURE_LIST, DEFAULT_FEATURE_FLAGS, sanitizeFeatureFlags, type FeatureFlags, type FeatureKey, useFeatureFlagsStore } from '../../config/featureFlags';
import { appApi } from '../../data/app';
import { useUpdateStore } from '../../store/updateStore';
import { hasBridge, isDesktopRuntime } from '../../data/client';
import { bridgeEvents } from '../../data/events';
import { printingApi } from '../../data/printing';
import { getRecommendedLeftMarginOffset } from '../../utils/print/printFormatHelper';
import { syncApi } from '../../data/sync';
import { useSettingsLoader } from './hooks/useSettingsLoader';
import { useSettingsSave } from './hooks/useSettingsSave';
import { useSettingsFormState } from './hooks/useSettingsFormState';
import { SettingsSectionContent } from './views/SettingsSectionContent';
import { LanSyncHelpModal } from './views/LanSyncHelpModal';
import { SettingsSidebar } from './views/SettingsSidebar';
import { findSettingsSection } from './settingsSections';
import type { PrinterConfig } from './settingsTypes';

export function SettingsManager({ onClose, initialSection, isRestricted: _isRestricted }: { onClose: () => void; initialSection?: string; isRestricted?: boolean }) {
  useCloseOnEscape(onClose);
  const { role, updateDomain, tenantId } = useAuthStore();
  const form = useSettingsFormState();
  const {
    loading, setLoading, saving, message, setMessage,
    showBulkSheet, setShowBulkSheet, setBarcodePrinter, setReceiptPrinter,
    setOsPrinters, setPrintersLoading, setActiveHardwareTab, setActiveProductsTab,
    pass, setPass, setChangingPass, confirmTurnOffAllModalOpen, setConfirmTurnOffAllModalOpen, appVersion,
    shopGstin, shopState, shopNameLocal, shopAddress, shopPhone, showProductOffers, receiptFont, billSettings,
    a5Orientation, printWidth,
    thermalStyle, setThermalStyle, a4Style, setA4Style, previewFormat, setPreviewFormat,
    previewStyle, setPreviewStyle, bankName, bankAccount, bankIfsc, bankBranch,
    setShowCashRegister, returnPrefix, returnStartNumber, setDetectedLocalIp,
    setNetworkDetails, setEffectiveCloudState,
  } = form;

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => {
      setMessage(null);
    }, 4000);
    return () => clearTimeout(timer);
  }, [message, setMessage]);
  const [saveSession] = useState(() => new SettingsSaveSession());
  const [, refreshSections] = useState(0);
  const saveContext = useMemo(() => ({ session: saveSession, changed: () => refreshSections(v => v + 1) }), [saveSession]);
  const [visited, setVisited] = useState<string[]>([initialSection || (isAdminRole(role) ? 'store' : 'hardware')]);
  const [activeSection, setActiveSection] = useState(isAdminRole(role) ? (initialSection || 'store') : 'hardware');
  const selectSection = useCallback((id: string) => {
    setVisited(current => current.includes(id) ? current : [...current, id]);
    setActiveSection(id);
    if (id === 'hardware') setActiveHardwareTab('receipt');
    if (id === 'products') setActiveProductsTab('coding');
  }, [setActiveHardwareTab, setActiveProductsTab]);

  useEffect(() => {
    const handleOpenSection = (e: Event) => {
      const ce = e as CustomEvent<string>;
      if (ce.detail) {
        selectSection(ce.detail);
      }
    };
    window.addEventListener('open-settings-section', handleOpenSection);
    return () => window.removeEventListener('open-settings-section', handleOpenSection);
  }, [selectSection]);

  const shopDomain = useCartStore((state) => state.shopDomain);
  const [localDomain] = useState(shopDomain || 'GENERAL');
  const { flags: savedFeatureFlags, loadFlags } = useFeatureFlagsStore();
  const [draftFeatureFlags, setDraftFeatureFlags] = useState<FeatureFlags | null>(null);
  const featureFlags = draftFeatureFlags ?? savedFeatureFlags;

  const handleToggleFeatureFlag = (key: FeatureKey, nextVal?: boolean) => {
    setDraftFeatureFlags(previous => {
      const current = previous ?? savedFeatureFlags ?? DEFAULT_FEATURE_FLAGS;
      const target = nextVal ?? !current[key];
      return sanitizeFeatureFlags({ ...current, [key]: target,
        ...(key === 'cash_register' && target ? { cash_settlement: true } : {}),
        ...(['dining_tables', 'takeaway_delivery', 'kitchen_display'].includes(key) && target ? { restaurant_mode: true } : {}),
      });
    });
  };
  const [initialSnapshot, setInitialSnapshot] = useState('');

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
    setInitialSnapshot((snapshot) => {
      try {
        if (snapshot) return JSON.stringify(updater(JSON.parse(snapshot)));
      } catch { /* ignore */ }
      return snapshot;
    });
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
              const autoOffset = getRecommendedLeftMarginOffset(defPr.name);
              updateSnapshotField(s => ({ ...s, receiptPrinter: { ...(s.receiptPrinter as Record<string, unknown>), deviceName: defPr.name, leftMarginOffsetMm: autoOffset } }));
              return { ...prev, deviceName: defPr.name, leftMarginOffsetMm: prev?.leftMarginOffsetMm ?? autoOffset };
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
    form, featureFlags, fetchPrinters, setInitialSnapshot, loadFlags, returnPrefix, returnStartNumber,
    updateSnapshotField,
  });

  const hasChanges = saveSession.dirty || Boolean(initialSnapshot && buildSettingsSnapshot() !== initialSnapshot);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadSettings is a render-local loader; this effect intentionally performs the settings load only on mount.
  }, [setLoading]);

  const { handleSave } = useSettingsSave({
    form, activeSection, buildSettingsSnapshot, featureFlags, setInitialSnapshot, localDomain, returnPrefix, saveSession,
    returnStartNumber, role, shopDomain, updateDomain,
  });

  const handleInstallUpdate = async () => {
    const result = await useUpdateStore.getState().installUpdate();
    if (result && !result.success) setMessage({ type: 'error', text: result.error || 'Could not start the installer. Please retry.' });
  };

  const handleRetryDownload = () => { void useUpdateStore.getState().checkForUpdates(); };

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
      <FloatToast message={message} onClose={() => setMessage(null)} title={message.title || (message.type === 'success' ? 'SETTINGS SAVED' : 'SETTINGS ALERT')} duration={0} />
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
        <div className="flex-1 flex min-h-0 flex-col md:flex-row overflow-hidden">
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

  const activeItem = findSettingsSection(activeSection);
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
      <div className="flex-1 flex min-h-0 flex-col md:flex-row overflow-hidden">

        <SettingsSidebar activeSection={activeSection} isAdmin={isAdminRole(role)} onSelect={selectSection} />

        {/* ─── Main Content Area ─── */}
        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto bg-background" style={{ scrollbarGutter: 'stable' }}>
          <div className="w-full p-6 lg:p-8 animate-in fade-in duration-300">

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
                  {localizeTaxText(activeItem.description)}
                </p>
              </div>
            )}

            {/* Section Content */}
            <fieldset disabled={saving} className="min-w-0">
            <SettingsSaveContext.Provider value={saveContext}>
            {Array.from(new Set([...visited, activeSection])).map(section => <div key={section} hidden={section !== activeSection}>
              <SettingsSectionContent
                onFlagsChange={setDraftFeatureFlags} activeSection={activeSection} featureFlags={featureFlags} fetchPrinters={fetchPrinters}

                handleChangePassword={handleChangePassword} handleInstallUpdate={handleInstallUpdate}
                handleRetryDownload={handleRetryDownload} handleToggleFeatureFlag={handleToggleFeatureFlag}
                returnPrefix={returnPrefix} returnStartNumber={returnStartNumber} role={role} sectionId={section}
                setActiveSection={setActiveSection} tenantId={tenantId} form={form}
              />
            </div>)}
            </SettingsSaveContext.Provider>
            </fieldset>

          </div>

        </main>
      </div>

      <PaperPreviewModal
        isOpen={previewFormat !== null}
        onClose={() => { setPreviewFormat(null); setPreviewStyle(null); }}
        format={previewFormat || 'thermal'}
        thermalStyle={(previewStyle as typeof thermalStyle) || thermalStyle}
        a4Style={(previewStyle as typeof a4Style) || a4Style}
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
                setDraftFeatureFlags(sanitizeFeatureFlags(Object.fromEntries(FEATURE_LIST.map(f => [f.key, false])) as FeatureFlags));
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

