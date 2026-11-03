import { create, type StoreApi, type UseBoundStore } from 'zustand';
import { useCartStore } from './cartStore';
import { convertLegacyRestrictedPageToPermissions } from '../utils/security/permissions';
import { authApi } from '../data/auth';
import { hasBridge, isDesktopRuntime } from '../data/client';
import { settingsApi } from '../data/settings';
import { syncApi } from '../data/sync';
import { CLOUD_API, registerCloudAuth } from '../data/cloud/client';
import { authCloud } from '../data/cloud/authCloud';

export interface AuthState {
  isAuthenticated: boolean;
  token: string | null;
  tenantId: string | null;
  userId: string | null;
  role: 'SUPER_ADMIN' | 'ADMIN' | 'STAFF' | null;
  permissions: string[];
  userName: string | null;
  shopName: string | null;
  isLoading: boolean;
  lastSyncTime: number | null;
  restrictedPage: string | null;
  isCloudSyncPaused: boolean;
  cloudSyncReason: string | null;

  // Actions
  login: (email: string, password: string, apiBase?: string) => Promise<{ success: boolean; error?: string }>;
  loginWithPin: (pin: string) => Promise<{ success: boolean; error?: string }>;
  setLastSyncTime: (time: number) => void;
  setCloudSyncPaused: (paused: boolean, reason?: string | null) => void;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  updateDomain: (domain: string) => Promise<{ success: boolean; error?: string }>;
  forgotPassword: (email: string) => Promise<{ success: boolean; error?: string }>;
  resetPassword: (token: string, password: string) => Promise<{ success: boolean; error?: string }>;
  changePassword: (oldPassword: string, newPassword: string) => Promise<{ success: boolean; error?: string }>;
}

function normalizeRole(rawRole: string | null | undefined): 'SUPER_ADMIN' | 'ADMIN' | 'STAFF' {
  if (!rawRole) return 'STAFF';
  const r = rawRole.toUpperCase().trim();
  if (r === 'SUPER_ADMIN') return 'SUPER_ADMIN';
  if (r === 'ADMIN' || r === 'OWNER' || r === 'ADMINISTRATOR') return 'ADMIN';
  return 'STAFF';
}

const BROWSER_AUTH_KEY = 'nafid_pos_auth_session';

function decodeJwtPayload(token: string): { exp?: number; role?: string; permissions?: string[]; restricted_page?: string } | null {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    let base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4 !== 0) {
      base64 += '=';
    }
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
}

function isTokenExpired(token: string): boolean {
  const payload = decodeJwtPayload(token);
  if (!payload) return true;
  return payload.exp ? payload.exp * 1000 < Date.now() : false;
}

function parsePermissionsFromToken(token: string): string[] {
  const payload = decodeJwtPayload(token);
  if (!payload) return [];
  const r = (payload.role || '').toUpperCase();
  if (r === 'ADMIN' || r === 'OWNER' || r === 'SUPER_ADMIN') return ['*'];
  if (Array.isArray(payload.permissions) && payload.permissions.length > 0) return payload.permissions;
  return convertLegacyRestrictedPageToPermissions(payload.restricted_page);
}

function formatError(err: unknown, fallback: string): string {
  if (!err) return fallback;
  if (typeof err === 'string') return err;
  if (typeof err === 'object') {
    if (typeof (err as { message?: unknown }).message === 'string') return (err as { message: string }).message;
    if (typeof (err as { error?: unknown }).error === 'string') return (err as { error: string }).error;
    try {
      return JSON.stringify(err);
    } catch {
      return fallback;
    }
  }
  return String(err);
}

