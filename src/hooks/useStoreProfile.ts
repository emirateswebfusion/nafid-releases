import { useEffect, useState } from 'react';
import { getSetting } from '../data/settings';
import { bridgeEvents } from '../data/events';
import { isDesktopRuntime } from '../data/client';
import { setStoreCountry, setStoreVatInclusive } from '../utils/localization/storeProfile';
import { setStoreTimezone } from '../utils/time/timezoneHelper';
import { UAE_ARABIC_PRINT_KEY, setUaeArabicPrint } from '../utils/print/uaeLabels';

/** Never show another tenant's currency while the active tenant's settings load. */
export function useStoreProfile(tenantId: string | null, authenticated: boolean): boolean {
  const [loadedTenant, setLoadedTenant] = useState<{ tenant: string; revision: number } | null>(null);
  useEffect(() => {
    if (!authenticated || !isDesktopRuntime()) return;
    let disposed = false;
    let revision = 0;
    const load = async () => {
      const request = ++revision;
      try {
        const [country, inclusive, timezone, arabicPrint] = await Promise.all(['store_country', 'vat_price_inclusive', 'store_timezone', UAE_ARABIC_PRINT_KEY].map(key => getSetting({ tenant_id: tenantId || 'global', key })));
        if (disposed || request !== revision) return;
        setStoreCountry(country); setStoreVatInclusive(inclusive); setStoreTimezone(timezone); setUaeArabicPrint(arabicPrint);
        setLoadedTenant(previous => ({ tenant: tenantId || 'global', revision: (previous?.revision || 0) + 1 }));
      } catch (error) { console.error('[StoreProfile] Unable to load shop settings', error); }
    };
    void load();
    window.addEventListener('settings:updated', load);
    const off = bridgeEvents.onSyncDataUpdated(load);
    return () => { disposed = true; window.removeEventListener('settings:updated', load); off(); };
  }, [tenantId, authenticated]);
  return !isDesktopRuntime() || loadedTenant?.tenant === (tenantId || 'global');
}
