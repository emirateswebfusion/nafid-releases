import { bindBridge } from './client';

export type CloudLoginReply = { success: true; status: number; data: unknown } | { success: false; error: string };

export interface CloudCredentials {
  jwt_token: string; tenant_id: string; user_id: string; role: string; shop_name: string;
  user_name?: string; domain_type?: string; restricted_page?: string; password_hash?: string;
  store_profile?: unknown;
  email?: string; permissions?: string[]; login_enabled?: boolean;
}
export interface CloudSessionResumeRequest {
  expected_tenant_id: string; expected_user_id: string; credentials: CloudCredentials;
}

/** Identifies the cloud session rejected by the sync worker, so delayed events cannot reject a newer login. */
export interface RejectedCloudSession { token: string }

/** User returned by `localAuthenticateUser` after an offline password check. */
export interface OfflineAuthenticatedUser {
  user_id: string;
  tenant_id: string;
  name: string;
  email: string;
  role: string;
  restricted_page?: string | null;
  permissions: string[];
  login_enabled: boolean;
}

/** Success and all validation/authentication failures returned by `auth:loginOffline`. */
export type OfflineLoginResult =
  | { success: true; user: OfflineAuthenticatedUser }
  | { success: false; error: string };

export interface PinAuthenticatedUser {
  user_id: string;
  tenant_id: string;
  name: string;
  email: string | null;
  role: 'ADMIN' | 'STAFF';
  permissions: string[];
  shop_name?: string;
}

export type PinLoginResult =
  | { success: true; user: PinAuthenticatedUser; cloud_sync_ready?: boolean }
  | { success: false; error: string; remaining_seconds?: number; attempts_remaining?: number };

export interface TerminalConfigResult {
  user_name?: string;
  user_id?: string;
  role?: string;
  isConfigured: boolean;
  tenant_id?: string;
  shop_name?: string;
  cloud_sync_ready?: boolean;
  lockout_remaining_seconds?: number;
  is_locked?: boolean;
}

/** Session token and offline-login persistence. Channel catalog — the only way UI code reaches these IPC channels. */
export const authApi = bindBridge({
  saveToken: 'authSaveToken',
  loginCloud: 'authLoginCloud',
  resumeCloudSession: 'authResumeCloudSession',
  getToken: 'authGetToken',
  saveOfflineSession: 'authSaveOfflineSession',
  getOfflineSession: 'authGetOfflineSession',
  clearToken: 'authClearToken',
  lockSession: 'authLockSession',
  isLocked: 'authIsLocked',
  getLockMode: 'authGetLockMode',
  checkUserPin: 'authCheckUserPin',
  saveLocalUser: 'authSaveLocalUser',
  loginOffline: 'authLoginOffline',
  loginWithPin: 'authLoginWithPin',
  getTerminalConfig: 'authGetTerminalConfig',
  getTrialAccess: 'authGetTrialAccess',
  refreshTrialSession: 'authRefreshTrialSession',
  blockTrialAccess: 'authBlockTrialAccess',
});
