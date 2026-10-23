import { useEffect } from 'react';
import { fetchApi } from '../../../lib/api';
import { type TenantAdmin } from '../superDashboardTypes';
import { useAuthStore } from '../../../store/authStore';
import type { SuperDashboardState } from './useSuperDashboardState';

export interface UseTenantAdminsContext {
  sd: SuperDashboardState;
}

/** Load the tenant admins on mount and check every tenant database connection. */
export function useTenantAdmins(ctx: UseTenantAdminsContext) {
  const { checkingAll, setAdmins, setCheckingAll, setConnectionHealth, setLoading } = ctx.sd;
  useEffect(() => {
    fetchAdmins();
  }, []);

  const fetchAdmins = async () => {
    setLoading(true);
    try {
      const data = await fetchApi('/super-admin/admins');
      setAdmins(data || []);
      // Check health of connections in the background
      checkAllHealth(data || []);
    } catch (err) {
      console.error('Error fetching admins:', err);
    } finally {
      setLoading(false);
    }
  };

  const checkAllHealth = async (tenantList: TenantAdmin[]) => {
    if (checkingAll) return;
    setCheckingAll(true);
    
    const healthMap: Record<string, 'healthy' | 'unreachable' | 'checking'> = {};
    tenantList.forEach(t => {
      healthMap[t.tenant_id] = 'checking';
    });
    setConnectionHealth({ ...healthMap });

    // API base URL read from env — set VITE_CLOUD_API in .env
    const apiBase = (import.meta.env.VITE_CLOUD_API as string).replace(/\/$/, '');

    for (const t of tenantList) {
      try {
        const res = await fetch(`${apiBase}/super-admin/test-connection`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${useAuthStore.getState().token}`
          },
          body: JSON.stringify({
            db_connection_string: t.db_connection_string,
            tenant_id: t.tenant_id
          })
        });
        const statusData = await res.json();
        setConnectionHealth(prev => ({
          ...prev,
          [t.tenant_id]: statusData.success ? 'healthy' : 'unreachable'
        }));
      } catch {
        setConnectionHealth(prev => ({
          ...prev,
          [t.tenant_id]: 'unreachable'
        }));
      }
    }
    setCheckingAll(false);
  };

  return { fetchAdmins, checkAllHealth };
}
