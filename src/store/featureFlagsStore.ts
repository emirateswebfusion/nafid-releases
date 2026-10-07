import { create } from 'zustand';
import { FEATURE_LIST, DEFAULT_FEATURE_FLAGS, type FeatureFlags, type FeatureKey, sanitizeFeatureFlags } from '../featureFlags';

interface FeatureFlagsState {
  flags: FeatureFlags | null;
  loaded: boolean;
  tenantId: string | null;

  loadFlags: (tenantId: string) => Promise<void>;
  setFlag: (key: FeatureKey, value: boolean) => void;
  setFlags: (flags: FeatureFlags) => void;
  reset: () => void;
}

let loadPromise: Promise<void> | null = null;
let cacheStored = false;

export const useFeatureFlagsStore = create<FeatureFlagsState>()((set, get) => ({
  flags: null,
  loaded: false,
  tenantId: null,

  loadFlags: async (tenantId: string) => {
    const { flags, loaded, tenantId: currentTenantId } = get();
    if (loaded && currentTenantId === tenantId && flags) return;

    if (loadPromise) {
      await loadPromise;
      return;
    }

    loadPromise = (async () => {
      if (!window.electronAPI) {
        set({ flags: sanitizeFeatureFlags({ ...DEFAULT_FEATURE_FLAGS }), loaded: true, tenantId });
        return;
      }
      try {
        const stored = await window.electronAPI.settingsGet({ tenant_id: tenantId, key: 'feature_flags' });
        let loadedFlags: FeatureFlags;
        if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
          loadedFlags = { ...DEFAULT_FEATURE_FLAGS };
          for (const def of FEATURE_LIST) {
            const v = (stored as Record<string, unknown>)[def.key];
            if (typeof v === 'boolean') loadedFlags[def.key] = v;
          }
          loadedFlags = sanitizeFeatureFlags(loadedFlags);
          cacheStored = true;
        } else {
          loadedFlags = sanitizeFeatureFlags({ ...DEFAULT_FEATURE_FLAGS });
          cacheStored = false;
        }
        set({ flags: loadedFlags, loaded: true, tenantId });
      } catch {
        set({ flags: sanitizeFeatureFlags({ ...DEFAULT_FEATURE_FLAGS }), loaded: true, tenantId });
        cacheStored = false;
      } finally {
        loadPromise = null;
      }
    })();

    await loadPromise;
  },

  setFlag: (key: FeatureKey, value: boolean) => {
    set((state) => ({
      flags: state.flags ? sanitizeFeatureFlags({ ...state.flags, [key]: value }) : sanitizeFeatureFlags({ ...DEFAULT_FEATURE_FLAGS, [key]: value }),
    }));
  },

  setFlags: (flags: FeatureFlags) => {
    set({ flags: sanitizeFeatureFlags(flags), loaded: true });
  },

  reset: () => {
    set({ flags: null, loaded: false, tenantId: null });
    loadPromise = null;
  },
}));

export async function loadFeatureFlags(tenantId?: string): Promise<FeatureFlags> {
  const store = useFeatureFlagsStore.getState();
  await store.loadFlags(tenantId || 'global');
  return store.flags || sanitizeFeatureFlags({ ...DEFAULT_FEATURE_FLAGS });
}

export function wereFeatureFlagsStored(): boolean {
  return cacheStored;
}

export function cashierPageTitle(flags: FeatureFlags | null): string {
  if (!flags) return 'Cash Settlement';
  if (flags.cash_settlement && flags.cash_register) return 'Cashier Settlement';
  if (flags.cash_settlement) return 'Cash Settlement';
  return 'Cash Settlement';
}