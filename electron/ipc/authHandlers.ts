import { ipcMain } from 'electron';
import { handle } from './common.js';
import { resumeCloudSession } from '../services/cloudSessionRecoveryService.js';
import { loginCloud } from '../services/cloudLoginService.js';
import { localSaveUser, localAuthenticateUser, getTerminalConfig } from '../services/localAuthService.js';
import { readAuthPayload, readOfflineSession } from '../services/authStorage.js';
import * as authSession from '../services/authSessionService.js';
import { getTrialAccess, blockTrialAccess } from '../services/trialAccessService.js';
import { refreshTrialSession } from '../services/trialSessionService.js';

export function registerAuthHandlers(): void {
  handle('auth:resumeCloudSession', resumeCloudSession);
  handle('auth:loginCloud', loginCloud);
  ipcMain.removeHandler('auth:saveToken');
  ipcMain.handle('auth:saveToken', (_event, payload) => authSession.saveToken(payload));

  ipcMain.removeHandler('auth:saveOfflineSession');
  ipcMain.handle('auth:saveOfflineSession', (_event, payload) => authSession.saveOfflineSession(payload));

  ipcMain.removeHandler('auth:getOfflineSession');
  ipcMain.handle('auth:getOfflineSession', () => {
    try {
      return readOfflineSession();
    } catch {
      return null;
    }
  });

  ipcMain.removeHandler('auth:saveLocalUser');
  ipcMain.handle('auth:saveLocalUser', (_event, payload) => {
    try {
      localSaveUser(payload);
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.removeHandler('auth:loginOffline');
  ipcMain.handle('auth:loginOffline', (_event, payload) => {
    try {
      const { email, password } = payload || {};
      if (!email || !password) {
        return { success: false, error: 'Email and password required' };
      }
      return localAuthenticateUser(email, password);
    } catch (error) {
      return { success: false, error: (error as Error).message || 'Offline authentication failed' };
    }
  });

  ipcMain.removeHandler('auth:loginWithPin');
  ipcMain.handle('auth:loginWithPin', (_event, payload) => authSession.loginWithPin(payload));

  ipcMain.removeHandler('auth:getTerminalConfig');
  ipcMain.handle('auth:getTerminalConfig', () => {
    try {
      return getTerminalConfig();
    } catch {
      return { isConfigured: false };
    }
  });

  ipcMain.removeHandler('auth:getToken');
  ipcMain.handle('auth:getToken', () => {
    try {
      return readAuthPayload();
    } catch {
      return null;
    }
  });

  ipcMain.removeHandler('auth:clearToken');
  ipcMain.handle('auth:clearToken', () => authSession.clearToken());

  ipcMain.removeHandler('auth:getTrialAccess');
  ipcMain.handle('auth:getTrialAccess', (_event, payload: { tenant_id: string }) => {
    try { return getTrialAccess(payload); }
    catch (error) { return { is_trial: true, allowed: false, error: (error as Error).message }; }
  });

  ipcMain.removeHandler('auth:refreshTrialSession');
  ipcMain.handle('auth:refreshTrialSession', (_event, payload) => {
    try { return refreshTrialSession(payload as Parameters<typeof refreshTrialSession>[0]); }
    catch (error) { return { success: false, error: (error as Error).message }; }
  });

  ipcMain.removeHandler('auth:blockTrialAccess');
  ipcMain.handle('auth:blockTrialAccess', (_event, payload: { tenant_id: string }) => {
    try { return blockTrialAccess(payload); }
    catch (error) { return { success: false, error: (error as Error).message }; }
  });
}
