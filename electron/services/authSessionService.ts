import fs from 'node:fs';
import { localSaveUser, localAuthenticatePin } from './localAuthService.js';
import { setSyncActive } from '../sync/syncWorker.js';
import * as syncService from './syncService.js';
import { cloudTokenUnusable } from '../sync/syncAuth.js';
import {
  getConfigPath,
  getEncryptedPath,
  getOfflineSessionPath,
  encrypt,
  readAuthPayload,
  clearOfflineSession,
  readOfflineSession,
} from './authStorage.js';

import { rememberTerminalSession } from './terminalSession.js';

export function saveToken(value: unknown) {
    if (!value || typeof value !== 'object') return { success: false, error: 'Incomplete session' };
    const payload = value as Record<string, unknown>;
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
      }
      rememberTerminalSession(payload);
      clearOfflineSession();
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

      // Only remove cloud token if it belonged to a different tenant
      const existingAuth = readAuthPayload();
      if (existingAuth?.tenant_id && existingAuth.tenant_id !== session.tenant_id) {
        const encryptedPath = getEncryptedPath();
        const configPath = getConfigPath();
        if (fs.existsSync(encryptedPath)) fs.unlinkSync(encryptedPath);
        if (fs.existsSync(configPath)) fs.unlinkSync(configPath);
      }

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
    } catch (error) {
      return { success: false, error: (error as Error).message || 'Failed to save offline session' };
    }
}

export function loginWithPin(payload: Parameters<typeof localAuthenticatePin>[0]) {
    try {
      const res = localAuthenticatePin(payload);
      if (res.success && res.user) {
        const existing = readAuthPayload();
        const hasValidCloudToken = Boolean(
          existing?.jwt_token &&
          existing?.tenant_id === res.user.tenant_id &&
          !cloudTokenUnusable(existing.jwt_token)
        );

        const session = {
          tenant_id: res.user.tenant_id,
          user_id: res.user.user_id,
          role: res.user.role,
          user_name: res.user.name,
          shop_name: res.user.shop_name || '',
          restricted_page: null,
          permissions: res.user.permissions,
        };

        if (hasValidCloudToken && existing) {
          const updatedPayload = {
            ...existing,
            user_id: res.user.user_id,
            user_name: res.user.name,
            role: res.user.role,
            permissions: res.user.permissions,
          };
          saveToken(updatedPayload);
          setSyncActive(true);
          return { ...res, token: existing.jwt_token };
        }

        const saved = saveOfflineSession(session);
        if (!saved.success) return saved;
      }
      return res;
    } catch (error) {
      return { success: false, error: (error as Error).message || 'PIN authentication failed' };
    }
}

export function clearToken() {
    try {
      rememberTerminalSession(readOfflineSession() || readAuthPayload());
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
}

