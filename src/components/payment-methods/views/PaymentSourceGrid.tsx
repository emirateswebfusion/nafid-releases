import React from 'react';
import { Skeleton } from '../../ui/Skeleton';
import { Wallet, Plus, Star, Loader2, Check, Copy, History, Pencil, Trash2 } from 'lucide-react';
import { TYPE_CONFIG } from '../paymentMethodsTypes';
import clsx from 'clsx';
import { formatCurrency } from '../../../utils/money';
import type { PaymentSource } from '../paymentMethodsTypes';
import type { PaymentMethodsState } from '../hooks/usePaymentMethodsState';

export interface PaymentSourceGridProps {
  copyToClipboard: (text: string, idKey: string) => void;
  deleteSource: (s: PaymentSource) => void;
  filteredSources: PaymentSource[];
  isOwner: boolean;
  openAdd: () => void;
  openEdit: (s: PaymentSource) => void;
  openTransactions: (s: PaymentSource) => Promise<void>;
  toggleSourceDefault: (s: PaymentSource, e: React.MouseEvent) => Promise<void>;
  toggleSourceEnabled: (s: PaymentSource, e: React.MouseEvent) => Promise<void>;
  pmState: PaymentMethodsState;
}

/** Grid of payment method cards (loading skeleton, empty state) with owner toggles, copy, ledger, edit and delete. */
export function PaymentSourceGrid({
  copyToClipboard, deleteSource, filteredSources, isOwner, openAdd, openEdit, openTransactions, toggleSourceDefault,
  toggleSourceEnabled, pmState,
}: PaymentSourceGridProps) {
  const { copiedId, loading, search, togglingId } = pmState;
  return (
    <>
    {loading ? (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-56 rounded-3xl" />)}
      </div>
    ) : filteredSources.length === 0 ? (
      <div className="text-center py-20 bg-card/40 border border-border/60 rounded-3xl backdrop-blur-md">
        <div className="w-16 h-16 rounded-3xl bg-muted/60 flex items-center justify-center mx-auto mb-4 border border-border/40">
          <Wallet className="w-8 h-8 text-muted-foreground/50" />
        </div>
        <h3 className="text-sm font-bold text-foreground">No payment methods found</h3>
        <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
          {search ? 'No channel matches your search term. Try resetting your filter.' : 'Link your bank account, card, or UPI portal to get started.'}
        </p>
        {isOwner && !search && (
          <button
            onClick={openAdd}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-xs font-bold bg-primary text-primary-foreground rounded-xl hover:opacity-90 transition-all shadow-sm cursor-pointer"
          >
            <Plus className="w-4 h-4" /> Add Payment Method
          </button>
        )}
      </div>
    ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {filteredSources.map(s => {
          const cfg = TYPE_CONFIG[s.type] || TYPE_CONFIG.BANK;
          const Icon = cfg.icon;

          return (
            <div
              key={s.source_id}
              className={clsx(
                'relative group overflow-hidden bg-card/80 dark:bg-card/50 border rounded-3xl p-6 shadow-sm hover:shadow-xl hover:border-primary/40 transition-all duration-300 backdrop-blur-md flex flex-col justify-between',
                s.is_enabled === 1 ? 'border-border/70' : 'border-border/30 opacity-60 bg-muted/20',
                s.is_default === 1 && 'ring-2 ring-primary/40 shadow-primary/5'
              )}
            >
              {/* Card Top Strip Header */}
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className={clsx(
                      'w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 border shadow-inner transition-transform group-hover:scale-105',
                      cfg.badgeBg
                    )}>
                      <Icon className="w-6 h-6" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-black text-sm text-foreground truncate">{s.name}</h3>
                        {s.is_default === 1 && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30 rounded-full px-2.5 py-0.5">
                            <Star className="w-3 h-3 fill-amber-500" /> Default
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground font-semibold mt-0.5 flex items-center gap-1.5">
                        <span>{cfg.label}</span>
                        {s.bank_name && <span>· {s.bank_name}</span>}
                      </div>
                    </div>
                  </div>

                  {/* Quick Interactive Toggles (Owner only) */}
                  {isOwner && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        disabled={togglingId === s.source_id}
                        onClick={e => toggleSourceDefault(s, e)}
                        title={s.is_default === 1 ? 'Current Default Method' : 'Set as Default Method'}
                        className={clsx(
                          'p-2 rounded-xl border transition-all cursor-pointer',
                          s.is_default === 1
                            ? 'bg-amber-500/10 border-amber-500/40 text-amber-600 dark:text-amber-400'
                            : 'bg-muted/40 border-border/60 text-muted-foreground hover:text-amber-500 hover:bg-amber-500/10',
                          togglingId === s.source_id && 'opacity-60 cursor-wait'
                        )}
                      >
                        <Star className={clsx('w-3.5 h-3.5', s.is_default === 1 && 'fill-amber-500')} />
                      </button>
                      <button
                        type="button"
                        disabled={togglingId === s.source_id}
                        onClick={e => toggleSourceEnabled(s, e)}
                        title={s.is_enabled === 1 ? 'Click to Disable Method' : 'Click to Enable Method'}
                        className={clsx(
                          'p-2 rounded-xl border transition-all text-[11px] font-bold cursor-pointer inline-flex items-center justify-center min-w-[62px]',
                          s.is_enabled === 1
                            ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-600 dark:text-emerald-400'
                            : 'bg-red-500/10 border-red-500/40 text-red-600 dark:text-red-400',
                          togglingId === s.source_id && 'opacity-60 cursor-wait'
                        )}
                      >
                        {togglingId === s.source_id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          s.is_enabled === 1 ? 'Active' : 'Disabled'
                        )}
                      </button>
                    </div>
                  )}
                </div>

                {/* Account Identifier Box */}
                <div className="mt-5 p-3.5 rounded-2xl bg-muted/40 border border-border/50 flex items-center justify-between text-xs">
                  <div className="min-w-0 flex-1">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                      {s.type === 'UPI' ? 'UPI Identifier' : s.type === 'CARD' ? 'Card Details' : 'Account Details'}
                    </span>
                    <div className="font-mono font-bold text-foreground truncate mt-0.5 flex items-center gap-2">
                      {s.type === 'UPI' && (s.upi_id || 'No UPI ID specified')}
                      {s.type === 'CARD' && (s.account_number ? `•••• •••• •••• ${s.account_number}` : 'No card number')}
                      {s.type === 'BANK' && (s.account_number ? `A/C: ${s.account_number}` : 'No account number')}
                    </div>
                  </div>

                  {/* Quick Copy Button */}
                  {(s.upi_id || s.account_number) && (
                    <button
                      onClick={() => copyToClipboard(s.upi_id || s.account_number || '', s.source_id)}
                      className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-background rounded-lg border border-transparent hover:border-border transition-all cursor-pointer shrink-0 ml-2"
                      title="Copy to clipboard"
                    >
                      {copiedId === s.source_id ? (
                        <Check className="w-3.5 h-3.5 text-emerald-500" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  )}
                </div>
              </div>

              {/* Card Bottom: Balance & Action Toolbar */}
              <div className="mt-5 pt-4 border-t border-border/50 flex items-center justify-between gap-3">
                <div>
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground block">Available Balance</span>
                  <div className="text-xl font-black text-foreground font-mono tracking-tight mt-0.5">
                    {formatCurrency(s.current_balance)}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => openTransactions(s)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20 rounded-xl transition-all cursor-pointer"
                  >
                    <History className="w-3.5 h-3.5" />
                    <span>Ledger ({s.transaction_count ?? 0})</span>
                  </button>
                  {isOwner && (
                    <>
                      <button
                        onClick={() => openEdit(s)}
                        className="p-2 text-muted-foreground hover:text-foreground bg-muted/60 hover:bg-muted border border-border/60 rounded-xl transition-all cursor-pointer"
                        title="Edit Method"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => deleteSource(s)}
                        className="p-2 text-red-600 dark:text-red-400 hover:bg-red-500/10 border border-red-500/20 rounded-xl transition-all cursor-pointer"
                        title="Delete Method"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>

            </div>
          );
        })}
      </div>
    )}
    </>
  );
}
