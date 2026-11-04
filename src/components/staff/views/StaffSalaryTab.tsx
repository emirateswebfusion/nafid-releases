import { useState } from 'react';
import clsx from 'clsx';
import {
  ChevronLeft, ChevronRight, Wallet, FileText, CalendarPlus, HandCoins, Gift, MinusCircle, History, AlertTriangle, Pencil,
} from 'lucide-react';
import { Button } from '../../ui/Button';
import { formatCurrency } from '../../../utils/pricing/money';
import { getStoreLocale } from '../../../utils/localization/storeProfile';
import type { StaffMember } from '../staffTypes';
import type { StaffManagerState } from '../hooks/useStaffManagerState';
import { buildPayStatement } from '../../../utils/pricing/staffPayStatement';
import { SectionCard } from './staffUi';
import { SalaryStepGuide } from './SalarySteps';

export interface StaffSalaryTabProps {
  /** Opens the staff profile on its salary section; the salary is set only there. */
  onChangeSalary?: () => void;
  selectedStaff: StaffMember;
  sm: StaffManagerState;
}

type TxnType = StaffManagerState['txnData']['type'];

/** Salary tab: the month's pay statement (what is owed, what was taken, what is left to pay) and the salary amount. */
export function StaffSalaryTab({ onChangeSalary, selectedStaff, sm }: StaffSalaryTabProps) {
  const { ledgerEntries, setShowTxnModal, setTxnData } = sm;
  const locale = getStoreLocale();
  const [monthOffset, setMonthOffset] = useState(0);
  const today = new Date();
  const month = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
  const isCurrentMonth = monthOffset === 0;
  const monthName = month.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
  const monthShort = month.toLocaleDateString(locale, { month: 'long' });

  const statement = buildPayStatement(ledgerEntries, month);
  const salaryAmount = Number(selectedStaff.monthly_salary) || 0;

  const addedMonths = ledgerEntries
    .filter(l => l.reference_type === 'SALARY_ACCRUAL')
    .sort((a, b) => new Date(b.transaction_date as string).getTime() - new Date(a.transaction_date as string).getTime())
    .slice(0, 6);

  const openTxn = (type: TxnType, amount: number, notes = '') => {
    const moneyMoves = type === 'ADVANCE' || type === 'SALARY_PAYMENT';
    setTxnData({ type, amount: Math.max(0, amount), payment_method: moneyMoves ? 'CASH' : 'N/A', notes });
    setShowTxnModal(true);
  };
  const addSalary = () => openTxn('SALARY_ACCRUAL', salaryAmount, today.toLocaleDateString(locale, { month: 'long', year: 'numeric' }));

  const lines: { label: string; value: number; sign: '+' | '−' | ''; show: boolean }[] = [
    { label: 'Carried from earlier months', value: statement.carriedForward, sign: '', show: statement.carriedForward !== 0 },
    { label: `Salary for ${monthShort}`, value: statement.salaryAdded, sign: '+', show: true },
    { label: 'Bonus / extra', value: statement.extras, sign: '+', show: statement.extras > 0 },
    { label: 'Advances taken', value: statement.advances, sign: '−', show: true },
    { label: 'Store purchases', value: statement.storePurchases, sign: '−', show: statement.storePurchases > 0 },
    { label: 'Deductions', value: statement.deductions, sign: '−', show: statement.deductions > 0 },
    { label: 'Salary paid', value: statement.salaryPaid, sign: '−', show: true },
  ];

  const result = statement.balance > 0
    ? { label: 'Balance to pay', tone: 'text-amber-600 dark:text-amber-400', box: 'bg-amber-500/[0.07] border-amber-500/20' }
    : statement.balance < 0
      ? { label: 'Staff owes the shop', tone: 'text-rose-600 dark:text-rose-400', box: 'bg-rose-500/[0.07] border-rose-500/20' }
      : { label: 'Fully paid', tone: 'text-emerald-600 dark:text-emerald-400', box: 'bg-emerald-500/[0.07] border-emerald-500/20' };

  return (
    <div className="space-y-4">
      <SalaryStepGuide
        monthName={monthName}
        salaryAmount={salaryAmount}
        salaryAdded={statement.salaryAddedThisMonth}
        balance={statement.balance}
      />

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
        {/* Pay statement */}
        <SectionCard
          icon={FileText}
          title="Salary Statement"
          description="What the shop owes this person for the month"
          className="xl:col-span-3"
          action={
            <div className="flex items-center gap-1 rounded-xl border border-border/70 bg-background p-0.5">
              <button type="button" onClick={() => setMonthOffset(o => o - 1)} className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer" title="Previous month">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-2 text-xs font-semibold text-foreground min-w-[112px] text-center">{monthName}</span>
              <button type="button" onClick={() => setMonthOffset(o => Math.min(0, o + 1))} disabled={isCurrentMonth} className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed" title="Next month">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          }
        >
          {isCurrentMonth && !statement.salaryAddedThisMonth && salaryAmount > 0 && (
            <div className="mb-4 flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-amber-500/[0.08] border border-amber-500/25">
              <div className="flex items-center gap-2.5 min-w-0">
                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-foreground">{monthShort} salary is not added yet</p>
                  <p className="text-[11.5px] text-muted-foreground">Add it first, then pay. Advances and purchases are taken off automatically.</p>
                </div>
              </div>
              <Button onClick={addSalary} className="gap-2 shrink-0">
                <CalendarPlus className="w-4 h-4" /><span>Add {formatCurrency(salaryAmount)}</span>
              </Button>
            </div>
          )}

          <div className="divide-y divide-border/50">
            {lines.filter(l => l.show).map(line => (
              <div key={line.label} className="flex items-center justify-between py-2.5 text-[13px]">
                <span className="text-muted-foreground">{line.label}</span>
                <span className={clsx(
                  'tabular-nums font-medium',
                  line.value === 0 ? 'text-muted-foreground/60' : line.sign === '+' ? 'text-emerald-600 dark:text-emerald-400' : line.sign === '−' ? 'text-rose-600 dark:text-rose-400' : 'text-foreground'
                )}>
                  {line.value === 0 ? '—' : `${line.sign ? line.sign + ' ' : line.value < 0 ? '− ' : ''}${formatCurrency(Math.abs(line.value))}`}
                </span>
              </div>
            ))}
          </div>

          <div className={clsx('mt-3 flex items-center justify-between px-4 py-3.5 rounded-xl border', result.box)}>
            <div>
              <p className="text-[13px] font-semibold text-foreground">{result.label}</p>
              <p className="text-[11.5px] text-muted-foreground">{isCurrentMonth ? 'As of today' : `At the end of ${monthName}`}</p>
            </div>
            <p className={clsx('text-2xl font-semibold tabular-nums tracking-tight', result.tone)}>
              {formatCurrency(Math.abs(statement.balance))}
            </p>
          </div>

          {isCurrentMonth ? (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button onClick={() => openTxn('SALARY_PAYMENT', statement.balance)} className="gap-2">
                <Wallet className="w-4 h-4" /><span>Pay Salary</span>
              </Button>
              <Button variant="outline" onClick={() => openTxn('ADVANCE', 0)} className="gap-2">
                <HandCoins className="w-4 h-4" /><span>Give Advance</span>
              </Button>
              <div className="flex-1" />
              <Button variant="ghost" size="sm" onClick={() => openTxn('BONUS', 0)} className="gap-1.5">
                <Gift className="w-3.5 h-3.5" /><span>Add Bonus</span>
              </Button>
              <Button variant="ghost" size="sm" onClick={() => openTxn('DEDUCTION', 0)} className="gap-1.5">
                <MinusCircle className="w-3.5 h-3.5" /><span>Deduct</span>
              </Button>
            </div>
          ) : (
            <p className="mt-4 text-xs text-muted-foreground">
              This is a past month. Payments are always recorded today —{' '}
              <button type="button" onClick={() => setMonthOffset(0)} className="font-semibold text-primary hover:underline cursor-pointer">go to this month</button>.
            </p>
          )}
        </SectionCard>

        <div className="xl:col-span-2 space-y-4">
          {/* Salary amount (set in the staff profile) */}
          <SectionCard
            icon={Wallet}
            title="Monthly Salary"
            description="Set in the staff profile"
            action={onChangeSalary && (
              <Button variant="ghost" size="sm" onClick={onChangeSalary} className="gap-1.5 text-primary hover:text-primary">
                <Pencil className="w-3.5 h-3.5" /><span>Change</span>
              </Button>
            )}
          >
            <p className="text-[28px] leading-tight font-semibold tabular-nums tracking-tight text-foreground">
              {salaryAmount > 0 ? formatCurrency(salaryAmount) : 'Not set'}
            </p>
            <p className="text-[11.5px] text-muted-foreground mt-1">per month · fixed amount</p>
            <p className="text-[11.5px] text-muted-foreground mt-3 pt-3 border-t border-border/50 leading-relaxed">
              Changing it only affects months you add after the change. Salary is not calculated from attendance.
            </p>
          </SectionCard>

          {/* Months added */}
          <SectionCard icon={History} title="Salary Added" description="Months already added to the account" flush>
            {addedMonths.length === 0 ? (
              <p className="px-5 py-6 text-xs text-muted-foreground text-center">No month added yet.</p>
            ) : (
              <div className="divide-y divide-border/50">
                {addedMonths.map(l => (
                  <div key={l.ledger_id} className="px-5 py-2.5 flex items-center justify-between text-[13px]">
                    <span className="text-foreground">
                      {new Date(l.transaction_date as string).toLocaleDateString(locale, { month: 'long', year: 'numeric' })}
                    </span>
                    <span className="tabular-nums font-medium text-emerald-600 dark:text-emerald-400">+ {formatCurrency(l.debit_amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>
      </div>

    </div>
  );
}
