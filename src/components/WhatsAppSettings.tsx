import React, { useState, useEffect, useCallback } from 'react';
import { QrCode, Smartphone, CheckCircle2, AlertCircle, RefreshCw, PowerOff, ShieldCheck, Loader2, WifiSync, BookOpen, Check, RotateCcw, Store, Clock, Send, CheckSquare, Square, History, ShieldAlert, Phone, ListChecks, Layers, ChevronDown, ChevronUp } from 'lucide-react';
import clsx from 'clsx';
import { Button } from './ui/Button';
import { Modal } from './ui/Modal';
import { FloatToast } from './ui/FloatToast';
import { WhatsAppIcon } from './ui/WhatsAppIcon';
import { useAuthStore } from '../store/authStore';
import { isAdminRole } from '../utils/permissions';
import { type ShopClosingOverviewConfig, type ShopClosingChecklist, type ShopClosingSendTiming, DEFAULT_SHOP_CLOSING_CONFIG, DEFAULT_CHECKLIST, ALL_CHECKLIST_SELECTED, ALL_CHECKLIST_CLEARED, CHECKLIST_DEFINITIONS, isValidPhoneNumber, getSampleClosingSummary, generateWhatsAppClosingMessage } from '../utils/shopClosingHelper';
import { hasBridge } from '../data/client';
import { bridgeEvents } from '../data/events';
import { settingsApi } from '../data/settings';
import { whatsappApi } from '../data/whatsapp';

type WhatsAppStatus = 'disconnected' | 'connecting' | 'syncing' | 'connected';

interface WhatsAppSettingsProps {
  tenantId?: string;
  autoSendEnabled: boolean;
  onAutoSendChange: (val: boolean) => void;
  activeTab?: 'qr' | 'settings' | 'closing' | string;
  defaultTab?: 'device' | 'settings' | 'qr' | 'closing' | string;
  onTabChange?: (tab: 'qr' | 'settings' | 'closing') => void;
  closingConfig?: ShopClosingOverviewConfig;
  onClosingConfigChange?: (config: ShopClosingOverviewConfig) => void;
}

