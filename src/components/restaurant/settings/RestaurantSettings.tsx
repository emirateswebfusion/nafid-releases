import { useMemo, useState } from 'react';
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
  const [message, setMessage] = useState('');
  const categories = useMemo(() => [...new Set(data.products.map(p => p.category).filter((c): c is string => !!c))].sort(), [data.products]);
  return <><p role="status" className="px-5 text-sm">{message}</p><RestaurantSetupView tenantId={tenantId} data={data} categories={categories}
    onChanged={() => { void data.refreshSetup(); }} onError={setMessage} onInfo={setMessage} /></>;
}
