import { useState, useEffect, useCallback } from 'react';
import {
  Calendar,
  Lock,
  Unlock,
  CheckCircle2,
  Hash,
  Shield,
  ArrowRight,
} from 'lucide-react';
import clsx from 'clsx';
import {
  getCurrentFinancialYear,
  getAvailableFinancialYears,
  parseFinancialYearsConfig,
  type FinancialYearsConfig,
  FINANCIAL_YEARS_CONFIG_KEY,
} from '../../utils/time/financialYear';
import { ConfirmFinancialYearModal } from './ConfirmFinancialYearModal';
import { settingsApi } from '../../data/settings';
import { hasBridge } from '../../data/client';
import { FloatToast, type ToastMessage } from '../ui/FloatToast';
import { useSettingsSectionSave } from './hooks/useSettingsSectionSave';

export interface FinancialYearSettingsProps {
  tenantId: string | null;
  terminalCode?: string;
}

export function FinancialYearSettings({ tenantId, terminalCode = 'POS1' }: FinancialYearSettingsProps) {
  const [config, setConfig] = useState<FinancialYearsConfig>(() => parseFinancialYearsConfig(null));
  const [savedConfig, setSavedConfig] = useState<FinancialYearsConfig>(() => parseFinancialYearsConfig(null));
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState<boolean>(false);
  const [resolvedTerminalCode, setResolvedTerminalCode] = useState<string>(terminalCode);
  const [invoicePrefix, setInvoicePrefix] = useState<string>('');
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const loadData = useCallback(async () => {
    if (!hasBridge('settingsGet')) return;
    try {
      const tenant = tenantId || 'global';
      const raw = await settingsApi.get({ tenant_id: tenant, key: FINANCIAL_YEARS_CONFIG_KEY });
      const parsed = parseFinancialYearsConfig(raw);
      setConfig(parsed);
      setSavedConfig(parsed);
      setReady(true);

      const tc = await settingsApi.get({ tenant_id: 'global', key: 'terminal_code' });
      if (tc) {
        const clean = String(tc).replace(/[^A-Z0-9]/gi, '').toUpperCase();
        if (clean) setResolvedTerminalCode(clean);
      }

      const invConfig = await settingsApi.get({ tenant_id: 'global', key: 'invoice_counter_config' });
      if (invConfig && typeof invConfig === 'object' && 'prefix' in (invConfig as Record<string, unknown>)) {
        setInvoicePrefix(String((invConfig as Record<string, unknown>).prefix || ''));
      }
    } catch (err) {
      console.error('[FinancialYearSettings] load error', err);
    }
  }, [tenantId]);

  useEffect(() => {
    let active = true;
    const execute = async () => {
      if (active) await loadData();
    };
    void execute();

    const handleUpdated = () => {
      if (active) void loadData();
    };
    window.addEventListener('settings:updated', handleUpdated);
    window.addEventListener('financial-year:updated', handleUpdated);
    return () => {
      active = false;
      window.removeEventListener('settings:updated', handleUpdated);
      window.removeEventListener('financial-year:updated', handleUpdated);
    };
  }, [loadData]);

  const currentFy = getCurrentFinancialYear();
  const availableFys = getAvailableFinancialYears(3, 1);
  const activeYearId = config.activeYearId || currentFy.id;

  const saveDraft = useCallback(async () => {
    setSaving(true);
    try {
      await settingsApi.set({
        tenant_id: tenantId || 'global',
        key: FINANCIAL_YEARS_CONFIG_KEY,
        value: JSON.stringify(config),
      });
      setSavedConfig(config);
      setToast({ text: 'Financial year settings saved.', type: 'success' });
      window.dispatchEvent(new CustomEvent('financial-year:updated'));
    } catch (err) {
      setToast({ text: 'Could not save financial year settings. Please retry.', type: 'error' });
      throw err;
    } finally {
      setSaving(false);
    }
  }, [config, tenantId]);

  const dirty = JSON.stringify(config) !== JSON.stringify(savedConfig);
  useSettingsSectionSave(ready && dirty, saveDraft);

  const toggleYearLock = (fyId: string) => {
    const isCurrentlyLocked = config.lockedYearIds.includes(fyId);
    let newLockedIds: string[];
    if (isCurrentlyLocked) {
      newLockedIds = config.lockedYearIds.filter((id) => id !== fyId);
    } else {
      newLockedIds = [...config.lockedYearIds, fyId];
    }

    const newConfig: FinancialYearsConfig = {
      ...config,
      lockedYearIds: newLockedIds,
      updatedAt: new Date().toISOString(),
    };
    setConfig(newConfig);
  };

  const toggleLockPriorYears = (val: boolean) => {
    const newConfig: FinancialYearsConfig = {
      ...config,
      lockPriorYears: val,
      updatedAt: new Date().toISOString(),
    };
    setConfig(newConfig);
  };

  return (
    <fieldset disabled={!ready || saving} className="space-y-6 animate-in fade-in duration-300 w-full pb-12 relative border-0 p-0 m-0 min-w-0">
      {/* Card 1: Active Financial Year Banner */}
      <div className="bg-card border border-border rounded-[28px] p-6 md:p-8 shadow-sm">
        <div className="flex items-center justify-between pb-4 mb-6 border-b border-border/80">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest block">
                Active Financial Year
              </span>
              <h3 className="text-lg font-black text-foreground mt-0.5">
                {currentFy.label}
              </h3>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-full text-xs font-black bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" /> LIVE BILLING
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-2xl bg-muted/30 border border-border/60">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">
              Start Date
            </span>
            <span className="text-sm font-mono font-bold text-foreground">
              {currentFy.startDate}
            </span>
          </div>

          <div className="p-4 rounded-2xl bg-muted/30 border border-border/60">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">
              End Date
            </span>
            <span className="text-sm font-mono font-bold text-foreground">
              {currentFy.endDate}
            </span>
          </div>

          <div className="p-4 rounded-2xl bg-muted/30 border border-border/60">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">
              Active Invoice Prefix
            </span>
            <span className="text-sm font-mono font-bold text-primary flex items-center gap-1.5">
              <Hash className="w-3.5 h-3.5" />
              {invoicePrefix || `${resolvedTerminalCode}-`}
            </span>
          </div>
        </div>
      </div>

      {/* Card 2: Year-End Rollover Wizard Trigger */}
      <div className="bg-gradient-to-br from-card via-card to-primary/[0.03] border border-primary/20 rounded-[28px] p-6 md:p-8 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-xs font-black text-primary uppercase tracking-widest">
                Year-End Closing Wizard
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                Annual Process
              </span>
            </div>
            <h4 className="text-base font-bold text-foreground">
              Transition to New Financial Year
            </h4>
            <p className="text-xs text-muted-foreground max-w-xl leading-relaxed">
              Carries forward all ledger balances and inventory stock into the upcoming financial year,
              locks the previous audit period, and resets invoice counters back to 001 under the new year sequence.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowConfirmModal(true)}
            className="px-5 py-3 rounded-2xl bg-primary text-primary-foreground font-bold text-xs hover:bg-primary/90 shadow-md hover:shadow-lg transition-all duration-200 active:scale-95 shrink-0 flex items-center gap-2 cursor-pointer self-start md:self-auto"
          >
            <span>Start New Financial Year</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Card 3: Audit Period Protection & All Financial Years List */}
      <div className="bg-card border border-border rounded-[28px] p-6 md:p-8 shadow-sm space-y-6">
        <div className="flex items-center justify-between pb-4 border-b border-border/80">
          <div>
            <span className="text-xs font-black text-foreground uppercase tracking-widest block">
              Audit Period Protection
            </span>
            <p className="text-xs text-muted-foreground mt-0.5">
              Control whether past financial years can be modified or remain locked for audit integrity.
            </p>
          </div>

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={config.lockPriorYears}
              onChange={(e) => toggleLockPriorYears(e.target.checked)}
              className="rounded border-border text-primary focus:ring-primary w-4 h-4"
            />
            <span className="text-xs font-bold text-foreground">
              Auto-lock prior years
            </span>
          </label>
        </div>

        {/* Financial Years Table */}
        <div className="space-y-3">
          <h5 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
            Financial Year Records
          </h5>

          <div className="divide-y divide-border/60 border border-border/80 rounded-2xl overflow-hidden bg-background/50">
            {availableFys.map((fy) => {
              const isActive = fy.id === activeYearId;
              const isLocked = config.lockedYearIds.includes(fy.id) || (config.lockPriorYears && fy.endDate < currentFy.startDate);

              return (
                <div
                  key={fy.id}
                  className="p-4 flex items-center justify-between gap-4 hover:bg-muted/20 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className={clsx(
                      'p-2 rounded-xl shrink-0',
                      isActive ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-muted text-muted-foreground'
                    )}>
                      <Calendar className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-foreground">{fy.label}</span>
                        {isActive && (
                          <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                            CURRENT
                          </span>
                        )}
                        {isLocked && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400 flex items-center gap-1">
                            <Lock className="w-2.5 h-2.5" /> LOCKED
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground font-mono mt-0.5">
                        {fy.startDate} to {fy.endDate}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {!isActive && (
                      <button
                        type="button"
                        onClick={() => toggleYearLock(fy.id)}
                        className={clsx(
                          'px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors flex items-center gap-1.5 cursor-pointer',
                          isLocked
                            ? 'border-amber-500/30 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10'
                            : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground'
                        )}
                        title={isLocked ? 'Click to unlock this year' : 'Click to lock this year'}
                      >
                        {isLocked ? (
                          <>
                            <Unlock className="w-3.5 h-3.5" /> Unlock
                          </>
                        ) : (
                          <>
                            <Lock className="w-3.5 h-3.5" /> Lock
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-muted/40 border border-border/60 text-xs text-muted-foreground flex items-center gap-2.5">
          <Shield className="w-4 h-4 text-primary shrink-0" />
          <span>
            Locked years prevent modifying or deleting historical invoices, protecting accounts during tax filing and audits.
          </span>
        </div>
      </div>

      {/* Confirmation Modal */}
      <ConfirmFinancialYearModal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        terminalCode={resolvedTerminalCode}
        tenantId={tenantId}
        currentConfig={config}
        onSuccess={(msg) => {
          void loadData();
          if (msg) setToast({ text: msg, type: 'success' });
        }}
        onError={(errMsg) => setToast({ text: errMsg, type: 'error' })}
      />

      {/* FloatToast */}
      <FloatToast message={toast} onClose={() => setToast(null)} />
    </fieldset>
  );
}
