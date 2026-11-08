import { useState } from 'react';
import { Calendar, ArrowRight, CheckCircle2, Shield, Lock, X } from 'lucide-react';
import {
  getCurrentFinancialYear,
  getNextFinancialYear,
  generateSuggestedPrefix,
  type FinancialYear,
  type FinancialYearsConfig,
  FINANCIAL_YEARS_CONFIG_KEY,
} from '../../utils/time/financialYear';
import { Input } from '../ui/Input';
import { settingsApi } from '../../data/settings';

export interface ConfirmFinancialYearModalProps {
  isOpen: boolean;
  onClose: () => void;
  terminalCode: string;
  tenantId: string | null;
  currentConfig: FinancialYearsConfig;
  onSuccess: (msg?: string) => void;
  onError?: (msg: string) => void;
}

export function ConfirmFinancialYearModal({
  isOpen,
  onClose,
  terminalCode,
  tenantId,
  currentConfig,
  onSuccess,
  onError,
}: ConfirmFinancialYearModalProps) {
  const currentFy: FinancialYear = getCurrentFinancialYear();
  const nextFy: FinancialYear = getNextFinancialYear(currentFy);

  const defaultNewPrefix = generateSuggestedPrefix(nextFy, terminalCode);
  const [newPrefix, setNewPrefix] = useState<string>(defaultNewPrefix);
  const [lockOldYear, setLockOldYear] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    setIsSubmitting(true);
    try {
      const tenant = tenantId || 'global';

      // 1. Prepare updated FY config
      const updatedLockedIds = new Set(currentConfig.lockedYearIds);
      if (lockOldYear) {
        updatedLockedIds.add(currentFy.id);
      }

      const newConfig: FinancialYearsConfig = {
        activeYearId: nextFy.id,
        lockPriorYears: true,
        lockedYearIds: Array.from(updatedLockedIds),
        updatedAt: new Date().toISOString(),
      };

      // 2. Save FY config
      await settingsApi.set({
        tenant_id: tenant,
        key: FINANCIAL_YEARS_CONFIG_KEY,
        value: JSON.stringify(newConfig),
      });

      // 3. Update invoice counter config to start at 1 with the new prefix
      const prefixClean = newPrefix.trim() || defaultNewPrefix;
      await settingsApi.set({
        tenant_id: tenant,
        key: 'invoice_counter_config',
        value: JSON.stringify({ prefix: prefixClean, counter: 1 }),
      });

      // 4. Update return and quotation counters with new year code if appropriate
      await settingsApi.set({
        tenant_id: tenant,
        key: 'return_counter',
        value: JSON.stringify({ prefix: `${terminalCode || 'POS1'}-RTN-${nextFy.yearCode}-`, counter: 1 }),
      });

      await settingsApi.set({
        tenant_id: tenant,
        key: 'quotation_counter',
        value: JSON.stringify({ prefix: `${terminalCode || 'POS1'}-QTN-${nextFy.yearCode}-`, counter: 1 }),
      });

      // 5. Notify all listeners
      window.dispatchEvent(new CustomEvent('settings:updated'));
      window.dispatchEvent(new CustomEvent('financial-year:updated'));

      onSuccess(`Successfully transitioned to ${nextFy.label}! Invoice series reset to 001.`);
      onClose();
    } catch (err) {
      console.error('[ConfirmFinancialYearModal]', err);
      onError?.('Failed to start new financial year. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-card border border-border rounded-[28px] w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-5 border-b border-border/80 flex items-center justify-between bg-muted/20">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-primary/10 text-primary">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-foreground">Start New Financial Year</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Year-End transition &amp; counter reset</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1.5 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          {/* Transition Visual Box */}
          <div className="flex items-center justify-between p-4 rounded-2xl border border-border/80 bg-muted/30">
            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Current Year</span>
              <div className="text-sm font-black text-foreground">{currentFy.label}</div>
              <div className="text-[11px] text-muted-foreground font-mono">{currentFy.startDate} – {currentFy.endDate}</div>
            </div>

            <div className="p-2 rounded-full bg-primary/10 text-primary">
              <ArrowRight className="w-4 h-4" />
            </div>

            <div className="space-y-1 text-right">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">New Year</span>
              <div className="text-sm font-black text-emerald-600 dark:text-emerald-400">{nextFy.label}</div>
              <div className="text-[11px] text-muted-foreground font-mono">{nextFy.startDate} – {nextFy.endDate}</div>
            </div>
          </div>

          {/* Key Automated Actions Summary */}
          <div className="space-y-2.5">
            <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">What will happen:</h4>
            <div className="space-y-2 text-xs text-muted-foreground">
              <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-card border border-border/60">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <span>
                  <strong>Balances Carried Forward:</strong> Customer credit, supplier payables, and inventory stock automatically carry forward into the new year.
                </span>
              </div>
              <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-card border border-border/60">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <span>
                  <strong>New Invoice Series:</strong> Starting counter resets back to <strong>001</strong> under the new year sequence.
                </span>
              </div>
            </div>
          </div>

          {/* New Prefix Input */}
          <div className="space-y-2 pt-2 border-t border-border/60">
            <label className="text-xs font-bold text-foreground block">
              New Invoice Series Prefix
            </label>
            <Input
              type="text"
              value={newPrefix}
              onChange={(e) => setNewPrefix(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ''))}
              placeholder="e.g. POS1-2627-"
              className="font-mono font-bold uppercase"
            />
            <p className="text-[11px] text-muted-foreground">
              Next invoice will be: <span className="font-mono font-bold text-foreground">{newPrefix || defaultNewPrefix}001</span>
            </p>
          </div>

          {/* Lock Option */}
          <div className="p-3.5 rounded-2xl border border-amber-500/20 bg-amber-500/5 space-y-2">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={lockOldYear}
                onChange={(e) => setLockOldYear(e.target.checked)}
                className="mt-0.5 rounded border-border text-primary focus:ring-primary"
              />
              <div className="space-y-0.5">
                <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-amber-500" />
                  Lock previous financial year ({currentFy.shortLabel})
                </span>
                <p className="text-[11px] text-muted-foreground">
                  Prevents staff from editing or deleting finalized invoices from the closed year.
                </p>
              </div>
            </label>
          </div>

          <div className="p-3 rounded-xl bg-muted/40 border border-border/60 text-[11px] text-muted-foreground flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary shrink-0" />
            <span>Past sales history and audit reports remain accessible at any time.</span>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border/80 bg-muted/20 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 text-xs font-bold rounded-xl border border-border hover:bg-muted text-foreground transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isSubmitting}
            className="px-5 py-2 text-xs font-bold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm transition-all cursor-pointer flex items-center gap-2 active:scale-95 disabled:opacity-50"
          >
            {isSubmitting ? 'Starting New Year...' : 'Confirm & Start New FY'}
          </button>
        </div>
      </div>
    </div>
  );
}
