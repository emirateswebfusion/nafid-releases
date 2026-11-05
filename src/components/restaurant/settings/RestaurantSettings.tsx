import { useEffect, useMemo, useState } from 'react';
import { restaurantApi, type KitchenPrinterConfig } from '../../../data/restaurant';
import { useRestaurantSettingsDraft } from './useRestaurantSettingsDraft';
import type { RestaurantData } from '../hooks/useRestaurantData';
import { useAuthStore } from '../../../store/authStore';
import { useFeatureFlagsStore } from '../../../config/featureFlags';
import { hasPermission } from '../../../utils/security/permissions';
import { useRestaurantData } from '../hooks/useRestaurantData';
import { RestaurantSetupView } from './RestaurantSetupView';

export function RestaurantSettings() {
  const { tenantId, role, permissions } = useAuthStore();
  const enabled = useFeatureFlagsStore(s => s.flags?.restaurant_mode);
  if (!enabled || !hasPermission({ role, permissions }, 'restaurant.manage')) return <p className="p-5 text-sm text-muted-foreground">Food order setup is unavailable for this shop or account.</p>;
  return <Setup tenantId={tenantId || 'global'} />;
}
function Setup({ tenantId }: { tenantId: string }) {
  const data = useRestaurantData(tenantId);
  const { setError } = data;
  const [printer, setPrinter] = useState<KitchenPrinterConfig | null>(null);
  useEffect(() => { void restaurantApi.getPrinterConfig().then(setPrinter).catch(error => setError(String(error))); }, [setError]);
  if (data.loading || !printer) return <p role="status">{data.error || 'Loading food order settings…'}</p>;
  return <DraftSetup tenantId={tenantId} data={data} printer={printer} />;
}
function DraftSetup({ tenantId, data, printer }: { tenantId: string; data: RestaurantData; printer: KitchenPrinterConfig }) {
  const draft = useRestaurantSettingsDraft(tenantId, data.setup, printer);
  const [message, setMessage] = useState('');
  const categories = useMemo(() => [...new Set(data.products.map(p => p.category).filter((c): c is string => !!c))].sort(), [data.products]);
  return <><p role="status" className="px-5 text-sm">{message}</p><RestaurantSetupView tenantId={tenantId} api={draft.api} data={{ ...data, setup: draft.setup }} categories={categories}
    onChanged={() => {}} onError={setMessage} onInfo={setMessage} /></>;
}
