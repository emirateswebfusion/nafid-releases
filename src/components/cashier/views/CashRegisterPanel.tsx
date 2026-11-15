import React from 'react';
import clsx from 'clsx';
import { Receipt, Plus, AlertTriangle, RotateCcw, TrendingUp, TrendingDown, CheckCircle2, Banknote, Clock, FileText, ChevronDown, Trash2 } from 'lucide-react';
import { partiesApi } from '../../../data/parties';
import { cashierApi } from '../../../data/cashier';
import { formatCurrency } from '../../../utils/pricing/money';
import { formatTime, formatCashierCategory, formatCashierNotes } from '../cashierFormat';
import type { CashCategoryRow, CashDrawerRow, CashPartyRow, CashTransactionRow } from '../cashierTypes';

export interface CashRegisterPanelProps {
  drawer: CashDrawerRow | null;
  expandedTxId: string | null;
  initiateDeleteTransaction: (tx: CashTransactionRow) => void;
  initiateReopenDrawer: (targetDrawer: CashDrawerRow) => void;
  isOwner: boolean;
  parties: CashPartyRow[];
  setCustomCategories: React.Dispatch<React.SetStateAction<CashCategoryRow[]>>;
  setExpandedTxId: React.Dispatch<React.SetStateAction<string | null>>;
  setNewCatName: React.Dispatch<React.SetStateAction<string>>;
  setParties: React.Dispatch<React.SetStateAction<CashPartyRow[]>>;
  setPartySearch: React.Dispatch<React.SetStateAction<string>>;
  setShowAddCatForm: React.Dispatch<React.SetStateAction<boolean>>;
  setShowTxnModal: React.Dispatch<React.SetStateAction<boolean>>;
  setTxnAmt: React.Dispatch<React.SetStateAction<number>>;
  setTxnCat: React.Dispatch<React.SetStateAction<string>>;
  setTxnNote: React.Dispatch<React.SetStateAction<string>>;
  setTxnPartyId: React.Dispatch<React.SetStateAction<string>>;
  setTxnPartyName: React.Dispatch<React.SetStateAction<string>>;
  showSettlement: boolean;
  tenantId: string | null;
  totalIn: number;
  totalOut: number;
  transactions: CashTransactionRow[];
}

