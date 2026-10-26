import { cloudFetch, cloudRequest } from './client';

/** Super-admin console: tenants, their cloud access, credential reveal and the platform WhatsApp device (cloud `/super-admin`). */
export interface SuperAdminResult {
  success?: boolean;
  error?: string;
}

export interface CloudAccessConfig {
  cloud_access_enabled?: boolean;
  cloud_schedule_enabled?: boolean;
  cloud_manual_override?: 'AUTO' | 'FORCE_ON' | 'FORCE_OFF';
  cloud_schedules?: unknown;
}

export interface ViewCodeResult extends SuperAdminResult {
  /** Present when `success`. */
  db_connection_string: string;
  neon_mail_id?: string;
  neon_password?: string;
}

export interface WhatsAppDeviceStatus {
  status: 'disconnected' | 'connecting' | 'syncing' | 'connected';
  qrCode?: string;
  phone?: string;
}

export interface WhatsAppConnectResult {
  error?: string;
  status?: WhatsAppDeviceStatus['status'];
  qrCode?: string;
}

export const superAdminCloud = {
  admins: <T>() => cloudFetch<T | null>('/super-admin/admins'),
  createAdmin: (body: Record<string, unknown>) => cloudFetch<unknown>('/super-admin/admins', { method: 'POST', body: JSON.stringify(body) }),
  updateAdmin: (tenantId: string, body: Record<string, unknown>) =>
    cloudFetch<unknown>(`/super-admin/admins/${tenantId}`, { method: 'PUT', body: JSON.stringify(body) }),
  testConnection: (body: { db_connection_string: unknown; tenant_id: unknown }) =>
    cloudFetch<SuperAdminResult>('/super-admin/test-connection', { method: 'POST', body: JSON.stringify(body) }),
  /** Health check of one tenant database against an explicit API base; the caller reads the Response. */
  testConnectionAt: (apiBase: string, token: string | null, body: { db_connection_string: unknown; tenant_id: unknown }) =>
    cloudRequest(`${apiBase}/super-admin/test-connection`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(body)
    }),
  getCloudAccess: (tenantId: string) => cloudFetch<CloudAccessConfig | null>(`/super-admin/cloud-access/${tenantId}`),
  setCloudAccess: (tenantId: string, config: unknown) =>
    cloudFetch(`/super-admin/cloud-access/${tenantId}`, { method: 'PUT', body: JSON.stringify(config) }),
  requestViewCode: (tenantId: string) =>
    cloudFetch<SuperAdminResult>('/super-admin/request-view-code', { method: 'POST', body: JSON.stringify({ tenant_id: tenantId }) }),
  verifyViewCode: (tenantId: string, code: string) =>
    cloudFetch<ViewCodeResult>('/super-admin/verify-view-code', { method: 'POST', body: JSON.stringify({ tenant_id: tenantId, code }) }),
  whatsappStatus: () => cloudFetch<WhatsAppDeviceStatus | null>('/super-admin/whatsapp/status'),
  whatsappConnect: () => cloudFetch<WhatsAppConnectResult>('/super-admin/whatsapp/connect', { method: 'POST' }),
  whatsappDisconnect: () => cloudFetch<SuperAdminResult>('/super-admin/whatsapp/disconnect', { method: 'POST' }),
};
