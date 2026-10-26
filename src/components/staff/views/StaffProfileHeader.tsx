import clsx from 'clsx';
import { UserX, UserCheck, Edit, Lock, User, DollarSign, CreditCard, BookOpen, Calendar } from 'lucide-react';
import { WhatsAppIcon } from '../../ui/WhatsAppIcon';
import { formatCurrency } from '../../../utils/money';
import type { FeatureFlags } from '../../../config/featureFlags';
import type { StaffMember } from '../staffTypes';
import type { StaffManagerState } from '../hooks/useStaffManagerState';

export interface StaffProfileHeaderProps {
  featureFlags: FeatureFlags | null;
  handleSendWhatsAppSalary: () => Promise<void>;
  handleToggleStatus: (staffMember: StaffMember) => Promise<void>;
  openEditStaff: (staff: StaffMember) => void;
  /** Rendered only while a staff member is selected. */
  selectedStaff: StaffMember;
  sm: StaffManagerState;
}

/** Selected staff member's profile header: details, balance and the salary / transaction / edit actions. */
export function StaffProfileHeader({
  featureFlags, handleSendWhatsAppSalary, handleToggleStatus, openEditStaff, selectedStaff, sm,
}: StaffProfileHeaderProps) {
  const { activeTab, isSendingWhatsApp, setActiveTab } = sm;
  return (
    <div className="bg-card border-b border-border p-5 shrink-0">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center font-black text-xl shadow-md">
            {selectedStaff.name.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-extrabold text-foreground">{selectedStaff.name}</h2>
              <span className="text-xs font-mono bg-muted text-muted-foreground px-2 py-0.5 rounded-md font-bold">
                {selectedStaff.staff_code}
              </span>
              <span className={clsx(
                'text-xs font-bold px-2 py-0.5 rounded-full border',
                selectedStaff.status === 'ACTIVE' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' : 'bg-rose-500/10 text-rose-500 border-rose-500/20'
              )}>
                {selectedStaff.status}
              </span>
            </div>
            <p className="text-xs font-medium text-muted-foreground mt-0.5">
              {selectedStaff.role_designation || 'Staff Member'} {selectedStaff.phone && `• ${selectedStaff.phone}`} {selectedStaff.email && `• ${selectedStaff.email}`}
            </p>
          </div>
        </div>

        {/* Top Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleToggleStatus(selectedStaff)}
            className={clsx(
              'px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer flex items-center gap-1.5',
              selectedStaff.status === 'ACTIVE'
                ? 'border-rose-500/20 text-rose-500 hover:bg-rose-500/10'
                : 'border-emerald-500/20 text-emerald-600 hover:bg-emerald-500/10'
            )}
          >
            {selectedStaff.status === 'ACTIVE' ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
            {selectedStaff.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
          </button>
          <button
            onClick={() => openEditStaff(selectedStaff)}
            className="px-3 py-1.5 rounded-xl text-xs font-bold bg-muted hover:bg-muted/80 text-foreground transition-all cursor-pointer flex items-center gap-1.5"
          >
            <Edit className="w-3.5 h-3.5" /> Edit Profile
          </button>
          <button
            onClick={handleSendWhatsAppSalary}
            disabled={isSendingWhatsApp}
            className="px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50 active:scale-95"
            title="Send Salary Statement to Staff via WhatsApp"
          >
            {isSendingWhatsApp ? (
              <div className="w-3.5 h-3.5 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin shrink-0" />
            ) : (
              <WhatsAppIcon className="w-3.5 h-3.5 fill-emerald-500 text-emerald-500 shrink-0" />
            )}
            <span>WhatsApp Statement</span>
          </button>
        </div>
      </div>

      {/* Key Financial Metrics */}
      <div className="grid grid-cols-4 gap-3 mt-4">
        <div className="p-3 rounded-xl bg-muted/30 border border-border/50">
          <p className="text-[10px] font-bold text-muted-foreground uppercase">Configured Monthly Salary</p>
          <p className="text-sm font-black text-foreground mt-0.5">{formatCurrency(selectedStaff.monthly_salary)}</p>
        </div>
        <div className="p-3 rounded-xl bg-amber-500/8 border border-amber-500/20">
          <p className="text-[10px] font-bold text-amber-600 uppercase">Pending Salary Balance</p>
          <p className="text-sm font-black text-amber-600 dark:text-amber-400 mt-0.5">{formatCurrency(selectedStaff.current_balance)}</p>
        </div>
        <div className="p-3 rounded-xl bg-muted/30 border border-border/50">
          <p className="text-[10px] font-bold text-muted-foreground uppercase">Biller PIN Status</p>
          <p className="text-xs font-bold text-foreground mt-1 flex items-center gap-1">
            {selectedStaff.has_pin ? (
              <span className="text-emerald-600 flex items-center gap-1"><Lock className="w-3 h-3" /> Configured</span>
            ) : (
              <span className="text-muted-foreground">Not set</span>
            )}
          </p>
        </div>
        <div className="p-3 rounded-xl bg-muted/30 border border-border/50">
          <p className="text-[10px] font-bold text-muted-foreground uppercase">System Account Link</p>
          <p className="text-xs font-bold text-foreground mt-1 truncate">
            {selectedStaff.user_email ? (
              <span className="text-indigo-600 dark:text-indigo-400 truncate">{selectedStaff.user_email}</span>
            ) : (
              <span className="text-muted-foreground">No login account</span>
            )}
          </p>
        </div>
      </div>

      {/* Module Sub-Tabs */}
      <div className="flex items-center gap-2 border-b border-border/60 -mb-5 mt-4">
        {[
          { id: 'directory', label: 'Overview & Profile', icon: User },
          { id: 'salary', label: 'Salary Book', icon: DollarSign },
          { id: 'payments', label: 'Advances & Payments', icon: CreditCard },
          { id: 'ledger', label: 'Staff Ledger', icon: BookOpen },
          ...(featureFlags?.staff_attendance ? [{ id: 'attendance', label: 'Attendance', icon: Calendar }] : [])
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={clsx(
                'flex items-center gap-1.5 px-4 py-2.5 text-xs font-extrabold border-b-2 transition-all cursor-pointer',
                isActive
                  ? 'border-primary text-primary bg-primary/5'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
