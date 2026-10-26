import React from 'react';
import { nameToHue, getInitials, formatCurrency, formatStock, formatDateTime } from '../scrapFormat';
import clsx from 'clsx';
import { TrendingUp, TrendingDown, Activity, Plus, Pencil, Trash } from 'lucide-react';
import type { View, ScrapCategory, ScrapTransaction } from '../scrapTypes';
import type { ScrapInvoiceTxRow } from '../scrapTypes';

export interface ScrapTransactionsViewProps {
  handleStartEditTx: (tx: ScrapInvoiceTxRow) => void;
  isDark: boolean;
  isOwner: true;
  realizedProfit: number;
  /** Rendered only while a category is selected. */
  selectedCategory: ScrapCategory;
  setConfirmDeleteTxId: React.Dispatch<React.SetStateAction<string | null>>;
  setTxForm: React.Dispatch<React.SetStateAction<{ type: "PURCHASE" | "SALE"; categoryId: string; quantity: string; rate: string; party_name: string; notes: string; }>>;
  setView: React.Dispatch<React.SetStateAction<View>>;
  transactions: ScrapTransaction[];
}

/** One scrap category's transactions with stock summary. */
export function ScrapTransactionsView({
  handleStartEditTx, isDark, isOwner, realizedProfit, selectedCategory, setConfirmDeleteTxId, setTxForm, setView,
  transactions,
}: ScrapTransactionsViewProps) {
  return (
    <div className="flex flex-col flex-1 min-h-0 bg-background">
      <div
        className="shrink-0 px-5 py-4 border-b border-border"
        style={{
          background: isDark
            ? `linear-gradient(135deg, hsl(${nameToHue(selectedCategory.name)}, 25%, 13%) 0%, hsl(${nameToHue(selectedCategory.name)}, 15%, 17%) 100%)`
            : `linear-gradient(135deg, hsl(${nameToHue(selectedCategory.name)}, 60%, 96%) 0%, hsl(${nameToHue(selectedCategory.name)}, 40%, 98%) 100%)`
        }}
      >
        <div className="flex items-center gap-4">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center text-white font-black text-lg shadow-md shrink-0 select-none"
            style={{ background: `linear-gradient(135deg, hsl(${nameToHue(selectedCategory.name)},65%,50%), hsl(${nameToHue(selectedCategory.name)},65%,40%))` }}
          >
            {getInitials(selectedCategory.name)}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={clsx(
                'inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-lg',
                realizedProfit >= 0
                  ? 'text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/40'
                  : 'text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/40'
              )}>
                {realizedProfit >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                Profit: {formatCurrency(realizedProfit)}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground font-medium mt-1.5">
              {transactions.length} {transactions.length === 1 ? 'transaction' : 'transactions'}
            </p>
          </div>

          <div className={clsx(
            'shrink-0 text-right px-4 py-3 rounded-2xl shadow-sm',
            Number(selectedCategory.current_stock) > 0
              ? 'bg-emerald-500 text-white'
              : 'bg-muted text-muted-foreground border border-border'
          )}>
            <p className="text-xl font-black leading-none">
              {formatStock(selectedCategory.current_stock)}
            </p>
            <p className="text-[10px] font-bold uppercase tracking-widest mt-1 opacity-80">
              {selectedCategory.unit}
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        {transactions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
            <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
              <Activity className="w-8 h-8 text-muted-foreground/50" />
            </div>
            <div>
              <p className="text-base font-bold text-foreground">No transactions yet</p>
              <p className="text-sm text-muted-foreground mt-0.5">Add the first transaction to start tracking</p>
            </div>
            {isOwner && (
              <button
                onClick={() => {
                  setTxForm({ type: 'PURCHASE', categoryId: selectedCategory.scrap_category_id, quantity: '', rate: String(selectedCategory.purchase_price), party_name: '', notes: '' });
                  setView('tx_form');
                }}
                className="mt-2 flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-bold shadow-sm hover:bg-primary/90 transition-all active:scale-95 cursor-pointer"
              >
                <Plus className="w-4 h-4" /> Add Transaction
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2.5">
            {[...transactions].reverse().map((entry) => {
              const isPurchase = entry.type === 'PURCHASE';
              return (
                <div
                  key={entry.transaction_id}
                  className={clsx(
                    'rounded-xl border bg-card shadow-sm overflow-hidden transition-all duration-200 hover:shadow-md',
                    isPurchase ? 'border-emerald-200 dark:border-emerald-900/50' : 'border-red-200 dark:border-red-900/50'
                  )}
                >
                  <div className={clsx('h-1 w-full', isPurchase ? 'bg-emerald-500' : 'bg-red-500')} />

                  <div className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-2">
                          <span className={clsx(
                            'inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-lg',
                            isPurchase ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'
                          )}>
                            {isPurchase ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                            {isPurchase ? 'Purchase' : 'Sale'}
                          </span>
                          {entry.party_name && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-muted-foreground bg-muted border border-border px-2 py-1 rounded-lg">
                              {entry.party_name}
                            </span>
                          )}
                        </div>

                        <p className="font-bold text-sm text-foreground leading-snug">
                          {entry.notes || `${entry.quantity.toFixed(3)} ${selectedCategory.unit} of ${entry.scrap_category_name || selectedCategory.name}`}
                        </p>

                        <div className="flex items-center gap-3 mt-2 flex-wrap">
                          <span className="flex items-center gap-1 text-[11px] text-muted-foreground font-medium">
                            {formatDateTime(entry.created_at)}
                          </span>
                          <span className="text-[11px] text-muted-foreground font-medium">
                            {entry.quantity.toFixed(3)} {selectedCategory.unit} × ₹{entry.rate.toFixed(2)}
                          </span>
                        </div>
                      </div>

                      <div className="shrink-0 flex flex-col items-end gap-1.5">
                        <p className={clsx(
                          'text-xl font-black leading-none',
                          isPurchase ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'
                        )}>
                          {isPurchase ? '+' : '−'}₹{entry.total_amount.toFixed(2)}
                        </p>
                        {isOwner && (
                          <div className="flex items-center gap-1 mt-1">
                            <button
                              onClick={() => handleStartEditTx(entry)}
                              className="p-1 rounded text-muted-foreground hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all cursor-pointer"
                              title="Edit"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setConfirmDeleteTxId(entry.transaction_id)}
                              className="p-1 rounded text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all cursor-pointer"
                              title="Delete"
                            >
                              <Trash className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
