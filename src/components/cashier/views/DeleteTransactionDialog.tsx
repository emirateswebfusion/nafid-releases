import React from 'react';
import { Modal } from '../../ui/Modal';
import { Trash2, AlertTriangle } from 'lucide-react';
import clsx from 'clsx';
import { formatCurrency } from '../../../utils/pricing/money';
import { formatCashierCategory, formatCashierNotes } from '../cashierFormat';
import type { CashTransactionRow } from '../cashierTypes';

export interface DeleteTransactionDialogProps {
  confirmDeleteTransaction: () => Promise<void>;
  deleteConfirmTx: CashTransactionRow | null;
  isDeletingTx: boolean;
  setDeleteConfirmTx: React.Dispatch<React.SetStateAction<CashTransactionRow | null>>;
}

/** Confirm deleting a cash drawer transaction. */
export function DeleteTransactionDialog({
  confirmDeleteTransaction, deleteConfirmTx, isDeletingTx, setDeleteConfirmTx,
}: DeleteTransactionDialogProps) {
  return (
    <Modal
      isOpen={!!deleteConfirmTx}
      onClose={() => !isDeletingTx && setDeleteConfirmTx(null)}
      title={null}
      className="max-w-md p-0 overflow-hidden rounded-3xl border border-rose-500/20 shadow-2xl"
    >
      <div className="p-6 space-y-5 bg-card">
        {/* Icon Header */}
        <div className="flex items-center gap-3.5">
          <div className="p-3 rounded-2xl bg-rose-500/10 text-rose-500 border border-rose-500/20 shrink-0">
            <Trash2 className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-black text-foreground tracking-tight">Delete Register Transaction</h3>
            <p className="text-xs text-muted-foreground font-medium mt-0.5">
              Reconciles drawer cash balance
            </p>
          </div>
        </div>

        {/* Transaction Summary Card */}
        {deleteConfirmTx && (
          <div className="p-4 rounded-2xl bg-muted/40 border border-border/60 space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground font-semibold">Type & Category</span>
              <span className="font-extrabold text-foreground flex items-center gap-1.5">
                <span className={clsx(
                  'text-[9px] font-black px-1.5 py-0.5 rounded uppercase',
                  deleteConfirmTx.type === 'CASH_IN' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                )}>
                  {deleteConfirmTx.type === 'CASH_IN' ? 'CASH IN' : 'EXPENSE'}
                </span>
                {formatCashierCategory(deleteConfirmTx.category, deleteConfirmTx.party_name, deleteConfirmTx.type)}
              </span>
            </div>

            {formatCashierNotes(deleteConfirmTx.notes, deleteConfirmTx.party_name, deleteConfirmTx.category) && (
              <div className="flex flex-col gap-1 text-xs">
                <span className="text-muted-foreground font-semibold text-[10px] uppercase tracking-wider">Notes</span>
                <span className="font-medium text-foreground bg-card/80 p-2.5 rounded-xl border border-border/60 whitespace-pre-wrap leading-relaxed shadow-inner">
                  {formatCashierNotes(deleteConfirmTx.notes, deleteConfirmTx.party_name, deleteConfirmTx.category)}
                </span>
              </div>
            )}

            <div className="flex items-center justify-between text-xs pt-1.5 border-t border-border/40">
              <span className="text-muted-foreground font-semibold">Amount</span>
              <span className={clsx(
                'text-sm font-black tabular-nums',
                deleteConfirmTx.type === 'CASH_IN' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'
              )}>
                {deleteConfirmTx.type === 'CASH_IN' ? '+' : '−'}{formatCurrency(deleteConfirmTx.amount)}
              </span>
            </div>

            {deleteConfirmTx.entered_by_name && (
              <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-0.5">
                <span>Recorded By</span>
                <span className="font-bold text-foreground">{deleteConfirmTx.entered_by_name}</span>
              </div>
            )}
          </div>
        )}

        {/* Warning Banner */}
        <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 text-xs font-semibold leading-relaxed">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" />
          <span>Are you sure you want to delete this cash transaction? Current drawer totals will be recalculated immediately. {deleteConfirmTx?.source === 'ledger' && 'The linked party ledger entry will also be removed. '}This action cannot be undone.</span>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-2 border-t border-border/40">
          <button
            type="button"
            disabled={isDeletingTx}
            onClick={() => setDeleteConfirmTx(null)}
            className="px-4 py-2 rounded-xl text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isDeletingTx}
            onClick={confirmDeleteTransaction}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-md transition-all cursor-pointer active:scale-95 disabled:opacity-50"
          >
            {isDeletingTx ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Deleting...</span>
              </>
            ) : (
              <>
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Transaction</span>
              </>
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}
