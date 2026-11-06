import { cloudRequest } from './client';
import { authApi } from '../auth';
import { hasBridge, isDesktopRuntime } from '../client';

/** Authentication requests against the cloud API. Returns the raw response so callers keep their status handling. */
export const authCloud = {
  async login(baseUrl: string, email: string, password: string, signal?: AbortSignal): Promise<Response> {
    if (signal?.aborted) throw new Error('Cloud sign-in cancelled.');
    if (isDesktopRuntime() && hasBridge('authLoginCloud')) {
      // Main uses the shipped cloud endpoint, never a renderer-supplied destination for credentials.
      const result = await authApi.loginCloud({ email, password });
      if (signal?.aborted) throw new Error('Cloud sign-in cancelled.');
      if (result.success === false) throw new Error(result.error);
      return new Response(JSON.stringify(result.data), { status: result.status, headers: { 'Content-Type': 'application/json' } });
    }
    return cloudRequest(`${baseUrl}/auth/login`, {
      method: 'POST',
      signal: signal || AbortSignal.timeout(15000),
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
