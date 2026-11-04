import clsx from 'clsx';
import { Wallet, HandCoins, Gift, MinusCircle, CalendarPlus, ArrowRight } from 'lucide-react';
import { getCurrencyPrefix } from '../../../utils/localization/storeProfile';
import { formatCurrency } from '../../../utils/pricing/money';
import { Modal } from '../../ui/Modal';
import { Button } from '../../ui/Button';
import { RedCrossButton } from '../../ui/RedCrossButton';
import type { StaffManagerState } from '../hooks/useStaffManagerState';
import { STAFF_LABEL } from './staffStyle';

export interface StaffTransactionModalProps {
  handleAddTransaction: () => Promise<void>;
  sm: StaffManagerState;
}

type TxnType = StaffManagerState['txnData']['type'];

/** Plain-language choices. `adds` = the shop owes more; otherwise it owes less. `cash` = money changes hands. */
const KINDS: { type: TxnType; label: string; hint: string; icon: typeof Wallet; adds: boolean; cash: boolean; submit: string }[] = [
  { type: 'SALARY_PAYMENT', label: 'Pay Salary', hint: 'Money given as salary', icon: Wallet, adds: false, cash: true, submit: 'Pay' },
  { type: 'ADVANCE', label: 'Advance', hint: 'Money given before salary', icon: HandCoins, adds: false, cash: true, submit: 'Give advance of' },
  { type: 'SALARY_ACCRUAL', label: 'Add Month Salary', hint: 'Adds the month\'s salary owed', icon: CalendarPlus, adds: true, cash: false, submit: 'Add salary of' },
  { type: 'BONUS', label: 'Bonus', hint: 'Extra amount owed', icon: Gift, adds: true, cash: false, submit: 'Add bonus of' },
  { type: 'DEDUCTION', label: 'Deduction', hint: 'Cut from salary (fine, loss)', icon: MinusCircle, adds: false, cash: false, submit: 'Deduct' },
];

const INPUT = 'w-full h-10 px-3 text-sm bg-background border border-border/80 rounded-xl outline-none text-foreground focus:border-primary focus:ring-2 focus:ring-primary/15 transition-all';

/** Record a salary entry for the selected staff member: pay, advance, add the month's salary, bonus or deduction. */
export function StaffTransactionModal({
  handleAddTransaction, sm,
}: StaffTransactionModalProps) {
  const { saving, setShowTxnModal, setTxnData, showTxnModal, txnData, staffList, selectedStaffId } = sm;
  const staff = staffList.find(s => s.staff_id === selectedStaffId);
  const kind = KINDS.find(k => k.type === txnData.type) || KINDS[0];
  const balance = Number(staff?.current_balance) || 0;
  const amount = Number(txnData.amount) || 0;
  const after = kind.adds ? balance + amount : balance - amount;
  const describe = (value: number) => value > 0 ? 'Shop owes' : value < 0 ? 'Staff owes' : 'Settled';

  const chooseKind = (type: TxnType) => {
    const next = KINDS.find(k => k.type === type) || KINDS[0];
    const method = next.cash ? (txnData.payment_method === 'N/A' ? 'CASH' : txnData.payment_method) : 'N/A';
    const suggested = type === 'SALARY_PAYMENT' ? Math.max(0, balance)
      : type === 'SALARY_ACCRUAL' ? Number(staff?.monthly_salary) || 0
        : 0;
    setTxnData({ ...txnData, type, payment_method: method, amount: suggested });
  };

  return (
    <Modal
      isOpen={showTxnModal}
      onClose={() => setShowTxnModal(false)}
      closeButton={<RedCrossButton onClick={() => setShowTxnModal(false)} />}
      title={staff ? `Salary entry · ${staff.name}` : 'Salary entry'}
    >
      <div className="p-6 space-y-5">
        <div>
          <p className={STAFF_LABEL}>What are you recording?</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
            {KINDS.map(k => {
              const Icon = k.icon;
              const active = k.type === txnData.type;
              return (
                <button
                  type="button"
                  key={k.type}
                  onClick={() => chooseKind(k.type)}
                  className={clsx(
                    'text-left rounded-xl border px-3 py-2.5 transition-all cursor-pointer',
                    active ? 'border-primary bg-primary/[0.07] ring-2 ring-primary/15' : 'border-border/70 hover:border-border hover:bg-muted/40'
                  )}
                >
                  <div className="flex items-center gap-2">
                    <Icon className={clsx('w-4 h-4', active ? 'text-primary' : 'text-muted-foreground')} />
                    <span className="text-[13px] font-semibold text-foreground">{k.label}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1 leading-snug">{k.hint}</p>
                </button>
              );
            })}
          </div>
        </div>

        <div className={clsx('grid gap-3', kind.cash ? 'grid-cols-2' : 'grid-cols-1')}>
          <div>
            <label htmlFor="staff-txn-amount" className={STAFF_LABEL}>Amount ({getCurrencyPrefix()})</label>
            <input
              id="staff-txn-amount"
              type="number"
              min={0}
              placeholder="0"
              value={txnData.amount || ''}
              onChange={e => setTxnData({ ...txnData, amount: Number(e.target.value) })}
              className={clsx(INPUT, 'no-spinners mt-1.5 text-base font-semibold tabular-nums')}
              autoFocus
            />
          </div>
          {kind.cash && (
            <div>
              <label htmlFor="staff-txn-method" className={STAFF_LABEL}>Paid by</label>
              <select
                id="staff-txn-method"
                value={txnData.payment_method}
                onChange={e => setTxnData({ ...txnData, payment_method: e.target.value })}
                className={clsx(INPUT, 'mt-1.5 font-medium')}
              >
                <option value="CASH">Cash (from cash drawer)</option>
                <option value="BANK_TRANSFER">Bank transfer</option>
                <option value="UPI">UPI / GPay / PhonePe</option>
                <option value="CARD">Card</option>
              </select>
            </div>
          )}
        </div>

        <div>
          <label htmlFor="staff-txn-note" className={STAFF_LABEL}>Note (optional)</label>
          <input
            id="staff-txn-note"
            type="text"
            placeholder={kind.type === 'ADVANCE' ? 'e.g. Festival advance' : kind.type === 'SALARY_ACCRUAL' ? 'e.g. November 2026' : 'Add a note'}
            value={txnData.notes}
            onChange={e => setTxnData({ ...txnData, notes: e.target.value })}
            className={clsx(INPUT, 'mt-1.5')}
          />
        </div>

        {staff && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-muted/30 px-4 py-3 text-[12.5px]">
            <div>
              <p className="text-muted-foreground">Now · {describe(balance)}</p>
              <p className="font-semibold tabular-nums text-foreground">{formatCurrency(Math.abs(balance))}</p>
            </div>
            <ArrowRight className="w-4 h-4 text-muted-foreground" />
            <div className="text-right">
              <p className="text-muted-foreground">After · {describe(after)}</p>
              <p className={clsx('font-semibold tabular-nums', after > 0 ? 'text-amber-600 dark:text-amber-400' : after < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400')}>
                {formatCurrency(Math.abs(after))}
              </p>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={() => setShowTxnModal(false)}>Cancel</Button>
          <Button onClick={handleAddTransaction} disabled={saving || amount <= 0}>
            {saving ? 'Saving…' : `${kind.submit} ${formatCurrency(amount)}`}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
