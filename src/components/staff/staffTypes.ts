export interface StaffMember {
  staff_id: string;
  staff_code: string;
  tenant_id: string;
  name: string;
  phone?: string;
  email?: string;
  role_designation?: string;
  user_id?: string | null;
  user_email?: string;
  user_role?: string;
  permissions?: string[];
  user_login_enabled?: boolean | number;
  joining_date?: string;
  monthly_salary: number;
  current_balance: number;
  status: 'ACTIVE' | 'INACTIVE';
  has_pin: boolean;
  created_at: string;
}

export interface SavedSystemAccount {
  user_id: string;
  role: 'ADMIN' | 'STAFF';
  permissions: string[];
  login_enabled: boolean;
}

/** Staff ledger and attendance rows have no data types yet; named here, in one place, until they are typed. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- legacy staff ledger row, typed later in one place
export type StaffLedgerRow = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- legacy attendance row, typed later in one place
export type StaffAttendanceRow = any;
