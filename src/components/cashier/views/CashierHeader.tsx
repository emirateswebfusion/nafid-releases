import React from 'react';
import { Banknote, RefreshCw, Clock, History, DollarSign, AlertTriangle } from 'lucide-react';
import clsx from 'clsx';
import { formatBusinessDate, todayStr } from '../cashierFormat';
import { formatCurrency } from '../../../utils/money';
import { hasBridge } from '../../../data/client';
import { syncApi } from '../../../data/sync';
import { RedCrossButton } from '../../ui/RedCrossButton';
import { useAuthStore } from '../../../store/authStore';
import type { CashDrawerRow, DayCloseResult } from '../cashierTypes';

export interface CashierHeaderProps {
  closeResult: DayCloseResult | null;
  drawer: CashDrawerRow | null;
  drawerClosed: boolean;
  drawerOpen: boolean;
  handleOpenOpeningBalModal: (currentBal?: number) => Promise<void>;
  isRestricted: boolean | undefined;
  lastSyncTime: number | null;
  load: () => Promise<void>;
  onClose: () => void;
  openHistory: () => Promise<void>;
  pageTitle: string;
  setActualCash: React.Dispatch<React.SetStateAction<number>>;
  setCloseResult: React.Dispatch<React.SetStateAction<DayCloseResult | null>>;
  setShowDayClose: React.Dispatch<React.SetStateAction<boolean>>;
  showSettlement: boolean;
  yesterdayNotClosed: boolean;
}

/** Cashier screen header: drawer status, business date and the screen actions. */
export function CashierHeader({
  closeResult, drawer, drawerClosed, drawerOpen, handleOpenOpeningBalModal, isRestricted, lastSyncTime, load,
  onClose, openHistory, pageTitle, setActualCash, setCloseResult, setShowDayClose, showSettlement,
  yesterdayNotClosed,
}: CashierHeaderProps) {
  return (
    <header className="relative shrink-0 z-30 border-b border-border bg-card shadow-sm">
      <div className="absolute inset-x-0 top-0 h-0.5" style={{ background: 'linear-gradient(90deg, transparent 0%, hsl(217,91%,60%) 50%, transparent 100%)' }} />
      <div className="flex items-center justify-between px-5 py-3 gap-4">
        {/* Left: title + status */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 text-primary shadow-inner shrink-0">
            <Banknote className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-extrabold text-foreground truncate tracking-tight">{pageTitle}</h1>
              <span className={clsx(
                'w-1.5 h-1.5 rounded-full shrink-0',
                drawerOpen ? 'bg-emerald-500 animate-pulse' : drawerClosed ? 'bg-muted-foreground' : yesterdayNotClosed ? 'bg-rose-500' : 'bg-amber-500'
              )} />
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className={clsx(
                'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border',
                drawerOpen   ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25' :
                drawerClosed ? 'bg-muted text-muted-foreground border-border' :
                yesterdayNotClosed ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/25' :
                               'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25'
              )}>
                <span className={clsx('w-1 h-1 rounded-full', drawerOpen ? 'bg-emerald-500 animate-pulse' : drawerClosed ? 'bg-muted-foreground' : yesterdayNotClosed ? 'bg-rose-500' : 'bg-amber-500')} />
                {drawerOpen ? 'Open' : drawerClosed ? 'Closed' : yesterdayNotClosed ? 'Blocked' : 'Not Started'}
              </span>
              <span className="text-[10px] text-muted-foreground font-semibold tabular-nums">
                {formatBusinessDate(drawer?.business_date || todayStr())}
              </span>
              {drawerClosed && drawer?.actual_cash !== null && drawer?.actual_cash !== undefined && (
                <span className={clsx(
                  'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold border',
                  (drawer.cash_short as number) > 0 ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/25' :
                  (drawer.cash_excess as number) > 0 ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25' :
                  'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25'
                )}>
                  Actual: {formatCurrency(drawer.actual_cash)}
                  {(drawer.cash_short as number) > 0 && ` Short −${formatCurrency(drawer.cash_short)}`}
                  {(drawer.cash_excess as number) > 0 && ` Excess +${formatCurrency(drawer.cash_excess)}`}
                  {drawer.cash_short === 0 && drawer.cash_excess === 0 && ' Matched'}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Center: current drawer cash */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <div className={clsx(
            'flex items-center gap-2.5 pl-2.5 pr-4 py-1.5 rounded-2xl border shadow-sm',
            drawerOpen ? 'bg-gradient-to-r from-emerald-500/10 to-emerald-500/[0.03] border-emerald-500/25' : 'bg-muted/50 border-border'
          )}>
            <div className={clsx('p-1.5 rounded-xl', drawerOpen ? 'bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 text-emerald-500 shadow-inner' : 'bg-muted text-muted-foreground')}>
              <Banknote className="w-3.5 h-3.5" />
            </div>
            <div className="leading-tight">
              <p className="text-[8px] font-black text-muted-foreground uppercase tracking-widest">Drawer Cash</p>
              <p className="text-sm font-black tabular-nums text-foreground">{formatCurrency(drawerClosed ? 0 : (drawer?.current_cash ?? 0))}</p>
            </div>
          </div>
        </div>

        {/* Right: action buttons */}
        <div className="flex items-center gap-1.5 shrink-0">
          {showSettlement && (
            <>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={async () => {
                    if (hasBridge('runInitialSync')) {
                      try { await syncApi.runInitialSync(); } catch { /* ignore */ }
                    }
                    await load();
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold text-muted-foreground hover:text-foreground hover:bg-muted border border-border transition-all duration-200 active:scale-95 cursor-pointer"
                  title="Instant Refresh & Sync Queue"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-emerald-500 animate-spin" style={{ animationDuration: '3s' }} />
                  <span className="hidden sm:inline">Sync</span>
                </button>
                {lastSyncTime && (
                  <span className="hidden sm:inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-medium text-muted-foreground/70 bg-muted/50 border border-border/50">
                    <Clock className="w-2.5 h-2.5" />
                    {new Date(lastSyncTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
                  </span>
                )}
              </div>
              <button
                onClick={openHistory}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold text-muted-foreground hover:text-foreground hover:bg-muted border border-border transition-all duration-200 active:scale-95 cursor-pointer"
              >
                <History className="w-3.5 h-3.5" /> History
              </button>
            </>
          )}
          {!drawerClosed && (
            <button
              onClick={() => handleOpenOpeningBalModal(drawer?.opening_balance)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold text-primary hover:bg-primary/10 border border-primary/20 transition-all duration-200 active:scale-95 cursor-pointer"
            >
              <DollarSign className="w-3.5 h-3.5" /> Opening
            </button>
          )}
          {drawerOpen && !closeResult && (
            <button
              onClick={() => { setActualCash(drawer?.expected_closing || 0); setCloseResult(null); setShowDayClose(true); }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold text-destructive hover:bg-destructive/10 border border-destructive/25 transition-all duration-200 active:scale-95 cursor-pointer"
            >
              <AlertTriangle className="w-3.5 h-3.5" /> Close
            </button>
          )}
          <RedCrossButton
            onClick={isRestricted ? () => useAuthStore.getState().logout() : onClose}
            title="Close"
          />
        </div>
      </div>
    </header>
  );
}
