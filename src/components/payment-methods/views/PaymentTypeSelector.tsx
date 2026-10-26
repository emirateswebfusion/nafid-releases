import { TYPE_CONFIG } from '../paymentMethodsTypes';
import clsx from 'clsx';
import type { PaymentMethodsState } from '../hooks/usePaymentMethodsState';

export interface PaymentTypeSelectorProps {
  pmState: PaymentMethodsState;
}

/** Step 1 of the add / edit form: choose bank, card or UPI. */
export function PaymentTypeSelector({
  pmState,
}: PaymentTypeSelectorProps) {
  const { form, setForm } = pmState;
  return (
    <div className="space-y-2">
      <span className="text-[11px] font-extrabold text-muted-foreground uppercase tracking-wider block">
        1. Select Payment Channel Type
      </span>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {(['BANK', 'UPI', 'CARD'] as const).map(t => {
          const cfg = TYPE_CONFIG[t];
          const Icon = cfg.icon;
          const isSelected = form.type === t;

          return (
            <button
              key={t}
              type="button"
              onClick={() => setForm({ ...form, type: t })}
              className={clsx(
                'p-5 rounded-3xl border text-left transition-all duration-300 cursor-pointer flex flex-col justify-between relative overflow-hidden group',
                isSelected
                  ? 'border-primary bg-primary/10 ring-2 ring-primary/40 shadow-lg shadow-primary/10'
                  : 'border-border/60 bg-card/60 hover:bg-card hover:border-border'
              )}
            >
              <div className="flex items-center justify-between">
                <div className={clsx('w-12 h-12 rounded-2xl flex items-center justify-center border shadow-inner transition-transform group-hover:scale-105', cfg.badgeBg)}>
                  <Icon className="w-6 h-6" />
                </div>
                {isSelected && (
                  <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-black shadow-md">
                    ✓
                  </span>
                )}
              </div>
              <div className="mt-5">
                <div className="font-black text-sm text-foreground">{cfg.label}</div>
                <div className="text-xs text-muted-foreground font-medium mt-1">
                  {t === 'BANK' && 'Direct IMPS / NEFT / RTGS settlement'}
                  {t === 'UPI' && 'Google Pay, PhonePe, Paytm QR VPAs'}
                  {t === 'CARD' && 'Visa, Mastercard & RuPay POS swipe'}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
