import { cloudRequest } from './client';

/** Authentication requests against the cloud API. Returns the raw response so callers keep their status handling. */
export const authCloud = {
  login(baseUrl: string, email: string, password: string): Promise<Response> {
    return cloudRequest(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
  },

  updateTenantDomain(token: string, domain: string): Promise<Response> {
    return cloudRequest('/auth/tenant/domain', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ domain_type: domain }),
    });
  },

  forgotPassword(email: string): Promise<Response> {
    return cloudRequest('/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
  },

  resetPassword(token: string, password: string): Promise<Response> {
    return cloudRequest('/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password }),
    });
  },

  changePassword(token: string, oldPassword: string, newPassword: string): Promise<Response> {
    return cloudRequest('/auth/change-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ oldPassword, newPassword }),
    });
  },
};