export const WhatsAppSettings: React.FC<WhatsAppSettingsProps> = ({
  tenantId,
  autoSendEnabled,
  onAutoSendChange,
  activeTab: controlledTab,
  defaultTab,
  onTabChange,
  closingConfig: propClosingConfig,
  onClosingConfigChange,
}) => {
  const { role, tenantId: storeTenantId, shopName: authShopName } = useAuthStore();
  const effectiveTenantId = tenantId || storeTenantId || 'global';
  const isAdmin = isAdminRole(role);

  const isControlledClosing = propClosingConfig !== undefined && onClosingConfigChange !== undefined;
  const [internalClosingConfig, setInternalClosingConfig] = useState<ShopClosingOverviewConfig>(DEFAULT_SHOP_CLOSING_CONFIG);
  const closingConfig = isControlledClosing ? propClosingConfig : internalClosingConfig;

  const setClosingConfig = (newCfg: ShopClosingOverviewConfig | ((prev: ShopClosingOverviewConfig) => ShopClosingOverviewConfig)) => {
    if (isControlledClosing) {
      const next = typeof newCfg === 'function' ? newCfg(propClosingConfig) : newCfg;
      onClosingConfigChange(next);
    } else {
      setInternalClosingConfig(newCfg);
    }
  };

  const initialTab = (defaultTab === 'settings' ? 'settings' : defaultTab === 'closing' ? 'closing' : 'qr') as 'qr' | 'settings' | 'closing';
  const [internalTab, setInternalTab] = useState<'qr' | 'settings' | 'closing'>(initialTab);
  const currentTab = (controlledTab || internalTab) as 'qr' | 'settings' | 'closing';

  const handleTabSelect = (tab: 'qr' | 'settings' | 'closing') => {
    setInternalTab(tab);
    if (onTabChange) onTabChange(tab);
  };

  const [status, setStatus] = useState<WhatsAppStatus>('disconnected');
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [phone, setPhone] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [msg, setMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [ledgerAlertsEnabled, setLedgerAlertsEnabled] = useState<boolean>(true);
  const [includeShopName, setIncludeShopName] = useState<boolean>(false);
  const [shopName, setShopName] = useState<string>(authShopName || 'My Store');
  const [showConfirmDisconnect, setShowConfirmDisconnect] = useState<boolean>(false);

  // ── Shop Closing Overview State ──────────────────────────────────────────
  const [, setLoadingClosing] = useState<boolean>(false);
  const [savingClosing, setSavingClosing] = useState<boolean>(false);
  const [sendingTest, setSendingTest] = useState<boolean>(false);
  const [previewText, setPreviewText] = useState<string>('');
  const [previewLoading, setPreviewLoading] = useState<boolean>(false);
  const [closingHistory, setClosingHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState<boolean>(false);

  useEffect(() => {
    // Initial status check
    if (hasBridge('whatsappGetStatus')) {
      whatsappApi.getStatus()
        .then((res) => {
          if (res) {
            setStatus(res.status);
            setQrCode(res.qrCode);
            setPhone(res.phone);
          }
        })
        .catch(console.error);
    }

    // Subscribe to real-time status updates
    if (hasBridge('onWhatsAppStatusUpdate')) {
      const unsubscribe = bridgeEvents.onWhatsAppStatusUpdate((data) => {
        setStatus(data.status);
        setQrCode(data.qrCode);
        setPhone(data.phone);
        if (data.status === 'connected') {
          setLoading(false);
          setMsg({ text: 'WhatsApp connected and synced successfully!', type: 'success' });
        }
        if (data.status === 'syncing') {
          setLoading(false);
        }
      });
      return () => {
        if (typeof unsubscribe === 'function') unsubscribe();
      };
    }
  }, []);

  useEffect(() => {
    if (hasBridge('settingsGet')) {
      Promise.all([
        settingsApi.get({ tenant_id: effectiveTenantId, key: 'ledger_whatsapp_enabled' }),
        settingsApi.get({ tenant_id: effectiveTenantId, key: 'ledger_whatsapp_include_shop' }),
        settingsApi.get({ tenant_id: effectiveTenantId, key: 'shop_name' }),
      ])
        .then(([enabledVal, includeShopVal, shopVal]) => {
          if (enabledVal !== null && enabledVal !== undefined) {
            setLedgerAlertsEnabled(Boolean(enabledVal));
          }
          if (includeShopVal !== null && includeShopVal !== undefined) {
            setIncludeShopName(Boolean(includeShopVal));
          }
          if (shopVal && typeof shopVal === 'string') {
            setShopName(shopVal);
          }
        })
        .catch(console.error);
    }
  }, [effectiveTenantId]);

  // Load Shop Closing Configuration
  const loadClosingConfig = useCallback(async () => {
    if (!hasBridge('shopClosingGetConfig')) return;
    setLoadingClosing(true);
    try {
      const res = await whatsappApi.shopClosingGetConfig({ tenant_id: effectiveTenantId });
      const cfg = (res && res.config) ? res.config : res;
      if (cfg && typeof cfg === 'object') {
        setClosingConfig({
          ...DEFAULT_SHOP_CLOSING_CONFIG,
          ...cfg,
          checklist: {
            ...DEFAULT_CHECKLIST,
            ...(cfg.checklist || {}),
          },
        });
      }
    } catch (err: any) {
      console.error('[WhatsAppSettings] loadClosingConfig error:', err);
    } finally {
      setLoadingClosing(false);
    }
  }, [effectiveTenantId]);

  // Load Shop Closing Delivery History
  const loadClosingHistory = useCallback(async () => {
    if (!hasBridge('shopClosingGetHistory')) return;
    setLoadingHistory(true);
    try {
      const history = await whatsappApi.shopClosingGetHistory({ tenant_id: effectiveTenantId, limit: 15 });
      if (Array.isArray(history)) {
        setClosingHistory(history);
      }
    } catch (err: any) {
      console.error('[WhatsAppSettings] loadClosingHistory error:', err);
    } finally {
      setLoadingHistory(false);
    }
  }, [effectiveTenantId]);

  useEffect(() => {
    loadClosingConfig();
    loadClosingHistory();

    if (hasBridge('onShopClosingUpdated')) {
      const unsubscribe = bridgeEvents.onShopClosingUpdated(() => {
        loadClosingHistory();
      });
      return () => {
        if (typeof unsubscribe === 'function') unsubscribe();
      };
    }
  }, [loadClosingConfig, loadClosingHistory]);

  // Refresh live preview text
  const refreshPreview = useCallback(async (cfgToUse: ShopClosingOverviewConfig) => {
    setPreviewLoading(true);
    try {
      if (hasBridge('shopClosingGetPreview')) {
        const res = await whatsappApi.shopClosingGetPreview({
          tenant_id: effectiveTenantId,
          checklist: cfgToUse.checklist,
        });
        if (res && res.success && res.message) {
          setPreviewText(res.message);
          setPreviewLoading(false);
          return;
        }
      }
    } catch (e) {
      // Fallback to client sample preview generator
    }
    const sample = getSampleClosingSummary(shopName);
    const msg = generateWhatsAppClosingMessage(sample, cfgToUse.checklist);
    setPreviewText(msg);
    setPreviewLoading(false);
  }, [effectiveTenantId, shopName]);

  useEffect(() => {
    refreshPreview(closingConfig);
  }, [closingConfig, refreshPreview]);

  const handleToggleLedgerAlerts = async (enabled: boolean) => {
    setLedgerAlertsEnabled(enabled);
    try {
      if (hasBridge('settingsSet')) {
        await settingsApi.set({
          tenant_id: effectiveTenantId,
          key: 'ledger_whatsapp_enabled',
          value: enabled,
        });
        window.dispatchEvent(new CustomEvent('settings:updated'));
        setMsg({
          text: enabled
            ? 'Ledger WhatsApp transaction alerts enabled!'
            : 'Ledger WhatsApp transaction alerts disabled!',
          type: 'success',
        });
      }
    } catch (err: any) {
      setMsg({ text: 'Failed to update alert setting', type: 'error' });
    }
  };

  const handleToggleIncludeShopName = async (include: boolean) => {
    setIncludeShopName(include);
    try {
      if (hasBridge('settingsSet')) {
        await settingsApi.set({
          tenant_id: effectiveTenantId,
          key: 'ledger_whatsapp_include_shop',
          value: include,
        });
        window.dispatchEvent(new CustomEvent('settings:updated'));
        setMsg({
          text: include
            ? 'Shop name will be included in transaction messages'
            : 'Shop name excluded from transaction messages',
          type: 'success',
        });
      }
    } catch (err: any) {
      setMsg({ text: 'Failed to update shop name setting', type: 'error' });
    }
  };

  const handleConnect = async () => {
    setLoading(true);
    setMsg(null);
    try {
      const res = await whatsappApi.connect();
      if (!res.success) {
        setMsg({ text: 'Failed to initiate WhatsApp connection', type: 'error' });
      }
    } catch (err: any) {
      setMsg({ text: err?.message || 'Connection error', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setShowConfirmDisconnect(false);
    setLoading(true);
    try {
      await whatsappApi.disconnect();
      setStatus('disconnected');
      setQrCode(null);
      setPhone(null);
      setMsg({ text: 'WhatsApp disconnected successfully', type: 'success' });
    } catch (err: any) {
      setMsg({ text: err?.message || 'Disconnect error', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  // ── Shop Closing Overview Handlers ───────────────────────────────────────
  const handleToggleClosingFeature = async (enabled: boolean) => {
    if (!isAdmin) {
      setMsg({ text: 'Admin privileges required to change this setting.', type: 'error' });
      return;
    }
    const updated = { ...closingConfig, enabled };
    setClosingConfig(updated);

    // Auto-persist toggle immediately to database so that even if the page is reopened without pressing Save,
    // the enabled/disabled state is permanently persisted!
    try {
      if (hasBridge('shopClosingSaveConfig')) {
        await whatsappApi.shopClosingSaveConfig({
          tenant_id: effectiveTenantId,
          config: updated,
          user_role: role as string | undefined,
        });
      }
    } catch (err: any) {
      console.error('[WhatsAppSettings] Auto-save toggle error:', err);
    }
  };

  const handlePhoneChange = (val: string) => {
    setClosingConfig((prev) => ({ ...prev, ownerPhone: val }));
  };

  const handleTimingChange = (timing: ShopClosingSendTiming) => {
    if (!isAdmin) return;
    setClosingConfig((prev) => ({ ...prev, sendTiming: timing }));
  };

  const handleScheduledTimeChange = (time: string) => {
    if (!isAdmin) return;
    setClosingConfig((prev) => ({ ...prev, scheduledTime: time }));
  };

  const handleMultiCounterToggle = (include: boolean) => {
    if (!isAdmin) return;
    setClosingConfig((prev) => ({ ...prev, includeMultiCounterBreakdown: include }));
  };

  const handleChecklistToggle = (key: keyof ShopClosingChecklist) => {
    if (!isAdmin) return;
    setClosingConfig((prev) => {
      const nextVal = !prev.checklist[key];
      const newChecklist = { ...prev.checklist, [key]: nextVal };

      // If user toggled a parent group header (e.g. paymentMethods or sales), also sync all its children
      const children = CHECKLIST_DEFINITIONS.filter((def) => def.parentKey === key);
      if (children.length > 0) {
        children.forEach((child) => {
          (newChecklist as any)[child.key] = nextVal;
        });
      }

      // If user turned on a child option, ensure its parent group toggle is also enabled
      const currentDef = CHECKLIST_DEFINITIONS.find((def) => def.key === key);
      if (currentDef && currentDef.parentKey && nextVal === true) {
        (newChecklist as any)[currentDef.parentKey] = true;
      }

      return {
        ...prev,
        checklist: newChecklist,
      };
    });
  };

  const handleSelectAllChecklist = () => {
    if (!isAdmin) return;
    setClosingConfig((prev) => ({ ...prev, checklist: ALL_CHECKLIST_SELECTED }));
  };

  const handleClearAllChecklist = () => {
    if (!isAdmin) return;
    setClosingConfig((prev) => ({ ...prev, checklist: ALL_CHECKLIST_CLEARED }));
  };

  const handleRestoreDefaultChecklist = () => {
    if (!isAdmin) return;
    setClosingConfig((prev) => ({ ...prev, checklist: DEFAULT_CHECKLIST }));
  };

  const handleSaveClosingConfig = async () => {
    if (!isAdmin) {
      setMsg({ text: 'Permission denied: Store Admin or Owner access required.', type: 'error' });
      return;
    }
    if (closingConfig.enabled && !isValidPhoneNumber(closingConfig.ownerPhone)) {
      setMsg({ text: 'Please enter a valid owner WhatsApp phone number before enabling.', type: 'error' });
      return;
    }

    setSavingClosing(true);
    try {
      if (hasBridge('shopClosingSaveConfig')) {
        const res = await whatsappApi.shopClosingSaveConfig({
          tenant_id: effectiveTenantId,
          config: closingConfig,
          user_role: role as string | undefined,
        });

        if (res && res.success) {
          setMsg({ text: 'Shop Closing Overview settings saved successfully!', type: 'success' });
          if (res.config) setClosingConfig(res.config);
        } else {
          setMsg({ text: res?.error || 'Failed to save settings.', type: 'error' });
        }
      }
    } catch (err: any) {
      setMsg({ text: err?.message || 'Error saving settings.', type: 'error' });
    } finally {
      setSavingClosing(false);
    }
  };

  const handleSendTestReport = async () => {
    if (!isValidPhoneNumber(closingConfig.ownerPhone)) {
      setMsg({ text: 'Please enter a valid owner WhatsApp phone number first.', type: 'error' });
      return;
    }
    if (status !== 'connected') {
      setMsg({ text: 'WhatsApp device is not connected. Please scan QR in the QR tab.', type: 'error' });
      return;
    }

    setSendingTest(true);
    try {
      if (hasBridge('shopClosingSendReport')) {
        const res = await whatsappApi.shopClosingSendReport({
          tenant_id: effectiveTenantId,
          trigger_type: 'MANUAL',
          force: true,
          custom_phone: closingConfig.ownerPhone,
          custom_checklist: closingConfig.checklist,
        });

        if (res && res.success) {
          setMsg({ text: `Test report dispatched successfully to ${closingConfig.ownerPhone}!`, type: 'success' });
          loadClosingHistory();
        } else {
          setMsg({ text: res?.error || 'Failed to send test report.', type: 'error' });
        }
      }
    } catch (err: any) {
      setMsg({ text: err?.message || 'Dispatch error occurred.', type: 'error' });
    } finally {
      setSendingTest(false);
    }
  };

  const handleRetryReport = async (reportId: string) => {
    setRetryingId(reportId);
    try {
      if (hasBridge('shopClosingRetry')) {
        const res = await whatsappApi.shopClosingRetry({ report_id: reportId });
        if (res && res.success) {
          setMsg({ text: 'Report retry sent successfully!', type: 'success' });
          loadClosingHistory();
        } else {
          setMsg({ text: res?.error || 'Retry attempt failed.', type: 'error' });
        }
      }
    } catch (err: any) {
      setMsg({ text: err?.message || 'Retry error.', type: 'error' });
    } finally {
      setRetryingId(null);
    }
  };

  const selectedChecklistCount = Object.values(closingConfig.checklist || {}).filter(Boolean).length;
  const totalChecklistCount = CHECKLIST_DEFINITIONS.length;

  return (
    <div className="w-full space-y-6">
      {/* Header bar matching other settings sections */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-border">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center font-bold shrink-0 border border-emerald-500/20 shadow-xs">
            <WhatsAppIcon className="w-6 h-6 text-emerald-500 fill-current" />
          </div>
          <div>
            <h3 className="text-sm font-black uppercase tracking-wider text-foreground flex items-center gap-2">
              {currentTab === 'qr'
                ? 'WhatsApp Device Connection'
                : currentTab === 'closing'
                ? 'Shop Closing Overview'
                : 'WhatsApp Automation & Alerts'}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {currentTab === 'qr'
                ? 'Scan the QR code to link your shop phone for automated invoice & ledger messaging'
                : currentTab === 'closing'
                ? 'Configure automated end-of-day sales, cash reconciliation & multi-counter reports to the shop owner'
                : 'Configure automated PDF bill dispatch and party ledger transaction alert rules'}
            </p>
          </div>
        </div>

        {/* Real-time Status Badge */}
        <div className="flex items-center gap-2 shrink-0">
          {status === 'connected' ? (
            <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shadow-xs">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Connected (+{phone || 'Ready'})
            </span>
          ) : status === 'syncing' ? (
            <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-500 border border-blue-500/20">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Syncing Session...
            </span>
          ) : status === 'connecting' ? (
            <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-500 border border-amber-500/20">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              Waiting for Scan...
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-muted text-muted-foreground border border-border">
              <span className="w-2 h-2 rounded-full bg-muted-foreground/40" />
              Not Connected
            </span>
          )}
        </div>
      </div>

      {/* ─── TAB 1: QR CODE / DEVICE CONNECTION ─────────────────────────────── */}
      {currentTab === 'qr' && (
        <div className="w-full space-y-6 animate-in fade-in duration-200">
          {status === 'connected' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full items-stretch">
              {/* Card 1: Active Device Details */}
              <div className="p-6 md:p-8 rounded-2xl bg-muted/20 border border-border/80 flex flex-col items-center justify-center text-center space-y-4">
                <div className="relative inline-block mx-auto">
                  <div className="w-20 h-20 rounded-3xl bg-emerald-500/10 border-2 border-emerald-500 text-emerald-500 flex items-center justify-center mx-auto shadow-sm">
                    <Smartphone className="w-10 h-10" />
                  </div>
                  <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-white shadow-sm ring-4 ring-card">
                    <Check className="w-3.5 h-3.5 stroke-[3]" />
                  </span>
                </div>

                <div className="space-y-1">
                  <h4 className="text-base font-bold text-foreground">Active WhatsApp Device</h4>
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-mono font-bold text-sm">
                    <span>+{phone}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto leading-relaxed">
                    Invoices, bill PDFs, party ledger alerts, and shop closing reports are actively sent from this number.
                  </p>
                </div>

                <div className="pt-2">
                  <Button
                    variant="outline"
                    onClick={() => setShowConfirmDisconnect(true)}
                    disabled={loading}
                    className="text-xs text-destructive hover:bg-destructive/10 border-destructive/30 px-5 py-2.5 rounded-xl cursor-pointer"
                  >
                    <PowerOff className="w-4 h-4 mr-2" />
                    Disconnect Number
                  </Button>
                </div>
              </div>

              {/* Card 2: Status & Features Overview */}
              <div className="p-6 md:p-8 rounded-2xl bg-muted/20 border border-border/80 flex flex-col justify-between space-y-5">
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                    <CheckCircle2 className="w-4.5 h-4.5 text-emerald-500 shrink-0" />
                    <span>Connection Active &amp; Ready</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Your WhatsApp session is running smoothly in the background. Messages dispatch directly over your local session with no extra subscription fees.
                  </p>

                  <div className="space-y-2 pt-2">
                    <div className="flex items-center gap-2.5 text-xs text-foreground/90 font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      <span>Instant High-Res PDF invoice dispatch on checkout</span>
                    </div>
                    <div className="flex items-center gap-2.5 text-xs text-foreground/90 font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      <span>Automated ledger transaction debit/credit notifications</span>
                    </div>
                    <div className="flex items-center gap-2.5 text-xs text-foreground/90 font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      <span>Daily Shop Closing &amp; Cash Reconciliation summary to owner</span>
                    </div>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-card border border-border/60 text-xs text-muted-foreground flex items-center justify-between">
                  <span>Want to configure Shop Closing Overview?</span>
                  <button
                    type="button"
                    onClick={() => handleTabSelect('closing')}
                    className="text-xs font-bold text-primary hover:underline cursor-pointer"
                  >
                    Open Shop Closing &rarr;
                  </button>
                </div>
              </div>
            </div>
          ) : status === 'syncing' ? (
            <div className="py-16 rounded-2xl bg-muted/20 border border-border/80 flex flex-col items-center justify-center text-center space-y-4 w-full">
              <div className="w-20 h-20 rounded-3xl bg-blue-500/10 border-2 border-blue-500 text-blue-500 flex items-center justify-center mx-auto">
                <WifiSync className="w-10 h-10 animate-spin" />
              </div>
              <div className="space-y-1 max-w-md">
                <h4 className="text-base font-bold text-foreground">Synchronizing WhatsApp Session</h4>
                <p className="text-xs text-muted-foreground">
                  Device authenticated successfully. Initializing encryption keys and session cache&hellip;
                </p>
                <p className="text-[11px] text-muted-foreground/80 mt-1">
                  Please keep the app open. This takes only a few seconds.
                </p>
              </div>
            </div>
          ) : qrCode ? (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center p-6 md:p-8 rounded-2xl bg-muted/20 border border-border/80 w-full">
              <div className="lg:col-span-5 flex flex-col items-center text-center space-y-4">
                <div className="p-4 bg-white rounded-3xl shadow-lg border border-border/80 inline-block">
                  <img src={qrCode} alt="WhatsApp QR Code" className="w-60 h-60 object-contain mx-auto" />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleConnect}
                  disabled={loading || status === 'connecting'}
                  className="text-xs px-5 py-2 rounded-xl cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 mr-2 ${loading ? 'animate-spin' : ''}`} />
                  Refresh QR Code
                </Button>
              </div>

              <div className="lg:col-span-7 space-y-5 text-left">
                <div className="space-y-1">
                  <h4 className="text-base font-bold text-foreground">Scan with WhatsApp on your Phone</h4>
                  <p className="text-xs text-muted-foreground">
                    Connect your mobile phone to enable automated PDF bills, ledger alerts, and daily closing overviews.
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-card border border-border/70 space-y-3">
                  <span className="text-xs font-bold text-foreground block">Follow these 3 steps:</span>
                  <div className="space-y-2.5 text-xs text-muted-foreground">
                    <div className="flex items-start gap-3">
                      <span className="w-5 h-5 rounded-full bg-primary/10 text-primary font-bold text-[11px] flex items-center justify-center shrink-0 mt-0.5">
                        1
                      </span>
                      <span>Open WhatsApp on your mobile device.</span>
                    </div>
                    <div className="flex items-start gap-3">
                      <span className="w-5 h-5 rounded-full bg-primary/10 text-primary font-bold text-[11px] flex items-center justify-center shrink-0 mt-0.5">
                        2
                      </span>
                      <span>
                        Go to <strong>Settings</strong> (iPhone) or tap <strong>Menu ⋮</strong> (Android) &gt; <strong>Linked Devices</strong>.
                      </span>
                    </div>
                    <div className="flex items-start gap-3">
                      <span className="w-5 h-5 rounded-full bg-primary/10 text-primary font-bold text-[11px] flex items-center justify-center shrink-0 mt-0.5">
                        3
                      </span>
                      <span>
                        Tap <strong>Link a Device</strong> and point your phone&apos;s camera at the QR code.
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="py-16 rounded-2xl bg-muted/20 border border-border/80 flex flex-col items-center justify-center text-center space-y-5 w-full">
              <div className="w-20 h-20 rounded-3xl bg-emerald-500/10 border-2 border-emerald-500/20 text-emerald-500 flex items-center justify-center mx-auto shadow-xs">
                <QrCode className="w-10 h-10" />
              </div>
              <div className="space-y-1.5 max-w-md">
                <h4 className="text-base font-bold text-foreground">Link Your WhatsApp Number</h4>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Send high-resolution digital invoice PDFs, credit reminders, ledger transaction alerts, and daily shop closing summaries.
                </p>
              </div>
              <div className="pt-2">
                <Button
                  onClick={handleConnect}
                  disabled={loading || status === 'connecting'}
                  className="text-xs font-bold px-7 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer shadow-sm"
                >
                  <QrCode className="w-4 h-4 mr-2" />
                  {loading
                    ? 'Initializing...'
                    : status === 'connecting'
                    ? 'Please Wait...'
                    : 'Generate WhatsApp QR Code'}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── TAB 2: AUTOMATION & BILLS SETTINGS ─────────────────────────────── */}
      {currentTab === 'settings' && (
        <div className="w-full space-y-6 animate-in fade-in duration-200">
          {status !== 'connected' && (
            <div className="flex items-center justify-between gap-3 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400">
              <div className="flex items-center gap-2.5 text-xs">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>
                  <strong>Device not connected:</strong> Automated messages will begin sending once you link your WhatsApp number in the <strong>QR</strong> tab.
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleTabSelect('qr')}
                className="text-xs font-bold underline shrink-0 cursor-pointer"
              >
                Open QR Tab &rarr;
              </button>
            </div>
          )}

          {/* Quick link banner to Shop Closing Overview */}
          <div className="p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/15 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
                <Store className="w-5 h-5" />
              </div>
              <div className="text-left">
                <span className="text-xs font-bold text-foreground block">Looking for Daily Shop Closing Reports?</span>
                <span className="text-[11px] text-muted-foreground block">
                  Automatically send end-of-day sales, cash balances, and counter reports to the shop owner&apos;s WhatsApp.
                </span>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleTabSelect('closing')}
              className="text-xs font-bold px-4 py-1.5 rounded-xl border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 cursor-pointer"
            >
              Configure Closing Overview &rarr;
            </Button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 w-full items-start">
            {/* Column 1: Automated Bill Options */}
            <div className="p-6 rounded-2xl bg-muted/20 border border-border/80 space-y-5">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-black uppercase tracking-wider text-foreground">
                    Automated Checkout Bills
                  </h4>
                  <p className="text-[11px] text-muted-foreground">
                    Send digital receipts to customer phones on checkout
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between p-4 rounded-xl bg-card border border-border/60 hover:border-border transition-colors">
                <div className="space-y-0.5 pr-4 text-left">
                  <span className="text-xs font-bold text-foreground block">
                    Auto-send WhatsApp Bill on Checkout
                  </span>
                  <span className="text-[11px] text-muted-foreground block leading-snug">
                    When a customer phone number is entered during billing, automatically send the PDF invoice and bill summary.
                  </span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0 select-none">
                  <input
                    type="checkbox"
                    checked={autoSendEnabled}
                    onChange={(e) => onAutoSendChange(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-muted/80 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary shadow-inner"></div>
                </label>
              </div>

              <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/10 space-y-2">
                <h5 className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                  What does the customer receive?
                </h5>
                <ul className="text-[11px] text-muted-foreground space-y-1.5 list-disc list-inside leading-snug">
                  <li>High-resolution standalone PDF invoice document</li>
                  <li>Itemized purchase summary (descriptions, quantities &amp; totals)</li>
                  <li>Credit period &amp; Due date reminder (for credit invoices)</li>
                  <li>Live ledger balance summary</li>
                </ul>
              </div>
            </div>

            {/* Column 2: Ledger Transaction Alerts */}
            <div className="p-6 rounded-2xl bg-muted/20 border border-border/80 space-y-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <BookOpen className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-black uppercase tracking-wider text-foreground">
                      Ledger Transaction Alerts
                    </h4>
                    <p className="text-[11px] text-muted-foreground">
                      Instant WhatsApp alerts on Got Cash / Gave Cash entries
                    </p>
                  </div>
                </div>

                <span
                  className={clsx(
                    'text-[10px] font-bold px-2.5 py-0.5 rounded-full border transition-colors',
                    ledgerAlertsEnabled
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                      : 'bg-muted text-muted-foreground border-border'
                  )}
                >
                  {ledgerAlertsEnabled ? 'Active (Enabled)' : 'Disabled (Off)'}
                </span>
              </div>

              <div className="flex items-center justify-between p-4 rounded-xl bg-card border border-border/60 hover:border-border transition-colors">
                <div className="space-y-0.5 pr-4 text-left">
                  <span className="text-xs font-bold text-foreground block">
                    Send WhatsApp Alert on Ledger Transactions
                  </span>
                  <span className="text-[11px] text-muted-foreground block leading-snug">
                    {ledgerAlertsEnabled
                      ? 'Active for all parties. You can silence individual parties anytime from their ledger profile.'
                      : 'Turned off for all parties. No automated transaction messages will be sent.'}
                  </span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0 select-none">
                  <input
                    type="checkbox"
                    checked={ledgerAlertsEnabled}
                    onChange={(e) => handleToggleLedgerAlerts(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-muted/80 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600 shadow-inner"></div>
                </label>
              </div>

              <div
                className={clsx(
                  'flex items-center justify-between p-4 rounded-xl border transition-all',
                  ledgerAlertsEnabled
                    ? 'bg-card border-border/60 hover:border-border'
                    : 'bg-muted/15 border-border/40 opacity-60 pointer-events-none'
                )}
              >
                <div className="space-y-0.5 pr-4 text-left">
                  <span className="text-xs font-bold text-foreground block">
                    Include Shop Name in Message
                  </span>
                  <span className="text-[11px] text-muted-foreground block leading-snug">
                    Appends &ldquo;— *{shopName}*&rdquo; at the bottom of the notification.
                  </span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0 select-none">
                  <input
                    type="checkbox"
                    checked={includeShopName}
                    disabled={!ledgerAlertsEnabled}
                    onChange={(e) => handleToggleIncludeShopName(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-muted/80 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary shadow-inner"></div>
                </label>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── TAB 3: SHOP CLOSING OVERVIEW (END TO END) ───────────────────────── */}
      {currentTab === 'closing' && (
        <div className="w-full space-y-6 animate-in fade-in duration-200">
          {/* Admin Guard Notice */}
          {!isAdmin && (
            <div className="flex items-center gap-3 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400">
              <ShieldAlert className="w-5 h-5 shrink-0" />
              <div className="text-xs leading-relaxed">
                <strong>Administrator Access Required:</strong> Only the Store Owner or Admin can configure or modify WhatsApp Shop Closing Overview settings.
              </div>
            </div>
          )}

          {/* Connection warning if WhatsApp is not connected */}
          {status !== 'connected' && (
            <div className="flex items-center justify-between gap-3 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400">
              <div className="flex items-center gap-2.5 text-xs">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>
                  <strong>WhatsApp is disconnected:</strong> Scheduled and settlement reports will automatically deliver once WhatsApp is connected in the <strong>QR</strong> tab.
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleTabSelect('qr')}
                className="text-xs font-bold underline shrink-0 cursor-pointer"
              >
                Connect Now &rarr;
              </button>
            </div>
          )}

          {/* Main Controls Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full items-start">
            {/* Left 7 Columns: Settings, Recipient & Checklist */}
            <div className="lg:col-span-7 space-y-6">
              {/* Card 1: Master Enable & Phone Number */}
              <div className="p-6 rounded-2xl bg-muted/20 border border-border/80 space-y-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
                      <Store className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-xs font-black uppercase tracking-wider text-foreground">
                        Shop Closing Overview Alert
                      </h4>
                      <p className="text-[11px] text-muted-foreground">
                        Daily WhatsApp business summary sent directly to the store owner
                      </p>
                    </div>
                  </div>

                  <span
                    className={clsx(
                      'text-[10px] font-bold px-2.5 py-0.5 rounded-full border transition-colors',
                      closingConfig.enabled
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                        : 'bg-muted text-muted-foreground border-border'
                    )}
                  >
                    {closingConfig.enabled ? 'Enabled' : 'Disabled'}
                  </span>
                </div>

                {/* Master Toggle */}
                <div className="flex items-center justify-between p-4 rounded-xl bg-card border border-border/60 hover:border-border transition-colors">
                  <div className="space-y-0.5 pr-4 text-left">
                    <span className="text-xs font-bold text-foreground block">
                      Enable Shop Closing WhatsApp Reports
                    </span>
                    <span className="text-[11px] text-muted-foreground block leading-snug">
                      Generate accurate financial summary from local POS transactions and dispatch directly to the owner.
                    </span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0 select-none">
                    <input
                      type="checkbox"
                      checked={closingConfig.enabled}
                      disabled={!isAdmin}
                      onChange={(e) => handleToggleClosingFeature(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className={clsx(
                      "w-11 h-6 bg-muted/80 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600 shadow-inner",
                      !isAdmin && "opacity-50 cursor-not-allowed"
                    )}></div>
                  </label>
                </div>

                {/* Owner's Phone Number Input */}
                <div
                  className={clsx(
                    'p-4 rounded-xl bg-card border border-border/60 space-y-2 transition-all',
                    !closingConfig.enabled && 'opacity-60'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5 text-primary" />
                      Shop Owner WhatsApp Number
                    </label>
                    {closingConfig.ownerPhone && (
                      <span
                        className={clsx(
                          'text-[10px] font-bold px-2 py-0.5 rounded-full',
                          isValidPhoneNumber(closingConfig.ownerPhone)
                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                            : 'bg-rose-500/10 text-rose-500'
                        )}
                      >
                        {isValidPhoneNumber(closingConfig.ownerPhone) ? '✓ Valid Number' : '⚠️ Invalid Format'}
                      </span>
                    )}
                  </div>
                  <input
                    type="tel"
                    disabled={!isAdmin || !closingConfig.enabled}
                    value={closingConfig.ownerPhone}
                    onChange={(e) => handlePhoneChange(e.target.value)}
                    placeholder="e.g. +91 9876543210 or +971 50 1234567"
                    className="w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-xs text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none font-mono"
                  />
                  <p className="text-[10px] text-muted-foreground leading-normal">
                    Enter the owner&apos;s mobile number with country code (e.g. <code>+91</code> for India, <code>+971</code> for UAE).
                  </p>
                </div>
              </div>

              {/* Card 2: Dispatch Timing & Triggers */}
              <div
                className={clsx(
                  'p-6 rounded-2xl bg-muted/20 border border-border/80 space-y-4 transition-all',
                  !closingConfig.enabled && 'opacity-60'
                )}
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <Clock className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-black uppercase tracking-wider text-foreground">
                      Report Dispatch Timing
                    </h4>
                    <p className="text-[11px] text-muted-foreground">
                      Choose when reports are generated and sent to the owner
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    {
                      id: 'IMMEDIATELY',
                      label: 'On Settlement Close',
                      desc: 'Immediately after Cash Settlement closes',
                    },
                    {
                      id: 'SCHEDULED',
                      label: 'At Closing Time',
                      desc: 'At configured daily closing hour',
                    },
                    {
                      id: 'BOTH',
                      label: 'Both Triggers',
                      desc: 'On settlement & at scheduled time',
                    },
                  ].map((option) => {
                    const isSelected = closingConfig.sendTiming === option.id;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        disabled={!isAdmin || !closingConfig.enabled}
                        onClick={() => handleTimingChange(option.id as ShopClosingSendTiming)}
                        className={clsx(
                          'p-3.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between space-y-1',
                          isSelected
                            ? 'bg-primary/5 border-primary/40 ring-1 ring-primary/20'
                            : 'bg-card border-border/60 hover:border-border'
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-foreground">{option.label}</span>
                          <span
                            className={clsx(
                              'w-3.5 h-3.5 rounded-full border flex items-center justify-center',
                              isSelected ? 'border-primary bg-primary text-white' : 'border-muted-foreground/40'
                            )}
                          >
                            {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                          </span>
                        </div>
                        <p className="text-[10px] text-muted-foreground leading-snug">{option.desc}</p>
                      </button>
                    );
                  })}
                </div>

                {/* Scheduled Time Config */}
                {(closingConfig.sendTiming === 'SCHEDULED' || closingConfig.sendTiming === 'BOTH') && (
                  <div className="p-4 rounded-xl bg-card border border-border/60 flex items-center justify-between gap-4 animate-in fade-in duration-150">
                    <div className="space-y-0.5 text-left">
                      <span className="text-xs font-bold text-foreground block">Daily Scheduled Closing Time</span>
                      <span className="text-[10px] text-muted-foreground block">
                        Using store local timezone. Report checks automatically in the background.
                      </span>
                    </div>
                    <input
                      type="time"
                      disabled={!isAdmin || !closingConfig.enabled}
                      value={closingConfig.scheduledTime}
                      onChange={(e) => handleScheduledTimeChange(e.target.value)}
                      className="bg-background border border-border rounded-xl px-3 py-1.5 text-xs font-mono font-bold text-foreground focus:border-primary focus:outline-none"
                    />
                  </div>
                )}

                {/* Multi-counter Breakdown Option */}
                <div className="flex items-center justify-between p-4 rounded-xl bg-card border border-border/60">
                  <div className="space-y-0.5 pr-4 text-left">
                    <span className="text-xs font-bold text-foreground block flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-primary" />
                      Consolidate Multi-Counter Performance
                    </span>
                    <span className="text-[11px] text-muted-foreground block leading-snug">
                      When multiple counters/drawers operate, includes individual breakdown for each terminal.
                    </span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0 select-none">
                    <input
                      type="checkbox"
                      checked={closingConfig.includeMultiCounterBreakdown}
                      disabled={!isAdmin || !closingConfig.enabled}
                      onChange={(e) => handleMultiCounterToggle(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-muted/80 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary shadow-inner"></div>
                  </label>
                </div>
              </div>

              {/* Card 3: Customizable Information Checklist */}
              <div
                className={clsx(
                  'p-6 rounded-2xl bg-muted/20 border border-border/80 space-y-4 transition-all',
                  !closingConfig.enabled && 'opacity-60'
                )}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-border/60">
                  <div>
                    <h4 className="text-xs font-black uppercase tracking-wider text-foreground flex items-center gap-2">
                      <ListChecks className="w-4 h-4 text-primary" />
                      Information Checklist
                    </h4>
                    <p className="text-[11px] text-muted-foreground">
                      Select which metrics and sections the shop owner receives
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 self-start sm:self-auto">
                    <button
                      type="button"
                      disabled={!isAdmin || !closingConfig.enabled}
                      onClick={handleRestoreDefaultChecklist}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-card border border-border/80 hover:bg-muted text-foreground cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3 text-amber-500" />
                      Defaults
                    </button>
                    <button
                      type="button"
                      disabled={!isAdmin || !closingConfig.enabled}
                      onClick={handleSelectAllChecklist}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-card border border-border/80 hover:bg-muted text-foreground cursor-pointer"
                    >
                      <CheckSquare className="w-3 h-3 text-emerald-500" />
                      Select All
                    </button>
                    <button
                      type="button"
                      disabled={!isAdmin || !closingConfig.enabled}
                      onClick={handleClearAllChecklist}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-card border border-border/80 hover:bg-muted text-foreground cursor-pointer"
                    >
                      <Square className="w-3 h-3 text-muted-foreground" />
                      Clear
                    </button>
                  </div>
                </div>

                {/* Counter Tag */}
                <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1">
                  <span>Selected Checklist Items:</span>
                  <span className="font-bold text-foreground font-mono">
                    {selectedChecklistCount} of {totalChecklistCount} selected
                  </span>
                </div>

                {/* Categorized Checklist Items Grouped by Domain */}
                <div className="space-y-4 pt-1">
                  {[
                    {
                      groupId: 'core',
                      title: '1. General & Shift Information',
                      subtitle: 'Basic closing metadata, cashier, register status & terminal details',
                      keys: ['dateTime', 'closingStatus', 'counterDetails', 'closingStaff'] as (keyof ShopClosingChecklist)[],
                    },
                    {
                      groupId: 'sales',
                      title: '2. Sales Summary & Breakdown',
                      subtitle: 'Invoices count, net sales, pre-discount gross sales, discounts, and tax',
                      keys: ['invoices', 'sales'] as (keyof ShopClosingChecklist)[],
                      subItems: [
                        { key: 'grossSales' as keyof ShopClosingChecklist, parentKey: 'sales' as keyof ShopClosingChecklist },
                        { key: 'totalDiscount' as keyof ShopClosingChecklist, parentKey: 'sales' as keyof ShopClosingChecklist },
                        { key: 'taxCollected' as keyof ShopClosingChecklist, parentKey: 'sales' as keyof ShopClosingChecklist },
                      ],
                    },
                    {
                      groupId: 'payments',
                      title: '3. Payment Methods Breakdown',
                      subtitle: 'Select which payment modes to include or exclude in the closing summary',
                      keys: ['paymentMethods'] as (keyof ShopClosingChecklist)[],
                      subItems: [
                        { key: 'paymentCash' as keyof ShopClosingChecklist, parentKey: 'paymentMethods' as keyof ShopClosingChecklist },
                        { key: 'paymentUpi' as keyof ShopClosingChecklist, parentKey: 'paymentMethods' as keyof ShopClosingChecklist },
                        { key: 'paymentCard' as keyof ShopClosingChecklist, parentKey: 'paymentMethods' as keyof ShopClosingChecklist },
                        { key: 'paymentBank' as keyof ShopClosingChecklist, parentKey: 'paymentMethods' as keyof ShopClosingChecklist },
                        { key: 'paymentCheque' as keyof ShopClosingChecklist, parentKey: 'paymentMethods' as keyof ShopClosingChecklist },
                        { key: 'paymentCredit' as keyof ShopClosingChecklist, parentKey: 'paymentMethods' as keyof ShopClosingChecklist },
                      ],
                    },
                    {
                      groupId: 'cash',
                      title: '4. Cash Drawer, Cash Flow & Expenses',
                      subtitle: 'Drawer reconciliation, variance, cash-in entries and itemized store expenses',
                      keys: ['cashBalances', 'cashDifferences', 'cashInOut', 'cashInList', 'expenses', 'expensesList'] as (keyof ShopClosingChecklist)[],
                    },
                    {
                      groupId: 'ops',
                      title: '5. Credit, Ledger, Staff & Operations',
                      subtitle: 'Credit sales, ledger payments, party & staff lists, scrap, returns and supplier purchases',
                      keys: ['creditSales', 'customerPayments', 'partyTransactions', 'staffTransactions', 'scrap', 'returns', 'refunds', 'purchases'] as (keyof ShopClosingChecklist)[],
                    },
                  ].map((group) => {
                    return (
                      <div
                        key={group.groupId}
                        className="p-3.5 rounded-xl bg-card border border-border/70 space-y-3"
                      >
                        <div className="flex items-center justify-between border-b border-border/40 pb-2">
                          <div>
                            <span className="text-xs font-black uppercase tracking-wider text-foreground block">
                              {group.title}
                            </span>
                            <span className="text-[10px] text-muted-foreground block">
                              {group.subtitle}
                            </span>
                          </div>
                        </div>

                        {/* Primary Items Grid */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {group.keys.map((k) => {
                            const def = CHECKLIST_DEFINITIONS.find((d) => d.key === k);
                            if (!def) return null;
                            const isChecked = Boolean(closingConfig.checklist?.[k]);
                            const isMasterGroup = k === 'paymentMethods' || k === 'sales';

                            return (
                              <label
                                key={k}
                                className={clsx(
                                  'flex items-start gap-2.5 p-2.5 rounded-lg border text-left transition-all cursor-pointer select-none',
                                  isChecked
                                    ? isMasterGroup
                                      ? 'bg-primary/5 border-primary/40 ring-1 ring-primary/20'
                                      : 'bg-muted/30 border-border/80'
                                    : 'bg-muted/10 border-border/40 opacity-70'
                                )}
                              >
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  disabled={!isAdmin || !closingConfig.enabled}
                                  onChange={() => handleChecklistToggle(k)}
                                  className="mt-0.5 rounded border-border text-primary focus:ring-primary/20 h-4 w-4 shrink-0"
                                />
                                <div className="space-y-0.5">
                                  <span className="text-xs font-bold text-foreground block leading-tight flex items-center gap-1.5">
                                    {def.label}
                                    {isMasterGroup && (
                                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-primary/10 text-primary font-bold uppercase">
                                        Group
                                      </span>
                                    )}
                                  </span>
                                  <span className="text-[10px] text-muted-foreground block leading-tight">
                                    {def.description}
                                  </span>
                                </div>
                              </label>
                            );
                          })}
                        </div>

                        {/* Granular Sub-Items (Indented underneath parent group) */}
                        {group.subItems && group.subItems.length > 0 && (
                          <div className="pl-3.5 border-l-2 border-primary/30 mt-2 space-y-1.5">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                              Sub-Options (Include / Exclude individually):
                            </span>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {group.subItems.map((sub) => {
                                const def = CHECKLIST_DEFINITIONS.find((d) => d.key === sub.key);
                                if (!def) return null;
                                const isChecked = Boolean(closingConfig.checklist?.[sub.key]);
                                const parentChecked = Boolean(closingConfig.checklist?.[sub.parentKey]);

                                return (
                                  <label
                                    key={sub.key}
                                    className={clsx(
                                      'flex items-start gap-2 p-2 rounded-lg border text-left transition-all cursor-pointer select-none',
                                      !parentChecked && 'opacity-50',
                                      isChecked && parentChecked
                                        ? 'bg-background border-border shadow-2xs'
                                        : 'bg-muted/10 border-border/30 opacity-60'
                                    )}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      disabled={!isAdmin || !closingConfig.enabled}
                                      onChange={() => handleChecklistToggle(sub.key)}
                                      className="mt-0.5 rounded border-border text-primary focus:ring-primary/20 h-3.5 w-3.5 shrink-0"
                                    />
                                    <div className="space-y-0.5">
                                      <span className="text-[11px] font-semibold text-foreground block leading-tight">
                                        {def.label}
                                      </span>
                                      <span className="text-[9px] text-muted-foreground block leading-tight">
                                        {def.description}
                                      </span>
                                    </div>
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Right 5 Columns: WhatsApp Chat Live Preview & Actions */}
            <div className="lg:col-span-5 space-y-6">
              {/* Card: Live WhatsApp Preview */}
              <div className="p-6 rounded-2xl bg-muted/20 border border-border/80 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <WhatsAppIcon className="w-4 h-4 text-emerald-500 fill-current" />
                    <h4 className="text-xs font-black uppercase tracking-wider text-foreground">
                      Live Message Preview
                    </h4>
                  </div>
                  <span className="text-[10px] font-bold text-muted-foreground font-mono">
                    {previewLoading ? 'Updating...' : 'Real-time Preview'}
                  </span>
                </div>

                {/* WhatsApp Chat Bubble Mockup */}
                <div className="rounded-2xl bg-[#0b141a] dark:bg-[#0b141a] border border-border/80 overflow-hidden shadow-md text-white font-sans">
                  {/* WhatsApp Top Bar */}
                  <div className="bg-[#1f2c34] px-4 py-2.5 flex items-center justify-between border-b border-white/5">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-emerald-600 flex items-center justify-center font-bold text-xs text-white">
                        {shopName.charAt(0).toUpperCase()}
                      </div>
                      <div className="text-left">
                        <span className="text-xs font-bold text-white block leading-tight truncate max-w-[150px]">
                          {shopName}
                        </span>
                        <span className="text-[9px] text-emerald-400 block leading-tight">WhatsApp Business</span>
                      </div>
                    </div>
                    <span className="text-[10px] text-white/50 font-mono">
                      {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>

                  {/* Message Bubble Container */}
                  <div className="p-4 bg-[radial-gradient(#1f2c34_1px,transparent_1px)] [background-size:16px_16px] bg-[#0b141a] max-h-[460px] overflow-y-auto scrollbar-thin">
                    <div className="p-3.5 rounded-2xl rounded-tl-sm bg-[#005c4b] text-[#e9edef] text-[11px] leading-relaxed whitespace-pre-wrap font-sans shadow-sm border border-white/5">
                      {previewText || 'Configuring overview report...'}
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="space-y-2.5 pt-2">
                  <Button
                    onClick={handleSendTestReport}
                    disabled={sendingTest || !closingConfig.ownerPhone || status !== 'connected'}
                    className="w-full text-xs font-bold py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer shadow-sm flex items-center justify-center gap-2"
                  >
                    {sendingTest ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    {sendingTest ? 'Dispatching Test...' : 'Send Test Report to WhatsApp'}
                  </Button>

                  <Button
                    onClick={handleSaveClosingConfig}
                    disabled={savingClosing || !isAdmin}
                    variant="outline"
                    className="w-full text-xs font-bold py-2.5 rounded-xl border-border hover:bg-muted text-foreground cursor-pointer flex items-center justify-center gap-2"
                  >
                    {savingClosing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    {savingClosing ? 'Saving Changes...' : 'Save Closing Settings'}
                  </Button>
                </div>
              </div>

              {/* Card: Delivery History Log Accordion */}
              <div className="p-5 rounded-2xl bg-muted/20 border border-border/80 space-y-3">
                <button
                  type="button"
                  onClick={() => setShowHistory(!showHistory)}
                  className="w-full flex items-center justify-between text-left cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <History className="w-4 h-4 text-primary" />
                    <span className="text-xs font-bold text-foreground">Recent Report Deliveries</span>
                    {closingHistory.length > 0 && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                        {closingHistory.length}
                      </span>
                    )}
                  </div>
                  {showHistory ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                </button>

                {showHistory && (
                  <div className="space-y-2 pt-2 animate-in fade-in duration-150">
                    {loadingHistory ? (
                      <div className="p-4 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Loading delivery logs...
                      </div>
                    ) : closingHistory.length === 0 ? (
                      <p className="text-[11px] text-muted-foreground text-center py-4">
                        No closing reports sent yet. Trigger a test report or close daily cash settlement to record delivery logs.
                      </p>
                    ) : (
                      <div className="space-y-2 max-h-72 overflow-y-auto scrollbar-none pr-1">
                        {closingHistory.map((item) => (
                          <div
                            key={item.id}
                            className="p-3 rounded-xl bg-card border border-border/60 text-xs flex items-center justify-between gap-3"
                          >
                            <div className="space-y-0.5 text-left">
                              <div className="flex items-center gap-1.5">
                                <span
                                  className={clsx(
                                    'text-[9px] font-bold px-2 py-0.5 rounded-full',
                                    item.status === 'SENT'
                                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                      : item.status === 'FAILED'
                                      ? 'bg-rose-500/10 text-rose-500'
                                      : 'bg-blue-500/10 text-blue-500'
                                  )}
                                >
                                  {item.status}
                                </span>
                                <span className="text-[10px] text-muted-foreground font-mono">
                                  {item.trigger_type}
                                </span>
                              </div>
                              <div className="text-[10px] text-muted-foreground">
                                Date: <strong className="text-foreground">{item.business_date}</strong> &bull; To:{' '}
                                <span className="font-mono">{item.recipient_phone}</span>
                              </div>
                              {item.error_message && (
                                <p className="text-[10px] text-rose-500 truncate max-w-[200px]">
                                  {item.error_message}
                                </p>
                              )}
                            </div>

                            {item.status === 'FAILED' && (
                              <button
                                type="button"
                                disabled={retryingId === item.id}
                                onClick={() => handleRetryReport(item.id)}
                                className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-destructive/10 text-destructive hover:bg-destructive/20 cursor-pointer shrink-0 flex items-center gap-1"
                              >
                                {retryingId === item.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                                Retry
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Custom Disconnect Confirmation Dialog */}
      <Modal
        isOpen={showConfirmDisconnect}
        onClose={() => setShowConfirmDisconnect(false)}
        title="Disconnect WhatsApp"
        className="max-w-md rounded-[24px]"
      >
        <div className="space-y-4 py-2">
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-2xl bg-destructive/10 text-destructive flex items-center justify-center shrink-0">
              <PowerOff className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-foreground">Disconnect Linked Device?</h4>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Are you sure you want to disconnect WhatsApp number{' '}
                <span className="font-mono font-bold text-foreground">+{phone}</span>? Automated PDF bills, payment alerts, and daily closing overviews will pause until reconnected.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-border/60">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowConfirmDisconnect(false)}
              className="text-xs font-semibold px-4 rounded-xl cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDisconnect}
              disabled={loading}
              className="text-xs font-bold px-4 rounded-xl cursor-pointer"
            >
              <PowerOff className="w-3.5 h-3.5 mr-1.5" />
              {loading ? 'Disconnecting...' : 'Yes, Disconnect'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Floating Toast Notification */}
      <FloatToast message={msg} onClose={() => setMsg(null)} duration={3500} />
    </div>
  );
};