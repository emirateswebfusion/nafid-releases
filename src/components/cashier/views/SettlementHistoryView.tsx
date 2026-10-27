import React from 'react';
import { History, Search, X, TrendingUp, DollarSign, TrendingDown, CheckCircle2, ChevronDown, ChevronRight, Receipt, User, Banknote, RotateCcw, Clock, Trash2 } from 'lucide-react';
import clsx from 'clsx';
import { todayStr, formatTime } from '../cashierFormat';
import { formatCurrency } from '../../../utils/pricing/money';
import type { CashDrawerRow, CashTransactionRow, CashierInvoiceRow, DaySettlementRow } from '../cashierTypes';

export interface SettlementHistoryViewProps {
  dayCashTransactions: CashTransactionRow[];
  daySettlements: DaySettlementRow[];
  expandedDay: string | null;
  expandedSubTab: "bills" | "cash";
  handleViewInvoice: (inv: CashierInvoiceRow) => Promise<void>;
  histDateRange: "all" | "today" | "7days" | "30days";
  history: CashDrawerRow[];
  histSearch: string;
  initiateDeleteTransaction: (tx: CashTransactionRow) => void;
  initiateReopenDrawer: (targetDrawer: CashDrawerRow) => void;
  isOwner: boolean;
  loadDaySettlements: (businessDate: string) => Promise<void>;
  loadingSettlements: boolean;
  setExpandedDay: React.Dispatch<React.SetStateAction<string | null>>;
  setExpandedSubTab: React.Dispatch<React.SetStateAction<"bills" | "cash">>;
  setHistDateRange: React.Dispatch<React.SetStateAction<"all" | "today" | "7days" | "30days">>;
  setHistSearch: React.Dispatch<React.SetStateAction<string>>;
  setShowHist: React.Dispatch<React.SetStateAction<boolean>>;
}

