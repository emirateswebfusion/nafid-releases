import { create } from 'zustand';
import { useCartStore } from './cartStore';
import { convertLegacyRestrictedPageToPermissions } from '../utils/permissions';

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
  setLastSyncTime: (time: number) => void;
  setCloudSyncPaused: (paused: boolean, reason?: string | null) => void;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  updateDomain: (domain: string) => Promise<{ success: boolean; error?: string }>;
  forgotPassword: (email: string) => Promise<{ success: boolean; error?: string }>;
  resetPassword: (token: string, password: string) => Promise<{ success: boolean; error?: string }>;
  changePassword: (oldPassword: string, newPassword: string) => Promise<{ success: boolean; error?: string }>;
}

export function normalizeRole(rawRole: string | null | undefined): 'SUPER_ADMIN' | 'ADMIN' | 'STAFF' {
  if (!rawRole) return 'STAFF';
  const r = rawRole.toUpperCase().trim();
  if (r === 'SUPER_ADMIN') return 'SUPER_ADMIN';
  if (r === 'ADMIN' || r === 'OWNER' || r === 'ADMINISTRATOR') return 'ADMIN';
  return 'STAFF';
}

// Cloud API URL — set VITE_CLOUD_API in .env
const CLOUD_API = (import.meta.env.VITE_CLOUD_API as string).replace(/\/$/, '');

function decodeJwtPayload(token: string): any {
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
  if (Array.isArray(payload.permissions)) return payload.permissions;
  const r = (payload.role || '').toUpperCase();
  if (r === 'ADMIN' || r === 'OWNER' || r === 'SUPER_ADMIN') return ['*'];
  return convertLegacyRestrictedPageToPermissions(payload.restricted_page);
}

function formatError(err: any, fallback: string): string {
  if (!err) return fallback;
  if (typeof err === 'string') return err;
  if (typeof err === 'object') {
    if (typeof err.message === 'string') return err.message;
    if (typeof err.error === 'string') return err.error;
    try {
      return JSON.stringify(err);
    } catch {
      return fallback;
    }
  }
  return String(err);
}

