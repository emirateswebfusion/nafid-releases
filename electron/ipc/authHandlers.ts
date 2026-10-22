import { ipcMain } from 'electron';
import fs from 'node:fs';
import { localSaveUser, localAuthenticateUser } from '../services/localAuthService.js';
import { setSyncActive } from '../sync/syncWorker.js';
import * as syncService from '../services/syncService.js';
import {
  getConfigPath,
  getEncryptedPath,
  getOfflineSessionPath,
  encrypt,
  readAuthPayload,
  clearOfflineSession,
  readOfflineSession,
} from '../services/authStorage.js';

export function registerAuthHandlers(): void {
  ipcMain.removeHandler('auth:saveToken');
  ipcMain.handle('auth:saveToken', (_event, payload) => {
    try {
      const plaintext = JSON.stringify(payload);
      fs.writeFileSync(getConfigPath(), plaintext, 'utf-8');
      const encrypted = encrypt(plaintext);
      if (encrypted) {
        fs.writeFileSync(getEncryptedPath(), encrypted);
      }
      // Also persist user credentials into local SQLite database for offline login capability
      if (payload && payload.user_id && payload.tenant_id) {
        localSaveUser({
          user_id: payload.user_id,
          tenant_id: payload.tenant_id,
          name: payload.user_name || payload.email,
          email: payload.email || payload.user_name,
          password_hash: payload.password_hash,
          role: payload.role,
          restricted_page: payload.restricted_page,
          permissions: payload.permissions,
          login_enabled: payload.login_enabled,
        });
      }
      clearOfflineSession();
      setSyncActive(true);
      return { success: true };
    } catch {
      return { success: false, error: 'Failed to save token' };
    }
  });

  ipcMain.removeHandler('auth:saveOfflineSession');
  ipcMain.handle('auth:saveOfflineSession', (_event, payload) => {
    try {
      if (!payload?.tenant_id || !payload?.user_id || !payload?.role) {
        return { success: false, error: 'Incomplete offline session' };
      }
      const session = {
        tenant_id: String(payload.tenant_id),
        user_id: String(payload.user_id),
        role: String(payload.role),
        user_name: String(payload.user_name || ''),
        shop_name: String(payload.shop_name || ''),
        restricted_page: payload.restricted_page ? String(payload.restricted_page) : null,
        permissions: Array.isArray(payload.permissions) ? payload.permissions : [],
      };
      const encrypted = encrypt(JSON.stringify(session));
      if (!encrypted) throw new Error('Unable to encrypt offline session');
      fs.writeFileSync(getOfflineSessionPath(), encrypted);

      // Offline authentication must not leave an older cloud token active.
      const encryptedPath = getEncryptedPath();
      const configPath = getConfigPath();
      if (fs.existsSync(encryptedPath)) fs.unlinkSync(encryptedPath);
      if (fs.existsSync(configPath)) fs.unlinkSync(configPath);

      // Keep sync worker alive if terminal is configured for LAN or HYBRID peer sync
      try {
        if (syncService.isLanSyncConfigured()) {
          setSyncActive(true);
        } else {
          setSyncActive(false);
        }
      } catch {
        setSyncActive(false);
      }
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message || 'Failed to save offline session' };
    }
  });

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
    } catch (error: any) {
      return { success: false, error: error.message };
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
    } catch (error: any) {
      return { success: false, error: error.message || 'Offline authentication failed' };
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
  ipcMain.handle('auth:clearToken', () => {
    try {
      const encPath = getEncryptedPath();
      if (fs.existsSync(encPath)) fs.unlinkSync(encPath);
      const p = getConfigPath();
      if (fs.existsSync(p)) fs.unlinkSync(p);
      clearOfflineSession();
      setSyncActive(false);
      return { success: true };
    } catch {
      return { success: false, error: 'Failed to clear token' };
    }
  });
}
