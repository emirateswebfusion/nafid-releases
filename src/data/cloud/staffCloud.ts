import { cloudRequest } from './client';

export type StaffStatusFilter = 'ALL' | 'ACTIVE' | 'INACTIVE';

export interface StaffRecordPayload {
  staff_id?: string;
  tenant_id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  role_designation?: string | null;
  joining_date?: string | null;
  monthly_salary: number;
  status: 'ACTIVE' | 'INACTIVE';
  user_id?: string;
  biller_pin?: string;
}

export interface StaffAccountPayload {
  name: string;
  email: string;
  password?: string;
  role: 'ADMIN' | 'STAFF';
  permissions: string[];
  login_enabled: boolean;
}

/** Staff directory and login-account requests against the cloud API. Returns raw responses. */
export const staffCloud = {
  list(token: string | null, searchQuery: string, statusFilter: StaffStatusFilter): Promise<Response> {
    return cloudRequest(
      `/api/staff?search=${encodeURIComponent(searchQuery)}&status=${statusFilter}`,
      { headers: { 'Authorization': `Bearer ${token}` } }
    );
  },

  listAccounts(token: string | null): Promise<Response> {
    return cloudRequest('/auth/staff', {
      headers: { 'Authorization': `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
    });
  },

  setLoginEnabled(token: string | null, userId: string, loginEnabled: boolean): Promise<Response> {
    return cloudRequest(`/auth/staff/${encodeURIComponent(userId)}/login`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ login_enabled: loginEnabled }),
    });
  },

  saveAccount(token: string | null, userId: string, payload: StaffAccountPayload): Promise<Response> {
    return cloudRequest(`/auth/staff${userId ? `/${encodeURIComponent(userId)}` : ''}`, {
      method: userId ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
  },

  saveStaff(token: string | null, payload: StaffRecordPayload): Promise<Response> {
    return cloudRequest('/api/staff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
  },
};
