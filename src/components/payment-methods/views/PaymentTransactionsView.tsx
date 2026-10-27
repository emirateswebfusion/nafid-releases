import clsx from 'clsx';
import { TYPE_CONFIG, QUICK_CATEGORIES, formatDateTime } from '../paymentMethodsTypes';
import { formatCurrency } from '../../../utils/pricing/money';
import { PlusCircle, ArrowDownToLine, ArrowUpFromLine, Search, X, History } from 'lucide-react';
import { Input } from '../../ui/Input';
import { Skeleton } from '../../ui/Skeleton';
import type { PaymentSource, SourceTransaction } from '../paymentMethodsTypes';
import type { PaymentMethodsState } from '../hooks/usePaymentMethodsState';

export interface PaymentTransactionsViewProps {
  filteredTransactions: SourceTransaction[];
  isOwner: boolean;
  saveTransaction: () => Promise<void>;
  /** Rendered only while it is set. */
  txTotalIn: number;
  txTotalOut: number;
  /** Rendered only while it is set. */
  selectedSource: PaymentSource;
  pmState: PaymentMethodsState;
}

/** Transaction ledger of the selected payment method: summary card, manual cash in / out entry, transaction log. */
export function PaymentTransactionsView({
  selectedSource, filteredTransactions, isOwner, saveTransaction, txTotalIn, txTotalOut, pmState,
}: PaymentTransactionsViewProps) {
  const { isSavingTx, loadingTx, setShowNotes, setTxForm, setTxSearch, showNotes, txForm, txSearch } = pmState;
  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in duration-300">
      
      {/* Header channel summary card */}
      <div className="bg-card/80 border border-border/80 rounded-3xl p-6 shadow-sm backdrop-blur-md select-none flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className={clsx('w-14 h-14 rounded-2xl flex items-center justify-center border shadow-inner', TYPE_CONFIG[selectedSource.type].badgeBg)}>
            {(() => {
              const Icon = TYPE_CONFIG[selectedSource.type].icon;
              return <Icon className="w-7 h-7" />;
            })()}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-black text-foreground">{selectedSource.name}</h2>
              {selectedSource.is_default === 1 && (
                <span className="text-[10px] font-extrabold uppercase bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30 rounded-full px-2 py-0.5">
                  Default
                </span>
              )}
            </div>
            <div className="text-xs text-muted-foreground font-semibold mt-0.5">
              {TYPE_CONFIG[selectedSource.type].label}
              {selectedSource.bank_name && ` · ${selectedSource.bank_name}`}
              {selectedSource.account_number && ` · ${selectedSource.account_number}`}
              {selectedSource.upi_id && ` · ${selectedSource.upi_id}`}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-6 self-end md:self-auto">
          <div className="text-right">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground block">Net Cash In</span>
            <span className="font-mono text-sm font-bold text-emerald-600 dark:text-emerald-400">+{formatCurrency(txTotalIn)}</span>
          </div>
          <div className="text-right">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground block">Net Cash Out</span>
            <span className="font-mono text-sm font-bold text-red-600 dark:text-red-400">-{formatCurrency(txTotalOut)}</span>
          </div>
          <div className="text-right pl-4 border-l border-border/60">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground block">Current Balance</span>
            <span className="font-mono text-xl font-black text-foreground">{formatCurrency(selectedSource.current_balance)}</span>
          </div>
        </div>
      </div>

      {/* Quick Record Manual Entry Panel */}
      {isOwner && (
        <div className="bg-card/80 border border-border/80 rounded-3xl p-5 shadow-sm backdrop-blur-md space-y-4">
          <div className="flex items-center justify-between border-b border-border/40 pb-3">
            <h3 className="text-xs font-black text-foreground uppercase tracking-wider flex items-center gap-2 select-none">
              <PlusCircle className="w-4 h-4 text-primary" />
              <span>Record Manual Transaction Entry</span>
            </h3>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setTxForm({ ...txForm, type: 'CASH_IN' })}
                className={clsx(
                  'px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer',
                  txForm.type === 'CASH_IN' ? 'bg-emerald-600 text-white shadow-sm' : 'bg-muted text-muted-foreground hover:text-foreground'
                )}
              >
                + Money In (Deposit)
              </button>
              <button
                type="button"
                onClick={() => setTxForm({ ...txForm, type: 'CASH_OUT' })}
                className={clsx(
                  'px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer',
                  txForm.type === 'CASH_OUT' ? 'bg-red-600 text-white shadow-sm' : 'bg-muted text-muted-foreground hover:text-foreground'
                )}
              >
                - Money Out (Withdrawal)
              </button>
            </div>
          </div>

          {/* Quick Category Chips */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mr-1 select-none">Presets:</span>
            {QUICK_CATEGORIES.map(cat => (
              <button
                key={cat}
                type="button"
                onClick={() => setTxForm({ ...txForm, category: cat })}
                className={clsx(
                  'px-2.5 py-1 text-[11px] font-semibold rounded-lg border transition-all cursor-pointer',
                  txForm.category === cat
                    ? 'bg-primary/10 border-primary/40 text-primary font-bold'
                    : 'bg-muted/40 border-border/50 text-muted-foreground hover:text-foreground hover:bg-muted'
                )}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
            <div className="sm:col-span-3">
              <label className="text-[10px] font-bold text-muted-foreground mb-1 block uppercase tracking-wider">Amount (₹) *</label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={txForm.amount}
                onChange={e => setTxForm({ ...txForm, amount: e.target.value })}
                placeholder="0.00"
              />
            </div>

            <div className="sm:col-span-4">
              <label className="text-[10px] font-bold text-muted-foreground mb-1 block uppercase tracking-wider">Category</label>
              <Input
                value={txForm.category}
                onChange={e => setTxForm({ ...txForm, category: e.target.value })}
                placeholder="e.g. Vendor Payment / Invoice #1024"
              />
            </div>

            <div className="sm:col-span-3">
              <label className="text-[10px] font-bold text-muted-foreground mb-1 block uppercase tracking-wider">Reference / UTR</label>
              <Input
                value={txForm.reference_number}
                onChange={e => setTxForm({ ...txForm, reference_number: e.target.value })}
                placeholder="e.g. UTR-94827103"
              />
            </div>

            <div className="sm:col-span-2 flex items-end">
              <button
                type="button"
                onClick={saveTransaction}
                disabled={isSavingTx}
                className={clsx(
                  'w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl hover:opacity-90 active:scale-95 transition-all shadow-sm disabled:opacity-50 cursor-pointer h-10',
                  txForm.type === 'CASH_IN'
                    ? 'bg-emerald-600 text-white shadow-emerald-900/20'
                    : 'bg-red-600 text-white shadow-red-900/20'
                )}
              >
                {txForm.type === 'CASH_IN' ? <ArrowDownToLine className="w-4 h-4" /> : <ArrowUpFromLine className="w-4 h-4" />}
                <span>{isSavingTx ? 'Posting...' : 'Post Entry'}</span>
              </button>
            </div>
          </div>

          {showNotes ? (
            <div className="pt-2">
              <Input
                value={txForm.notes}
                onChange={e => setTxForm({ ...txForm, notes: e.target.value })}
                placeholder="Add optional notes or ledger reference detail..."
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowNotes(true)}
              className="text-[11px] font-bold text-primary hover:underline cursor-pointer"
            >
              + Add notes to transaction
            </button>
          )}
        </div>
      )}

      {/* Transactions Log & Table */}
      <div className="bg-card/80 border border-border/80 rounded-3xl overflow-hidden shadow-sm backdrop-blur-md">
        <div className="p-4 border-b border-border/60 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-extrabold text-foreground uppercase tracking-wider">Transaction History</h3>
            <span className="text-xs text-muted-foreground font-semibold">({filteredTransactions.length} entries)</span>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50 pointer-events-none" />
            <input
              type="text"
              value={txSearch}
              onChange={e => setTxSearch(e.target.value)}
              placeholder="Search UTR, category, notes..."
              className="w-full pl-8 pr-7 py-1.5 text-xs bg-background/60 border border-border/60 rounded-xl focus:outline-none focus:border-primary transition-all font-semibold text-foreground"
            />
            {txSearch && (
              <button
                onClick={() => setTxSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground p-0.5 hover:text-foreground rounded"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {loadingTx ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-12 rounded-xl" />)}
          </div>
        ) : filteredTransactions.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <History className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-xs font-semibold">No transactions recorded for this method yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left uppercase tracking-wider text-muted-foreground border-b border-border/60 bg-muted/40 font-extrabold text-[10px]">
                  <th className="px-5 py-3">Date &amp; Time</th>
                  <th className="px-5 py-3">Type</th>
                  <th className="px-5 py-3">Category &amp; Notes</th>
                  <th className="px-5 py-3">Reference / UTR</th>
                  <th className="px-5 py-3 text-right">Amount</th>
                  <th className="px-5 py-3 text-right">Running Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40 font-medium">
                {filteredTransactions.map(t => (
                  <tr key={t.transaction_id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-5 py-3.5 text-muted-foreground font-mono whitespace-nowrap">
                      {formatDateTime(t.transaction_date)}
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      <span className={clsx(
                        'inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full border',
                        t.type === 'CASH_IN'
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                          : 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30'
                      )}>
                        {t.type === 'CASH_IN' ? <ArrowDownToLine className="w-3 h-3" /> : <ArrowUpFromLine className="w-3 h-3" />}
                        {t.type === 'CASH_IN' ? 'Deposit' : 'Withdrawal'}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="font-bold text-foreground block">{t.category || 'General Ledger'}</span>
                      {t.notes && <span className="text-muted-foreground text-[11px] block mt-0.5">{t.notes}</span>}
                      {t.entered_by_name && <span className="text-[10px] text-muted-foreground/70 block">By: {t.entered_by_name}</span>}
                    </td>
                    <td className="px-5 py-3.5 font-mono text-muted-foreground font-semibold">
                      {t.reference_number ? (
                        <span className="bg-muted px-2 py-0.5 rounded border border-border/60 text-[11px]">
                          {t.reference_number}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className={clsx(
                      'px-5 py-3.5 text-right font-mono font-bold whitespace-nowrap text-sm',
                      t.type === 'CASH_IN' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                    )}>
                      {t.type === 'CASH_IN' ? '+' : '-'}{formatCurrency(t.amount)}
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono font-bold text-foreground whitespace-nowrap">
                      {formatCurrency(t.running_balance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
}
