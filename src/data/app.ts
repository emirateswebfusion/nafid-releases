import { bindBridge, isDesktopRuntime } from './client';

/** electron-updater update metadata sent by `updaterService` on `app:checkForUpdates` and `update-info`. */
export interface UpdateInfoPayload {
  version: string;
  releaseDate?: string;
  /** HTML string with the default GitHub provider (no `fullChangelog`). */
  releaseNotes?: string;
}

/** All success and failure shapes returned by `updaterService` on `app:checkForUpdates`. */
export type AppCheckForUpdatesResult =
  | { success: true; updateInfo: UpdateInfoPayload | null }
  | { success: false; error: string };

/** Result of `app:installUpdate`. `success: false` means the app stayed open because no installer was launched. */
export type AppInstallUpdateResult =
  | { success: true }
  | { success: false; error: string; installerReady?: boolean };

export interface AppRendererReadyResult { success: boolean }

/** App shell: version, updater, network info, error logging. Channel catalog — the only way UI code reaches these IPC channels. */
export const appApi = bindBridge({
  logError: 'logError',
  ping: 'ping',
  checkForUpdates: 'appCheckForUpdates',
  getVersion: 'appGetVersion',
  rendererReady: 'appRendererReady',
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
