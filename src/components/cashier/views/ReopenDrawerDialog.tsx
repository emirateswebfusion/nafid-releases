import React from 'react';
import { Modal } from '../../ui/Modal';
import { RotateCcw, AlertTriangle } from 'lucide-react';
import { formatBusinessDate } from '../cashierFormat';
import { formatCurrency } from '../../../utils/pricing/money';
import type { CashDrawerRow } from '../cashierTypes';

export interface ReopenDrawerDialogProps {
  confirmReopenDrawer: () => Promise<void>;
  isReopeningDrawer: boolean;
  reopenConfirmDrawer: CashDrawerRow | null;
  setReopenConfirmDrawer: React.Dispatch<React.SetStateAction<CashDrawerRow | null>>;
}

/** Confirm re-opening a closed cash drawer. */
export function ReopenDrawerDialog({
  confirmReopenDrawer, isReopeningDrawer, reopenConfirmDrawer, setReopenConfirmDrawer,
}: ReopenDrawerDialogProps) {
  return (
    <Modal
      isOpen={!!reopenConfirmDrawer}
      onClose={() => !isReopeningDrawer && setReopenConfirmDrawer(null)}
      title={null}
      className="max-w-md p-0 overflow-hidden rounded-3xl border border-rose-500/20 shadow-2xl"
    >
      <div className="p-6 space-y-5 bg-card">
        {/* Icon Header */}
        <div className="flex items-center gap-3.5">
          <div className="p-3 rounded-2xl bg-rose-500/10 text-rose-500 border border-rose-500/20 shrink-0">
            <RotateCcw className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-black text-foreground tracking-tight">Reopen Closed Cash Register</h3>
            <p className="text-xs text-muted-foreground font-medium mt-0.5">
              Owner action • Unlocks shift for new entries
            </p>
          </div>
        </div>

        {/* Session Details Summary Card */}
        {reopenConfirmDrawer && (
          <div className="p-4 rounded-2xl bg-muted/40 border border-border/60 space-y-2 text-xs">
            {reopenConfirmDrawer.business_date && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground font-semibold">Business Date</span>
                <span className="font-extrabold text-foreground">{formatBusinessDate(reopenConfirmDrawer.business_date)}</span>
              </div>
            )}
            {reopenConfirmDrawer.opening_balance != null && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground font-semibold">Opening Balance</span>
                <span className="font-extrabold text-foreground tabular-nums">{formatCurrency(reopenConfirmDrawer.opening_balance)}</span>
              </div>
            )}
            {reopenConfirmDrawer.cash_sales != null && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground font-semibold">Cash Sales</span>
                <span className="font-extrabold text-emerald-600 dark:text-emerald-400 tabular-nums">{formatCurrency(reopenConfirmDrawer.cash_sales)}</span>
              </div>
            )}
            {(reopenConfirmDrawer.opened_by_name || reopenConfirmDrawer.closed_by_name) && (
              <div className="flex items-center justify-between pt-1 border-t border-border/40">
                <span className="text-muted-foreground font-semibold">Cashier</span>
                <span className="font-bold text-foreground">{reopenConfirmDrawer.opened_by_name || reopenConfirmDrawer.closed_by_name}</span>
              </div>
            )}
          </div>
        )}

        {/* Warning Banner */}
        <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 text-xs font-semibold leading-relaxed">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" />
          <span>Are you sure you want to REOPEN this closed cash register? The register status will return to OPEN to allow adding new cash transactions.</span>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-2 border-t border-border/40">
          <button
            type="button"
            disabled={isReopeningDrawer}
            onClick={() => setReopenConfirmDrawer(null)}
            className="px-4 py-2 rounded-xl text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isReopeningDrawer}
            onClick={confirmReopenDrawer}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-md transition-all cursor-pointer active:scale-95 disabled:opacity-50"
          >
            {isReopeningDrawer ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Reopening...</span>
              </>
            ) : (
              <>
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reopen Register</span>
              </>
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}
