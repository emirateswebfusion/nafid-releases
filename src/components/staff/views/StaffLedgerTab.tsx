import { storeDate } from '../../../utils/time/dateDisplay';
import { BookOpen } from 'lucide-react';
import clsx from 'clsx';
import { getStoreLocale } from '../../../utils/localization/storeProfile';
import { formatCurrency } from '../../../utils/pricing/money';
import type { StaffMember, StaffLedgerRow } from '../staffTypes';
import { EmptyState, SectionCard } from './staffUi';
import { STAFF_TD, STAFF_TH, balanceTone } from './staffStyle';

export interface StaffLedgerTabProps {
  ledgerEntries: StaffLedgerRow[];
  /** Rendered only while it is set. */
  selectedStaff: StaffMember;
}

/** Selected staff member's ledger tab: salary, advances and payments. */
export function StaffLedgerTab({
  ledgerEntries, selectedStaff,
}: StaffLedgerTabProps) {
  const balance = Number(selectedStaff.current_balance) || 0;
  const tone = balanceTone(balance);

  return (
    <SectionCard
      icon={BookOpen}
      title="Staff Ledger"
      description="Salary accruals, advances, bonuses and payouts"
      flush
      action={
        <div className="text-right">
          <p className="text-[11px] text-muted-foreground">{tone.label}</p>
          <p className={clsx('text-sm font-semibold tabular-nums', tone.text)}>{formatCurrency(Math.abs(balance))}</p>
        </div>
      }
    >
      {ledgerEntries.length === 0 ? (
        <EmptyState icon={BookOpen} title="No ledger entries yet" hint="Accrued salary and recorded payouts appear here." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px] border-collapse">
            <thead>
              <tr className="border-b border-border/60 bg-muted/30">
                <th className={STAFF_TH}>Date</th>
                <th className={STAFF_TH}>Description</th>
                <th className={clsx(STAFF_TH, 'text-right')}>Accrued</th>
                <th className={clsx(STAFF_TH, 'text-right')}>Paid</th>
                <th className={clsx(STAFF_TH, 'text-right')}>Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {ledgerEntries.map(l => (
                <tr key={l.ledger_id} className="hover:bg-muted/30 transition-colors">
                  <td className={clsx(STAFF_TD, 'text-muted-foreground whitespace-nowrap tabular-nums')}>
                    {storeDate(l.transaction_date as string, getStoreLocale(), { day: 'numeric', month: 'short', year: 'numeric' })}
                  </td>
                  <td className={clsx(STAFF_TD, 'font-medium text-foreground')}>
                    <div className="flex items-center gap-2">
                      {l.reference_type === 'STAFF_PURCHASE' && (
                        <span className="px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-primary/10 text-primary border border-primary/20 shrink-0">
                          Store purchase
                        </span>
                      )}
                      <span>{l.description}</span>
                    </div>
                  </td>
                  <td className={clsx(STAFF_TD, 'text-right tabular-nums font-medium', (l.debit_amount ?? 0) > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground/50')}>
                    {(l.debit_amount ?? 0) > 0 ? `+${formatCurrency(l.debit_amount)}` : '—'}
                  </td>
                  <td className={clsx(STAFF_TD, 'text-right tabular-nums font-medium', (l.credit_amount ?? 0) > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-muted-foreground/50')}>
                    {(l.credit_amount ?? 0) > 0 ? `−${formatCurrency(l.credit_amount)}` : '—'}
                  </td>
                  <td className={clsx(STAFF_TD, 'text-right tabular-nums font-semibold text-foreground')}>{formatCurrency(l.running_balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}
