import { useState, useEffect } from 'react';
import { 
  AlertTriangle, Shield, Key, Zap, CheckCircle2, Lock, 
  RotateCcw, MousePointerClick, RefreshCw, AlertOctagon, Terminal
} from 'lucide-react';
import { 
  DEFAULT_EMERGENCY_PANIC_CONFIG, 
  EMERGENCY_PANIC_CONFIG_KEY, 
  parseEmergencyPanicConfig, 
  type EmergencyPanicConfig,
  type EmergencyWipeCommand
} from '../../utils/emergencyPurge';
import { emergencyCloud } from '../../data/cloud/emergency';
import { useAuthStore } from '../../store/authStore';
import { hasBridge } from '../../data/client';
import { settingsApi } from '../../data/settings';

const HOTKEY_OPTIONS = [
  { value: 'Ctrl+Alt+Shift+X', label: 'Ctrl + Alt + Shift + X (Recommended)' },
  { value: 'Ctrl+Alt+Shift+Z', label: 'Ctrl + Alt + Shift + Z' },
  { value: 'Ctrl+Alt+Shift+Delete', label: 'Ctrl + Alt + Shift + Delete' },
  { value: 'Ctrl+Shift+F12', label: 'Ctrl + Shift + F12' },
  { value: 'Alt+Shift+Q', label: 'Alt + Shift + Q' },
];

export interface EmergencyPurgeSettingsProps {
  config?: EmergencyPanicConfig;
  onChange?: (config: EmergencyPanicConfig) => void;
}

