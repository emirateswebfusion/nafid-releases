import { useEffect } from 'react';
import { useAuthStore } from '../../../store/authStore';
import { isDesktopRuntime } from '../../../data/client';
import { gradesApi } from '../../../data/grades';
import type { SettingsGradesState } from './useSettingsGradesState';

export interface UseSettingsGradesLoadContext {
  sg: SettingsGradesState;
}

/** Initial grades load for the settings grades screen. */
export function useSettingsGradesLoad(ctx: UseSettingsGradesLoadContext) {
  const { setGrades, setLoading } = ctx.sg;

  const loadGrades = async () => {
    if (isDesktopRuntime()) {
      setLoading(true);
      const { tenantId } = useAuthStore.getState();
      const res = await gradesApi.getGrades(tenantId || '');
      if (Array.isArray(res)) {
        setGrades(res);
      }
      setLoading(false);
    }
  };

  useEffect(() => {
    loadGrades();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadGrades excluded: a new function every render; grades load once on mount
  }, []);

  return { loadGrades };
}
