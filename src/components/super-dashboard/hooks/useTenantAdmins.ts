import { useEffect } from 'react';
import { superAdminCloud } from '../../../data/cloud/superAdmin';
import { CLOUD_API } from '../../../data/cloud/client';
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchAdmins is a render-local helper; the tenant admin list loads once when the dashboard opens.
  }, []);

  async function fetchAdmins() {
    setLoading(true);
    try {
      const data = await superAdminCloud.admins<TenantAdmin[]>();
      setAdmins(data || []);
      // Check health of connections in the background
      checkAllHealth(data || []);
    } catch (err) {
      console.error('Error fetching admins:', err);
    } finally {
      setLoading(false);
    }
  }

  async function checkAllHealth(tenantList: TenantAdmin[]) {
    if (checkingAll) return;
    setCheckingAll(true);
    
    const healthMap: Record<string, 'healthy' | 'unreachable' | 'checking'> = {};
    tenantList.forEach(t => {
      healthMap[t.tenant_id] = 'checking';
    });
    setConnectionHealth({ ...healthMap });

    // API base URL read from env — set VITE_CLOUD_API in .env
    const apiBase = CLOUD_API;

    for (const t of tenantList) {
      try {
        const res = await superAdminCloud.testConnectionAt(apiBase, useAuthStore.getState().token, {
          db_connection_string: t.db_connection_string,
          tenant_id: t.tenant_id
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
  }

  return { fetchAdmins, checkAllHealth };
}
