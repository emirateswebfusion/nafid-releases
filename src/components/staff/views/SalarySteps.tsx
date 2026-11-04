import clsx from 'clsx';
import { Check } from 'lucide-react';
import { formatCurrency } from '../../../utils/pricing/money';
import { STAFF_PANEL } from './staffStyle';

export interface SalaryStepGuideProps {
  monthName: string;
  salaryAmount: number;
  salaryAdded: boolean;
  balance: number;
}

/** "How salary works" strip: the four steps of a month, ticked off for the month on screen. */
export function SalaryStepGuide({ monthName, salaryAmount, salaryAdded, balance }: SalaryStepGuideProps) {
  const steps = [
    { title: 'Set monthly salary', hint: salaryAmount > 0 ? `${formatCurrency(salaryAmount)} per month` : 'Set it in the staff profile', done: salaryAmount > 0 },
    { title: 'Add the month\'s salary', hint: salaryAdded ? `Added for ${monthName}` : 'Once at the start of the month', done: salaryAdded },
    { title: 'Advances are taken off', hint: 'Advances and store purchases reduce it automatically', done: salaryAdded },
    { title: 'Pay the balance', hint: salaryAdded && balance <= 0 ? 'Fully paid' : 'Pay what is left', done: salaryAdded && balance <= 0 },
  ];
  const current = steps.findIndex(s => !s.done);

  return (
    <div className={clsx(STAFF_PANEL, 'px-5 py-4')}>
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <p className="text-sm font-semibold text-foreground tracking-tight">How salary works</p>
        <p className="text-[11.5px] text-muted-foreground">Fixed monthly salary · not calculated from attendance</p>
      </div>
      <ol className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        {steps.map((step, i) => {
          const isCurrent = i === current;
          return (
            <li
              key={step.title}
              className={clsx(
                'flex items-start gap-2.5 rounded-xl border px-3 py-2.5',
                step.done ? 'border-emerald-500/20 bg-emerald-500/[0.05]'
                  : isCurrent ? 'border-primary/30 bg-primary/[0.06]'
                    : 'border-border/60 bg-muted/20'
              )}
            >
              <span
                className={clsx(
                  'w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0',
                  step.done ? 'bg-emerald-500 text-white'
                    : isCurrent ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground'
                )}
              >
                {step.done ? <Check className="w-3.5 h-3.5" /> : i + 1}
              </span>
              <div className="min-w-0">
                <p className="text-[12.5px] font-semibold text-foreground leading-tight">{step.title}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{step.hint}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
