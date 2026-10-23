import { KeyRound, Plus } from 'lucide-react';
import { formatCurrency } from '../../../utils/money';
import { StaffLedgerTab } from './StaffLedgerTab';
import { StaffAttendanceTab } from './StaffAttendanceTab';
import type { FeatureFlags } from '../../../featureFlags';
import type { StaffMember } from '../staffTypes';
import type { StaffManagerState } from '../hooks/useStaffManagerState';

export interface StaffDetailPanelProps {
  featureFlags: FeatureFlags | null;
  handleMarkAttendance: (staffId: string, date: string, status: "PRESENT" | "ABSENT" | "HALF_DAY" | "LEAVE" | "HOLIDAY") => Promise<void>;
  handleSaveStaff: () => Promise<void>;
  handleUpdateMonthlySalary: () => Promise<void>;
  /** Rendered only while a staff member is selected. */
  selectedStaff: StaffMember;
  sm: StaffManagerState;
}

/** Selected staff member's panel: tabs (ledger, attendance) with their content. */
export function StaffDetailPanel({
  featureFlags, handleMarkAttendance, handleSaveStaff, handleUpdateMonthlySalary, selectedStaff, sm,
}: StaffDetailPanelProps) {
  const { activeTab, formData, ledgerEntries, setFormData, setShowTxnModal, setStaffList, setStatusMessage, setTxnData, staffList } = sm;
  return (
    <div className="flex-1 overflow-y-auto p-6">
      {/* ── TAB 1: OVERVIEW & PROFILE ── */}
      {activeTab === 'directory' && (
        <div className="space-y-6 max-w-3xl">
          <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
            <h3 className="text-sm font-extrabold text-foreground flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-primary" /> Biller PIN & Security Settings
            </h3>
            <p className="text-xs text-muted-foreground">
              Configure a 4-digit numeric code to attribute sales & print actions to this staff member when <strong>Enable Biller PIN</strong> is ON.
            </p>
            <div className="flex items-center gap-3">
              <input
                type="password"
                maxLength={4}
                placeholder="Enter 4-digit PIN"
                value={formData.biller_pin}
                onChange={e => setFormData({ ...formData, biller_pin: e.target.value.replace(/\D/g, '') })}
                className="w-36 px-4 py-2 text-center text-lg font-black font-mono bg-background border border-border rounded-xl outline-none focus:border-primary"
              />
              <button
                onClick={async () => {
                  if (formData.biller_pin.length !== 4) {
                    setStatusMessage({ text: 'PIN must be exactly 4 digits', type: 'error' });
                    return;
                  }
                  await handleSaveStaff();
                }}
                className="px-4 py-2 bg-primary text-primary-foreground text-xs font-bold rounded-xl hover:bg-primary/90 transition-all cursor-pointer"
              >
                Save Biller PIN
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 2: SALARY BOOK ── */}
      {activeTab === 'salary' && (
        <div className="space-y-6 max-w-3xl">
          <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-extrabold text-foreground">Monthly Salary Configuration</h3>
                <p className="text-xs text-muted-foreground">Set or revise the monthly salary structure for {selectedStaff.name}</p>
              </div>
              <button
                onClick={async () => {
                  setTxnData({ type: 'SALARY_ACCRUAL', amount: selectedStaff.monthly_salary, payment_method: 'N/A', notes: `Accrual for ${new Date().toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}` });
                  setShowTxnModal(true);
                }}
                className="px-3.5 py-2 bg-emerald-500 text-white rounded-xl text-xs font-bold hover:bg-emerald-600 transition-all cursor-pointer flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" /> Accrue Monthly Salary
              </button>
            </div>
            <div className="flex items-center gap-3">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">₹</span>
                <input
                  type="number"
                  value={selectedStaff.monthly_salary}
                  onChange={e => {
                    const v = Number(e.target.value) || 0;
                    setStaffList(staffList.map(s => s.staff_id === selectedStaff.staff_id ? { ...s, monthly_salary: v } : s));
                  }}
                  className="w-44 pl-8 pr-3 py-2 text-sm font-bold bg-background border border-border rounded-xl outline-none focus:border-primary"
                />
              </div>
              <button
                onClick={handleUpdateMonthlySalary}
                className="px-4 py-2 bg-primary text-primary-foreground text-xs font-bold rounded-xl hover:bg-primary/90 transition-all cursor-pointer"
              >
                Update Monthly Salary
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 3: ADVANCES & PAYMENTS ── */}
      {activeTab === 'payments' && (
        <div className="space-y-6 max-w-3xl">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-extrabold text-foreground">Record Advance / Salary Payout</h3>
              <p className="text-xs text-muted-foreground">Every payout updates the staff ledger and cash register automatically</p>
            </div>
            <button
              onClick={() => {
                setTxnData({ type: 'ADVANCE', amount: 0, payment_method: 'CASH', notes: '' });
                setShowTxnModal(true);
              }}
              className="px-4 py-2 bg-primary text-primary-foreground text-xs font-bold rounded-xl hover:bg-primary/90 transition-all cursor-pointer flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" /> Record New Payout
            </button>
          </div>

          <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
            <div className="px-5 py-3 border-b border-border bg-muted/20 font-bold text-xs text-muted-foreground uppercase tracking-wider">
              Recent Staff Transactions
            </div>
            <div className="divide-y divide-border/40">
              {ledgerEntries.filter(l => l.reference_type !== 'SALARY_ACCRUAL').length === 0 ? (
                <p className="p-8 text-center text-xs text-muted-foreground">No recent advances or payments recorded</p>
              ) : (
                ledgerEntries.filter(l => l.reference_type !== 'SALARY_ACCRUAL').map(l => (
                  <div key={l.ledger_id} className="px-5 py-3.5 flex items-center justify-between hover:bg-muted/20 transition-colors">
                    <div>
                      <div className="flex items-center gap-2">
                        {l.reference_type === 'STAFF_PURCHASE' && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-black tracking-wider uppercase bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300 border border-purple-200 dark:border-purple-800 shrink-0">
                            Store Purchase
                          </span>
                        )}
                        <p className="text-xs font-bold text-foreground">{l.description}</p>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{new Date(l.transaction_date).toLocaleString('en-IN')}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-black text-rose-500 tabular-nums">−{formatCurrency(l.credit_amount)}</p>
                      <p className="text-[10px] text-muted-foreground">Running Bal: {formatCurrency(l.running_balance)}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 4: STAFF LEDGER ── */}
      {activeTab === 'ledger' && (
        <StaffLedgerTab
          ledgerEntries={ledgerEntries} selectedStaff={selectedStaff}
        />
      )}

      {/* ── TAB 5: ATTENDANCE ── */}
      {activeTab === 'attendance' && featureFlags?.staff_attendance && (
        <StaffAttendanceTab
          handleMarkAttendance={handleMarkAttendance} selectedStaff={selectedStaff} sm={sm}
        />
      )}
    </div>
  );
}
