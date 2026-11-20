import { cloudFetch } from './client';
export interface SyncSupportReport {
  tenant_id: string; shop_name: string; terminal_id: string; received_at: string;
  report: { version: string; platform: string; observed_at: string; route: string;
    pending: number; conflicts: number; downloads: number;
    issues: { entity: string; entity_id: string; code: string; row_version: number;
      sync_status: string; base: string; updated_at: string }[] };
}
export const loadSyncSupport = () => cloudFetch<{ reports: SyncSupportReport[] }>('/support/sync-reports');
