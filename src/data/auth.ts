import { bindBridge } from './client';

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
  | { success: true; user: PinAuthenticatedUser }
  | { success: false; error: string };

export interface TerminalConfigResult {
  user_name?: string;
  user_id?: string;
  role?: string;
  isConfigured: boolean;
  tenant_id?: string;
  shop_name?: string;
}

/** Session token and offline-login persistence. Channel catalog — the only way UI code reaches these IPC channels. */
export const authApi = bindBridge({
  saveToken: 'authSaveToken',
  getToken: 'authGetToken',
  saveOfflineSession: 'authSaveOfflineSession',
  getOfflineSession: 'authGetOfflineSession',
  clearToken: 'authClearToken',
  saveLocalUser: 'authSaveLocalUser',
  loginOffline: 'authLoginOffline',
  loginWithPin: 'authLoginWithPin',
  getTerminalConfig: 'authGetTerminalConfig',
  getTrialAccess: 'authGetTrialAccess',
  refreshTrialSession: 'authRefreshTrialSession',
  blockTrialAccess: 'authBlockTrialAccess',
});
