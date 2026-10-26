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
export type StaffLedgerRow = { ledger_id: string; transaction_date: string; reference_type?: string; description: string; debit_amount: number; credit_amount: number; running_balance: number };
export type StaffAttendanceRow = { attendance_id: string; date: string; status: string };
