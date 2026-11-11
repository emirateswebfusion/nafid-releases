import { create, type StoreApi, type UseBoundStore } from 'zustand';
import { useCartStore } from './cartStore';
import { convertLegacyRestrictedPageToPermissions } from '../utils/security/permissions';
import { authApi } from '../data/auth';
import { hasBridge, isDesktopRuntime } from '../data/client';
import { settingsApi } from '../data/settings';
import { syncApi } from '../data/sync';
import { CLOUD_API, registerCloudAuth } from '../data/cloud/client';
import { authCloud } from '../data/cloud/authCloud';
import { decodeJwtPayload, isTokenExpired } from '../utils/security/authToken';
export { isTokenExpired } from '../utils/security/authToken';

export interface AuthState {
  isAuthenticated: boolean;
  authError: string | null;
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
  login: (email: string, password: string, apiBase?: string, options?: { requireCloud?: boolean; offlineOnly?: boolean }) => Promise<{ success: boolean; error?: string }>;
  loginWithPin: (pin: string) => Promise<{ success: boolean; error?: string; remaining_seconds?: number; attempts_remaining?: number }>;
  setLastSyncTime: (time: number) => void;
  setCloudSyncPaused: (paused: boolean, reason?: string | null) => void;
  lockTerminal: () => Promise<void>;
  switchToEmailLogin: () => Promise<void>;
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
let authGeneration = 0;

function clearRendererSession(set: (partial: Partial<AuthState>) => void): void {
  localStorage.removeItem(BROWSER_AUTH_KEY);
  try {
    localStorage.removeItem('nafid_pos_ai_conversations_v3');
    localStorage.removeItem('nafid_pos_ai_active_conv_id_v3');
    localStorage.removeItem('nafid_pos_ai_conversations');
  } catch { /* ignore */ }
  useCartStore.getState().clearCart();
  set({
    isAuthenticated: false,
    token: null,
    tenantId: null,
    userId: null,
    role: null,
    permissions: [],
    userName: null,
    shopName: null,
    restrictedPage: null,
    isCloudSyncPaused: true,
    cloudSyncReason: null,
    lastSyncTime: null,
    authError: null,
    isLoading: false,
  });
}

function setEmailLoginPreference(preferEmail: boolean): void {
  try {
    if (preferEmail) sessionStorage.setItem('auth_prefer_email', '1');
    else sessionStorage.removeItem('auth_prefer_email');
  } catch { /* ignore */ }
}

async function lockTerminalSession(
  set: (partial: Partial<AuthState>) => void,
  preferEmail: boolean
): Promise<void> {
  ++authGeneration;
  try {
    if (isDesktopRuntime() && hasBridge('authLockSession') && typeof authApi.lockSession === 'function') {
      const locked = await authApi.lockSession();
      if (!locked?.success) throw new Error(locked?.error || 'Could not lock the terminal session.');
    }
  } catch {
    set({ authError: 'Could not switch user right now. Your current work is still open. Please retry.' });
    return;
  }
  setEmailLoginPreference(preferEmail);
  clearRendererSession(set);
}

async function recoverSameUserCloudToken(
  tenantId: string,
  userId: string
): Promise<{ token: string | null; cloudAvailable: boolean }> {
  if (!hasBridge('authGetToken') || typeof authApi.getToken !== 'function') {
    return { token: null, cloudAvailable: false };
  }
  try {
    const cloud = await authApi.getToken();
    const cloudAvailable = cloud?.tenant_id === tenantId && Boolean(cloud?.jwt_token) && !isTokenExpired(cloud!.jwt_token);
    const sameUserToken = cloudAvailable && cloud?.user_id === userId ? cloud!.jwt_token : null;
    return { token: sameUserToken, cloudAvailable };
  } catch {
    return { token: null, cloudAvailable: false };
  }
}

export const useAuthStore: UseBoundStore<StoreApi<AuthState>> = create<AuthState>()((set, _get) => ({
  isAuthenticated: false,
  authError: null,
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
    const generation = authGeneration;
    set({ isLoading: true });
    try {
      if (isDesktopRuntime()) {
        // Reset local store confirmation state before restoring either session type.
        useCartStore.getState().resetDomainConfirmation();
        if (hasBridge('authIsLocked') && typeof authApi.isLocked === 'function' && await authApi.isLocked()) {
          if (generation !== authGeneration) return;
          set({ isAuthenticated: false, permissions: [] });
          return;
        }
        const offlineSession = await authApi.getOfflineSession();
        if (generation !== authGeneration) return;
        if (offlineSession?.tenant_id && offlineSession.user_id) {
          const roleVal = normalizeRole(offlineSession.role);
          if (roleVal === 'SUPER_ADMIN') {
            await authApi.clearToken();
            if (generation !== authGeneration) return;
            set({ isAuthenticated: false, permissions: [] });
            return;
          }
          const { token: sameUserToken, cloudAvailable } = await recoverSameUserCloudToken(offlineSession.tenant_id, offlineSession.user_id);
          const permissions = roleVal === 'ADMIN'
            ? ['*']
            : (Array.isArray(offlineSession.permissions) && offlineSession.permissions.length > 0 ? offlineSession.permissions : convertLegacyRestrictedPageToPermissions(offlineSession.restricted_page));
          if (generation !== authGeneration) return;
          set({
            isAuthenticated: true,
            token: sameUserToken,
            tenantId: offlineSession.tenant_id,
            userId: offlineSession.user_id,
            role: roleVal,
            permissions,
            userName: offlineSession.user_name || null,
            shopName: offlineSession.shop_name || null,
            restrictedPage: offlineSession.restricted_page || null,
            isCloudSyncPaused: !cloudAvailable,
            cloudSyncReason: cloudAvailable ? null : 'Operating in Local Mode (Central DB unavailable). POS active.'
          });
          useCartStore.getState().setRole(roleVal);
          return;
        }

        const stored = await authApi.getToken();
        if (generation !== authGeneration) return;
        if (stored?.jwt_token) {
          const expired = isTokenExpired(stored.jwt_token);
          const perms = parsePermissionsFromToken(stored.jwt_token);
          let rawRole = (stored.role || '') as NonNullable<AuthState['role']>;
          if (rawRole === 'SUPER_ADMIN') {
            if (isDesktopRuntime()) await authApi.clearToken();
            if (generation !== authGeneration) return;
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

          if (generation !== authGeneration) return;

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
          if (generation !== authGeneration) return;
          set({ isAuthenticated: false, permissions: [] });
        }
      } else {
        // Keep browser development sessions across a hard refresh as well.
        const rawSession = localStorage.getItem(BROWSER_AUTH_KEY);
        if (!rawSession) {
          if (generation !== authGeneration) return;
          set({ isAuthenticated: false, permissions: [] });
          return;
        }

        try {
          const stored = JSON.parse(rawSession);
          if (!stored?.jwt_token || isTokenExpired(stored.jwt_token)) {
            localStorage.removeItem(BROWSER_AUTH_KEY);
            if (generation !== authGeneration) return;
            set({ isAuthenticated: false, permissions: [] });
            return;
          }
          const roleVal = normalizeRole(stored.role);
          if (generation !== authGeneration) return;
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
          if (generation !== authGeneration) return;
          set({ isAuthenticated: false, permissions: [] });
        }
      }
    } finally {
      if (generation === authGeneration) set({ isLoading: false });
    }
  },

  // ── Login: call Cloud API then persist token via IPC ─────────────────────
  login: async (email, password, apiBase = CLOUD_API, options = {}) => {
    const generation = ++authGeneration;
    const cancelled = () => generation !== authGeneration;
    const cancelledResult = { success: false, error: 'Login cancelled because the session changed.' };
    set({ authError: null });
    let receivedCloudResponse = false;
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
      if (cancelled()) return cancelledResult;
      let cloudReady = false;
      if (isDesktopRuntime()) {
        try {
          const saved = await authApi.saveOfflineSession(offlineSession);
          if (!saved?.success) {
            return { success: false, error: saved?.error || 'Could not save the offline session. Please try again.' };
          }
          cloudReady = saved.cloud_sync_ready === true;
        } catch (error) {
          return { success: false, error: (error as Error)?.message || 'Could not save the offline session. Please try again.' };
        }
      }

      if (cancelled()) return cancelledResult;
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
        isCloudSyncPaused: !cloudReady,
        cloudSyncReason: cloudReady ? null : reason,
      });
      useCartStore.getState().setRole(roleVal);
      try { sessionStorage.removeItem('auth_prefer_email'); } catch { /* ignore */ }
      return { success: true };
    };

    try {
      // Reset local store confirmation state before logging in
      useCartStore.getState().resetDomainConfirmation();
      if (options.offlineOnly) {
        if (options.requireCloud) return { success: false, error: 'Cloud recovery requires an online login.' };
        if (!hasBridge('authLoginOffline')) return { success: false, error: 'Offline login is available only on a configured POS terminal.' };
        const offline = await authApi.loginOffline({ email, password });
        if (offline.success === false) return { success: false, error: offline.error || 'Offline login failed. Please sign in online once on this PC.' };
        return await applyOfflineLogin(offline.user, 'Working offline — Cloud Sync paused. Sign in online later to resume sync.');
      }
      const baseUrl = apiBase.replace(/\/$/, '');
      const res = await authCloud.login(baseUrl, email, password);
      if (cancelled()) return cancelledResult;
      receivedCloudResponse = true;
      // Guard: server may return a non-JSON body (e.g. a hosting-provider gateway error such as
      // HTTP 402 "Payment required"). Parse gracefully so the UI always shows a readable message.
      const data = await res.json().catch(() => null as null);
      if (cancelled()) return cancelledResult;

      if (!res.ok) {
        // An online denial must never be bypassed with an older cached password.
        if (options.requireCloud || [400, 401, 403, 429].includes(res.status)) {
          return { success: false, error: formatError(data?.error || data, `Cloud login failed (HTTP ${res.status}). The cloud service did not provide an error message. Please try again or contact support with this code.`) };
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
        return { success: false, error: formatError(data?.error || data, 'Server is temporarily unavailable. Please try again later.') };
      }

      if (!data || typeof data.token !== 'string' || !data.token || isTokenExpired(data.token) || !data.tenant_id || !data.user_id) {
        return { success: false, error: 'Server returned an unexpected response. Please try again.' };
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
      if (cancelled()) return cancelledResult;
      if (isDesktopRuntime()) {
        const saved = await authApi.saveToken({
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
        if (!saved?.success) return { success: false, error: saved?.error || 'Could not save the cloud session. Please try again.' };
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
      
      if (cancelled()) return cancelledResult;
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
          try {
            await settingsApi.set({ tenant_id: data.tenant_id, key: 'isDomainConfirmed', value: true });
          } catch (error) {
            console.warn('[AuthStore] Could not cache domain confirmation:', error);
          }
        }
      }

      if (cancelled()) return cancelledResult;
      // If background sync worker is running, trigger an immediate cycle
      if (hasBridge('runInitialSync')) {
        syncApi.runInitialSync().catch(() => {});
      }

      return { success: true };
    } catch (err) {
      if (cancelled()) return cancelledResult;
      // Only a failed network request may fall back; persistence/response errors must stay visible.
      if (!receivedCloudResponse && !options.requireCloud && !options.offlineOnly && hasBridge('authLoginOffline')) {
        try {
          const offlineAuth = await authApi.loginOffline({ email, password });
          if (offlineAuth.success && offlineAuth.user) {
            return await applyOfflineLogin(offlineAuth.user, 'Offline Mode — Cloud Sync paused. Check network connection.');
          }
        } catch (offlineError) {
          return { success: false, error: formatError(offlineError, 'Offline login is unavailable. Please try again.') };
        }
      }
      return { success: false, error: formatError(err, 'Cannot reach server. Check your network connection.') };
    }
  },

  // ── Login with PIN ────────────────────────────────────────────────────────
  loginWithPin: async (pin: string) => {
    const generation = ++authGeneration;
    set({ authError: null });
    if (!isDesktopRuntime()) {
      return { success: false, error: 'PIN login is only supported on the POS desktop app.' };
    }
    if (!hasBridge('authLoginWithPin')) {
      return { success: false, error: 'PIN login is not supported in this version.' };
    }
    try {
      const res = await authApi.loginWithPin({ pin });
      if (generation !== authGeneration) return { success: false, error: 'PIN login cancelled because the session changed.' };
      if (!res.success) {
        return {
          success: false,
          error: res.error || 'Invalid PIN',
          remaining_seconds: res.remaining_seconds,
          attempts_remaining: res.attempts_remaining,
        };
      }
      const u = res.user;
      const roleVal = normalizeRole(u.role);
      const permissions = roleVal === 'ADMIN' ? ['*'] : (u.permissions && u.permissions.length > 0 ? u.permissions : ['sales.create', 'sales.view', 'sales.reprint']);
      const { token: sameUserToken } = res.cloud_sync_ready === true
        ? await recoverSameUserCloudToken(u.tenant_id, u.user_id)
        : { token: null };
      if (generation !== authGeneration) return { success: false, error: 'PIN login cancelled because the session changed.' };
      useCartStore.getState().resetDomainConfirmation();
      set({
        isAuthenticated: true,
        token: sameUserToken,
        tenantId: u.tenant_id,
        userId: u.user_id,
        role: roleVal,
        permissions,
        userName: u.name,
        shopName: u.shop_name || 'My Shop',
        restrictedPage: null,
        isCloudSyncPaused: res.cloud_sync_ready !== true,
        cloudSyncReason: res.cloud_sync_ready === true ? null : 'Local PIN login — sign in online to reconnect cloud sync.',
      });
      useCartStore.getState().setRole(roleVal);
      try { sessionStorage.removeItem('auth_prefer_email'); } catch { /* ignore */ }
      return { success: true };
    } catch (err) {
      return { success: false, error: formatError(err, 'PIN login failed') };
    }
  },

  // ── Lock / Switch User & Full Logout ──────────────────────────────────────
  lockTerminal: () => lockTerminalSession(set, false),

  switchToEmailLogin: () => lockTerminalSession(set, true),

  logout: async () => {
    ++authGeneration;
    try {
      if (isDesktopRuntime()) {
        const cleared = await authApi.clearToken();
        if (!cleared?.success) throw new Error(cleared?.error || 'Could not clear the saved session.');
      }
    } catch {
      set({ token: null, isCloudSyncPaused: true, authError: 'Sign-out could not finish. Your current work is still open. Please retry signing out.' });
      return;
    }
    setEmailLoginPreference(true);
    clearRendererSession(set);
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
        const active = useAuthStore.getState();
        if (stored?.jwt_token && active.isAuthenticated && stored.tenant_id === active.tenantId && stored.user_id === active.userId) {
          token = stored.jwt_token;
          useAuthStore.setState({ token: stored.jwt_token });
        }
      } catch { /* keep going without a token */ }
    }
    return token;
  },
  isPinSession: () => {
    const active = useAuthStore.getState();
    return active.isAuthenticated && !active.token;
  },
  onUnauthorized: () => {
    // Concurrent requests can all reject the same session; notify once until the next login.
    if (useAuthStore.getState().isCloudSyncPaused) return;
    useAuthStore.getState().setCloudSyncPaused(true, 'Token expired — Cloud Sync paused. Re-login to resume cloud sync.');
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('open-session-expired-modal'));
  },
});
