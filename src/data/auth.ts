import { bindBridge } from './client';

/** Session token and offline-login persistence. Channel catalog — the only way UI code reaches these IPC channels. */
export const authApi = bindBridge({
  saveToken: 'authSaveToken',
  getToken: 'authGetToken',
  saveOfflineSession: 'authSaveOfflineSession',
  getOfflineSession: 'authGetOfflineSession',
  clearToken: 'authClearToken',
  saveLocalUser: 'authSaveLocalUser',
  loginOffline: 'authLoginOffline',
});
