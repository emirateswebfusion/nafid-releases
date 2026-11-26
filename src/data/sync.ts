import { bindBridge } from './client';

/** Scheduled cloud-access window as stored by `calculateEffectiveCloudAccess`. */
export interface CloudScheduleWindow {
  id: string;
  startTime: string;
  endTime: string;
  daysOfWeek?: number[];
  enabled: boolean;
}

/** Effective access settings embedded in `calculateEffectiveCloudAccess` results. */
export interface CloudAccessConfig {
  cloud_access_enabled: boolean;
  cloud_schedule_enabled: boolean;
  cloud_schedules: CloudScheduleWindow[];
  cloud_manual_override: 'AUTO' | 'FORCE_ON' | 'FORCE_OFF';
}

/** State returned by `syncService.getCloudAccessState` / `calculateEffectiveCloudAccess`. */
export interface EffectiveCloudState {
  isCloudAllowed: boolean;
  stateName: 'LOCAL_ONLY' | 'LOCAL_PLUS_CLOUD' | 'LOCAL_WITH_PENDING_CLOUD_QUEUE';
  activeReason: string;
  pendingCount: number;
  config: CloudAccessConfig;
}

/** Cloud/LAN sync control and diagnostics. Channel catalog — the only way UI code reaches these IPC channels. */
export const syncApi = bindBridge({
  debugSyncState: 'dbDebugSyncState',
  runInitialSync: 'runInitialSync',
  manualCloudSync: 'manualCloudSync',
  forceResyncInvoices: 'forceResyncInvoices',
  forceResyncCatalog: 'forceResyncCatalog',
  forceResyncEntities: 'forceResyncEntities',
  getSyncProgress: 'getSyncProgress',
  getCloudAccessState: 'getCloudAccessState',
  updateCloudAccessConfig: 'updateCloudAccessConfig',
  drainPendingCloudQueue: 'drainPendingCloudQueue',
  testNetworkConnection: 'testNetworkConnection',
  syncClearPending: 'syncClearPending',
  syncGetPending: 'syncGetPending',
  setPageContext: 'setPageContext',
  resetFastPollBackoff: 'resetFastPollBackoff',
});