export function EmergencyPurgeSettings({ config: propConfig, onChange: propOnChange }: EmergencyPurgeSettingsProps = {}) {
  const { tenantId } = useAuthStore();
  const [internalConfig, setInternalConfig] = useState<EmergencyPanicConfig>(DEFAULT_EMERGENCY_PANIC_CONFIG);
  const [terminalCode, setTerminalCode] = useState<string>('POS1');
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const isControlled = propConfig !== undefined && propOnChange !== undefined;
  const config = isControlled ? propConfig : internalConfig;

  const setConfig = (newCfg: EmergencyPanicConfig | ((prev: EmergencyPanicConfig) => EmergencyPanicConfig)) => {
    if (isControlled) {
      const next = typeof newCfg === 'function' ? newCfg(propConfig) : newCfg;
      propOnChange(next);
    } else {
      setInternalConfig(newCfg);
    }
  };

  // Remote wipe state
  const [showRemoteWipeModal, setShowRemoteWipeModal] = useState(false);
  const [remoteWipeConfirmText, setRemoteWipeConfirmText] = useState('');
  const [remoteWipePassword, setRemoteWipePassword] = useState('');
  const [remoteWipeError, setRemoteWipeError] = useState('');
  const [remoteWipeTarget, setRemoteWipeTarget] = useState<'ALL' | string>('ALL');
  const [sendingWipeSignal, setSendingWipeSignal] = useState(false);
  const [wipeSignalSent, setWipeSignalSent] = useState(false);

  useEffect(() => {
    if (hasBridge('settingsGet')) {
      if (!isControlled) {
        settingsApi.get({ tenant_id: tenantId || 'global', key: EMERGENCY_PANIC_CONFIG_KEY })
          .then((val: unknown) => {
            if (val) setInternalConfig(parseEmergencyPanicConfig(val));
          })
          .catch(() => {});
      }

      settingsApi.get({ tenant_id: 'global', key: 'terminal_code' })
        .then((tc: unknown) => {
          if (tc) setTerminalCode(String(tc).trim());
        })
        .catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- isControlled only determines whether internalConfig is parent-owned; switching ownership should not refetch terminal_code or mutate hidden config.
  }, [tenantId]);

  const handleSaveConfig = async () => {
    if (!hasBridge('settingsSet')) return;
    setSaving(true);
    setSaveSuccess(false);

    try {
      const updatedConfig: EmergencyPanicConfig = {
        ...config,
        updated_at: new Date().toISOString(),
      };

      await settingsApi.set({
        tenant_id: tenantId || 'global',
        key: EMERGENCY_PANIC_CONFIG_KEY,
        value: updatedConfig,
      });

      setConfig(updatedConfig);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      try {
        window.dispatchEvent(new CustomEvent('settings:updated'));
      } catch { /* ignore */ }
    } catch (err) {
      console.error('[EmergencyPurgeSettings] Failed to save config:', err);
    } finally {
      setSaving(false);
    }
  };

  /** Issues the wipe on the server (owner + password re-entry); terminals pick it up on their next cloud sync. */
  const handleSendRemoteWipe = async () => {
    if (remoteWipeConfirmText.toUpperCase() !== 'RESET' || !remoteWipePassword) return;
    setSendingWipeSignal(true);
    setRemoteWipeError('');
    try {
      const command = (await emergencyCloud.issueWipeCommand({
        password: remoteWipePassword, target_terminal: remoteWipeTarget, wipe_mode: config.wipe_mode,
      })) as EmergencyWipeCommand;
      console.warn(`[EmergencyPurgeSettings] Wipe command ${command.command_id} issued for ${command.target_terminal}`);
      setWipeSignalSent(true);
      setShowRemoteWipeModal(false);
      setRemoteWipeConfirmText('');
      setRemoteWipePassword('');
      setTimeout(() => setWipeSignalSent(false), 5000);
    } catch (err) {
      setRemoteWipeError(err instanceof Error ? err.message : 'Could not issue the wipe command');
    } finally {
      setSendingWipeSignal(false);
    }
  };

  return (
    <div className="w-full space-y-6 animate-in fade-in duration-300 pb-10">
      {/* Header Banner */}
      <div className="p-5 md:p-6 rounded-[24px] bg-gradient-to-r from-rose-500/10 via-amber-500/5 to-rose-500/10 border border-rose-500/20">
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-2xl bg-rose-500/15 text-rose-500 border border-rose-500/25 shrink-0">
            <AlertOctagon className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-bold text-foreground">Emergency Reset & Kill Switch</h2>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                config.enabled 
                  ? 'bg-rose-500/15 text-rose-500 border border-rose-500/30' 
                  : 'bg-muted text-muted-foreground'
              }`}>
                {config.enabled ? 'Armed / Active' : 'Disabled'}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Protects a lost, stolen or compromised terminal by wiping its local data. Clears local sales records and cache on this terminal immediately while your central cloud records remain 100% safe and intact.
            </p>
          </div>
        </div>
      </div>

      {wipeSignalSent && (
        <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 flex items-center gap-3 text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          <span className="text-xs font-semibold">
            Emergency remote wipe signal sent successfully! The target terminal's local database will be cleared on the next sync cycle.
          </span>
        </div>
      )}

      {/* SECTION 1: REMOTE DEVICE WIPE */}
      <div className="p-6 rounded-[24px] bg-card border border-border shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-border/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-500">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">1. Remote Device Wipe</h3>
              <p className="text-xs text-muted-foreground">Trigger a remote database wipe on this terminal from your mobile phone or another computer.</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs font-mono bg-muted/60 px-2.5 py-1 rounded-xl border border-border">
            <Terminal className="w-3.5 h-3.5 text-muted-foreground" />
            <span>Terminal: {terminalCode}</span>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-amber-500/5 border border-amber-500/20 text-xs text-muted-foreground space-y-2">
          <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 font-semibold">
            <Shield className="w-4 h-4" />
            <span>Cloud Safety Guarantee</span>
          </div>
          <p>
            When an emergency wipe is triggered, only local SQLite database bills, sales cache, and active sessions on this computer are cleared. Your master cloud records, account details, and historical data remain completely safe and protected on the central cloud.
          </p>
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={() => setShowRemoteWipeModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-colors shadow-xs cursor-pointer active:scale-95"
          >
            <AlertTriangle className="w-4 h-4" />
            Send Remote Wipe Signal
          </button>
        </div>
      </div>

      {/* SECTION 2: LOCAL PANIC HOTKEY & MULTI-CLICK */}
      <div className="p-6 rounded-[24px] bg-card border border-border shadow-xs space-y-5">
        <div className="flex items-center justify-between pb-3 border-b border-border/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-rose-500/10 text-rose-500">
              <Key className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">2. On-Site Panic Triggers</h3>
              <p className="text-xs text-muted-foreground">On-device shortcut that opens the administrator confirmation for a local wipe, even without internet.</p>
            </div>
          </div>

          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={config.enabled}
              onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-muted peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-rose-600"></div>
          </label>
        </div>

        <div className={`space-y-4 transition-opacity ${config.enabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
          {/* Hotkey Combination */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-foreground flex items-center gap-2">
                <Key className="w-3.5 h-3.5 text-muted-foreground" />
                Panic Hotkey Combination
              </label>
              <select
                value={config.hotkey_combination}
                onChange={(e) => setConfig({ ...config, hotkey_combination: e.target.value })}
                className="w-full h-10 px-3 rounded-xl bg-background border border-border text-xs font-medium focus:ring-2 focus:ring-primary/20 outline-hidden"
              >
                {HOTKEY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <p className="text-[11px] text-muted-foreground">Pressing this key combination immediately wipes local data and triggers the purge protocol.</p>
            </div>

            {/* Multi-Click Gesture */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-foreground flex items-center gap-2">
                <MousePointerClick className="w-3.5 h-3.5 text-muted-foreground" />
                Multi-Click Gesture
              </label>
              <div className="h-10 px-3 rounded-xl bg-background border border-border flex items-center justify-between">
                <span className="text-xs font-medium text-foreground">Rapid 5-clicks on Shop Logo</span>
                <input
                  type="checkbox"
                  checked={config.click_gesture_enabled}
                  onChange={(e) => setConfig({ ...config, click_gesture_enabled: e.target.checked })}
                  className="rounded text-rose-600 focus:ring-rose-500 w-4 h-4 cursor-pointer"
                />
              </div>
              <p className="text-[11px] text-muted-foreground">Without touching the keyboard, quickly clicking the shop logo 5 times triggers the reset protocol.</p>
            </div>
          </div>

          {/* Wipe Scope Mode */}
          <div className="p-3.5 rounded-2xl bg-muted/40 border border-border space-y-2">
            <label className="text-xs font-bold text-foreground block">Wipe Scope (Select data to purge)</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className={`p-3 rounded-xl border cursor-pointer flex items-start gap-3 transition-colors ${
                config.wipe_mode === 'ALL_DATA'
                  ? 'bg-rose-500/10 border-rose-500/40 text-foreground'
                  : 'bg-card border-border/70 hover:bg-muted/60 text-muted-foreground'
              }`}>
                <input
                  type="radio"
                  name="wipe_mode"
                  checked={config.wipe_mode === 'ALL_DATA'}
                  onChange={() => setConfig({ ...config, wipe_mode: 'ALL_DATA' })}
                  className="mt-0.5 text-rose-600 focus:ring-rose-500 cursor-pointer"
                />
                <div className="text-xs">
                  <div className="font-bold text-foreground">Full Factory Reset (Recommended)</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">Clears all local sales, cache, and active sessions, returning the terminal to a fresh login screen.</div>
                </div>
              </label>

              <label className={`p-3 rounded-xl border cursor-pointer flex items-start gap-3 transition-colors ${
                config.wipe_mode === 'SALES_AND_CASH_ONLY'
                  ? 'bg-amber-500/10 border-amber-500/40 text-foreground'
                  : 'bg-card border-border/70 hover:bg-muted/60 text-muted-foreground'
              }`}>
                <input
                  type="radio"
                  name="wipe_mode"
                  checked={config.wipe_mode === 'SALES_AND_CASH_ONLY'}
                  onChange={() => setConfig({ ...config, wipe_mode: 'SALES_AND_CASH_ONLY' })}
                  className="mt-0.5 text-amber-600 focus:ring-amber-500 cursor-pointer"
                />
                <div className="text-xs">
                  <div className="font-bold text-foreground">Sales & Cash History Only</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">Purges invoice transactions, sales entries, and cash register ledger history only.</div>
                </div>
              </label>
            </div>
          </div>

          {/* Confirmation is mandatory */}
          <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-background border border-border">
            <Lock className="w-4 h-4 text-rose-500 shrink-0" />
            <div className="text-[11px] text-muted-foreground">
              Every wipe asks for an administrator email and password and is recorded in this terminal's audit log
              (<span className="font-mono">emergency-purge-audit.jsonl</span>). The hotkey or gesture only opens that confirmation.
            </div>
          </div>
        </div>

        {!isControlled && (
          <div className="flex items-center justify-between pt-3 border-t border-border/60">
            <div className="flex items-center gap-2 text-xs">
              {saveSuccess && (
                <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-semibold animate-in fade-in">
                  <CheckCircle2 className="w-4 h-4" /> Settings saved successfully!
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={handleSaveConfig}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold transition-all shadow-xs disabled:opacity-50 cursor-pointer active:scale-95"
            >
              {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
              Save Panic Settings
            </button>
          </div>
        )}
      </div>

      {/* SECTION 3: RESTORATION GUIDE */}
      <div className="p-6 rounded-[24px] bg-card border border-border shadow-xs space-y-3">
        <div className="flex items-center gap-2 text-foreground font-bold text-sm">
          <RotateCcw className="w-4 h-4 text-emerald-500" />
          <span>How to Restore Data After an Emergency?</span>
        </div>
        <ol className="text-xs text-muted-foreground space-y-2 list-decimal list-inside leading-relaxed">
          <li>Once the device is back under your control, reopen the application on this terminal.</li>
          <li>Log in normally using your Owner username and password.</li>
          <li>Navigate to <strong>Settings &rarr; Network & Sync</strong> and click <strong>"Full Resync from Cloud"</strong>.</li>
          <li>Within seconds, all your catalog products, customer ledgers, and invoice records will be restored from the cloud.</li>
        </ol>
      </div>

      {/* CONFIRMATION MODAL FOR REMOTE WIPE */}
      {showRemoteWipeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-card w-full max-w-md rounded-2xl border border-rose-500/30 p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-base text-foreground">Confirm Remote Emergency Wipe</h3>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
              Sending this command will immediately purge the local database on the target terminal and log out active sessions. Your central cloud data remains 100% safe.
            </p>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Target Terminal:</label>
              <select
                value={remoteWipeTarget}
                onChange={(e) => setRemoteWipeTarget(e.target.value)}
                className="w-full h-9 px-3 rounded-lg bg-background border border-border text-xs"
              >
                <option value="ALL">All Online Terminals</option>
                <option value={terminalCode}>This Terminal ({terminalCode})</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Your account password:</label>
              <input
                type="password"
                value={remoteWipePassword}
                onChange={(e) => setRemoteWipePassword(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-border bg-background text-xs"
                aria-label="Owner password"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                To confirm, type <span className="text-rose-500 font-bold">RESET</span> below:
              </label>
              <input
                type="text"
                placeholder="Type RESET"
                value={remoteWipeConfirmText}
                onChange={(e) => setRemoteWipeConfirmText(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-border bg-background text-xs font-mono font-bold tracking-wider uppercase text-center"
              />
            </div>

            {remoteWipeError && <p className="text-[11px] text-rose-500 font-medium">{remoteWipeError}</p>}

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowRemoteWipeModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-medium border border-border hover:bg-muted text-muted-foreground cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={remoteWipeConfirmText.toUpperCase() !== 'RESET' || !remoteWipePassword || sendingWipeSignal}
                onClick={handleSendRemoteWipe}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold disabled:opacity-40 transition-colors shadow-xs cursor-pointer"
              >
                {sendingWipeSignal ? 'Sending...' : 'Confirm & Wipe Local DB'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