/** Settlement history: day-by-day closings with expandable bills and transactions. */
export function SettlementHistoryView({
  dayCashTransactions, daySettlements, expandedDay, expandedSubTab, handleViewInvoice, histDateRange, history,
  histSearch, initiateDeleteTransaction, initiateReopenDrawer, isOwner, loadDaySettlements, loadingSettlements,
  setExpandedDay, setExpandedSubTab, setHistDateRange, setHistSearch, setShowHist,
}: SettlementHistoryViewProps) {
  return (
    <div className="flex-1 flex flex-col min-h-0 bg-background">
      {/* ── Top Floating Glass Header Bar ── */}
      <div className="relative shrink-0 border-b border-border/60 bg-card/80 backdrop-blur-xl z-20">
        <div className="absolute inset-x-0 top-0 h-0.5" style={{ background: 'linear-gradient(90deg, hsl(217,91%,60%) 0%, hsl(142,72%,50%) 50%, transparent 100%)' }} />
        <div className="flex items-center justify-between px-6 py-3.5 gap-4">
          {/* Left Title & Status */}
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-gradient-to-br from-blue-500/20 to-blue-500/5 text-blue-500 shadow-inner border border-blue-500/20">
              <History className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black text-foreground tracking-tight">Settlement History & Audit</h2>
                <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                  {history.length} Shift{history.length !== 1 ? 's' : ''}
                </span>
              </div>
              <p className="text-xs text-muted-foreground font-medium mt-0.5">
                Review drawer closing sessions, settled bills, and cash register transaction logs
              </p>
            </div>
          </div>

          {/* Right Controls: Search + Date Pill Filters + Close */}
          <div className="flex items-center gap-3">
            {/* Search input */}
            <div className="relative w-56 sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                value={histSearch}
                onChange={(e) => setHistSearch(e.target.value)}
                placeholder="Search date or cashier..."
                className="w-full pl-9 pr-3 py-1.5 text-xs font-semibold bg-background border border-border rounded-xl outline-none focus:border-primary/50 text-foreground placeholder:text-muted-foreground/50 transition-all"
              />
              {histSearch && (
                <button
                  onClick={() => setHistSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-md text-muted-foreground hover:text-foreground"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Quick Date Range Selector */}
            <div className="flex items-center bg-muted/40 p-1 rounded-xl border border-border gap-0.5">
              {(['all', 'today', '7days', '30days'] as const).map((r) => {
                const labels: Record<string, string> = { all: 'All', today: 'Today', '7days': '7 Days', '30days': '30 Days' };
                const active = histDateRange === r;
                return (
                  <button
                    key={r}
                    onClick={() => setHistDateRange(r)}
                    className={clsx(
                      'px-2.5 py-1 rounded-lg text-[10px] font-black transition-all cursor-pointer',
                      active
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground hover:bg-card'
                    )}
                  >
                    {labels[r]}
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => setShowHist(false)}
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-all duration-200 active:scale-95 cursor-pointer border border-destructive/30"
              title="Close History"
            >
              <X className="w-4 h-4 text-destructive" />
            </button>
          </div>
        </div>
      </div>

      {/* ── Double-Bezel Executive Summary Metric Cards ── */}
      {history.length > 0 && (() => {
        const filteredHist = history.filter((d) => {
          const matchesSearch = !histSearch ||
            (d.business_date && d.business_date.toLowerCase().includes(histSearch.toLowerCase())) ||
            (d.opened_by_name && d.opened_by_name.toLowerCase().includes(histSearch.toLowerCase())) ||
            (d.closed_by_name && d.closed_by_name.toLowerCase().includes(histSearch.toLowerCase()));

          if (!matchesSearch) return false;
          if (histDateRange === 'today') return d.business_date && d.business_date.startsWith(todayStr());
          if (histDateRange === '7days') {
            const limit7 = new Date(); limit7.setDate(limit7.getDate() - 7);
            return new Date(d.business_date) >= limit7;
          }
          if (histDateRange === '30days') {
            const limit30 = new Date(); limit30.setDate(limit30.getDate() - 30);
            return new Date(d.business_date) >= limit30;
          }
          return true;
        });

        const totalSales = filteredHist.reduce((s: number, d) => s + Number(d.cash_sales || 0), 0);
        const totalCollected = filteredHist.reduce((s: number, d) => s + Number(d.total_collected || 0), 0);
        let totalShort = 0, totalExcess = 0;
        filteredHist.filter((d) => d.status === 'CLOSED').forEach((d) => {
          const v = Number(d.actual_cash ?? 0) - Number(d.expected_closing ?? 0);
          if (v < 0) totalShort += Math.abs(v);
          else totalExcess += v;
        });

        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 px-6 py-4 border-b border-border bg-muted/10 shrink-0">
            {/* Metric 1: Sessions */}
            <div className="p-1.5 rounded-[1.5rem] bg-card/60 border border-border/60 shadow-sm backdrop-blur-md">
              <div className="p-3.5 rounded-[calc(1.5rem-0.375rem)] bg-background/80 border border-border/30 flex items-center justify-between">
                <div>
                  <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest block">Recorded Shifts</span>
                  <span className="text-2xl font-black text-foreground tabular-nums mt-0.5 block">{filteredHist.length}</span>
                  <span className="text-[10px] font-bold text-muted-foreground/70 block mt-0.5">
                    {filteredHist.filter((h) => h.status === 'OPEN').length} active shift open
                  </span>
                </div>
                <div className="p-3 rounded-2xl bg-gradient-to-br from-blue-500/20 to-blue-500/5 text-blue-500 shadow-inner border border-blue-500/20">
                  <History className="w-5 h-5" />
                </div>
              </div>
            </div>

            {/* Metric 2: Cash Sales */}
            <div className="p-1.5 rounded-[1.5rem] bg-card/60 border border-border/60 shadow-sm backdrop-blur-md">
              <div className="p-3.5 rounded-[calc(1.5rem-0.375rem)] bg-background/80 border border-border/30 flex items-center justify-between">
                <div>
                  <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest block">Cash Sales (CASH + Split Cash)</span>
                  <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400 tabular-nums mt-0.5 block">{formatCurrency(totalSales)}</span>
                  <span className="text-[10px] font-bold text-emerald-600/80 dark:text-emerald-400/80 flex items-center gap-0.5 mt-0.5">
                    <TrendingUp className="w-3 h-3" /> Drawer register cash
                  </span>
                </div>
                <div className="p-3 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 text-emerald-500 shadow-inner border border-emerald-500/20">
                  <TrendingUp className="w-5 h-5" />
                </div>
              </div>
            </div>

            {/* Metric 3: Total Revenue Collected */}
            <div className="p-1.5 rounded-[1.5rem] bg-card/60 border border-border/60 shadow-sm backdrop-blur-md">
              <div className="p-3.5 rounded-[calc(1.5rem-0.375rem)] bg-background/80 border border-border/30 flex items-center justify-between">
                <div>
                  <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest block">Total Revenue</span>
                  <span className="text-2xl font-black text-violet-600 dark:text-violet-400 tabular-nums mt-0.5 block">{formatCurrency(totalCollected)}</span>
                  <span className="text-[10px] font-bold text-muted-foreground/70 block mt-0.5">
                    Cash + Card + UPI + Bank
                  </span>
                </div>
                <div className="p-3 rounded-2xl bg-gradient-to-br from-violet-500/20 to-violet-500/5 text-violet-500 shadow-inner border border-violet-500/20">
                  <DollarSign className="w-5 h-5" />
                </div>
              </div>
            </div>

            {/* Metric 4: Short / Excess Variance */}
            <div className="p-1.5 rounded-[1.5rem] bg-card/60 border border-border/60 shadow-sm backdrop-blur-md">
              <div className="p-3.5 rounded-[calc(1.5rem-0.375rem)] bg-background/80 border border-border/30 flex items-center justify-between">
                <div>
                  <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest block">Shift Variance</span>
                  <span className={clsx(
                    'text-2xl font-black tabular-nums mt-0.5 block',
                    totalShort > 0 ? 'text-rose-500' : totalExcess > 0 ? 'text-emerald-500' : 'text-foreground'
                  )}>
                    {totalShort > 0 ? `−${formatCurrency(totalShort)}` : totalExcess > 0 ? `+${formatCurrency(totalExcess)}` : '✓ Balanced'}
                  </span>
                  <span className="text-[10px] font-bold text-muted-foreground/70 block mt-0.5">
                    {totalShort > 0 ? 'Drawer cash short' : totalExcess > 0 ? 'Drawer cash excess' : 'Zero discrepancy'}
                  </span>
                </div>
                <div className={clsx(
                  'p-3 rounded-2xl shadow-inner border',
                  totalShort > 0 ? 'bg-gradient-to-br from-rose-500/20 to-rose-500/5 text-rose-500 border-rose-500/20' : 'bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 text-emerald-500 border-emerald-500/20'
                )}>
                  {totalShort > 0 ? <TrendingDown className="w-5 h-5" /> : <CheckCircle2 className="w-5 h-5" />}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Main Master History Table / Feed ── */}
      <div className="flex-1 overflow-y-auto p-5">
        {(() => {
          const filteredHistory = history.filter((d) => {
            const matchesSearch = !histSearch ||
              (d.business_date && d.business_date.toLowerCase().includes(histSearch.toLowerCase())) ||
              (d.opened_by_name && d.opened_by_name.toLowerCase().includes(histSearch.toLowerCase())) ||
              (d.closed_by_name && d.closed_by_name.toLowerCase().includes(histSearch.toLowerCase()));

            if (!matchesSearch) return false;
            if (histDateRange === 'today') return d.business_date && d.business_date.startsWith(todayStr());
            if (histDateRange === '7days') {
              const limit7 = new Date(); limit7.setDate(limit7.getDate() - 7);
              return new Date(d.business_date) >= limit7;
            }
            if (histDateRange === '30days') {
              const limit30 = new Date(); limit30.setDate(limit30.getDate() - 30);
              return new Date(d.business_date) >= limit30;
            }
            return true;
          });

          if (filteredHistory.length === 0) {
            return (
              <div className="flex flex-col items-center justify-center h-full gap-3 p-12 text-center">
                <div className="w-16 h-16 rounded-3xl bg-muted/40 flex items-center justify-center">
                  <History className="w-8 h-8 text-muted-foreground/40" />
                </div>
                <div>
                  <p className="text-base font-extrabold text-foreground">No matching history records</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">Try clearing your search query or selecting a broader date filter</p>
                </div>
                {histSearch && (
                  <button
                    onClick={() => setHistSearch('')}
                    className="px-4 py-2 bg-primary/10 text-primary hover:bg-primary/20 rounded-xl text-xs font-black transition-all cursor-pointer"
                  >
                    Clear Search Filter
                  </button>
                )}
              </div>
            );
          }

          return (
            <div className="rounded-2xl border border-border/80 bg-card shadow-sm overflow-hidden">
              {/* Column headers */}
              <div className="grid grid-cols-[1.1fr_0.8fr_0.8fr_0.8fr_0.7fr_0.7fr_0.8fr_0.8fr_0.9fr_0.8fr_0.7fr] gap-x-2 px-5 py-3 text-[9px] font-black text-muted-foreground uppercase tracking-widest border-b border-border/60 bg-muted/30 sticky top-0 z-10">
                <span className="flex items-center gap-1 cursor-pointer hover:text-foreground" onClick={() => setExpandedDay(null)}>
                  Shift Date <ChevronDown className="w-3 h-3 opacity-50" />
                </span>
                <span>Cashier</span>
                <span className="text-right">Opening</span>
                <span className="text-right" title="Cash Sales = CASH payments + Cash portion of SPLIT payments">Cash Sales</span>
                <span className="text-right">Cash In</span>
                <span className="text-right">Cash Out</span>
                <span className="text-right">Expected</span>
                <span className="text-right">Actual</span>
                <span className="text-center">Variance</span>
                <span className="text-center">Total Settled</span>
                <span className="text-center">Status</span>
              </div>

              <div className="divide-y divide-border/30">
                {filteredHistory.map((d) => {
                  const isClosed = d.status === 'CLOSED';
                  const variance = Number(d.actual_cash ?? 0) - Number(d.expected_closing ?? 0);
                  const hasVar = isClosed && d.actual_cash !== null && d.actual_cash !== undefined;
                  const isExpanded = expandedDay === d.business_date;
                  const cashierName = d.opened_by_name || d.closed_by_name || '—';
                  const formattedDate = d.business_date ? d.business_date.split('T')[0] : '';

                  return (
                    <div key={d.drawer_id}>
                      {/* Main row — Clickable to expand */}
                      <div
                        onClick={() => loadDaySettlements(d.business_date)}
                        className={clsx(
                          'grid grid-cols-[1.1fr_0.8fr_0.8fr_0.8fr_0.7fr_0.7fr_0.8fr_0.8fr_0.9fr_0.8fr_0.7fr] gap-x-2 px-5 py-3.5 items-center transition-all duration-150 cursor-pointer border-l-4 group',
                          !isClosed ? 'border-l-blue-500' :
                          variance < 0 ? 'border-l-rose-500' :
                          variance > 0 ? 'border-l-amber-500' :
                          'border-l-emerald-500',
                          isExpanded ? 'bg-primary/5 shadow-inner' : 'hover:bg-primary/5'
                        )}
                      >
                        {/* Date */}
                        <div className="flex items-center gap-2">
                          <div className={clsx(
                            'p-1 rounded-lg transition-transform duration-200',
                            isExpanded ? 'bg-primary/10 text-primary rotate-90' : 'text-muted-foreground group-hover:text-foreground'
                          )}>
                            <ChevronRight className="w-3.5 h-3.5" />
                          </div>
                          <div className="flex flex-col gap-0.5">
                            <span className="text-xs font-extrabold text-foreground leading-tight">{formattedDate}</span>
                            {(d.settled_count as number) > 0 && (
                              <span className="text-[9px] text-muted-foreground font-bold flex items-center gap-1">
                                <Receipt className="w-2.5 h-2.5 text-muted-foreground/70" />
                                {d.settled_count} bill{d.settled_count !== 1 ? 's' : ''}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Cashier */}
                        <div className="flex items-center gap-1.5 min-w-0">
                          <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold text-muted-foreground shrink-0">
                            <User className="w-3 h-3" />
                          </div>
                          <span className="text-[11px] text-foreground font-bold truncate">{cashierName}</span>
                        </div>

                        {/* Opening */}
                        <span className="text-xs text-right tabular-nums text-muted-foreground font-semibold">{formatCurrency(d.opening_balance)}</span>

                        {/* Sales */}
                        <span className="text-xs text-right tabular-nums text-emerald-600 dark:text-emerald-400 font-extrabold" title="Cash Sales = CASH payments + Cash portion of SPLIT payments">{formatCurrency(d.cash_sales)}</span>

                        {/* Cash In */}
                        <span className="text-xs text-right tabular-nums text-blue-500 font-bold">{formatCurrency(d.cash_in || 0)}</span>

                        {/* Cash Out */}
                        <span className="text-xs text-right tabular-nums text-rose-500 font-bold">{formatCurrency(d.cash_out || 0)}</span>

                        {/* Expected closing */}
                        <span className="text-xs text-right tabular-nums text-foreground font-black">{formatCurrency(d.expected_closing)}</span>

                        {/* Actual (if closed) */}
                        <span className={clsx('text-xs text-right tabular-nums font-extrabold', isClosed ? 'text-foreground' : 'text-muted-foreground/40')}>
                          {isClosed && d.actual_cash !== null ? formatCurrency(d.actual_cash) : '—'}
                        </span>

                        {/* Variance */}
                        <div className="flex justify-center">
                          {hasVar ? (
                            <span className={clsx(
                              'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black border',
                              variance > 0 ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/25' :
                              variance < 0 ? 'text-rose-600 dark:text-rose-400 bg-rose-500/10 border-rose-500/25' :
                              'text-muted-foreground bg-muted/40 border-border'
                            )}>
                              {variance > 0 ? `+${formatCurrency(variance)}` : variance < 0 ? formatCurrency(variance) : '✓ Matched'}
                            </span>
                          ) : (
                            <span className="text-[10px] text-muted-foreground/40">—</span>
                          )}
                        </div>

                        {/* Settled (total collected) */}
                        <div className="flex justify-center">
                          <span className="text-xs font-black text-violet-600 dark:text-violet-400 tabular-nums">
                            {d.total_collected ? formatCurrency(d.total_collected) : '—'}
                          </span>
                        </div>

                        {/* Status */}
                        <div className="flex justify-center">
                          <span className={clsx(
                            'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[9px] font-black border shadow-xs',
                            isClosed
                              ? 'bg-muted/60 text-muted-foreground border-border'
                              : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                          )}>
                            <span className={clsx('w-1.5 h-1.5 rounded-full', isClosed ? 'bg-muted-foreground' : 'bg-emerald-500 animate-pulse')} />
                            {isClosed ? 'Closed' : 'Open'}
                          </span>
                        </div>
                      </div>

                      {/* ── Expanded Detail Workbench: Dual Sub-Tabs ── */}
                      {isExpanded && (
                        <div className="bg-muted/15 border-t border-b border-border/40 transition-all duration-200">
                          {loadingSettlements ? (
                            <div className="flex items-center justify-center py-8 gap-2.5">
                              <span className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                              <span className="text-xs text-muted-foreground font-extrabold tracking-tight">Fetching session details…</span>
                            </div>
                          ) : (
                            <div>
                              {/* Sub-navigation tabs */}
                              <div className="flex items-center justify-between px-8 pt-3 pb-2.5 border-b border-border/40 bg-card/80 backdrop-blur-sm">
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={(e) => { e.stopPropagation(); setExpandedSubTab('bills'); }}
                                    className={clsx(
                                      'flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer border shadow-xs',
                                      expandedSubTab === 'bills'
                                        ? 'bg-primary text-primary-foreground border-primary'
                                        : 'bg-background text-muted-foreground hover:text-foreground border-border'
                                    )}
                                  >
                                    <Receipt className="w-3.5 h-3.5" />
                                    Bills History
                                    <span className={clsx('px-1.5 py-0.2 rounded-full text-[9px]', expandedSubTab === 'bills' ? 'bg-white/20 text-white' : 'bg-muted text-muted-foreground')}>
                                      {daySettlements.length}
                                    </span>
                                  </button>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); setExpandedSubTab('cash'); }}
                                    className={clsx(
                                      'flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer border shadow-xs',
                                      expandedSubTab === 'cash'
                                        ? 'bg-primary text-primary-foreground border-primary'
                                        : 'bg-background text-muted-foreground hover:text-foreground border-border'
                                    )}
                                  >
                                    <Banknote className="w-3.5 h-3.5" />
                                    Cash Register History
                                    <span className={clsx('px-1.5 py-0.2 rounded-full text-[9px]', expandedSubTab === 'cash' ? 'bg-white/20 text-white' : 'bg-muted text-muted-foreground')}>
                                      {(d.opening_balance != null && d.opening_balance >= 0 ? 1 : 0) + dayCashTransactions.length}
                                    </span>
                                  </button>
                                </div>
                                <div className="text-[10px] text-muted-foreground font-semibold">
                                  Session Date: <span className="font-extrabold text-foreground">{formattedDate}</span>{isOwner && isClosed && (<button onClick={(e) => { e.stopPropagation(); initiateReopenDrawer(d); }} className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-[10px] shadow-xs transition-all cursor-pointer active:scale-95 ml-2" title="Reopen this closed shift session"><RotateCcw className="w-3 h-3" /> Reopen Register</button>)}
                                </div>
                              </div>

                              {/* Subtab 1: Bills History */}
                              {expandedSubTab === 'bills' ? (
                                daySettlements.length === 0 ? (
                                  <div className="flex flex-col items-center justify-center py-8 gap-2">
                                    <Receipt className="w-8 h-8 text-muted-foreground/30" />
                                    <p className="text-xs text-muted-foreground font-bold">No bills found for this date</p>
                                  </div>
                                ) : (
                                  <div className="p-6">
                                    <div className="rounded-xl border border-border/80 bg-card overflow-hidden shadow-xs">
                                      {/* Sub-header */}
                                      <div className="grid grid-cols-[1.2fr_1.3fr_0.9fr_0.9fr_1fr_0.9fr] gap-x-3 px-4 py-2.5 text-[9px] font-black text-muted-foreground uppercase tracking-wider border-b border-border bg-muted/30">
                                        <span>Invoice #</span>
                                        <span>Customer</span>
                                        <span className="text-right">Grand Total</span>
                                        <span className="text-right">Discount</span>
                                        <span className="text-center">Payment Badge</span>
                                        <span className="text-right">Biller</span>
                                      </div>
                                      <div className="divide-y divide-border/30">
                                        {daySettlements.map((inv) => (
                                          <div key={inv.invoice_id} className="grid grid-cols-[1.2fr_1.3fr_0.9fr_0.9fr_1fr_0.9fr] gap-x-3 px-4 py-2.5 items-center hover:bg-muted/20 transition-colors">
                                            <button
                                              onClick={() => handleViewInvoice(inv)}
                                              className="text-xs font-extrabold text-primary hover:underline text-left cursor-pointer flex items-center gap-1.5"
                                              title="View bill details & reprint"
                                            >
                                              <Receipt className="w-3.5 h-3.5 shrink-0 opacity-70" />
                                              {inv.invoice_number}
                                            </button>
                                            <span className="text-xs text-foreground font-medium truncate">
                                              {inv.customer_name || 'Walk-in Customer'}
                                            </span>
                                            <span className="text-xs text-right tabular-nums text-foreground font-extrabold">
                                              {formatCurrency(inv.grand_total)}
                                            </span>
                                            <span className="text-xs text-right tabular-nums text-amber-500 font-bold">
                                              {inv.discount_total ? formatCurrency(inv.discount_total) : '—'}
                                            </span>
                                            <div className="flex justify-center">
                                              <span className={clsx(
                                                'text-[9px] font-black px-2 py-0.5 rounded-md text-center border',
                                                inv.payment_method === 'CASH' ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20' :
                                                inv.payment_method === 'CARD' ? 'text-blue-600 dark:text-blue-400 bg-blue-500/10 border-blue-500/20' :
                                                inv.payment_method === 'UPI' ? 'text-violet-600 dark:text-violet-400 bg-violet-500/10 border-violet-500/20' :
                                                'text-muted-foreground bg-muted/50 border-border'
                                              )}>
                                                {inv.payment_method}
                                              </span>
                                            </div>
                                            <span className="text-[10px] text-muted-foreground text-right truncate font-medium">{inv.biller_name || '—'}</span>
                                          </div>
                                        ))}
                                      </div>

                                      {/* Bills Summary Footer */}
                                      {(() => {
                                        const totalAmt = daySettlements.reduce((s: number, i) => s + Number(i.grand_total || 0), 0);
                                        const totalDisc = daySettlements.reduce((s: number, i) => s + Number(i.discount_total || 0), 0);
                                        const totalRecv = daySettlements.reduce((s: number, i) => s + Number(i.received_amount || 0), 0);
                                        return (
                                          <div className="grid grid-cols-[1.2fr_1.3fr_0.9fr_0.9fr_1fr_0.9fr] gap-x-3 px-4 py-3 border-t border-border/80 bg-muted/40 font-bold">
                                            <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Total Billed</span>
                                            <span />
                                            <span className="text-xs text-right font-black text-foreground tabular-nums">{formatCurrency(totalAmt)}</span>
                                            <span className="text-xs text-right font-black text-amber-500 tabular-nums">{formatCurrency(totalDisc)}</span>
                                            <div className="flex justify-center">
                                              <span className="text-[9px] font-black text-violet-600 dark:text-violet-400 tabular-nums">{formatCurrency(totalRecv)} received</span>
                                            </div>
                                            <span />
                                          </div>
                                        );
                                      })()}
                                    </div>
                                  </div>
                                )
                              ) : (
                                /* Subtab 2: Cash Register History */
                                dayCashTransactions.length === 0 && (!d.opening_balance || d.opening_balance < 0) ? (
                                  <div className="flex flex-col items-center justify-center py-8 gap-2">
                                    <Banknote className="w-8 h-8 text-muted-foreground/30" />
                                    <p className="text-xs text-muted-foreground font-bold">No cash register entries recorded for this date</p>
                                  </div>
                                ) : (
                                  <div className="p-6">
                                    <div className="rounded-xl border border-border/80 bg-card overflow-hidden shadow-xs">
                                      {/* Sub-header */}
                                      <div className="grid grid-cols-[0.8fr_0.6fr_2fr_1fr_0.8fr] gap-x-3 px-4 py-2.5 text-[9px] font-black text-muted-foreground uppercase tracking-wider border-b border-border bg-muted/30">
                                        <span>Timestamp</span>
                                        <span>Type</span>
                                        <span>Category & Reference Notes</span>
                                        <span className="text-right">Amount</span>
                                        <span className="text-right">Recorded By</span>
                                      </div>
                                      <div className="divide-y divide-border/30">
                                        {/* Opening Balance Row */}
                                        {d.opening_balance != null && d.opening_balance >= 0 && (
                                          <div className="grid grid-cols-[0.8fr_0.6fr_2fr_1fr_0.8fr] gap-x-3 px-4 py-3 items-center hover:bg-muted/20 border-l-3 border-l-primary/70 transition-colors">
                                            <span className="text-[10px] text-muted-foreground tabular-nums font-semibold flex items-center gap-1">
                                              <Clock className="w-3 h-3 text-muted-foreground/60" /> {d.opened_at ? formatTime(d.opened_at) : '—'}
                                            </span>
                                            <div>
                                              <span className="text-[9px] font-black px-2 py-0.5 rounded-md text-center text-primary bg-primary/10 border border-primary/20">OPEN</span>
                                            </div>
                                            <div>
                                              <span className="text-xs font-extrabold text-foreground block">Opening Balance</span>
                                              <span className="text-[10px] text-muted-foreground font-medium">Shift initial drawer balance</span>
                                            </div>
                                            <span className="text-xs text-right tabular-nums font-black text-foreground">{formatCurrency(d.opening_balance)}</span>
                                            <span className="text-[10px] text-muted-foreground text-right truncate font-medium">{d.opened_by_name || '—'}</span>
                                          </div>
                                        )}

                                        {/* Cash Transactions Feed */}
                                        {dayCashTransactions.map((tx) => {
                                          const isIn = tx.type === 'CASH_IN';
                                          return (
                                            <div key={tx.transaction_id} className={clsx(
                                              'grid grid-cols-[0.8fr_0.6fr_2fr_1fr_0.8fr] gap-x-3 px-4 py-3 items-center hover:bg-muted/20 border-l-3 transition-colors',
                                              isIn ? 'border-l-emerald-500' : 'border-l-rose-500'
                                            )}>
                                              <span className="text-[10px] text-muted-foreground tabular-nums font-semibold flex items-center gap-1">
                                                <Clock className="w-3 h-3 text-muted-foreground/60" /> {formatTime(tx.transaction_date)}
                                              </span>
                                              <div>
                                                <span className={clsx(
                                                  'text-[9px] font-black px-2 py-0.5 rounded-md text-center border',
                                                  isIn ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20' : 'text-rose-600 dark:text-rose-400 bg-rose-500/10 border-rose-500/20'
                                                )}>
                                                  {isIn ? 'CASH IN' : 'EXPENSE'}
                                                </span>
                                              </div>
                                              <div className="min-w-0">
                                                <span className="text-xs font-bold text-foreground truncate block">{tx.category || 'Other'}</span>
                                                {tx.notes && <span className="text-[10px] text-muted-foreground font-medium truncate block mt-0.5">{tx.notes}</span>}
                                              </div>
                                              <span className={clsx(
                                                'text-xs text-right tabular-nums font-black',
                                                isIn ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'
                                              )}>
                                                {isIn ? '+' : '−'}{formatCurrency(tx.amount)}
                                              </span>
                                              <div className="flex items-center justify-end gap-2">
                                                <span className="text-[10px] text-muted-foreground text-right truncate font-medium">{tx.entered_by_name || '—'}</span>
                                                {isOwner && (
                                                  <button
                                                    onClick={(e) => {
                                                      e.stopPropagation();
                                                      initiateDeleteTransaction(tx);
                                                    }}
                                                    className="p-1 text-muted-foreground/60 hover:text-rose-500 rounded-md hover:bg-rose-500/10 transition-colors cursor-pointer"
                                                    title="Delete Transaction (Owner Only)"
                                                  >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                  </button>
                                                )}
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>

                                      {/* Cash Movement Totals Footer */}
                                      {(() => {
                                        const cashInSum = dayCashTransactions.filter((t) => t.type === 'CASH_IN').reduce((s: number, t) => s + Number(t.amount || 0), 0);
                                        const cashOutSum = dayCashTransactions.filter((t) => t.type === 'CASH_OUT').reduce((s: number, t) => s + Number(t.amount || 0), 0);
                                        const netCash = cashInSum - cashOutSum;
                                        return (
                                          <div className="grid grid-cols-[0.8fr_0.6fr_2fr_1fr_0.8fr] gap-x-3 px-4 py-3 border-t border-border/80 bg-muted/40 font-bold">
                                            <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Net Movement</span>
                                            <span />
                                            <div className="text-[10px] font-extrabold text-muted-foreground">
                                              <span>In: <span className="text-emerald-500">{formatCurrency(cashInSum)}</span></span>
                                              <span className="mx-2">&middot;</span>
                                              <span>Out: <span className="text-rose-500">{formatCurrency(cashOutSum)}</span></span>
                                            </div>
                                            <span className={clsx(
                                              'text-xs text-right font-black tabular-nums',
                                              netCash >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'
                                            )}>
                                              {netCash >= 0 ? `+${formatCurrency(netCash)}` : formatCurrency(netCash)}
                                            </span>
                                            <span />
                                          </div>
                                        );
                                      })()}
                                    </div>
                                  </div>
                                )
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
