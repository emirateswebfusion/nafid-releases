import { readAuthPayload, readOfflineSession } from './authStorage.js';
import { saveToken } from './authSessionService.js';
import { cloudTokenUnusable } from '../sync/syncAuth.js';

const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object');

/** Replaces only the terminal cloud credential, retaining the authenticated local user's identity and permissions. */
export function resumeCloudSession(value: unknown): { success: boolean; error?: string } {
  try {
    if (!record(value) || !record(value.credentials)) return { success: false, error: 'Incomplete cloud session' };
    const credentials = value.credentials;
    const active = readOfflineSession() || readAuthPayload();
    // Match startup: remembered terminal context is display-only, not an authenticated session.
    if (!record(active) || typeof active.tenant_id !== 'string' || !active.tenant_id || typeof active.user_id !== 'string' || !active.user_id
      || active.tenant_id !== value.expected_tenant_id || active.user_id !== value.expected_user_id) {
      return { success: false, error: 'The local session changed. Please reopen cloud sign-in.' };
    }
    if (credentials.tenant_id !== active.tenant_id) return { success: false, error: 'Sign in with an account for this shop.' };
    if (typeof credentials.jwt_token !== 'string' || !credentials.jwt_token || cloudTokenUnusable(credentials.jwt_token)
      || typeof credentials.user_id !== 'string' || !credentials.user_id || !['ADMIN', 'STAFF', 'OWNER'].includes(String(credentials.role))) {
      return { success: false, error: 'Invalid cloud session. Please try again.' };
    }
    // Keep this separately from the cloud account, including when an owner reconnects a cashier's terminal.
    const local = { tenant_id: active.tenant_id, user_id: active.user_id, role: active.role,
      user_name: active.user_name, shop_name: active.shop_name, restricted_page: active.restricted_page,
      permissions: active.permissions };
    return saveToken(credentials, local);
  } catch {
    return { success: false, error: 'Could not save the cloud session. Your local session is unchanged.' };
  }
}
