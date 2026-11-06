import type { AuthState } from './authStore';
import { authCloud } from '../data/cloud/authCloud';
import { CLOUD_API } from '../data/cloud/client';
import { authApi, type CloudCredentials } from '../data/auth';
import { hasBridge, isDesktopRuntime } from '../data/client';
import { syncApi } from '../data/sync';
import { isTokenExpired } from '../utils/security/authToken';

type SessionAccess = { getState: () => AuthState; setState: (patch: Partial<AuthState>) => void };
const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object');

/** Online-only recovery. Never signs the user out, switches the local account, resets the cart or falls back offline. */
export async function resumeCloudSync(email: string, password: string, access: SessionAccess, signal?: AbortSignal): Promise<{ success: boolean; error?: string }> {
  const snapshot = access.getState();
  const current = () => {
    const state = access.getState();
    return !signal?.aborted && state.isAuthenticated && state.tenantId === snapshot.tenantId && state.userId === snapshot.userId && state.token === snapshot.token;
  };
  if (!snapshot.isAuthenticated || !snapshot.tenantId || !snapshot.userId) return { success: false, error: 'Sign in to the POS first.' };
  if (!isDesktopRuntime() || !hasBridge('authResumeCloudSession')) return { success: false, error: 'Update this POS to reconnect cloud sync without signing out.' };
  try {
    const response = await authCloud.login(CLOUD_API, email.trim(), password, signal);
    const data: unknown = await response.json().catch(() => null);
    if (!current()) return { success: false, error: 'Cloud sign-in cancelled or the local session changed.' };
    if (!response.ok) return { success: false, error: record(data) && typeof data.error === 'string' ? data.error : `Cloud sign-in failed (HTTP ${response.status}). You can close this dialog and continue offline.` };
    if (!record(data) || typeof data.token !== 'string' || isTokenExpired(data.token) || typeof data.user_id !== 'string'
      || typeof data.tenant_id !== 'string' || !['ADMIN', 'STAFF', 'OWNER'].includes(String(data.role))) {
      return { success: false, error: 'The cloud returned an invalid session. Please try again.' };
    }
    if (data.tenant_id !== snapshot.tenantId) return { success: false, error: 'Sign in with an account for this shop.' };
    const credentials: CloudCredentials = {
      jwt_token: data.token, tenant_id: data.tenant_id, user_id: data.user_id, role: String(data.role), email: email.trim(),
      shop_name: typeof data.shop_name === 'string' ? data.shop_name : snapshot.shopName || '',
      user_name: typeof data.user_name === 'string' ? data.user_name : undefined,
      password_hash: typeof data.password_hash === 'string' ? data.password_hash : undefined,
      permissions: Array.isArray(data.permissions) ? data.permissions.filter((p): p is string => typeof p === 'string') : undefined,
      restricted_page: typeof data.restricted_page === 'string' ? data.restricted_page : undefined,
      domain_type: typeof data.domain_type === 'string' ? data.domain_type : undefined, login_enabled: data.login_enabled !== false,
    };
    const saved = await authApi.resumeCloudSession({ expected_tenant_id: snapshot.tenantId, expected_user_id: snapshot.userId!, credentials });
    if (!saved.success) return { success: false, error: saved.error || 'Could not save the cloud session. Please try again.' };
    if (!current()) return { success: false, error: 'Cloud sign-in cancelled or the local session changed.' };
    // The owner's cloud token belongs to sync, never to the cashier's renderer permissions.
    access.setState({ token: null, isCloudSyncPaused: false, cloudSyncReason: null });
    if (hasBridge('runInitialSync')) void syncApi.runInitialSync().catch(() => {});
    return { success: true };
  } catch {
    return { success: false, error: signal?.aborted ? 'Cloud sign-in cancelled.' : 'Cannot reconnect to the cloud. Check the connection or continue offline.' };
  }
}
