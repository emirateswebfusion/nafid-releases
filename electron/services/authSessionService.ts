import fs from 'node:fs';
import { localSaveUser, localAuthenticatePin, clearPinLockout } from './localAuthService.js';
import { setSyncActive } from '../sync/syncWorker.js';
import * as syncService from './syncService.js';
import { cloudTokenUnusable } from '../sync/syncAuth.js';
import { syncState } from '../sync/syncState.js';
import {
  getConfigPath,
  getEncryptedPath,
  getOfflineSessionPath,
  encrypt,
  readAuthPayload,
  clearOfflineSession,
  readOfflineSession,
  writeAuthPayload,
  setTerminalLocked,
} from './authStorage.js';

import { rememberTerminalSession } from './terminalSession.js';

function isCloudCredentialUsable(existingAuth: ReturnType<typeof readAuthPayload>, tenantId: string): boolean {
  return Boolean(
    existingAuth?.tenant_id === tenantId &&
    existingAuth?.jwt_token &&
    !cloudTokenUnusable(existingAuth.jwt_token) &&
    !syncState.authExpiredNotified
  );
}

function isLanSyncReady(): boolean {
  try {
    return syncService.isLanSyncConfigured();
  } catch {
    return false;
  }
}

export function saveToken(value: unknown, localSession?: Record<string, unknown>) {
    if (!value || typeof value !== 'object') return { success: false, error: 'Incomplete session' };
    const payload = value as Record<string, unknown>;
    try {
      const plaintext = JSON.stringify(payload);
      if (localSession) {
        const localEncrypted = encrypt(JSON.stringify(localSession));
        if (!localEncrypted) return { success: false, error: 'Could not preserve the local session' };
        fs.writeFileSync(getOfflineSessionPath(), localEncrypted);
      }
      if (!writeAuthPayload(plaintext)) {
        return { success: false, error: 'Failed to save token' };
      }
      // Also persist user credentials into local SQLite database for offline login capability
      if (payload && payload.user_id && payload.tenant_id) {
        localSaveUser({
          user_id: String(payload.user_id),
          tenant_id: String(payload.tenant_id),
          name: String(payload.user_name || payload.email || ''),
          email: String(payload.email || payload.user_name || ''),
          password_hash: typeof payload.password_hash === 'string' ? payload.password_hash : undefined,
          role: typeof payload.role === 'string' ? payload.role : undefined,
          restricted_page: typeof payload.restricted_page === 'string' ? payload.restricted_page : undefined,
          permissions: Array.isArray(payload.permissions) ? payload.permissions.filter((v): v is string => typeof v === 'string') : undefined,
          login_enabled: typeof payload.login_enabled === 'boolean' ? payload.login_enabled : undefined,
        });
        clearPinLockout(String(payload.tenant_id));
      }
      rememberTerminalSession(localSession || payload);
      if (!localSession) clearOfflineSession();
      setTerminalLocked(false);
      setSyncActive(true);
      return { success: true };
    } catch {
      return { success: false, error: 'Failed to save token' };
    }
}

export function saveOfflineSession(value: unknown) {
    if (!value || typeof value !== 'object') return { success: false, error: 'Incomplete offline session' };
    const payload = value as Record<string, unknown>;
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
      rememberTerminalSession(session);
      const encrypted = encrypt(JSON.stringify(session));
      if (!encrypted) throw new Error('Unable to encrypt offline session');
      fs.writeFileSync(getOfflineSessionPath(), encrypted);
      setTerminalLocked(false);

      // Only remove cloud token if it belonged to a different tenant
      const existingAuth = readAuthPayload();
      if (existingAuth?.tenant_id && existingAuth.tenant_id !== session.tenant_id) {
        const encryptedPath = getEncryptedPath();
        const configPath = getConfigPath();
        if (fs.existsSync(encryptedPath)) fs.unlinkSync(encryptedPath);
        if (fs.existsSync(configPath)) fs.unlinkSync(configPath);
      }

      const cloudReady = isCloudCredentialUsable(existingAuth, session.tenant_id);
      // PIN and cached-password entry preserve the same usable terminal cloud credential.
      setSyncActive(cloudReady || isLanSyncReady());
      return { success: true, cloud_sync_ready: cloudReady };
    } catch (error) {
      return { success: false, error: (error as Error).message || 'Failed to save offline session' };
    }
}

export function loginWithPin(payload: Parameters<typeof localAuthenticatePin>[0]) {
    try {
      const res = localAuthenticatePin(payload);
      if (res.success && res.user) {
        const session = {
          tenant_id: res.user.tenant_id,
          user_id: res.user.user_id,
          role: res.user.role,
          user_name: res.user.name,
          shop_name: res.user.shop_name || '',
          restricted_page: null,
          permissions: res.user.permissions,
        };

        const saved = saveOfflineSession(session);
        if (!saved.success) return saved;
        const cloud = readAuthPayload();
        return { ...res, cloud_sync_ready: saved.cloud_sync_ready === true,
          ...(saved.cloud_sync_ready && cloud?.jwt_token ? { token: cloud.jwt_token } : {}) };
      }
      return res;
    } catch (error) {
      return { success: false, error: (error as Error).message || 'PIN authentication failed' };
    }
}

/** Locks the terminal for PIN/user switching without deleting the terminal's cloud credential. */
export function lockSession(payload?: { prefer_email?: boolean }) {
    try {
      const current = readOfflineSession() || readAuthPayload();
      rememberTerminalSession(current);
      clearOfflineSession();
      setTerminalLocked(true, payload?.prefer_email);
      const existingAuth = readAuthPayload();
      const cloudReady = Boolean(existingAuth?.tenant_id && isCloudCredentialUsable(existingAuth, existingAuth.tenant_id));
      setSyncActive(cloudReady || isLanSyncReady());
      return { success: true, cloud_sync_ready: cloudReady };
    } catch {
      return { success: false, error: 'Failed to lock session' };
    }
}

export function clearToken() {
    // Stop cloud work even if a locked credential file prevents completing sign-out.
    setSyncActive(false);
    try {
      rememberTerminalSession(readOfflineSession() || readAuthPayload());
      const encPath = getEncryptedPath();
      if (fs.existsSync(encPath)) fs.unlinkSync(encPath);
      const p = getConfigPath();
      if (fs.existsSync(p)) fs.unlinkSync(p);
      clearOfflineSession();
      setTerminalLocked(false);
      setSyncActive(false);
      return { success: true };
    } catch {
      return { success: false, error: 'Failed to clear token' };
    }
}

