import { Modal } from '../../ui/Modal';
import { RedCrossButton } from '../../ui/RedCrossButton';
import type { StaffManagerState } from '../hooks/useStaffManagerState';

export interface StaffTransactionModalProps {
  handleAddTransaction: () => Promise<void>;
  sm: StaffManagerState;
}

/** Record a staff transaction (advance, salary payment, deduction) with amount, date and note. */
export function StaffTransactionModal({
  handleAddTransaction, sm,
}: StaffTransactionModalProps) {
  const { saving, setShowTxnModal, setTxnData, showTxnModal, txnData } = sm;
  return (
    <Modal isOpen={showTxnModal} onClose={() => setShowTxnModal(false)} closeButton={<RedCrossButton onClick={() => setShowTxnModal(false)} />} title="Record Staff Transaction">
      <div className="p-6 space-y-4">
        <div>
          <label className="text-xs font-black text-muted-foreground uppercase tracking-wider block mb-1">Transaction Type</label>
          <select
            value={txnData.type}
            onChange={e => setTxnData({ ...txnData, type: e.target.value as typeof txnData.type })}
            className="w-full px-3 py-2 text-xs font-bold bg-background border border-border rounded-xl outline-none focus:border-primary text-foreground"
          >
            <option value="ADVANCE">Salary Advance (Paid to Staff)</option>
            <option value="SALARY_PAYMENT">Salary Payment (Payout)</option>
            <option value="BONUS">Bonus / Incentive (Owed to Staff)</option>
            <option value="DEDUCTION">Deduction (Deducted from Staff)</option>
            <option value="SALARY_ACCRUAL">Monthly Salary Accrual</option>
          </select>
        </div>

        <div>
          <label className="text-xs font-black text-muted-foreground uppercase tracking-wider block mb-1">Amount (₹)</label>
          <input
            type="number"
            placeholder="Enter amount"
            value={txnData.amount || ''}
            onChange={e => setTxnData({ ...txnData, amount: Number(e.target.value) })}
            className="w-full px-4 py-2.5 text-base font-black bg-background border border-border rounded-xl outline-none focus:border-primary text-foreground tabular-nums"
            autoFocus
          />
        </div>

        <div>
          <label className="text-xs font-black text-muted-foreground uppercase tracking-wider block mb-1">Payment Method</label>
          <select
            value={txnData.payment_method}
            onChange={e => setTxnData({ ...txnData, payment_method: e.target.value })}
            className="w-full px-3 py-2 text-xs font-bold bg-background border border-border rounded-xl outline-none focus:border-primary text-foreground"
          >
            <option value="CASH">Cash (Deducts from Cash Drawer)</option>
            <option value="BANK_TRANSFER">Bank Transfer</option>
            <option value="UPI">UPI / GPay / PhonePe</option>
            <option value="CARD">Card</option>
          </select>
        </div>

        <div>
          <label className="text-xs font-black text-muted-foreground uppercase tracking-wider block mb-1">Notes / Remarks</label>
          <input
            type="text"
            placeholder="e.g. Festival advance"
            value={txnData.notes}
            onChange={e => setTxnData({ ...txnData, notes: e.target.value })}
            className="w-full px-3 py-2 text-xs bg-background border border-border rounded-xl outline-none focus:border-primary text-foreground"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={handleAddTransaction}
            disabled={saving || txnData.amount <= 0}
            className="px-5 py-2 rounded-xl text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer disabled:opacity-50"
          >
            {saving ? 'Recording...' : 'Record Transaction'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
