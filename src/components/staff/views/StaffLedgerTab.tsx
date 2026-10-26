import clsx from 'clsx';
import { formatCurrency } from '../../../utils/money';
import type { StaffMember, StaffLedgerRow } from '../staffTypes';

export interface StaffLedgerTabProps {
  ledgerEntries: StaffLedgerRow[];
  /** Rendered only while it is set. */
  selectedStaff: StaffMember;
}

/** Selected staff member's ledger tab: salary, advances and payments. */
export function StaffLedgerTab({
  ledgerEntries, selectedStaff,
}: StaffLedgerTabProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-extrabold text-foreground">Staff Financial Ledger</h3>
          <p className="text-xs text-muted-foreground">Complete auditable log of salary accruals, advances, bonuses & payouts</p>
        </div>
        <div className={clsx(
          "px-3 py-1.5 rounded-xl border text-xs font-extrabold tabular-nums",
          (selectedStaff.current_balance || 0) < 0
            ? "bg-rose-500/10 border-rose-500/20 text-rose-600 dark:text-rose-400"
            : "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400"
        )}>
          {(selectedStaff.current_balance || 0) < 0
            ? `Staff Owes Shop: ${formatCurrency(Math.abs(selectedStaff.current_balance || 0))}`
            : `Payable to Staff: ${formatCurrency(selectedStaff.current_balance || 0)}`}
        </div>
      </div>

      <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-border bg-muted/30 font-black text-[10px] text-muted-foreground uppercase tracking-wider">
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Description</th>
              <th className="px-4 py-3 text-right">Debit (Accrued)</th>
              <th className="px-4 py-3 text-right">Credit (Paid)</th>
              <th className="px-4 py-3 text-right">Running Balance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/30 font-medium">
            {ledgerEntries.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-8 text-center text-muted-foreground">
                  No ledger transactions found for this staff member
                </td>
              </tr>
            ) : (
              ledgerEntries.map(l => (
                <tr key={l.ledger_id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3 text-[11px] text-muted-foreground font-mono">{new Date(l.transaction_date as string).toLocaleDateString('en-IN')}</td>
                  <td className="px-4 py-3 font-bold text-foreground">
                    <div className="flex items-center gap-2">
                      {l.reference_type === 'STAFF_PURCHASE' && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-black tracking-wider uppercase bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300 border border-purple-200 dark:border-purple-800 shrink-0">
                          Staff Purchase
                        </span>
                      )}
                      <span>{l.description}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-emerald-600 tabular-nums">{(l.debit_amount ?? 0) > 0 ? `+${formatCurrency(l.debit_amount)}` : '—'}</td>
                  <td className="px-4 py-3 text-right font-bold text-rose-500 tabular-nums">{(l.credit_amount ?? 0) > 0 ? `−${formatCurrency(l.credit_amount)}` : '—'}</td>
                  <td className="px-4 py-3 text-right font-black text-foreground tabular-nums">{formatCurrency(l.running_balance)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
