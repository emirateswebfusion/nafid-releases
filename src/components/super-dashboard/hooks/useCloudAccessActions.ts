import { type TenantAdmin } from '../superDashboardTypes';
import { fetchApi } from '../../../lib/api';
import { hasBridge } from '../../../data/client';
import { syncApi } from '../../../data/sync';
import type { SuperDashboardState } from './useSuperDashboardState';

export interface UseCloudAccessActionsContext {
  sd: SuperDashboardState;
}

/** Cloud access dialog: load a tenant's access config, edit schedule windows, save. */
export function useCloudAccessActions(ctx: UseCloudAccessActionsContext) {
  const { cloudAccessEnabled, cloudManualOverride, cloudScheduleEnabled, cloudSchedules, selectedCloudTenant, setCloudAccessEnabled, setCloudAccessMsg, setCloudManualOverride, setCloudModalOpen, setCloudScheduleEnabled, setCloudSchedules, setSavingCloudAccess, setSelectedCloudTenant } = ctx.sd;
  const handleOpenCloudAccessModal = async (admin: TenantAdmin) => {
    setSelectedCloudTenant(admin);
    setSavingCloudAccess(false);
    setCloudAccessMsg('');
    setCloudModalOpen(true);
    try {
      const data = await fetchApi(`/super-admin/cloud-access/${admin.tenant_id}`);
      if (data) {
        setCloudAccessEnabled(data.cloud_access_enabled !== false);
        setCloudScheduleEnabled(!!data.cloud_schedule_enabled);
        setCloudManualOverride(data.cloud_manual_override || 'AUTO');
        setCloudSchedules(Array.isArray(data.cloud_schedules) ? data.cloud_schedules : []);
      }
    } catch (err) {
      console.error('Failed to fetch tenant cloud access config:', err);
    }
  };

  const handleAddScheduleWindow = () => {
    if (cloudSchedules.length >= 24) return;
    const newWindow = {
      id: String(Date.now()),
      startTime: '09:00',
      endTime: '17:00',
      daysOfWeek: [],
      enabled: true,
    };
    setCloudSchedules([...cloudSchedules, newWindow]);
  };

  const handleRemoveScheduleWindow = (id: string) => {
    setCloudSchedules(cloudSchedules.filter(w => w.id !== id));
  };

  const handleUpdateScheduleWindow = (id: string, field: string, value: unknown) => {
    setCloudSchedules(cloudSchedules.map(w => w.id === id ? { ...w, [field]: value } : w));
  };

  const handleSaveCloudAccess = async () => {
    if (!selectedCloudTenant) return;
    setSavingCloudAccess(true);
    setCloudAccessMsg('');
    try {
      const payload = {
        cloud_access_enabled: cloudAccessEnabled,
        cloud_schedule_enabled: cloudScheduleEnabled,
        cloud_manual_override: cloudManualOverride,
        cloud_schedules: cloudSchedules,
      };
      await fetchApi(`/super-admin/cloud-access/${selectedCloudTenant.tenant_id}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
      if (hasBridge('updateCloudAccessConfig')) {
        await syncApi.updateCloudAccessConfig({ config: payload, tenant_id: selectedCloudTenant.tenant_id });
      }
      setCloudAccessMsg('Cloud Access Configuration saved successfully!');
      setTimeout(() => setCloudModalOpen(false), 1200);
    } catch (err) {
      setCloudAccessMsg(`Error: ${(err as { message?: string }).message || 'Save failed'}`);
    } finally {
      setSavingCloudAccess(false);
    }
  };

  return { handleOpenCloudAccessModal, handleAddScheduleWindow, handleRemoveScheduleWindow, handleUpdateScheduleWindow, handleSaveCloudAccess };
}
