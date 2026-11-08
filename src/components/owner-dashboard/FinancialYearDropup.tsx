import { useState, useRef, useEffect } from 'react';
import { Calendar, ChevronUp, Lock, CheckCircle2, Settings as SettingsIcon, ArrowUpRight } from 'lucide-react';
import clsx from 'clsx';
import {
  getCurrentFinancialYear,
  getAvailableFinancialYears,
  parseFinancialYearsConfig,
  type FinancialYearsConfig,
  FINANCIAL_YEARS_CONFIG_KEY,
} from '../../utils/time/financialYear';
import { useAuthStore } from '../../store/authStore';
import { isAdminRole } from '../../utils/security/permissions';
import { settingsApi } from '../../data/settings';
import { hasBridge } from '../../data/client';

export function FinancialYearDropup({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const { role, tenantId } = useAuthStore();
  const isAdmin = isAdminRole(role);

  const [fyConfig, setFyConfig] = useState<FinancialYearsConfig>(() => parseFinancialYearsConfig(null));

  useEffect(() => {
    const loadConfig = async () => {
      if (hasBridge('settingsGet')) {
        try {
          const raw = await settingsApi.get({ tenant_id: tenantId || 'global', key: FINANCIAL_YEARS_CONFIG_KEY });
          if (raw) setFyConfig(parseFinancialYearsConfig(raw));
        } catch {
          /* ignore */
        }
      }
    };
    loadConfig();

    const handleUpdated = () => {
      loadConfig();
    };

    window.addEventListener('settings:updated', handleUpdated);
    window.addEventListener('financial-year:updated', handleUpdated);
    return () => {
      window.removeEventListener('settings:updated', handleUpdated);
      window.removeEventListener('financial-year:updated', handleUpdated);
    };
  }, [tenantId]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const currentFy = getCurrentFinancialYear();
  const availableFys = getAvailableFinancialYears(2, 1);
  const activeYearId = fyConfig.activeYearId || currentFy.id;

  const handleOpenSettings = () => {
    setOpen(false);
    window.dispatchEvent(new CustomEvent('open-settings-manager', { detail: 'financial_year' }));
    window.dispatchEvent(new CustomEvent('open-settings-section', { detail: 'financial_year' }));
  };

  const handleOpenReport = () => {
    setOpen(false);
    window.dispatchEvent(new CustomEvent('open-financial-report'));
  };

  return (
    <div ref={containerRef} className={clsx('relative inline-flex items-center', className)}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={clsx(
          'flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-bold transition-all duration-150 cursor-pointer select-none active:scale-95',
          open
            ? 'bg-primary/10 border-primary/30 text-primary shadow-xs'
            : 'bg-card border-border/80 text-foreground hover:bg-muted/40 hover:border-border'
        )}
        title={`Active Financial Year: ${currentFy.label} (Click for details)`}
      >
        <Calendar className="w-3.5 h-3.5 text-primary shrink-0" />
        <span className="font-mono text-[11px] font-black">{currentFy.shortLabel}</span>
        <ChevronUp className={clsx('w-3 h-3 text-muted-foreground transition-transform duration-200', open ? 'rotate-180 text-primary' : '')} />
      </button>

      {open && (
        <div className="absolute bottom-full mb-2 right-0 w-72 bg-card border border-border rounded-2xl shadow-xl p-3 z-50 animate-in fade-in slide-in-from-bottom-2 select-none">
          {/* Header */}
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-border/60">
            <div className="flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-primary" />
              <span className="text-xs font-black uppercase tracking-wider text-foreground">Financial Year</span>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold border border-emerald-500/20">
              Live
            </span>
          </div>

          {/* List of Years */}
          <div className="space-y-1.5 max-h-52 overflow-y-auto pr-0.5">
            {availableFys.map((fy) => {
              const isActive = fy.id === activeYearId;
              const isLocked = fyConfig.lockedYearIds.includes(fy.id) || (fyConfig.lockPriorYears && fy.endDate < currentFy.startDate);

              return (
                <div
                  key={fy.id}
                  className={clsx(
                    'p-2 rounded-xl border transition-all text-xs flex items-center justify-between',
                    isActive
                      ? 'bg-primary/5 border-primary/30 text-foreground font-bold shadow-2xs'
                      : 'bg-muted/20 border-border/60 text-muted-foreground'
                  )}
                >
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-foreground">{fy.label}</span>
                      {isActive && (
                        <span className="inline-flex items-center gap-1 text-[9px] font-black text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded">
                          <CheckCircle2 className="w-2.5 h-2.5" /> ACTIVE
                        </span>
                      )}
                      {isLocked && !isActive && (
                        <span className="inline-flex items-center gap-1 text-[9px] font-bold text-muted-foreground bg-muted px-1.5 py-0.2 rounded">
                          <Lock className="w-2.5 h-2.5" /> LOCKED
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-muted-foreground/80 font-mono mt-0.5">
                      {fy.startDate} to {fy.endDate}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Bottom Actions */}
          <div className="pt-2.5 mt-2 border-t border-border/60 space-y-1.5">
            <button
              type="button"
              onClick={handleOpenReport}
              className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs font-semibold text-foreground hover:bg-muted transition-colors cursor-pointer"
            >
              <span className="flex items-center gap-1.5">
                <ArrowUpRight className="w-3.5 h-3.5 text-blue-500" />
                <span>View Financial Report</span>
              </span>
            </button>

            {isAdmin && (
              <button
                type="button"
                onClick={handleOpenSettings}
                className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs font-semibold text-primary hover:bg-primary/10 transition-colors cursor-pointer"
              >
                <span className="flex items-center gap-1.5">
                  <SettingsIcon className="w-3.5 h-3.5" />
                  <span>Manage in Settings</span>
                </span>
                <span className="text-[10px] font-bold text-muted-foreground">→</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
