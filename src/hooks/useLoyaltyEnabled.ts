import { useEffect, useState } from 'react';
import { settingsApi } from '../data/settings';
import { isDesktopRuntime } from '../data/client';
import { useFeatureFlagsStore } from '../store/featureFlagsStore';

export function useLoyaltyEnabled(tenantId: string | null) {
  const [configured, setConfigured] = useState(false);
  const flag = useFeatureFlagsStore(s => s.flags?.loyalty);
  useEffect(() => {
    if (!isDesktopRuntime()) return;
    let active = true;
    const load = async () => {
      try {
        const [config, flags] = await Promise.all([
          settingsApi.get({ tenant_id: tenantId || 'global', key: 'loyalty_config' }),
          settingsApi.get({ tenant_id: tenantId || 'global', key: 'feature_flags' }),
        ]);
        if (active) setConfigured(config?.enabled !== false && flags?.loyalty !== false && (config?.enabled === true || flags?.loyalty === true));
      } catch (error) { console.error('Failed to load loyalty settings', error); if (active) setConfigured(false); }
    };
    void load();
    window.addEventListener('settings:updated', load);
    return () => { active = false; window.removeEventListener('settings:updated', load); };
  }, [tenantId, flag]);
  return configured && flag !== false;
}
