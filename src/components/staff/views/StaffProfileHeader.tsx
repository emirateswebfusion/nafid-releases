import { useState } from 'react';
import clsx from 'clsx';
import { useAuthStore } from '../../../store/authStore';
import {
  UserX, UserCheck, Pencil, LayoutGrid, Wallet,
  ArrowLeftRight, BookOpen, CalendarCheck, Phone, Mail, ShieldCheck, type LucideIcon,
} from 'lucide-react';
import { WhatsAppIcon } from '../../ui/WhatsAppIcon';
import { Button } from '../../ui/Button';
import { CustomDialog } from '../../ui/CustomDialog';
import { formatCurrency } from '../../../utils/pricing/money';
import type { FeatureFlags } from '../../../config/featureFlags';
import type { StaffMember } from '../staffTypes';
import type { StaffManagerState } from '../hooks/useStaffManagerState';
import { StaffAvatar, StatusPill } from './staffUi';
import { STAFF_LABEL, STAFF_PANEL, balanceTone, formatStaffDate, isAdminStaff } from './staffStyle';

export interface StaffProfileHeaderProps {
  featureFlags: FeatureFlags | null;
  handleSendWhatsAppSalary: () => Promise<void>;
  handleToggleStatus: (staffMember: StaffMember) => Promise<void>;
  openEditStaff: (staff: StaffMember) => void;
  /** Rendered only while a staff member is selected. */
  selectedStaff: StaffMember;
  sm: StaffManagerState;
}

