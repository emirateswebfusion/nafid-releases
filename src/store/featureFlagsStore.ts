import { create } from 'zustand';
import { DEFAULT_FEATURE_FLAGS, type FeatureFlags, type FeatureKey, sanitizeFeatureFlags, resolveFeatureFlags } from '../config/featureFlags';
import { isDesktopRuntime } from '../data/client';
import { settingsApi } from '../data/settings';

interface FeatureFlagsState {
  flags: FeatureFlags | null;
  loaded: boolean;
  tenantId: string | null;
  loadFlags: (tenantId: string, force?: boolean) => Promise<void>;
  setFlag: (key: FeatureKey, value: boolean) => void;
  setFlags: (flags: FeatureFlags) => void;
  reset: () => void;
}
let revision = 0;
let cacheStored = false;
let pending: { tenantId: string; promise: Promise<void> } | null = null;

export const useFeatureFlagsStore = create<FeatureFlagsState>()((set, get) => ({
  flags: null, loaded: false, tenantId: null,
  loadFlags: async (tenantId, force = false) => {
    if (!force && get().loaded && get().tenantId === tenantId) return;
    if (pending?.tenantId === tenantId) {
      await pending.promise;
      if (force) return get().loadFlags(tenantId, true);
      return;
    }
    const request = ++revision;
    if (get().tenantId !== tenantId) set({ flags: null, loaded: false, tenantId });
    const promise = (async () => {
      try {
        const stored = isDesktopRuntime()
          ? await settingsApi.get({ tenant_id: tenantId, key: 'feature_flags', tenant_only: true }) : null;
        if (request !== revision) return;
        cacheStored = !!stored && typeof stored === 'object' && !Array.isArray(stored);
        set({ flags: resolveFeatureFlags(stored), loaded: true, tenantId });
      } catch (error) {
        // Keep this shop's last confirmed choices; a failed read must never turn disabled modules back on.
        console.error('[Features] Could not refresh shop modules', error);
      }
    })();
    pending = { tenantId, promise };
    try { await promise; } finally { if (pending?.promise === promise) pending = null; }
  },
  setFlag: (key, value) => {
    ++revision;
    set({ flags: sanitizeFeatureFlags({ ...DEFAULT_FEATURE_FLAGS, ...get().flags, [key]: value }) });
  },
  setFlags: flags => { ++revision; set({ flags: sanitizeFeatureFlags(flags), loaded: true }); },
  reset: () => { ++revision; cacheStored = false; pending = null; set({ flags: null, loaded: false, tenantId: null }); },
}));
export function wereFeatureFlagsStored(): boolean { return cacheStored; }
export function cashierPageTitle(flags: FeatureFlags | null): string {
  return flags?.cash_settlement && flags.cash_register ? 'Cashier Settlement' : 'Cash Settlement';
}
