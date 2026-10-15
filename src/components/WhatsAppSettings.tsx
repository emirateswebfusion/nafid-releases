import React, { useState, useEffect } from 'react';
import {
  QrCode,
  Smartphone,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  PowerOff,
  ShieldCheck,
  Loader2,
  WifiSync,
  BookOpen,
  Check,
  Settings,
  Sparkles
} from 'lucide-react';
import clsx from 'clsx';
import { Button } from './ui/Button';
import { Modal } from './ui/Modal';
import { FloatToast } from './ui/FloatToast';
import { WhatsAppIcon } from './ui/WhatsAppIcon';

type WhatsAppStatus = 'disconnected' | 'connecting' | 'syncing' | 'connected';

interface WhatsAppSettingsProps {
  tenantId?: string;
  autoSendEnabled: boolean;
  onAutoSendChange: (val: boolean) => void;
  activeTab?: 'qr' | 'settings' | 'device';
  defaultTab?: 'device' | 'settings' | 'qr' | string;
  onTabChange?: (tab: 'qr' | 'settings') => void;
}

export const WhatsAppSettings: React.FC<WhatsAppSettingsProps> = ({
  tenantId,
  autoSendEnabled,
  onAutoSendChange,
  activeTab: controlledTab,
  defaultTab,
  onTabChange,
}) => {
  const initialTab = (defaultTab === 'settings' ? 'settings' : 'qr') as 'qr' | 'settings';
  const [internalTab, setInternalTab] = useState<'qr' | 'settings'>(initialTab);
  const currentTab = controlledTab || internalTab;

  const handleTabSelect = (tab: 'qr' | 'settings') => {
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
  const [shopName, setShopName] = useState<string>('My Store');
  const [showConfirmDisconnect, setShowConfirmDisconnect] = useState<boolean>(false);

  useEffect(() => {
    // Initial status check
    if (window.electronAPI?.whatsappGetStatus) {
      window.electronAPI
        .whatsappGetStatus()
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
    if (window.electronAPI?.onWhatsAppStatusUpdate) {
      const unsubscribe = window.electronAPI.onWhatsAppStatusUpdate((data) => {
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
    if (window.electronAPI?.settingsGet) {
      Promise.all([
        window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'ledger_whatsapp_enabled' }),
        window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'ledger_whatsapp_include_shop' }),
        window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'shop_name' }),
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
  }, [tenantId]);

  const handleToggleLedgerAlerts = async (enabled: boolean) => {
    setLedgerAlertsEnabled(enabled);
    try {
      if (window.electronAPI?.settingsSet) {
        await window.electronAPI.settingsSet({
          tenant_id: tenantId || 'global',
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
      if (window.electronAPI?.settingsSet) {
        await window.electronAPI.settingsSet({
          tenant_id: tenantId || 'global',
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
      const res = await window.electronAPI.whatsappConnect();
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
      await window.electronAPI.whatsappDisconnect();
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

  return (
    <div className="w-full space-y-6">
      {/* Header bar matching other settings sections */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-border">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center font-bold shrink-0 border border-emerald-500/20 shadow-xs">
            <WhatsAppIcon className="w-6 h-6 text-emerald-500 fill-current" />
          </div>
          <div>
            <h3 className="text-sm font-black uppercase tracking-wider text-foreground">
              {currentTab === 'qr' ? 'WhatsApp Device Connection' : 'WhatsApp Automation & Alerts'}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {currentTab === 'qr'
                ? 'Scan the QR code to link your shop phone for automated invoice & ledger messaging'
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

      {/* ─── TAB 1: QR CODE / DEVICE CONNECTION (DYNAMIC FULL-WIDTH) ─────────── */}
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
                    Invoices, bill PDFs, and party ledger alerts are actively sent from this number.
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
                      <Sparkles className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      <span>Instant High-Res PDF invoice dispatch on checkout</span>
                    </div>
                    <div className="flex items-center gap-2.5 text-xs text-foreground/90 font-medium">
                      <Sparkles className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      <span>Automated ledger transaction debit/credit notifications</span>
                    </div>
                    <div className="flex items-center gap-2.5 text-xs text-foreground/90 font-medium">
                      <Sparkles className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      <span>One-click statement sharing directly from Party Ledger</span>
                    </div>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-card border border-border/60 text-xs text-muted-foreground flex items-center justify-between">
                  <span>Want to change notification rules?</span>
                  <button
                    type="button"
                    onClick={() => handleTabSelect('settings')}
                    className="text-xs font-bold text-primary hover:underline cursor-pointer"
                  >
                    Open Settings &rarr;
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
              <div className="flex items-center justify-center gap-2 text-xs text-blue-500 font-semibold pt-1">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Finalizing connection&hellip;</span>
              </div>
            </div>
          ) : qrCode ? (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center p-6 md:p-8 rounded-2xl bg-muted/20 border border-border/80 w-full">
              {/* QR Code Container */}
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

              {/* Instructions */}
              <div className="lg:col-span-7 space-y-5 text-left">
                <div className="space-y-1">
                  <h4 className="text-base font-bold text-foreground">Scan with WhatsApp on your Phone</h4>
                  <p className="text-xs text-muted-foreground">
                    Connect your mobile phone to enable automated PDF bills and instant ledger alerts.
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

                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  🔒 <strong>Direct &amp; Private:</strong> Messages are sent directly through your phone session. No phone numbers or bill contents are uploaded to third-party marketing servers.
                </p>
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
                  Send high-resolution digital invoice PDFs, credit reminders, and ledger transaction alerts without third-party messaging costs.
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

      {/* ─── TAB 2: SETTINGS (DYNAMIC FULL-WIDTH 2-COLUMN GRID) ─────────────── */}
      {currentTab === 'settings' && (
        <div className="w-full space-y-6 animate-in fade-in duration-200">
          {/* Connection status banner if not connected */}
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

          {/* Dynamic 2-column layout filling width like other settings */}
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

              {/* Toggle Auto Send */}
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

              {/* What customer receives */}
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

              {/* Master Toggle: Enable / Disable Ledger Alerts */}
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

              {/* Sub-Option: Include Shop Name */}
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

              {/* Live Message Preview */}
              <div className="p-4 rounded-xl bg-card border border-border/60 space-y-2">
                <span className="text-[11px] font-bold text-foreground block">Message Format Preview:</span>
                <div className="p-3 rounded-lg bg-background border border-border/80 font-mono text-[11px] text-foreground leading-relaxed whitespace-pre shadow-inner">
{includeShopName ? `OB    ₹ 0/-
Bank  ₹ 15000/-
Bal   ₹ 15000/-

— *${shopName}*` : `OB    ₹ 0/-
Bank  ₹ 15000/-
Bal   ₹ 15000/-`}
                </div>
                <div className="text-[10px] text-muted-foreground space-y-0.5 pt-1">
                  <p>• <strong>Aligned Layout:</strong> Amounts align in a uniform column.</p>
                  <p>• <strong>Payment Method:</strong> Bank, Cash, UPI, Card, Cheque format dynamically.</p>
                </div>
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
                <span className="font-mono font-bold text-foreground">+{phone}</span>? Automated PDF bills and payment alerts will pause until reconnected.
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