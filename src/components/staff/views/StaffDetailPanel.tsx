import { StaffLedgerTab } from './StaffLedgerTab';
import { StaffAttendanceTab } from './StaffAttendanceTab';
import { StaffOverviewTab } from './StaffOverviewTab';
import { StaffPaymentsTab } from './StaffPayTabs';
import { StaffSalaryTab } from './StaffSalaryTab';
import type { FeatureFlags } from '../../../config/featureFlags';
import type { StaffMember } from '../staffTypes';
import type { StaffManagerState } from '../hooks/useStaffManagerState';

export interface StaffDetailPanelProps {
  featureFlags: FeatureFlags | null;
  handleMarkAttendance: (staffId: string, date: string, status: "PRESENT" | "ABSENT" | "HALF_DAY" | "LEAVE" | "HOLIDAY") => Promise<void>;
  handleSaveBillerPin: (pin: string) => Promise<void>;
  openEditStaff?: (staff: StaffMember) => void;
  /** Rendered only while a staff member is selected. */
  selectedStaff: StaffMember;
  sm: StaffManagerState;
}

/** Selected staff member's active tab (overview, salary, payouts, ledger, attendance). */
export function StaffDetailPanel({
  featureFlags, handleMarkAttendance, handleSaveBillerPin, openEditStaff, selectedStaff, sm,
}: StaffDetailPanelProps) {
  const { activeTab, ledgerEntries, setModalTab } = sm;

  return (
    <>
      {activeTab === 'directory' && (
        <StaffOverviewTab
          handleSaveBillerPin={handleSaveBillerPin} openEditStaff={openEditStaff} selectedStaff={selectedStaff} sm={sm}
        />
      )}
      {activeTab === 'salary' && (
        <StaffSalaryTab
          onChangeSalary={openEditStaff && (() => { openEditStaff(selectedStaff); setModalTab('compensation'); })}
          selectedStaff={selectedStaff} sm={sm}
        />
      )}
      {activeTab === 'payments' && <StaffPaymentsTab selectedStaff={selectedStaff} sm={sm} />}
      {activeTab === 'ledger' && <StaffLedgerTab ledgerEntries={ledgerEntries} selectedStaff={selectedStaff} />}
      {activeTab === 'attendance' && featureFlags?.staff_attendance && (
        <StaffAttendanceTab handleMarkAttendance={handleMarkAttendance} selectedStaff={selectedStaff} sm={sm} />
      )}
    </>
  );
}
