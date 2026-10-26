import React from 'react';
import { TrendingUp, Receipt, BarChart3, Shield, Lock, Trash2, RefreshCw, Download, X } from 'lucide-react';
import clsx from 'clsx';
import { DateRangeFilter } from '../../ui/DateRangeFilter';
import { hasPermission } from '../../../utils/permissions';
import { useAuthStore } from '../../../store/authStore';
import type { StaffDataMaskingConfig } from '../../../utils/staffDataMasking';

export interface SalesHistoryHeaderProps {
  /** Closes Sales History itself. */
  onClose: () => void;
  isRestricted?: boolean;
  filterDate: string;
  filterDateEnd: string;
  handleExportCSV: () => Promise<void>;
  isExporting: boolean;
  isStaff: boolean;
  maskingConfig: StaffDataMaskingConfig;
  permissions: string[];
  role: "SUPER_ADMIN" | "ADMIN" | "STAFF" | null;
  setFilterDate: React.Dispatch<React.SetStateAction<string>>;
  setFilterDateEnd: React.Dispatch<React.SetStateAction<string>>;
  setViewMode: React.Dispatch<React.SetStateAction<"bills" | "analytics">>;
  shouldMask: boolean;
  staffDateScope: { startDate: string | null; endDate: string | null; isLocked: boolean; scopeLabel: string; };
  viewMode: "bills" | "analytics";
}

/** Sales History header: title, Bills / Analytics switch, date filter, Recycle Bin, CSV export and close. */
export function SalesHistoryHeader({
  onClose, isRestricted, filterDate, filterDateEnd, handleExportCSV, isExporting, isStaff, maskingConfig, permissions, role, setFilterDate,
  setFilterDateEnd, setViewMode, shouldMask, staffDateScope, viewMode,
}: SalesHistoryHeaderProps) {
  return (
    <header className="shrink-0 z-30 border-b border-border bg-card shadow-sm">
      <div className="flex items-center justify-between gap-4 px-5 py-3">
        {/* Left Title */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2 rounded-xl bg-primary/10 text-primary shadow-inner shrink-0">
            <TrendingUp className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold text-foreground truncate">Sales History</h1>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
            </div>
            <p className="text-[11px] text-muted-foreground font-medium leading-none mt-0.5">Billing records &amp; analytics</p>
          </div>
        </div>

        {/* Center: View Mode Segmented Switcher */}
        <div className="flex items-center bg-muted/60 dark:bg-muted/30 p-1 rounded-2xl border border-border/80 gap-1 shadow-inner backdrop-blur-xs">
          <button
            type="button"
            onClick={() => setViewMode('bills')}
            className={clsx(
              'flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all duration-150 cursor-pointer active:scale-[0.98]',
              viewMode === 'bills'
                ? 'bg-card text-foreground border border-border shadow-xs'
                : 'text-muted-foreground hover:text-foreground hover:bg-card/50'
            )}
          >
            <Receipt className={clsx('w-3.5 h-3.5 transition-colors', viewMode === 'bills' ? 'text-primary' : 'text-muted-foreground')} />
            <span>Bills List</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('analytics')}
            className={clsx(
              'flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all duration-150 cursor-pointer active:scale-[0.98]',
              viewMode === 'analytics'
                ? 'bg-card text-foreground border border-border shadow-xs'
                : 'text-muted-foreground hover:text-foreground hover:bg-card/50'
            )}
          >
            <BarChart3 className={clsx('w-3.5 h-3.5 transition-colors', viewMode === 'analytics' ? 'text-violet-500' : 'text-muted-foreground')} />
            <span>Analytics &amp; Graph</span>
          </button>
        </div>

        {/* Right Controls */}
        <div className="flex items-center gap-2 shrink-0">
          {maskingConfig.enabled && !isStaff && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shadow-2xs select-none" title="Staff masking is active for staff accounts. Genuine owner figures shown here.">
              <Shield className="w-3 h-3" /> Staff Masking Active
            </span>
          )}

          {shouldMask && maskingConfig.sales_history_scope !== 'ALL' ? (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/25 shadow-2xs select-none" title="Historical date range restricted by store policy">
              <Lock className="w-3.5 h-3.5" />
              <span>Scope: {staffDateScope.scopeLabel}</span>
            </div>
          ) : (
            <DateRangeFilter
              startDate={filterDate}
              endDate={filterDateEnd}
              onChange={(start, end) => { setFilterDate(start); setFilterDateEnd(end); }}
              align="right"
              triggerClassName="h-8.5 px-3 rounded-xl text-xs font-semibold bg-background border-border/80 hover:bg-muted/40 shadow-2xs"
            />
          )}

          {hasPermission({ role, permissions }, 'sales.view') && (
            <button
              type="button"
              onClick={() => {
                window.dispatchEvent(new CustomEvent('open-recycle-bin', { detail: { initialCategory: 'SALES_BILLS' } }));
              }}
              title="Open Recycle Bin to view and restore deleted bills"
              className="h-8.5 px-3 rounded-xl text-xs font-bold transition-all duration-150 cursor-pointer border flex items-center gap-1.5 bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/25 hover:bg-rose-500/20 active:scale-95 shrink-0 shadow-2xs hover:shadow-rose-500/10"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Recycle Bin</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleExportCSV}
            disabled={isExporting}
            title="Export filtered invoices to CSV"
            className="h-8.5 px-3.5 rounded-xl text-xs font-bold transition-all duration-150 cursor-pointer border flex items-center gap-1.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25 hover:bg-emerald-500/20 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shrink-0 shadow-2xs hover:shadow-emerald-500/10"
          >
            {isExporting
              ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              : <Download className="w-3.5 h-3.5" />
            }
            <span>{isExporting ? 'Exporting…' : 'Export CSV'}</span>
          </button>

          <button
            type="button"
            onClick={isRestricted ? () => useAuthStore.getState().logout() : onClose}
            className="h-8.5 w-8.5 rounded-xl border border-destructive/25 bg-destructive/5 text-destructive hover:bg-destructive/15 transition-all duration-150 active:scale-95 cursor-pointer flex items-center justify-center shrink-0 shadow-2xs"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
