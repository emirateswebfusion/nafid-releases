import { bindBridge } from './client';

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

/** Session token and offline-login persistence. Channel catalog — the only way UI code reaches these IPC channels. */
export const authApi = bindBridge({
  saveToken: 'authSaveToken',
  getToken: 'authGetToken',
  saveOfflineSession: 'authSaveOfflineSession',
  getOfflineSession: 'authGetOfflineSession',
  clearToken: 'authClearToken',
  saveLocalUser: 'authSaveLocalUser',
  loginOffline: 'authLoginOffline',
  getTrialAccess: 'authGetTrialAccess',
  refreshTrialSession: 'authRefreshTrialSession',
  blockTrialAccess: 'authBlockTrialAccess',
});
