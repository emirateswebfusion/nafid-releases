import { useCallback, useEffect, useRef, useState } from 'react';
import { restaurantApi, type ActiveOrders, type RestaurantSetup } from '../../../data/restaurant';
import { listProducts, type Product } from '../../../data/products';
import { staffApi, type StaffListItem } from '../../../data/staff';
import { getSetting } from '../../../data/settings';
import { bridgeEvents } from '../../../data/events';
import { DEFAULT_SERVICE_CHARGE, SERVICE_CHARGE_SETTING_KEY, parseServiceChargeSetting, type ServiceChargeSetting } from '../restaurantRules';

const EMPTY_SETUP: RestaurantSetup = { tables: [], stations: [], modifierGroups: [], modifiers: [] };
const EMPTY_ACTIVE: ActiveOrders = { orders: [], lines: [], kots: [], closedToday: [], terminal: '' };

/** Everything the restaurant screen shows, refreshed after sync and every few seconds (other terminals' orders). */
export function useRestaurantData(tenantId: string) {
  const [setup, setSetup] = useState<RestaurantSetup>(EMPTY_SETUP);
  const [active, setActive] = useState<ActiveOrders>(EMPTY_ACTIVE);
  const [products, setProducts] = useState<Product[]>([]);
  const [staff, setStaff] = useState<StaffListItem[]>([]);
  const [serviceCharge, setServiceCharge] = useState<ServiceChargeSetting>(DEFAULT_SERVICE_CHARGE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);

  const refreshOrders = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      setActive(await restaurantApi.listActive({ tenant_id: tenantId }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      busy.current = false;
    }
  }, [tenantId]);

  const refreshSetup = useCallback(async () => {
    try {
      const [s, p, st, sc] = await Promise.all([
        restaurantApi.getSetup({ tenant_id: tenantId }),
        listProducts({ tenant_id: tenantId, limit: 5000 }),
        staffApi.getStaff({ tenant_id: tenantId, status: 'ACTIVE' }).catch(() => [] as StaffListItem[]),
        getSetting({ tenant_id: tenantId, key: SERVICE_CHARGE_SETTING_KEY }),
      ]);
      setSetup(s);
      setProducts(Array.isArray(p) ? p.filter(x => !x.is_deleted) : []);
      setStaff(Array.isArray(st) ? st : []);
      setServiceCharge(parseServiceChargeSetting(sc));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [tenantId]);

  useEffect(() => {
    let cancelled = false;
    const first = window.setTimeout(() => {
      Promise.all([refreshSetup(), refreshOrders()]).finally(() => { if (!cancelled) setLoading(false); });
    }, 0);
    const off = bridgeEvents.onSyncDataUpdated(() => { void refreshOrders(); void refreshSetup(); });
    const timer = window.setInterval(() => { void refreshOrders(); }, 5000);
    return () => { cancelled = true; window.clearTimeout(first); off(); window.clearInterval(timer); };
  }, [refreshOrders, refreshSetup]);

  return { setup, active, products, staff, serviceCharge, loading, error, setError, refreshOrders, refreshSetup };
}

export type RestaurantData = ReturnType<typeof useRestaurantData>;