export const useAuthStore = create<AuthState>()((set, get) => ({
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
      if (window.electronAPI) {
        const stored = await window.electronAPI.authGetToken();
        // Reset local store confirmation state before loading new ones
        useCartStore.getState().resetDomainConfirmation();
        if (stored?.jwt_token) {
          const expired = isTokenExpired(stored.jwt_token);
          const perms = parsePermissionsFromToken(stored.jwt_token);
          let rawRole = (stored.role || '') as any;
          if (rawRole === 'SUPER_ADMIN') {
            if (window.electronAPI) await window.electronAPI.authClearToken();
            set({ isAuthenticated: false, permissions: [] });
            return;
          }
          if (['BILLER', 'CASHIER'].includes(rawRole)) rawRole = 'STAFF';

          let resolvedShopName = stored.shop_name;
          try {
            const localName = await window.electronAPI.settingsGet({
              tenant_id: stored.tenant_id || 'global',
              key: 'shop_name'
            });
            if (typeof localName === 'string' && localName.trim()) {
              resolvedShopName = localName.trim();
            }
          } catch {}

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
            useCartStore.getState().setDomain(stored.domain_type as any);
            // Check local DB for confirmation if offline/restarting
            const confirmed = await window.electronAPI.settingsGet({ 
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
        // Browser dev fallback
        set({ isAuthenticated: false, permissions: [] });
      }
    } finally {
      set({ isLoading: false });
    }
  },

  // ── Login: call Cloud API then persist token via IPC ─────────────────────
  login: async (email, password, apiBase = CLOUD_API) => {
    try {
      // Reset local store confirmation state before logging in
      useCartStore.getState().resetDomainConfirmation();
      const baseUrl = apiBase.replace(/\/$/, '');
      const res = await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();

      if (!res.ok) return { success: false, error: formatError(data?.error || data, 'Login failed') };

      let roleVal = (data.role || '') as any;
      if (roleVal === 'SUPER_ADMIN') {
        return { success: false, error: 'Super Admin login is restricted to the Central Web Portal and is not allowed on POS terminals.' };
      }
      if (['BILLER', 'CASHIER'].includes(roleVal)) roleVal = 'STAFF';
      const perms = parsePermissionsFromToken(data.token);

      let resolvedShopName = data.shop_name;
      if (!resolvedShopName && window.electronAPI) {
        try {
          const local = await window.electronAPI.settingsGet({ tenant_id: data.tenant_id || 'global', key: 'shop_name' });
          if (typeof local === 'string' && local.trim()) resolvedShopName = local.trim();
        } catch {}
      }
      if (!resolvedShopName) resolvedShopName = email;

      // Persist to disk and local SQLite database via IPC
      if (window.electronAPI) {
        await window.electronAPI.authSaveToken({
          jwt_token: data.token,
          tenant_id: data.tenant_id,
          user_id: data.user_id,
          role: roleVal,
          user_name: data.user_name,
          shop_name: resolvedShopName,
          domain_type: data.domain_type,
          restricted_page: data.restricted_page,
          password_hash: data.password_hash,
          email: email
        });
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
        if (window.electronAPI) {
          await window.electronAPI.settingsSet({ 
            tenant_id: data.tenant_id, 
            key: 'isDomainConfirmed', 
            value: true 
          });
        }
      }

      // If background sync worker is running, trigger an immediate cycle
      if (window.electronAPI?.runInitialSync) {
        window.electronAPI.runInitialSync().catch(() => {});
      }

      return { success: true };
    } catch (err: any) {
      // Offline fallback: Attempt local authentication using cached user credentials in SQLite
      if (window.electronAPI?.authLoginOffline) {
        const offlineAuth = await window.electronAPI.authLoginOffline({ email, password });
        if (offlineAuth.success && offlineAuth.user) {
          const user = offlineAuth.user;
          let roleVal = (user.role || '') as any;
          if (['BILLER', 'CASHIER'].includes(roleVal)) roleVal = 'STAFF';

          let resolvedShopName = email;
          try {
            const local = await window.electronAPI.settingsGet({ tenant_id: user.tenant_id || 'global', key: 'shop_name' });
            if (typeof local === 'string' && local.trim()) resolvedShopName = local.trim();
          } catch {}

          set({
            isAuthenticated: true,
            tenantId: user.tenant_id,
            userId: user.user_id,
            role: roleVal,
            permissions: roleVal === 'ADMIN' ? ['*'] : convertLegacyRestrictedPageToPermissions(user.restricted_page),
            userName: user.name || email,
            shopName: resolvedShopName,
            restrictedPage: user.restricted_page || null,
            isCloudSyncPaused: true,
            cloudSyncReason: 'Offline Mode — Cloud Sync paused. Check network connection.'
          });
          useCartStore.getState().setRole(roleVal);
          return { success: true };
        }
      }
      return { success: false, error: formatError(err, 'Cannot reach server. Check your network connection.') };
    }
  },

  // ── Logout ────────────────────────────────────────────────────────────────
  logout: async () => {
    if (window.electronAPI) await window.electronAPI.authClearToken();
    useCartStore.getState().clearCart();
    set({ isAuthenticated: false, token: null, tenantId: null, userId: null, role: null, permissions: [], userName: null, shopName: null, restrictedPage: null });
  },

  updateDomain: async (domain: string) => {
    const { token, tenantId } = useAuthStore.getState();
    if (!token || !tenantId) return { success: false, error: 'Not authenticated' };

    try {
      const res = await fetch(`${CLOUD_API}/auth/tenant/domain`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ domain_type: domain }),
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: formatError(data?.error || data, 'Update failed') };

      // Update local cart store
      useCartStore.getState().setDomain(domain as any);
      useCartStore.getState().confirmDomain();

      // Update local config file via IPC (re-save current config with new domain)
      if (window.electronAPI) {
        const current = await window.electronAPI.authGetToken();
        if (current) {
          await window.electronAPI.authSaveToken({ ...current, domain_type: domain });
        }
        // Also update local DB settings
        await window.electronAPI.settingsSet({ 
          tenant_id: tenantId, 
          key: 'isDomainConfirmed', 
          value: true 
        });
      }

      return { success: true };
    } catch (err: any) {
      console.error('Update domain error:', err);
      return { success: false, error: 'Authentication failed' };
    }
  },
  
  forgotPassword: async (email: string) => {
    try {
      const res = await fetch(`${CLOUD_API}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: formatError(data?.error || data, 'Request failed') };
      return { success: true };
    } catch (err: any) {
      return { success: false, error: 'Cannot reach server.' };
    }
  },

  resetPassword: async (token: string, password: string) => {
    try {
      const res = await fetch(`${CLOUD_API}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: formatError(data?.error || data, 'Reset failed') };
      return { success: true };
    } catch (err: any) {
      return { success: false, error: 'Cannot reach server.' };
    }
  },

  changePassword: async (oldPassword: string, newPassword: string): Promise<{ success: boolean; error?: string }> => {
    const { token } = useAuthStore.getState();
    if (!token) return { success: false, error: 'Not authenticated' };

    try {
      const res = await fetch(`${CLOUD_API}/auth/change-password`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ oldPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: formatError(data?.error || data, 'Update failed') };
      return { success: true };
    } catch (err: any) {
      return { success: false, error: 'Cannot reach server.' };
    }
  }
}));
