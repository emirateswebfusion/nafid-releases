import { Modal } from '../../ui/Modal';
import { X, User, DollarSign, Shield, AlertCircle, Loader2, Save } from 'lucide-react';
import clsx from 'clsx';
import { formatCurrency } from '../../../utils/pricing/money';
import { StaffBasicTab } from './StaffBasicTab';
import { StaffCompensationTab } from './StaffCompensationTab';
import { StaffAccessTab } from './StaffAccessTab';
import type { StaffManagerState } from '../hooks/useStaffManagerState';

export interface StaffFormModalProps {
  handleSaveStaff: () => Promise<void>;
  sm: StaffManagerState;
}

/** Add / edit staff dialog: tabs (basic, compensation, access) and save. */
export function StaffFormModal({
  handleSaveStaff, sm,
}: StaffFormModalProps) {
  const { formData, modalTab, saving, setModalTab, setShowAddModal, showAddModal } = sm;
  return (
    <Modal
      isOpen={showAddModal}
      onClose={() => setShowAddModal(false)}
      title={null}
      className="max-w-5xl p-0 overflow-hidden"
      closeButton={<></>}
    >
      <div className="flex min-h-[580px] max-h-[82vh] overflow-hidden">

        {/* ── LEFT PANEL: IDENTITY CARD ── */}
        <div className="w-[220px] shrink-0 flex flex-col bg-gradient-to-b from-primary/10 via-primary/5 to-muted/20 border-r border-border/50 p-5 gap-5">

          {/* Top row: label + close */}
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">
              {formData.staff_id ? 'Edit Profile' : 'New Employee'}
            </span>
            <button
              onClick={() => setShowAddModal(false)}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Avatar + name */}
          <div className="flex flex-col items-center gap-3 pt-1">
            <div className="relative">
              <div className="w-18 h-18 rounded-2xl bg-gradient-to-br from-primary via-primary to-indigo-600 text-primary-foreground flex items-center justify-center font-black text-2xl shadow-lg ring-4 ring-primary/20 w-[72px] h-[72px]">
                {formData.name.trim() ? formData.name.trim().slice(0, 2).toUpperCase() : 'ST'}
              </div>
              <div className={clsx(
                'absolute -bottom-1.5 -right-1.5 w-4 h-4 rounded-full border-2 border-card shadow-sm',
                formData.status === 'ACTIVE' ? 'bg-emerald-500' : 'bg-rose-400'
              )} />
            </div>
            <div className="text-center w-full">
              <h4 className="text-sm font-extrabold text-foreground truncate leading-tight">
                {formData.name.trim() || 'Employee Name'}
              </h4>
              <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                {formData.role_designation || 'No designation'}
              </p>
            </div>
          </div>

          {/* Key Stats */}
          <div className="space-y-2">
            <div className="p-2.5 rounded-xl bg-card/70 border border-border/60">
              <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider block">Monthly Salary</span>
              <span className="text-sm font-black text-foreground font-mono tabular-nums mt-0.5 block">
                {formatCurrency(formData.monthly_salary)}
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-card/70 border border-border/60">
              <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">Biller PIN</span>
              <div className="flex items-center gap-1.5">
                {[0, 1, 2, 3].map(idx => (
                  <div
                    key={idx}
                    className={clsx(
                      'w-2 h-2 rounded-full transition-all duration-200',
                      formData.biller_pin.length > idx ? 'bg-primary shadow-sm' : 'bg-muted-foreground/25'
                    )}
                  />
                ))}
                <span className={clsx(
                  'text-[10px] font-bold ml-1',
                  formData.biller_pin.length === 4 ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'
                )}>
                  {formData.biller_pin.length === 4 ? 'Set' : `${formData.biller_pin.length}/4`}
                </span>
              </div>
            </div>
            {formData.showSystemAccountSection && (
              <div className="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20">
                <span className="text-[9px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider block">System Access</span>
                <span className="text-xs font-extrabold text-indigo-700 dark:text-indigo-300 mt-0.5 block">{formData.user_role}</span>
              </div>
            )}
            <div className="p-2.5 rounded-xl bg-card/70 border border-border/60">
              <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider block">Status</span>
              <span className={clsx(
                'text-xs font-extrabold mt-0.5 block',
                formData.status === 'ACTIVE' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'
              )}>
                {formData.status === 'ACTIVE' ? 'Active' : 'Inactive'}
              </span>
            </div>
          </div>

          {/* Tab Nav */}
          <div className="mt-auto space-y-0.5">
            {([
              { id: 'basic' as const, label: 'Profile & Role', icon: User, color: 'text-primary' },
              { id: 'compensation' as const, label: 'Salary & PIN', icon: DollarSign, color: 'text-emerald-600' },
              { id: 'access' as const, label: 'System Access', icon: Shield, color: 'text-indigo-500' },
            ]).map(tab => {
              const Icon = tab.icon;
              const isActive = modalTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setModalTab(tab.id)}
                  className={clsx(
                    'w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[11px] font-bold transition-all cursor-pointer text-left',
                    isActive
                      ? 'bg-card shadow-sm text-foreground border border-border/60'
                      : 'text-muted-foreground hover:bg-card/40 hover:text-foreground'
                  )}
                >
                  <Icon className={clsx('w-3.5 h-3.5 shrink-0', isActive ? tab.color : 'text-muted-foreground/50')} />
                  <span>{tab.label}</span>
                  {tab.id === 'access' && formData.showSystemAccountSection && (
                    <span className="ml-auto w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── RIGHT PANEL: FORM CONTENT ── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-6 space-y-5">

            {/* ── TAB 1: BASIC PROFILE ── */}
            {modalTab === 'basic' && (
              <StaffBasicTab
                sm={sm}
              />
            )}

            {/* ── TAB 2: SALARY & PIN ── */}
            {modalTab === 'compensation' && (
              <StaffCompensationTab
                sm={sm}
              />
            )}

            {/* ── TAB 3: SYSTEM ACCESS & PERMISSIONS ── */}
            {modalTab === 'access' && (
              <StaffAccessTab
                sm={sm}
              />
            )}
          </div>

          {/* ── FOOTER ACTIONS ── */}
          <div className="shrink-0 flex items-center justify-between px-6 py-4 border-t border-border/50 bg-muted/10">
            <div className="flex items-center gap-1.5">
              {!formData.name.trim() ? (
                <>
                  <AlertCircle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                  <span className="text-[11px] font-bold text-rose-500">Staff name is required</span>
                </>
              ) : (
                <span className="text-[11px] text-muted-foreground">Ready to save</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSaveStaff}
                disabled={saving || !formData.name.trim()}
                className="px-5 py-2.5 rounded-xl text-xs font-extrabold bg-primary text-primary-foreground hover:bg-primary/90 transition-all cursor-pointer shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 active:scale-[0.98]"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-3.5 h-3.5" />
                    <span>{formData.staff_id ? 'Update Profile' : 'Save Employee'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
