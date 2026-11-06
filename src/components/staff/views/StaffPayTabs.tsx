import { storeDateTime } from '../../../utils/time/dateDisplay';
import { Plus, ArrowLeftRight, Receipt } from 'lucide-react';
import { Button } from '../../ui/Button';
import { formatCurrency } from '../../../utils/pricing/money';
import { getStoreLocale } from '../../../utils/localization/storeProfile';
import type { StaffMember } from '../staffTypes';
import type { StaffManagerState } from '../hooks/useStaffManagerState';
import { EmptyState, SectionCard } from './staffUi';
import { balanceTone } from './staffStyle';

export interface StaffPayTabProps {
  selectedStaff: StaffMember;
  sm: StaffManagerState;
}

/** Advances & payouts tab: record a payment and list the recent ones. */
export function StaffPaymentsTab({ selectedStaff, sm }: StaffPayTabProps) {
  const { ledgerEntries, setShowTxnModal, setTxnData } = sm;
  const payouts = ledgerEntries.filter(l => l.reference_type !== 'SALARY_ACCRUAL');
  const tone = balanceTone(selectedStaff.current_balance);

  return (
    <SectionCard
      icon={ArrowLeftRight}
      title="Advances & Payouts"
      description={`${payouts.length} record${payouts.length === 1 ? '' : 's'} · ${tone.label}: ${formatCurrency(Math.abs(Number(selectedStaff.current_balance) || 0))}`}
      flush
      action={
        <Button
          className="gap-2"
          onClick={() => {
            setTxnData({ type: 'ADVANCE', amount: 0, payment_method: 'CASH', notes: '' });
            setShowTxnModal(true);
          }}
        >
          <Plus className="w-4 h-4" /><span>Record Payout</span>
        </Button>
      }
    >
      {payouts.length === 0 ? (
        <EmptyState icon={Receipt} title="No advances or payouts yet" hint="Salary payments and cash advances you record appear here." />
      ) : (
        <div className="divide-y divide-border/50">
          {payouts.map(l => (
            <div key={l.ledger_id} className="px-5 py-3.5 flex items-center justify-between gap-4 hover:bg-muted/30 transition-colors">
              <div className="min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  {l.reference_type === 'STAFF_PURCHASE' && (
                    <span className="px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-primary/10 text-primary border border-primary/20 shrink-0">
                      Store purchase
                    </span>
                  )}
                  <p className="text-[13px] font-medium text-foreground truncate">{l.description}</p>
                </div>
                <p className="text-[11.5px] text-muted-foreground mt-0.5">
                  {storeDateTime(l.transaction_date as string, getStoreLocale(), { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-[13px] font-semibold tabular-nums text-rose-600 dark:text-rose-400">−{formatCurrency(l.credit_amount)}</p>
                <p className="text-[11.5px] tabular-nums text-muted-foreground mt-0.5">Bal {formatCurrency(l.running_balance)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}
