import { cloudRequest } from './client';

export interface TrialSignup {
  shop_name: string; owner_name: string; owner_email: string; owner_password: string;
  phone: string; country: 'AE' | 'IN' | 'BH'; city: string;
}
export interface TrialSession {
  token: string; trial: { expires_at: string; days: number; started_at: string };
  role: 'ADMIN' | 'STAFF'; permissions: string[]; user_name: string; restricted_page: string | null;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await cloudRequest(path, { ...options, signal: options?.signal ?? AbortSignal.timeout(20000) });
  const body: unknown = await response.json();
  if (!response.ok) {
    const message = body && typeof body === 'object' && 'error' in body && typeof body.error === 'string' ? body.error : 'Unable to contact Nafid. Please try again.';
    throw Object.assign(new Error(message), { status: response.status });
  }
  return body as T;
}

export const trialsCloud = {
  policy: () => request<{ default_days: number }>('/auth/trial-policy'),
  register: (input: TrialSignup) => request<{ success: true; tenant_id: string }>('/auth/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input), signal: AbortSignal.timeout(180000),
  }),
  session: (token: string) => request<TrialSession>('/auth/trial-session', { headers: { Authorization: `Bearer ${token}` } }),
};
