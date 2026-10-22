import { bindBridge, isDesktopRuntime } from './client';

/** App shell: version, updater, network info, error logging. Channel catalog — the only way UI code reaches these IPC channels. */
export const appApi = bindBridge({
  logError: 'logError',
  ping: 'ping',
  checkForUpdates: 'appCheckForUpdates',
  getVersion: 'appGetVersion',
  getLocalIp: 'appGetLocalIp',
  getNetworkDetails: 'appGetNetworkDetails',
  installUpdate: 'appInstallUpdate',
  downloadUpdate: 'appDownloadUpdate',
});

/** Fire-and-forget log to the main-process log file. Safe outside the desktop runtime. */
export function logError(message: string, error?: unknown): Promise<void> {
  if (!isDesktopRuntime()) return Promise.resolve();
  return appApi.logError(message, error);
}
