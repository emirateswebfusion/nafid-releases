import { create } from 'zustand';
import { useCartStore } from './cartStore';

export interface AuthState {
  isAuthenticated: boolean;
  token: string | null;
  tenantId: string | null;
  userId: string | null;
  role: 'OWNER' | 'CASHIER' | null;
  shopName: string | null;
  isLoading: boolean;

  // Actions
  login: (email: string, password: string, apiBase?: string) => Promise<{ success: boolean; error?: string }>;
  register: (data: RegisterData, apiBase?: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  updateDomain: (domain: string) => Promise<{ success: boolean; error?: string }>;
  forgotPassword: (email: string) => Promise<{ success: boolean; error?: string }>;
  resetPassword: (token: string, password: string) => Promise<{ success: boolean; error?: string }>;
  changePassword: (oldPassword: string, newPassword: string) => Promise<{ success: boolean; error?: string }>;
}

interface RegisterData {
  shop_name: string;
  domain_type: string;
  owner_email: string;
  owner_password: string;
  owner_name: string;
}

const CLOUD_API = import.meta.env.VITE_CLOUD_API || 'http://localhost:3001';

export const useAuthStore = create<AuthState>()((set) => ({
  isAuthenticated: false,
  token: null,
  tenantId: null,
  userId: null,
  role: null,
  shopName: null,
  isLoading: true,

  // ── On app startup: read config.json via IPC ──────────────────────────────
  checkAuth: async () => {
    set({ isLoading: true });
    try {
      if (window.electronAPI) {
        const stored = await window.electronAPI.authGetToken();
        // Reset local store confirmation state before loading new ones
        useCartStore.getState().resetDomainConfirmation();
        if (stored?.jwt_token) {
          set({
            isAuthenticated: true,
            token: stored.jwt_token,
            tenantId: stored.tenant_id,
            userId: stored.user_id,
            role: stored.role as 'OWNER' | 'CASHIER',
            shopName: stored.shop_name,
          });
          useCartStore.getState().setRole(stored.role as 'OWNER' | 'CASHIER');
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
          set({ isAuthenticated: false });
        }
      } else {
        // Browser dev fallback
        set({ isAuthenticated: false });
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
      const res = await fetch(`${apiBase}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();

      if (!res.ok) return { success: false, error: data.error || 'Login failed' };

      // Persist to disk via IPC
      if (window.electronAPI) {
        await window.electronAPI.authSaveToken({
          jwt_token: data.token,
          tenant_id: data.tenant_id,
          user_id: data.user_id,
          role: data.role,
          shop_name: data.shop_name || email,
          domain_type: data.domain_type,
        });
      }
      
      set({
        isAuthenticated: true,
        token: data.token,
        tenantId: data.tenant_id,
        userId: data.user_id,
        role: data.role,
        shopName: data.shop_name || email,
      });
      useCartStore.getState().setRole(data.role);
      if (data.domain_type) {
        useCartStore.getState().setDomain(data.domain_type);
        // If it's coming from the cloud, it's already an existing preference
        useCartStore.getState().confirmDomain();
        
        // Also ensure it's saved locally for offline persistence
        await window.electronAPI.settingsSet({ 
          tenant_id: data.tenant_id, 
          key: 'isDomainConfirmed', 
          value: true 
        });
      }
      return { success: true };
    } catch (err: any) {
      return { success: false, error: 'Cannot reach server. Check your network connection.' };
    }
  },

  // ── Register: create tenant + first OWNER ────────────────────────────────
  register: async (data, apiBase = CLOUD_API) => {
    try {
      const res = await fetch(`${apiBase}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json();

      if (!res.ok) return { success: false, error: json.error || 'Registration failed' };

      if (window.electronAPI) {
        await window.electronAPI.authSaveToken({
          jwt_token: json.token,
          tenant_id: json.tenant_id,
          user_id: json.user_id,
          role: json.role,
          shop_name: data.shop_name,
        });
      }

      set({
        isAuthenticated: true,
        token: json.token,
        tenantId: json.tenant_id,
        userId: json.user_id,
        role: json.role,
        shopName: data.shop_name,
      });
      useCartStore.getState().setRole(json.role);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: 'Cannot reach server. Check your network connection.' };
    }
  },

  // ── Logout ────────────────────────────────────────────────────────────────
  logout: async () => {
    if (window.electronAPI) await window.electronAPI.authClearToken();
    set({ isAuthenticated: false, token: null, tenantId: null, userId: null, role: null, shopName: null });
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
      if (!res.ok) return { success: false, error: data.error || 'Update failed' };

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
      return { success: false, error: err.message };
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
      if (!res.ok) return { success: false, error: data.error || 'Request failed' };
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
      if (!res.ok) return { success: false, error: data.error || 'Reset failed' };
      return { success: true };
    } catch (err: any) {
      return { success: false, error: 'Cannot reach server.' };
    }
  },

  changePassword: async (oldPassword: string, newPassword: string) => {
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
      if (!res.ok) return { success: false, error: data.error || 'Update failed' };
      return { success: true };
    } catch (err: any) {
      return { success: false, error: 'Cannot reach server.' };
    }
  }
}));
