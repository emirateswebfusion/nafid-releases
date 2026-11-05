import { useEffect } from 'react';
import { useFeatureFlagsStore } from '../../../config/featureFlags';
import { bridgeEvents } from '../../../data/events';
import { isDesktopRuntime } from '../../../data/client';

/** Shop module choices refresh after local saves and every remote data update, across all screens. */
export function useFeatureFlagsRefresh(tenantId: string | null, authenticated: boolean) {
  useEffect(() => {
    if (!tenantId || !authenticated) return;
    const refresh = () => { void useFeatureFlagsStore.getState().loadFlags(tenantId, true); };
    refresh();
    window.addEventListener('settings:updated', refresh);
    window.addEventListener('focus', refresh);
    const unsubscribe = isDesktopRuntime() ? bridgeEvents.onSyncDataUpdated(refresh) : undefined;
    return () => { window.removeEventListener('settings:updated', refresh); window.removeEventListener('focus', refresh); if (typeof unsubscribe === 'function') unsubscribe(); };
  }, [tenantId, authenticated]);
}
