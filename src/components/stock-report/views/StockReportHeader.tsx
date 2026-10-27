import { BarChart3, FileText, Lock, Package, Printer, Receipt, RefreshCw, Shield, X } from 'lucide-react';
import clsx from 'clsx';
import { useAuthStore } from '../../../store/authStore';
import { getStoreTimezone } from '../../../utils/time/timezoneHelper';
import { Skeleton } from '../../ui/Skeleton';
import type { StockReportState } from '../hooks/useStockReportState';

export interface StockReportHeaderProps {
  sr: StockReportState;
  isStaff: boolean;
  isRestricted?: boolean;
  onClose: () => void;
  loadData: (forceRefresh?: boolean) => Promise<void>;
  handleDownloadCsv: () => void;
  handlePrint: () => Promise<void>;
}

/** Stock report header: title, tabs, view-mode switch, refresh, CSV and print actions, close. */
export function StockReportHeader({
  sr, isStaff, isRestricted, onClose, loadData, handleDownloadCsv, handlePrint,
}: StockReportHeaderProps) {
  const {
    lastUpdated, loading, maskingConfig, products, refreshing, reportTab, setReportTab, setViewMode, viewMode,
  } = sr;
  return (
    <header className="shrink-0 z-30 border-b border-border bg-card shadow-sm">
      <div className="flex items-center justify-between gap-4 px-5 py-3 select-none">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2 rounded-xl bg-primary/10 text-primary shadow-inner shrink-0">
            <BarChart3 className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0 text-left">
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold text-foreground truncate">Stock Report</h1>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
              {maskingConfig.enabled && !isStaff && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20" title="Staff masking is active for staff accounts. Genuine owner figures shown here.">
                  <Shield className="w-3 h-3" /> Staff Masking Active
                </span>
              )}
              {maskingConfig.enabled && isStaff && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20" title="Restricted view">
                  <Lock className="w-3 h-3" /> Protected
                </span>
              )}
            </div>
          <p className="text-[11px] text-muted-foreground font-medium leading-none mt-0.5">
            {loading ? <Skeleton className="h-3 w-16 inline-block align-middle" /> : products.length} products
            {lastUpdated && !loading && (
              <span className="ml-2 font-normal text-muted-foreground/60">&middot; {lastUpdated.toLocaleTimeString('en-IN', { timeZone: getStoreTimezone(), hour: '2-digit', minute: '2-digit' })}</span>
            )}
          </p>
        </div>
      </div>

        <div className="flex items-center gap-x-0.5 bg-muted/50 rounded-xl p-0.5 shrink-0">
          {([
            { tab: 'stock' as const, label: 'Stock', icon: Package },
            { tab: 'sales' as const, label: 'Product Sales', icon: BarChart3 },
          ]).map(({ tab, label, icon: Icon }) => (
            <button
              key={tab}
              onClick={() => setReportTab(tab)}
              className={clsx(
                'flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-lg transition-all cursor-pointer',
                reportTab === tab
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              )}
            >
              <Icon className={clsx('w-3 h-3', reportTab === tab ? 'text-primary-foreground' : 'text-muted-foreground')} />
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-x-0.5 bg-muted/50 rounded-xl p-0.5 shrink-0">
          {([
            { mode: 'estimate', label: 'Estimate', icon: Receipt, color: 'text-amber-500' },
            { mode: 'gst',      label: 'GST',      icon: FileText, color: 'text-sky-500' },
            { mode: 'combined', label: 'All',      icon: BarChart3, color: 'text-primary' },
          ] as const).map(({ mode, label, icon: Icon, color }) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={clsx(
                'flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-lg transition-all cursor-pointer',
                viewMode === mode
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              )}
            >
              <Icon className={clsx('w-3 h-3', viewMode === mode ? 'text-primary-foreground' : color)} />
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => loadData(true)}
            disabled={refreshing}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-all active:scale-95 cursor-pointer disabled:opacity-50 border border-border"
            title="Refresh data"
          >
            <RefreshCw className={clsx('w-4 h-4', refreshing && 'animate-spin')} />
          </button>
          <button
            onClick={handleDownloadCsv}
            disabled={loading}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all shadow-sm active:scale-95 cursor-pointer disabled:opacity-50"
          >
            <FileText className="w-3.5 h-3.5" /> CSV
          </button>
          <button
            onClick={handlePrint}
            disabled={loading}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-xs font-bold transition-all shadow-sm active:scale-95 cursor-pointer disabled:opacity-50"
          >
            <Printer className="w-3.5 h-3.5" /> Print Report
          </button>
          <button
            onClick={isRestricted ? () => useAuthStore.getState().logout() : onClose}
            className="p-2 rounded-xl border border-destructive/30 hover:bg-destructive/10 text-destructive transition-all duration-200 active:scale-95 cursor-pointer flex items-center justify-center shadow-xs"
            title="Close"
          >
            <X className="w-4 h-4 text-destructive" />
          </button>
        </div>
      </div>
    </header>
  );
}
