import { useState } from 'react';
import { KeyRound, Lock, Pencil, Trash2, UserRound, ShieldCheck, Cloud, HardDrive } from 'lucide-react';
import { Button } from '../../ui/Button';
import { CustomDialog } from '../../ui/CustomDialog';
import type { StaffMember } from '../staffTypes';
import type { StaffManagerState } from '../hooks/useStaffManagerState';
import { DetailRow, SectionCard, StatusPill } from './staffUi';
import { STAFF_LABEL, formatStaffDate, isAdminStaff } from './staffStyle';

export interface StaffOverviewTabProps {
  handleSaveBillerPin: (pin: string) => Promise<void>;
  openEditStaff?: (staff: StaffMember) => void;
  selectedStaff: StaffMember;
  sm: StaffManagerState;
}

/** Overview tab: employment profile, quick-login PIN and system account. */
export function StaffOverviewTab({ handleSaveBillerPin, openEditStaff, selectedStaff, sm }: StaffOverviewTabProps) {
  const { formData, setFormData, setStatusMessage } = sm;
  const [editingPinStaffId, setEditingPinStaffId] = useState<string | null>(null);
  const [confirmRemovePin, setConfirmRemovePin] = useState(false);
  const [removingPin, setRemovingPin] = useState(false);
  const isEditingPin = editingPinStaffId === selectedStaff.staff_id;
  const showPinForm = !selectedStaff.has_pin || isEditingPin;
  const isAdmin = isAdminStaff(selectedStaff);
  const email = selectedStaff.user_email || selectedStaff.email;

  const startPinEdit = () => {
    setFormData({ ...formData, biller_pin: '' });
    setEditingPinStaffId(selectedStaff.staff_id);
  };

  const onSavePin = async () => {
    if (formData.biller_pin.length !== 4) {
      setStatusMessage({ text: 'PIN must be exactly 4 digits', type: 'error' });
      return;
    }
    await handleSaveBillerPin(formData.biller_pin);
    setEditingPinStaffId(null);
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
      {/* Employment profile */}
      <SectionCard
        icon={UserRound}
        title="Employment Profile"
        description="Identity and contact details"
        className="xl:col-span-3"
        action={openEditStaff && (
          <Button variant="ghost" size="sm" onClick={() => openEditStaff(selectedStaff)} className="gap-1.5 text-primary hover:text-primary">
            <Pencil className="w-3.5 h-3.5" /><span>Edit</span>
          </Button>
        )}
      >
        <div className="divide-y divide-border/50 -my-3">
          <DetailRow label="Full name">{selectedStaff.name}</DetailRow>
          <DetailRow label="Staff code"><span className="font-mono">{selectedStaff.staff_code}</span></DetailRow>
          <DetailRow label="Role / title">{selectedStaff.role_designation || 'Staff Member'}</DetailRow>
          <DetailRow label="Phone">
            {selectedStaff.phone || <span className="text-muted-foreground font-normal">Not provided</span>}
          </DetailRow>
          <DetailRow label="Email">
            {email || <span className="text-muted-foreground font-normal">Not provided</span>}
          </DetailRow>
          <DetailRow label="Date of joining">{formatStaffDate(selectedStaff.joining_date)}</DetailRow>
          <DetailRow label="Status"><StatusPill active={selectedStaff.status === 'ACTIVE'} /></DetailRow>
        </div>
      </SectionCard>

      <div className="xl:col-span-2 space-y-4">
        {/* Quick login PIN */}
        <SectionCard icon={KeyRound} title="Quick Login PIN" description="4-digit code to sign in and bill at this till">
          {!showPinForm ? (
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <Lock className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-[13px] font-semibold text-foreground">PIN enabled</p>
                  <p className="text-sm text-muted-foreground font-mono tracking-[0.4em] mt-0.5">••••</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <Button variant="outline" size="sm" onClick={startPinEdit} className="gap-1.5">
                  <Pencil className="w-3.5 h-3.5" /><span>Change</span>
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  title="Remove PIN"
                  onClick={() => setConfirmRemovePin(true)}
                  className="text-rose-500 hover:text-rose-600 hover:bg-rose-500/10"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  placeholder="••••"
                  value={formData.biller_pin}
                  onChange={e => setFormData({ ...formData, biller_pin: e.target.value.replace(/\D/g, '') })}
                  className="w-28 h-9.5 text-center text-base font-semibold font-mono tracking-[0.4em] bg-background border border-border/80 rounded-xl outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                  autoFocus={isEditingPin}
                />
                <Button onClick={onSavePin}>{isEditingPin ? 'Update PIN' : 'Save PIN'}</Button>
                {isEditingPin && (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setEditingPinStaffId(null);
                      setFormData({ ...formData, biller_pin: '' });
                    }}
                  >
                    Cancel
                  </Button>
                )}
              </div>
              <p className="text-[11.5px] text-muted-foreground">Stored as a secure hash on this terminal only.</p>
            </div>
          )}
        </SectionCard>

        {/* System account */}
        <SectionCard
          icon={ShieldCheck}
          title="System Account"
          description="Login and module access"
          action={
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-muted/70 text-muted-foreground border border-border/60">
              {selectedStaff.user_email ? <Cloud className="w-3 h-3" /> : <HardDrive className="w-3 h-3" />}
              {selectedStaff.user_email ? 'Cloud login' : 'Local only'}
            </span>
          }
        >
          {selectedStaff.user_email ? (
            <div className="space-y-4">
              <div className="divide-y divide-border/50 -my-3">
                <DetailRow label="Login email">{selectedStaff.user_email}</DetailRow>
                <DetailRow label="Access level"><span className="capitalize">{(selectedStaff.user_role || 'Staff').toLowerCase()}</span></DetailRow>
              </div>
              {!isAdmin && selectedStaff.permissions && selectedStaff.permissions.length > 0 ? (
                <div>
                  <p className={STAFF_LABEL}>Allowed modules</p>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {selectedStaff.permissions.map(perm => (
                      <span key={perm} className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-muted/70 text-foreground/80 border border-border/60 capitalize">
                        {perm.replace(/[._]/g, ' ')}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="text-[13px] text-muted-foreground leading-relaxed">
              Managed locally for billing and payroll. Edit the profile and turn on system login to give this person their own sign-in.
            </p>
          )}
        </SectionCard>
      </div>

      <CustomDialog
        isOpen={confirmRemovePin}
        onClose={() => { if (!removingPin) setConfirmRemovePin(false); }}
        variant="danger"
        icon={Lock}
        title="Remove quick login PIN?"
        description={<>{selectedStaff.name} will no longer be able to sign in with a 4-digit PIN at this till. You can set a new PIN any time.</>}
        confirmText="Remove PIN"
        isLoading={removingPin}
        onConfirm={async () => {
          setRemovingPin(true);
          try {
            await handleSaveBillerPin('');
          } finally {
            setRemovingPin(false);
            setConfirmRemovePin(false);
          }
        }}
      />
    </div>
  );
}
