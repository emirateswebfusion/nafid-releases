import { bindBridge } from './client';
import type { StaffRow } from './dbRows';

/** A staff member as `db:getStaff` returns it (`getStaffStatement` + staffService.getStaff): the stored row without the
 * PIN hash, the linked login account, the latest ledger balance, parsed permissions and whether a PIN is set. */
export interface StaffListItem extends Omit<StaffRow, 'biller_pin_hash' | 'status'> {
  status: 'ACTIVE' | 'INACTIVE';
  user_email: string | null;
  user_role: string | null;
  user_permissions: string | null;
  user_restricted_page: string | null;
  /** users.login_enabled (0 / 1); older rows may hold booleans. */
  user_login_enabled: number | boolean | null;
  /** Latest staff_ledger.running_balance; null when the member has no ledger entry yet. */
  current_balance: number | null;
  permissions: string[];
  has_pin: boolean;
}

/** Staff, PIN verification, staff ledger and attendance. Channel catalog — the only way UI code reaches these IPC channels. */
export const staffApi = bindBridge({
  getStaff: 'dbGetStaff',
  saveStaff: 'dbSaveStaff',
  verifyBillerPin: 'dbVerifyBillerPin',
  getStaffLedger: 'dbGetStaffLedger',
  addStaffTransaction: 'dbAddStaffTransaction',
  getStaffAttendance: 'dbGetStaffAttendance',
  saveStaffAttendance: 'dbSaveStaffAttendance',
});