// Explicit type: the initializer calls useAuthStore.getState() itself, and with noImplicitAny off that circular
// reference made tsc infer `any` for the whole store (every screen read tenantId etc. untyped).
export const useAuthStore: UseBoundStore<StoreApi<AuthState>> = create<AuthState>()((set, _get) => ({
  isAuthenticated: false,
  token: null,
  tenantId: null,
  userId: null,
  role: null,
  permissions: [],
  userName: null,
  shopName: null,
  isLoading: true,
  lastSyncTime: null,
  restrictedPage: null,
  isCloudSyncPaused: false,
  cloudSyncReason: null,

  setLastSyncTime: (time) => set({ lastSyncTime: time }),
  setCloudSyncPaused: (paused, reason = null) => set({ isCloudSyncPaused: paused, cloudSyncReason: reason }),

  // ── On app startup: read config.json via IPC ──────────────────────────────
  checkAuth: async () => {
    set({ isLoading: true });
    try {
      if (isDesktopRuntime()) {
        // Reset local store confirmation state before restoring either session type.
        useCartStore.getState().resetDomainConfirmation();
        const offlineSession = await authApi.getOfflineSession();
        if (offlineSession?.tenant_id && offlineSession.user_id) {
          const roleVal = normalizeRole(offlineSession.role);
          if (roleVal === 'SUPER_ADMIN') {
            await authApi.clearToken();
            set({ isAuthenticated: false, permissions: [] });
            return;
          }
          const permissions = roleVal === 'ADMIN'
            ? ['*']
            : (Array.isArray(offlineSession.permissions) && offlineSession.permissions.length > 0 ? offlineSession.permissions : convertLegacyRestrictedPageToPermissions(offlineSession.restricted_page));
          set({
            isAuthenticated: true,
            token: null,
            tenantId: offlineSession.tenant_id,
            userId: offlineSession.user_id,
            role: roleVal,
            permissions,
            userName: offlineSession.user_name || null,
            shopName: offlineSession.shop_name || null,
            restrictedPage: offlineSession.restricted_page || null,
            isCloudSyncPaused: true,
            cloudSyncReason: 'Operating in Local Mode (Central DB unavailable). POS active.'
          });
          useCartStore.getState().setRole(roleVal);
          return;
        }

        const stored = await authApi.getToken();
        if (stored?.jwt_token) {
          const expired = isTokenExpired(stored.jwt_token);
          const perms = parsePermissionsFromToken(stored.jwt_token);
          let rawRole = (stored.role || '') as NonNullable<AuthState['role']>;
          if (rawRole === 'SUPER_ADMIN') {
            if (isDesktopRuntime()) await authApi.clearToken();
            set({ isAuthenticated: false, permissions: [] });
            return;
          }
          if (['BILLER', 'CASHIER'].includes(rawRole)) rawRole = 'STAFF';

          let resolvedShopName = stored.shop_name;
          try {
            const localName = await settingsApi.get({
              tenant_id: stored.tenant_id || 'global',
              key: 'shop_name'
            });
            if (typeof localName === 'string' && localName.trim()) {
              resolvedShopName = localName.trim();
            }
          } catch { /* ignore */ }

          set({
            isAuthenticated: true,
            token: stored.jwt_token,
            tenantId: stored.tenant_id,
            userId: stored.user_id,
            role: rawRole,
            permissions: perms,
            userName: stored.user_name || null,
            shopName: resolvedShopName,
            restrictedPage: stored.restricted_page || null,
            isCloudSyncPaused: expired,
            cloudSyncReason: expired ? 'Token expired — Cloud Sync paused. Re-login to resume cloud sync.' : null
          });
          useCartStore.getState().setRole(rawRole);
          if (stored.domain_type) {
            useCartStore.getState().setDomain(stored.domain_type as Parameters<ReturnType<typeof useCartStore.getState>['setDomain']>[0]);
            // Check local DB for confirmation if offline/restarting
            const confirmed = await settingsApi.get({ 
              tenant_id: stored.tenant_id, 
              key: 'isDomainConfirmed' 
            });
            if (confirmed || stored.domain_type !== 'GENERAL') {
              useCartStore.getState().confirmDomain();
            }
          }
        } else {
          set({ isAuthenticated: false, permissions: [] });
        }
      } else {
        // Keep browser development sessions across a hard refresh as well.
        const rawSession = localStorage.getItem(BROWSER_AUTH_KEY);
        if (!rawSession) {
          set({ isAuthenticated: false, permissions: [] });
          return;
        }

        try {
          const stored = JSON.parse(rawSession);
          if (!stored?.jwt_token || isTokenExpired(stored.jwt_token)) {
            localStorage.removeItem(BROWSER_AUTH_KEY);
            set({ isAuthenticated: false, permissions: [] });
            return;
          }
          const roleVal = normalizeRole(stored.role);
          set({
            isAuthenticated: true,
            token: stored.jwt_token,
            tenantId: stored.tenant_id || null,
            userId: stored.user_id || null,
            role: roleVal,
            permissions: parsePermissionsFromToken(stored.jwt_token),
            userName: stored.user_name || null,
            shopName: stored.shop_name || null,
            restrictedPage: stored.restricted_page || null,
            isCloudSyncPaused: false,
            cloudSyncReason: null,
          });
          useCartStore.getState().setRole(roleVal);
        } catch {
          localStorage.removeItem(BROWSER_AUTH_KEY);
          set({ isAuthenticated: false, permissions: [] });
        }
      }
    } finally {
      set({ isLoading: false });
    }
  },

  // ── Login: call Cloud API then persist token via IPC ─────────────────────
  login: async (email, password, apiBase = CLOUD_API) => {
    const applyOfflineLogin = async (user: { role?: string; permissions?: string[]; restricted_page?: string | null; tenant_id: string; user_id: string; name?: string }, reason: string) => {
      const roleVal = normalizeRole(user.role);
      if (roleVal === 'SUPER_ADMIN') {
        return { success: false, error: 'Super Admin login is restricted to the Central Web Portal and is not allowed on POS terminals.' };
      }

      const permissions = roleVal === 'ADMIN'
        ? ['*']
        : (Array.isArray(user.permissions) && user.permissions.length > 0 ? user.permissions : convertLegacyRestrictedPageToPermissions(user.restricted_page));
      let resolvedShopName = email;
      try {
        const local = await settingsApi.get({ tenant_id: user.tenant_id || 'global', key: 'shop_name' });
        if (typeof local === 'string' && local.trim()) resolvedShopName = local.trim();
      } catch { /* ignore */ }

      const offlineSession = {
        tenant_id: user.tenant_id,
        user_id: user.user_id,
        role: roleVal,
        user_name: user.name || email,
        shop_name: resolvedShopName,
        restricted_page: user.restricted_page || null,
        permissions,
      };
      if (isDesktopRuntime()) {
        try {
          const saved = await authApi.saveOfflineSession(offlineSession);
          if (!saved?.success) {
            return { success: false, error: saved?.error || 'Could not save the offline session. Please try again.' };
          }
        } catch (error) {
          return { success: false, error: (error as Error)?.message || 'Could not save the offline session. Please try again.' };
        }
      }

      set({
        isAuthenticated: true,
        token: null,
        tenantId: offlineSession.tenant_id,
        userId: offlineSession.user_id,
        role: roleVal,
        permissions,
        userName: offlineSession.user_name,
        shopName: resolvedShopName,
        restrictedPage: offlineSession.restricted_page,
        isCloudSyncPaused: true,
        cloudSyncReason: reason,
      });
      useCartStore.getState().setRole(roleVal);
      return { success: true };
    };

    try {
      // Reset local store confirmation state before logging in
      useCartStore.getState().resetDomainConfirmation();
      const baseUrl = apiBase.replace(/\/$/, '');
      const res = await authCloud.login(baseUrl, email, password);
      const data = await res.json();

      if (!res.ok) {
        if (res.status === 403 || res.status === 401) {
          const errMsg = data?.error || 'Authentication failed';
          if (errMsg.toLowerCase().includes('disabled') || errMsg.toLowerCase().includes('terminated') || errMsg.toLowerCase().includes('restricted')) {
            return { success: false, error: errMsg };
          }
        }
        if (hasBridge('authLoginOffline')) {
          console.warn(`[AuthStore] Cloud login returned HTTP ${res.status} (${data?.error || 'Server Error'}), attempting local DB auth...`);
          const offlineAuth = await authApi.loginOffline({ email, password });
          if (offlineAuth.success && offlineAuth.user) {
            return await applyOfflineLogin(offlineAuth.user, 'Operating in Local Mode (Central DB unavailable). POS active.');
          } else if ((offlineAuth as { error?: string }).error && !(offlineAuth as { error?: string }).error!.includes('User not found')) {
            return { success: false, error: (offlineAuth as { error: string }).error };
          }
        }
        return { success: false, error: formatError(data?.error || data, 'Login failed') };
      }

      let roleVal = (data.role || '') as NonNullable<AuthState['role']>;
      if (roleVal === 'SUPER_ADMIN') {
        return { success: false, error: 'Super Admin login is restricted to the Central Web Portal and is not allowed on POS terminals.' };
      }
      if (['BILLER', 'CASHIER'].includes(roleVal)) roleVal = 'STAFF';
      const perms = parsePermissionsFromToken(data.token);

      let resolvedShopName = data.shop_name;
      if (!resolvedShopName && isDesktopRuntime()) {
        try {
          const local = await settingsApi.get({ tenant_id: data.tenant_id || 'global', key: 'shop_name' });
          if (typeof local === 'string' && local.trim()) resolvedShopName = local.trim();
        } catch { /* ignore */ }
      }
      if (!resolvedShopName) resolvedShopName = email;

      // Persist to disk and local SQLite database via IPC
      if (isDesktopRuntime()) {
        await authApi.saveToken({
          jwt_token: data.token,
          tenant_id: data.tenant_id,
          user_id: data.user_id,
          role: roleVal,
          user_name: data.user_name,
          shop_name: resolvedShopName,
          domain_type: data.domain_type,
          restricted_page: data.restricted_page,
          password_hash: data.password_hash,
          email: email,
          permissions: data.permissions,
          login_enabled: data.login_enabled !== false,
        });
      } else {
        localStorage.setItem(BROWSER_AUTH_KEY, JSON.stringify({
          jwt_token: data.token,
          tenant_id: data.tenant_id,
          user_id: data.user_id,
          role: roleVal,
          user_name: data.user_name,
          shop_name: resolvedShopName,
          domain_type: data.domain_type,
          restricted_page: data.restricted_page,
        }));
      }
      
      set({
        isAuthenticated: true,
        token: data.token,
        tenantId: data.tenant_id,
        userId: data.user_id,
        role: roleVal,
        permissions: perms,
        userName: data.user_name || null,
        shopName: resolvedShopName,
        restrictedPage: data.restricted_page || null,
        isCloudSyncPaused: false,
        cloudSyncReason: null
      });
      useCartStore.getState().setRole(roleVal);
      if (data.domain_type) {
        useCartStore.getState().setDomain(data.domain_type);
        // If it's coming from the cloud, it's already an existing preference
        useCartStore.getState().confirmDomain();
        
        // Also ensure it's saved locally for offline persistence
        if (isDesktopRuntime()) {
          await settingsApi.set({ 
            tenant_id: data.tenant_id, 
            key: 'isDomainConfirmed', 
            value: true 
          });
        }
      }

      // If background sync worker is running, trigger an immediate cycle
      if (hasBridge('runInitialSync')) {
        syncApi.runInitialSync().catch(() => {});
      }

      return { success: true };
    } catch (err) {
      // Offline fallback: Attempt local authentication using cached user credentials in SQLite
      if (hasBridge('authLoginOffline')) {
        const offlineAuth = await authApi.loginOffline({ email, password });
        if (offlineAuth.success && offlineAuth.user) {
          return await applyOfflineLogin(offlineAuth.user, 'Offline Mode — Cloud Sync paused. Check network connection.');
        }
      }
      return { success: false, error: formatError(err, 'Cannot reach server. Check your network connection.') };
    }
  },

  // ── Login with PIN ────────────────────────────────────────────────────────
  loginWithPin: async (pin: string) => {
    if (!isDesktopRuntime()) {
      return { success: false, error: 'PIN login is only supported on the POS desktop app.' };
    }
    if (!hasBridge('authLoginWithPin')) {
      return { success: false, error: 'PIN login is not supported in this version.' };
    }
    try {
      const res = await authApi.loginWithPin({ pin });
      if (!res.success) {
        return { success: false, error: res.error || 'Invalid PIN' };
      }
      const u = res.user;
      const roleVal = normalizeRole(u.role);
      const permissions = roleVal === 'ADMIN' ? ['*'] : (u.permissions && u.permissions.length > 0 ? u.permissions : ['sales.create', 'sales.view', 'sales.reprint']);
      useCartStore.getState().resetDomainConfirmation();
      set({
        isAuthenticated: true,
        token: null,
        tenantId: u.tenant_id,
        userId: u.user_id,
        role: roleVal,
        permissions,
        userName: u.name,
        shopName: u.shop_name || 'My Shop',
        restrictedPage: null,
        isCloudSyncPaused: false,
        cloudSyncReason: null,
      });
      useCartStore.getState().setRole(roleVal);
      return { success: true };
    } catch (err) {
      return { success: false, error: formatError(err, 'PIN login failed') };
    }
  },

  // ── Logout ────────────────────────────────────────────────────────────────
  logout: async () => {
    if (isDesktopRuntime()) await authApi.clearToken();
    localStorage.removeItem(BROWSER_AUTH_KEY);
    try {
      localStorage.removeItem('nafid_pos_ai_conversations_v3');
      localStorage.removeItem('nafid_pos_ai_active_conv_id_v3');
      localStorage.removeItem('nafid_pos_ai_conversations');
    } catch { /* ignore */ }
    useCartStore.getState().clearCart();
    set({ isAuthenticated: false, token: null, tenantId: null, userId: null, role: null, permissions: [], userName: null, shopName: null, restrictedPage: null });
  },

  updateDomain: async (domain: string) => {
    const { token, tenantId } = useAuthStore.getState();
    if (!token || !tenantId) return { success: false, error: 'Not authenticated' };

    try {
      const res = await authCloud.updateTenantDomain(token, domain);
      const data = await res.json();
      if (!res.ok) return { success: false, error: formatError(data?.error || data, 'Update failed') };

      // Update local cart store
      useCartStore.getState().setDomain(domain as Parameters<ReturnType<typeof useCartStore.getState>['setDomain']>[0]);
      useCartStore.getState().confirmDomain();

      // Update local config file via IPC (re-save current config with new domain)
      if (isDesktopRuntime()) {
        const current = await authApi.getToken();
        if (current) {
          await authApi.saveToken({ ...current, domain_type: domain });
        }
        // Also update local DB settings
        await settingsApi.set({ 
          tenant_id: tenantId, 
          key: 'isDomainConfirmed', 
          value: true 
        });
      }

      return { success: true };
    } catch (err) {
      console.error('Update domain error:', err);
      return { success: false, error: 'Authentication failed' };
    }
  },
  
  forgotPassword: async (email: string) => {
    try {
      const res = await authCloud.forgotPassword(email);
      const data = await res.json();
      if (!res.ok) return { success: false, error: formatError(data?.error || data, 'Request failed') };
      return { success: true };
    } catch {
      return { success: false, error: 'Cannot reach server.' };
    }
  },

  resetPassword: async (token: string, password: string) => {
    try {
      const res = await authCloud.resetPassword(token, password);
      const data = await res.json();
      if (!res.ok) return { success: false, error: formatError(data?.error || data, 'Reset failed') };
      return { success: true };
    } catch {
      return { success: false, error: 'Cannot reach server.' };
    }
  },

  changePassword: async (oldPassword: string, newPassword: string): Promise<{ success: boolean; error?: string }> => {
    const { token } = useAuthStore.getState();
    if (!token) return { success: false, error: 'Not authenticated' };

    try {
      const res = await authCloud.changePassword(token, oldPassword, newPassword);
      const data = await res.json();
      if (!res.ok) return { success: false, error: formatError(data?.error || data, 'Update failed') };
      // The server ended every older session of this user and sent this device a new token.
      if (typeof data?.token === 'string') {
        useAuthStore.setState({ token: data.token });
        if (hasBridge('authGetToken') && hasBridge('authSaveToken')) {
          const stored = await authApi.getToken();
          if (stored) await authApi.saveToken({ ...stored, jwt_token: data.token });
        }
      }
      return { success: true };
    } catch {
      return { success: false, error: 'Cannot reach server.' };
    }
  }
}));

// Cloud calls (src/data/cloud) take the session token from this store; a 401 pauses cloud sync and asks to sign in.
registerCloudAuth({
  getToken: async () => {
    let token = useAuthStore.getState().token;
    // Auto-recover the token from the stored Electron config if the in-memory session was cleared.
    if (!token && typeof window !== 'undefined' && hasBridge('authGetToken')) {
      try {
        const stored = await authApi.getToken();
        if (stored?.jwt_token) {
          token = stored.jwt_token;
          useAuthStore.setState({ token: stored.jwt_token });
        }
      } catch { /* keep going without a token */ }
    }
    return token;
  },
  onUnauthorized: () => {
    useAuthStore.getState().setCloudSyncPaused(true, 'Token expired — Cloud Sync paused. Re-login to resume cloud sync.');
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('open-session-expired-modal'));
  },
});