/** Cash register panel: opening balance, drawer status and the day's transactions. */
export function CashRegisterPanel({
  drawer, expandedTxId, initiateDeleteTransaction, initiateReopenDrawer, isOwner, parties, setCustomCategories,
  setExpandedTxId, setNewCatName, setParties, setPartySearch, setShowAddCatForm, setShowTxnModal, setTxnAmt,
  setTxnCat, setTxnNote, setTxnPartyId, setTxnPartyName, showSettlement, tenantId, totalIn, totalOut, transactions,
}: CashRegisterPanelProps) {
  return (
    <div className={clsx('shrink-0 flex flex-col bg-card z-10', showSettlement ? 'w-[400px] border-l border-border' : 'flex-1')}>

      {/* Panel header */}
      <div className="relative shrink-0">
        <div
          className="absolute inset-x-0 top-0 h-0.5"
          style={{ background: 'linear-gradient(90deg, transparent 0%, hsl(217,91%,60%) 50%, transparent 100%)' }}
        />
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-500/10">
              <Receipt className="w-4 h-4 text-blue-500" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-extrabold text-foreground tracking-tight">Cash Register</h2>
                {drawer && (
                  <span className={clsx(
                    'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border',
                    drawer.status === 'OPEN' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25' :
                    drawer.status === 'CLOSED' ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/25' :
                    'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25'
                  )}>
                    <span className={clsx('w-1.5 h-1.5 rounded-full shrink-0', drawer.status === 'OPEN' ? 'bg-emerald-500 animate-pulse' : drawer.status === 'CLOSED' ? 'bg-rose-500' : 'bg-amber-500')} />
                    {drawer.status === 'OPEN' ? 'Open' : drawer.status === 'CLOSED' ? 'Closed' : 'Not Started'}
                  </span>
                )}
              </div>
            </div>
          </div>
          <button
            disabled={drawer?.status === 'CLOSED'}
            onClick={async () => {
              if (drawer?.status === 'CLOSED') return;
              setTxnAmt(0); setTxnCat(''); setTxnNote('');
              setTxnPartyId(''); setTxnPartyName(''); setPartySearch(''); setShowAddCatForm(false); setNewCatName('');
              setShowTxnModal(true);
              if (!parties.length) {
                const p = await partiesApi.getParties(tenantId!);
                if (Array.isArray(p)) setParties(p);
              }
              const cats = await cashierApi.getCategories({ tenant_id: tenantId! });
              if (Array.isArray(cats)) setCustomCategories(cats);
            }}
            className={clsx(
              "flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all duration-200 active:scale-95",
              drawer?.status === 'CLOSED'
                ? "opacity-40 cursor-not-allowed text-muted-foreground border border-border bg-muted/20"
                : "text-primary hover:bg-primary/10 border border-primary/20 cursor-pointer"
            )}
            title={drawer?.status === 'CLOSED' ? "Cash register is closed. Cannot add entries." : "Add Entry"}
          >
            <Plus className="w-3.5 h-3.5" /> Add Entry
          </button>
        </div>
      </div>

      {/* Closed drawer warning banner */}
      {drawer?.status === 'CLOSED' && (
        <div className="flex items-center gap-2 px-4 py-2 bg-rose-500/10 border-b border-rose-500/20 text-rose-600 dark:text-rose-400 shrink-0 text-xs font-bold">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span>Cash Register is closed for this date. Entries are locked.</span>
          {isOwner && (
            <button
              onClick={() => initiateReopenDrawer(drawer)}
              className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-sm transition-all cursor-pointer active:scale-95 ml-auto"
              title="Reopen closed cash register"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Reopen Register
            </button>
          )}
        </div>
      )}

      {/* Mini stat cards */}
      <div className="grid grid-cols-2 gap-2 px-4 py-3 border-b border-border bg-muted/5 shrink-0">
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-card border border-border shadow-sm">
            <div className="p-1.5 rounded-lg bg-gradient-to-br from-emerald-500/15 to-emerald-500/5 text-emerald-500 shadow-inner shrink-0">
              <TrendingUp className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0">
              <p className="text-[8px] font-bold text-muted-foreground uppercase tracking-wider">Cash In</p>
              <p className="text-xs font-black text-emerald-600 dark:text-emerald-400 tabular-nums leading-tight truncate">{formatCurrency(totalIn)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-card border border-border shadow-sm">
            <div className="p-1.5 rounded-lg bg-gradient-to-br from-rose-500/15 to-rose-500/5 text-rose-500 shadow-inner shrink-0">
              <TrendingDown className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0">
              <p className="text-[8px] font-bold text-muted-foreground uppercase tracking-wider">Cash Out</p>
              <p className="text-xs font-black text-rose-600 dark:text-rose-400 tabular-nums leading-tight truncate">{formatCurrency(totalOut)}</p>
            </div>
          </div>
        </div>

      {drawer?.payment_totals && Object.keys(drawer.payment_totals).length > 0 && (
        <div className="grid grid-cols-2 gap-2 px-4 py-3 border-b border-border" aria-label="Selected payment collections">
          {Object.entries(drawer.payment_totals).map(([method, amount]) => (
            <div key={method} className="rounded-xl border border-border p-3 text-xs">
              <span>{method === 'BANK_TRANSFER' ? 'Bank Transfer' : method}</span>
              <strong className="block">{formatCurrency(amount)}</strong>
            </div>
          ))}
        </div>
      )}
      {/* Column headers */}
      <div className="grid grid-cols-[0.55fr_0.5fr_1fr_0.75fr_auto] gap-2 px-5 py-2 text-[10px] font-black text-muted-foreground uppercase tracking-wider border-b border-border bg-muted/20 shrink-0">
        <span>Time</span>
        <span>Type</span>
        <span>Category</span>
        <span className="text-right">Amount</span>
        <span className="text-right">By</span>
      </div>

      {/* Transaction feed */}
      <div className="flex-1 overflow-y-auto">
        {drawer?.status === 'CLOSED' ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground p-8">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500/15 to-emerald-500/5 flex items-center justify-center shadow-inner border border-emerald-500/20">
              <CheckCircle2 className="w-7 h-7 text-emerald-500" />
            </div>
            <div className="text-center max-w-[250px]">
              <p className="text-sm font-extrabold text-foreground">Cash Register Closed</p>
              <p className="text-xs text-muted-foreground/80 mt-1 leading-relaxed">
                Shift completed & settled. All entries are safely archived in <strong>History</strong>.
              </p>
            </div>
          </div>
        ) : transactions.length === 0 && (!drawer || drawer.opening_balance == null) ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground p-8">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-muted to-muted/40 flex items-center justify-center shadow-inner">
              <Banknote className="w-6 h-6 text-muted-foreground/40" />
            </div>
            <div className="text-center">
              <p className="text-sm font-bold">No manual entries</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Use Add Entry to record cash-in or expenses</p>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-border/30">
            {/* Prepend Opening Balance Row */}
            {drawer && drawer.opening_balance != null && drawer.opening_balance >= 0 && (
              <div className="grid grid-cols-[0.55fr_0.5fr_1fr_0.75fr_auto] gap-2 px-5 py-2.5 bg-card hover:bg-muted/20 transition-colors items-center border-l-2 border-l-primary/50">
                <span className="text-[10px] text-muted-foreground tabular-nums flex items-center gap-0.5">
                  <Clock className="w-2.5 h-2.5 shrink-0" /> {drawer.opened_at ? formatTime(drawer.opened_at) : '—'}
                </span>
                <span className="text-[9px] font-black px-1.5 py-0.5 rounded-md text-center w-fit text-primary bg-primary/10">
                  OPEN
                </span>
                <span className="text-xs text-foreground truncate font-bold">Opening Balance</span>
                <span className="text-xs font-black text-right tabular-nums text-foreground">
                  {formatCurrency(drawer.opening_balance)}
                </span>
                <span className="text-[10px] text-muted-foreground truncate text-right">—</span>
              </div>
            )}
            {transactions.map((tx) => {
              const isIn = tx.type === 'CASH_IN';
              const cleanCat = formatCashierCategory(tx.category, tx.party_name, tx.type);
              const cleanNotes = formatCashierNotes(tx.notes, tx.party_name, tx.category);
              const hasCustomCat = cleanCat && cleanCat !== 'Other';
              const hasNotes = Boolean(cleanNotes && cleanNotes.trim() !== '');
              const isExpanded = expandedTxId === tx.transaction_id;

              // If category is not selected or 'Other', but notes exist -> display notes directly!
              const primaryText = hasCustomCat ? cleanCat : (hasNotes ? cleanNotes! : 'Other');
              const secondaryText = (hasCustomCat && hasNotes && cleanNotes !== cleanCat) ? cleanNotes : null;

              return (
                <div key={tx.transaction_id} className="border-b border-border/30 last:border-0">
                  <div
                    onClick={() => hasNotes && setExpandedTxId(isExpanded ? null : tx.transaction_id)}
                    className={clsx(
                      'grid grid-cols-[0.55fr_0.5fr_1fr_0.75fr_auto] gap-2 px-5 py-2.5 bg-card hover:bg-muted/30 transition-colors items-center border-l-2 select-none',
                      hasNotes ? 'cursor-pointer' : 'cursor-default',
                      isIn ? 'border-l-emerald-500/50' : 'border-l-rose-500/50',
                      isExpanded && 'bg-muted/20'
                    )}
                    title={hasNotes ? "Click to view full notes & details" : undefined}
                  >
                    <span className="text-[10px] text-muted-foreground tabular-nums flex items-center gap-0.5">
                      <Clock className="w-2.5 h-2.5 shrink-0" /> {formatTime(tx.transaction_date)}
                    </span>
                    <span className={clsx(
                      'text-[9px] font-black px-1.5 py-0.5 rounded-md text-center w-fit',
                      isIn ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10' : 'text-rose-600 dark:text-rose-400 bg-rose-500/10'
                    )}>
                      {isIn ? 'IN' : 'OUT'}
                    </span>
                    
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs text-foreground truncate font-semibold flex items-center gap-1">
                        {hasNotes && !hasCustomCat && <FileText className="w-3 h-3 text-primary shrink-0" />}
                        {primaryText}
                      </span>
                      {secondaryText && (
                        <span className="text-[10px] text-muted-foreground truncate flex items-center gap-1">
                          <FileText className="w-2.5 h-2.5 text-primary/70 shrink-0" />
                          {secondaryText}
                        </span>
                      )}
                    </div>

                    <span className={clsx('text-xs font-black text-right tabular-nums', isIn ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500')}>
                      {isIn ? '+' : '−'}{formatCurrency(tx.amount)}
                    </span>

                    <div className="flex items-center justify-end gap-1 text-muted-foreground">
                      <span className="text-[10px] truncate max-w-[65px]">{tx.entered_by_name || '—'}</span>
                      {hasNotes ? (
                        <span className={clsx('p-0.5 rounded transition-transform', isExpanded && 'rotate-180')}>
                          <ChevronDown className="w-3 h-3 text-muted-foreground/70" />
                        </span>

                      ) : isOwner && !tx.source ? (
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

                      ) : null}
                    </div>
                  </div>

                  {/* Expanded Details Card */}
                  {isExpanded && (
                    <div className="px-5 py-3 bg-muted/30 border-t border-border/40 text-xs space-y-2">
                      <div className="flex items-center justify-between text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                        <span className="flex items-center gap-1">
                          <FileText className="w-3 h-3 text-primary" /> Transaction Details
                        </span>
                        <div className="flex items-center gap-2">
                          {tx.entered_by_name && <span>Entered by: {tx.entered_by_name}</span>}
                          {isOwner && !tx.source && (
                            <button
                              onClick={() => initiateDeleteTransaction(tx)}
                              className="flex items-center gap-1 px-2 py-0.5 text-rose-500 hover:text-white bg-rose-500/10 hover:bg-rose-600 rounded-md text-[10px] font-bold transition-colors cursor-pointer"
                              title="Delete Transaction (Owner Only)"
                            >
                              <Trash2 className="w-3 h-3" /> Delete
                            </button>
                          )}
                        </div>
                      </div>

                      {hasNotes ? (
                        <div className="p-2.5 rounded-xl bg-card border border-border/60 text-xs font-medium text-foreground whitespace-pre-wrap leading-relaxed shadow-inner">
                          <span className="text-[10px] font-black text-primary uppercase tracking-wider block mb-1">Notes:</span>
                          {tx.notes}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground italic">No additional note attached to this transaction.</p>
                      )}

                      <div className="flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground font-medium pt-0.5">
                        <span>Category: <strong className="text-foreground">{cleanCat || 'Other'}</strong></span>
                        <span>Type: <strong className={isIn ? 'text-emerald-600' : 'text-rose-500'}>{isIn ? 'Cash In' : 'Expense'}</strong></span>
                        <span>Amount: <strong className="text-foreground">{formatCurrency(tx.amount)}</strong></span>
                        <span>Time: <strong className="text-foreground">{formatTime(tx.transaction_date)}</strong></span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