/** Selected staff member's profile card: identity, key figures, actions and the section tabs. */
export function StaffProfileHeader({
  featureFlags, handleSendWhatsAppSalary, handleToggleStatus, openEditStaff, selectedStaff, sm,
}: StaffProfileHeaderProps) {
  const { activeTab, isSendingWhatsApp, setActiveTab } = sm;
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [togglingStatus, setTogglingStatus] = useState(false);
  const currentUserId = useAuthStore(state => state.userId);
  const isSelf = Boolean(currentUserId && (selectedStaff.user_id === currentUserId || selectedStaff.staff_id === currentUserId));
  const isAdmin = isAdminStaff(selectedStaff);
  const isActive = selectedStaff.status === 'ACTIVE';
  const cannotDeactivate = isActive && (isSelf || isAdmin);
  const balance = Number(selectedStaff.current_balance) || 0;
  const tone = balanceTone(balance);
  const email = selectedStaff.user_email || selectedStaff.email;

  const stats = [
    { label: 'Monthly Salary', value: formatCurrency(selectedStaff.monthly_salary), hint: 'Fixed per month', valueClass: 'text-foreground' },
    { label: 'Ledger Balance', value: formatCurrency(Math.abs(balance)), hint: tone.label, valueClass: tone.text },
    { label: 'Joined', value: formatStaffDate(selectedStaff.joining_date), hint: 'Date of joining', valueClass: 'text-foreground' },
    {
      label: 'Quick PIN',
      value: selectedStaff.has_pin ? 'Enabled' : 'Not set',
      hint: selectedStaff.has_pin ? '4-digit login ready' : 'Set it in Overview',
      valueClass: selectedStaff.has_pin ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground',
    },
  ];

  const tabs: { id: typeof activeTab; label: string; icon: LucideIcon }[] = [
    { id: 'directory', label: 'Overview', icon: LayoutGrid },
    { id: 'salary', label: 'Salary', icon: Wallet },
    { id: 'payments', label: 'Advances & Payouts', icon: ArrowLeftRight },
    { id: 'ledger', label: 'Ledger', icon: BookOpen },
    ...(featureFlags?.staff_attendance ? [{ id: 'attendance' as const, label: 'Attendance', icon: CalendarCheck }] : []),
  ];

  return (
    <div className={clsx(STAFF_PANEL, 'overflow-hidden')}>
      {/* Identity & actions */}
      <div className="relative px-6 pt-6 pb-5">
        <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-r from-primary/[0.07] via-indigo-500/[0.05] to-transparent pointer-events-none" />
        <div className="relative flex items-start justify-between gap-6 flex-wrap">
          <div className="flex items-center gap-4 min-w-0">
            <StaffAvatar name={selectedStaff.name} size="lg" muted={!isActive} />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-semibold text-foreground tracking-tight truncate">{selectedStaff.name}</h2>
                <StatusPill active={isActive} />
                {isAdmin && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                    <ShieldCheck className="w-3 h-3" /><span>Administrator</span>
                  </span>
                )}
              </div>
              <div className="flex items-center gap-x-4 gap-y-1 mt-1.5 text-[12.5px] text-muted-foreground flex-wrap">
                <span className="font-medium text-foreground/80">{selectedStaff.role_designation || 'Staff Member'}</span>
                <span className="font-mono text-[11.5px] px-1.5 py-0.5 rounded-md bg-muted/70 border border-border/60">{selectedStaff.staff_code}</span>
                {selectedStaff.phone && (
                  <span className="inline-flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" />{selectedStaff.phone}</span>
                )}
                {email && (
                  <span className="inline-flex items-center gap-1.5 min-w-0"><Mail className="w-3.5 h-3.5 shrink-0" /><span className="truncate">{email}</span></span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              onClick={handleSendWhatsAppSalary}
              disabled={isSendingWhatsApp}
              title="Send the salary statement to this staff member on WhatsApp"
              className="gap-2"
            >
              {isSendingWhatsApp ? (
                <span className="w-3.5 h-3.5 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
              ) : (
                <WhatsAppIcon className="w-4 h-4 fill-emerald-500 text-emerald-500" />
              )}
              Send Statement
            </Button>
            <Button variant="outline" onClick={() => openEditStaff(selectedStaff)} className="gap-2">
              <Pencil className="w-3.5 h-3.5" /><span>Edit</span>
            </Button>
            <Button
              variant="outline"
              onClick={() => (isActive ? setConfirmDeactivate(true) : handleToggleStatus(selectedStaff))}
              disabled={cannotDeactivate}
              title={cannotDeactivate ? (isAdmin ? 'Admin accounts cannot be deactivated' : 'You cannot deactivate your own account') : undefined}
              className={clsx(
                'gap-2',
                isActive
                  ? 'text-rose-600 dark:text-rose-400 hover:text-rose-600 hover:bg-rose-500/10 hover:border-rose-500/30'
                  : 'text-emerald-600 dark:text-emerald-400 hover:text-emerald-600 hover:bg-emerald-500/10 hover:border-emerald-500/30'
              )}
            >
              {isActive ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
              <span>{isActive ? 'Deactivate' : 'Activate'}</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Key figures */}
      <div className="grid grid-cols-2 lg:grid-cols-4 border-y border-border/60 bg-muted/25 divide-x divide-border/60">
        {stats.map(stat => (
          <div key={stat.label} className="px-6 py-4 min-w-0">
            <p className={STAFF_LABEL}>{stat.label}</p>
            <p className={clsx('text-lg font-semibold tabular-nums tracking-tight mt-1 truncate', stat.valueClass)}>{stat.value}</p>
            <p className="text-[11.5px] text-muted-foreground mt-0.5 truncate">{stat.hint}</p>
          </div>
        ))}
      </div>

      {/* Section tabs */}
      <nav className="flex items-center gap-1 px-4 overflow-x-auto scrollbar-none">
        {tabs.map(tab => {
          const Icon = tab.icon;
          const isCurrent = activeTab === tab.id;
          return (
            <button
              type="button"
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={clsx(
                'relative flex items-center gap-2 px-3.5 py-3.5 text-[13px] font-medium transition-colors cursor-pointer whitespace-nowrap',
                isCurrent ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
              {isCurrent && <span className="absolute left-2 right-2 bottom-0 h-[2px] rounded-full bg-primary" />}
            </button>
          );
        })}
      </nav>

      <CustomDialog
        isOpen={confirmDeactivate}
        onClose={() => { if (!togglingStatus) setConfirmDeactivate(false); }}
        variant="warning"
        icon={UserX}
        title={`Deactivate ${selectedStaff.name}?`}
        description="They will move to the Inactive list. Their ledger and history are kept, and you can activate them again later."
        confirmText="Deactivate"
        isLoading={togglingStatus}
        onConfirm={async () => {
          setTogglingStatus(true);
          try {
            await handleToggleStatus(selectedStaff);
          } finally {
            setTogglingStatus(false);
            setConfirmDeactivate(false);
          }
        }}
      />
    </div>
  );
}
