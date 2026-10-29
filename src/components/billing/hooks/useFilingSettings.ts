import { useEffect, useState } from 'react';
import { settingsApi } from '../../../data/settings';
export interface FilingOptions { enabled: boolean; reduceStock: boolean; countInRevenue: boolean; showB2bInSalesCategory: boolean; showB2cInSalesCategory: boolean }
export const DEFAULT_FILING_OPTIONS: FilingOptions = { enabled: false, reduceStock: false, countInRevenue: false, showB2bInSalesCategory: true, showB2cInSalesCategory: true };
export function useFilingSettings(tenantId: string | null) {
  const [options, setOptions] = useState(DEFAULT_FILING_OPTIONS);
  useEffect(() => {
    let active = true;
    const load = () => settingsApi.get({ tenant_id: tenantId || 'global', key: 'filing_only_mode' }).then(value => {
      if (active) setOptions({ ...DEFAULT_FILING_OPTIONS, ...(value && typeof value === 'object' ? value : {}) });
    }).catch(() => { if (active) setOptions(DEFAULT_FILING_OPTIONS); });
    void load();
    window.addEventListener('settings:updated', load);
    return () => { active = false; window.removeEventListener('settings:updated', load); };
  }, [tenantId]);
  return options;
}
