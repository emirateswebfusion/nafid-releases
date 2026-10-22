import { bindBridge } from './client';

/** Cloud/LAN sync control and diagnostics. Channel catalog — the only way UI code reaches these IPC channels. */
export const syncApi = bindBridge({
  debugSyncState: 'dbDebugSyncState',
  runInitialSync: 'runInitialSync',
  forceResyncInvoices: 'forceResyncInvoices',
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
