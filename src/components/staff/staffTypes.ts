import type { StaffListItem } from '../../data/staff';
/** A staff member as the staff screen lists it (the data layer's StaffListItem). */
export type StaffMember = StaffListItem;

export interface SavedSystemAccount {
  user_id: string;
  role: 'ADMIN' | 'STAFF';
  permissions: string[];
  login_enabled: boolean;
}

/** Staff ledger and attendance rows as stored. */
export type { StaffLedgerRow, StaffAttendanceRow } from '../../data/dbRows';
