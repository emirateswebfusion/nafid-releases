import { DollarSign, KeyRound, Lock, CheckCircle2 } from 'lucide-react';
import { formatCurrency } from '../../../utils/money';
import clsx from 'clsx';
import type { StaffManagerState } from '../hooks/useStaffManagerState';

export interface StaffCompensationTabProps {
  sm: StaffManagerState;
}

/** Staff form, compensation tab: salary type, amount and payment details. */
export function StaffCompensationTab({
  sm,
}: StaffCompensationTabProps) {
  const { formData, setFormData } = sm;
  return (
    <div className="space-y-5 animate-in fade-in duration-200">

      <div>
        <h3 className="text-base font-extrabold text-foreground">Salary & Biller PIN</h3>
        <p className="text-xs text-muted-foreground mt-0.5">Set payroll structure and POS authentication PIN</p>
      </div>

      {/* Salary card */}
      <div className="p-4 rounded-2xl bg-muted/20 border border-border/60 space-y-4">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-emerald-500/10 shrink-0">
            <DollarSign className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="min-w-0">
            <h4 className="text-xs font-extrabold text-foreground">Monthly Base Salary</h4>
            <p className="text-[11px] text-muted-foreground">Drives staff ledger accruals each month</p>
          </div>
          <span className="ml-auto shrink-0 text-base font-black text-emerald-600 dark:text-emerald-400 font-mono tabular-nums">
            {formatCurrency(formData.monthly_salary)}
          </span>
        </div>
        <div className="relative">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-base font-black text-muted-foreground">₹</span>
          <input
            type="number"
            placeholder="0"
            value={formData.monthly_salary || ''}
            onChange={e => setFormData({ ...formData, monthly_salary: Math.max(0, Number(e.target.value)) })}
            className="w-full pl-8 pr-4 py-3 text-lg font-black bg-background border border-border rounded-xl outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 text-foreground tabular-nums"
          />
        </div>
        <div>
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-2">Quick Presets</span>
          <div className="flex flex-wrap gap-1.5">
            {[15000, 20000, 25000, 30000, 40000, 50000].map(amt => (
              <button
                key={amt}
                type="button"
                onClick={() => setFormData({ ...formData, monthly_salary: amt })}
                className={clsx(
                  'px-2.5 py-1.5 rounded-lg text-[11px] font-extrabold border transition-all cursor-pointer font-mono',
                  formData.monthly_salary === amt
                    ? 'bg-emerald-500 text-white border-emerald-600 shadow-sm'
                    : 'bg-background border-border text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                ₹{(amt / 1000)}k
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* PIN card */}
      <div className="p-4 rounded-2xl bg-muted/20 border border-border/60 space-y-4">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-primary/10 shrink-0">
            <KeyRound className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h4 className="text-xs font-extrabold text-foreground">4-Digit POS Biller PIN</h4>
            <p className="text-[11px] text-muted-foreground">Quick authentication at POS without full login</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2.5">
            {[0, 1, 2, 3].map(idx => (
              <div
                key={idx}
                className={clsx(
                  'w-4 h-4 rounded-full border-2 transition-all duration-200',
                  formData.biller_pin.length > idx
                    ? 'bg-primary border-primary scale-110 shadow-md'
                    : 'bg-transparent border-border'
                )}
              />
            ))}
          </div>
          <div className="flex-1 relative">
            <Lock className="w-3.5 h-3.5 text-muted-foreground/50 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="password"
              maxLength={4}
              placeholder="Enter 4 digits"
              value={formData.biller_pin}
              onChange={e => setFormData({ ...formData, biller_pin: e.target.value.replace(/\D/g, '') })}
              className="w-full pl-9 pr-4 py-2.5 text-center text-xl font-black font-mono tracking-[0.4em] bg-background border border-border rounded-xl outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 text-foreground"
            />
          </div>
          {formData.biller_pin.length === 4 && (
            <div className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 shrink-0">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">Set</span>
            </div>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground">
          Leave blank if PIN authentication is not required for this employee.
        </p>
      </div>
    </div>
  );
}
