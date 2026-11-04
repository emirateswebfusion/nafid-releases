import { app, BrowserWindow, ipcMain } from 'electron';
import { autoUpdater, type UpdateDownloadedEvent } from 'electron-updater';
import log from 'electron-log/main';
import { getMainWindow } from './windowRegistry.js';
import { platform } from 'node:process';
import { launchWindowsUpdate, type DownloadedWindowsInstaller } from './windowsUpdateInstaller.js';

type UpdaterState = 'idle' | 'checking' | 'update-available' | 'downloading' | 'downloaded' | 'error';
let updaterState: UpdaterState = 'idle';
let downloadedInstaller: DownloadedWindowsInstaller | null = null;
let installInProgress = false;
let downloadedInfo: UpdateDownloadedEvent | null = null;
let lastCheckTime = 0;
let isUpdateCheckInProgress = false;
let updateCheckTimer: NodeJS.Timeout | null = null;
const MIN_CHECK_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes minimum between checks
const STARTUP_CHECK_DELAY_MS = 30 * 1000; // Wait 30s after startup before first check

function setUpdaterState(newState: UpdaterState) {
  const oldState = updaterState;
  updaterState = newState;
  log.info(`[Updater] State transition: ${oldState} -> ${newState}`);
  const win = getMainWindow();
  if (win && !win.isDestroyed()) {
    // Map internal 'downloaded' state to 'ready-to-install' so the renderer
    // knows to enable the install button (renderer only handles 'ready-to-install').
    const broadcastState = newState === 'downloaded' ? 'ready-to-install' : newState;
    win.webContents.send('update-status', broadcastState);
  }
}

function downloadedUpdateReady(): boolean { return updaterState === 'downloaded'; }

function canCheckForUpdates(): boolean {
  const now = Date.now();
  if (isUpdateCheckInProgress) return false;
  if (now - lastCheckTime < MIN_CHECK_INTERVAL_MS) return false;
  if (updaterState === 'checking' || updaterState === 'downloading' || updaterState === 'downloaded' || installInProgress) return false;
  return true;
}



export function setupAutoUpdater(): void {
  // Updates come from the public releases repo baked into app-update.yml at build time: no credentials.
  autoUpdater.logger = log;
  autoUpdater.disableDifferentialDownload = false;
  // Disable auto-download initially - we'll control it via state machine
  autoUpdater.autoDownload = false;
  // Windows must confirm installer creation before the POS exits, including normal app shutdown.
  autoUpdater.autoInstallOnAppQuit = platform !== 'win32';

  async function performUpdateCheck(_notify: boolean = false): Promise<void> {
    if (!canCheckForUpdates()) {
      log.debug('[Updater] Skipping check - conditions not met', { state: updaterState, lastCheckTime, inProgress: isUpdateCheckInProgress });
      return;
    }

    isUpdateCheckInProgress = true;
    lastCheckTime = Date.now();
    setUpdaterState('checking');

    try {
      log.info('[Updater] Checking for updates...');
      const result = await autoUpdater.checkForUpdatesAndNotify();
      
      if (result && result.isUpdateAvailable && result.updateInfo) {
        log.info('[Updater] Update available:', result.updateInfo.version);
        setUpdaterState('update-available');
        const win = getMainWindow();
        if (win && !win.isDestroyed()) {
          win.webContents.send('update-info', result.updateInfo);
        }
        // Auto-download the update
        try {
          setUpdaterState('downloading');
          await autoUpdater.downloadUpdate();
        } catch (downloadErr) {
          log.error('[Updater] Download failed:', downloadErr);
          setUpdaterState('error');
        }
      } else {
        log.info('[Updater] No updates available');
        setUpdaterState('idle');
      }
    } catch (err) {
      const msg = (err as Error).message || '';
      log.error('[Updater] Check error:', msg);

      // A failed re-check must never discard an installer that is already downloaded.
      if (updaterState === 'downloaded') {
        log.warn('[Updater] Check failed after download; keeping update ready to install');
        return;
      }

      // Network errors are not critical - keep app usable
      const isNetworkError = 
        msg.includes('net::ERR_') ||
        msg.includes('ENOTFOUND') ||
        msg.includes('ECONNREFUSED') ||
        msg.includes('ENETUNREACH') ||
        msg.includes('request failed') ||
        msg.toLowerCase().includes('network') ||
        msg.includes('404') ||
        msg.includes('Cannot find') ||
        msg.includes('no published version');
      
      if (isNetworkError) {
        log.warn('[Updater] Network error during check, keeping app usable');
        setUpdaterState('idle');
      } else {
        setUpdaterState('error');
      }
    } finally {
      isUpdateCheckInProgress = false;
    }
  }

  // Event handlers for auto-updater events
  autoUpdater.on('update-available', (info) => {
    log.info('[Updater] Update available (event):', info.version);
    // Only set state and notify UI here. The actual download is triggered by the
    // state-machine callers (performUpdateCheck / app:checkForUpdates) that already
    // call downloadUpdate() after this event fires. Calling it a second time here
    // causes a race condition where two concurrent downloads collide, leaving slow
    // machines stuck at 100% with the download never completing.
    if (updaterState !== 'downloading' && updaterState !== 'downloaded') {
      setUpdaterState('update-available');
    }
    const win = BrowserWindow.getAllWindows()[0];
    if (win && !win.isDestroyed()) {
      win.webContents.send('update-info', info);
    }
  });

  autoUpdater.on('download-progress', (progress) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win && !win.isDestroyed()) {
      win.webContents.send('update-download-progress', {
        percent: progress.percent,
        bytesPerSecond: progress.bytesPerSecond,
        transferred: progress.transferred,
        total: progress.total,
      });
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    log.info('[Updater] Update downloaded and ready to install:', info?.version);
    downloadedInfo = info;
    downloadedInstaller = { file: info.downloadedFile, sha512: info.files.find(file => /\.exe$/i.test(file.url))?.sha512 || info.sha512 || '' };
    setUpdaterState('downloaded');
  });

  autoUpdater.on('error', (err) => {
    log.error('[Updater] Error:', err);
    // Don't transition to error state if we're already downloaded (install can still proceed)
    if (updaterState !== 'downloaded') {
      setUpdaterState('error');
    }
  });

  // Schedule periodic update checks (30 minutes)
  function scheduleNextUpdateCheck() {
    if (updateCheckTimer) {
      clearTimeout(updateCheckTimer);
    }
    updateCheckTimer = setTimeout(() => {
      performUpdateCheck().finally(() => {
        scheduleNextUpdateCheck();
      });
    }, MIN_CHECK_INTERVAL_MS);
  }

  // Initial check after startup delay
  setTimeout(() => {
    performUpdateCheck(true).finally(() => {
      scheduleNextUpdateCheck();
    });
  }, STARTUP_CHECK_DELAY_MS);

  // Cleanup on quit
  app.on('before-quit', () => {
    if (updateCheckTimer) {
      clearTimeout(updateCheckTimer);
      updateCheckTimer = null;
    }
  });

}

export function registerUpdaterIpc(): void {
ipcMain.handle('app:installUpdate', async () => {
  if (updaterState !== 'downloaded') {
    log.warn(`[Updater] Install requested without a downloaded update (state: ${updaterState})`);
    return { success: false, error: 'No downloaded update is ready to install.' };
  }

  if (installInProgress) return { success: false, error: 'The update installer is already starting.', installerReady: true };
  if (platform === 'win32') {
    if (!downloadedInstaller) return { success: false, error: 'No verified update installer is ready. Check for updates again.', installerReady: false };
    installInProgress = true;
    const result = await launchWindowsUpdate(downloadedInstaller);
    if (!result.success) {
      installInProgress = false;
      log.error('[Updater] Installer launch failed:', result.error);
      setUpdaterState(result.installerReady ? 'downloaded' : 'error');
      return result;
    }
    log.info('[Updater] Windows accepted the installer; quitting for update.');
    // Guard duplicate clicks until the process exits.
    setImmediate(() => app.quit());
    return result;
  }

  log.info('[Updater] Triggering quitAndInstall with progress banner...');
  let installError: Error | null = null;
  const captureInstallError = (err: Error) => { installError = err; };
  autoUpdater.once('error', captureInstallError);
  try {
    // Not silent: the one-click installer has no wizard, only a progress banner. With /S the screen stays
    // empty for the 30-50s install, and an install failure exits unseen without relaunching the app.
    // On success electron-updater quits the app itself and NSIS relaunches it.
    autoUpdater.quitAndInstall(false, true);
  } catch (e) {
    installError = e instanceof Error ? e : new Error(String(e));
  } finally {
    autoUpdater.removeListener('error', captureInstallError);
  }

  if (installError) {
    const message = installError.message || 'Could not start the update installer';
    log.error('[Updater] quitAndInstall failed:', message);
    // The pending installer is unusable; let the renderer re-download it instead of
    // leaving a restart button that can never succeed.
    setUpdaterState('error');
    return { success: false, error: message };
  }
  return { success: true };
});

ipcMain.handle('app:downloadUpdate', async () => {
  try {
    if (updaterState === 'downloading' || updaterState === 'downloaded') {
      log.warn('[Updater] Download already in progress or completed');
      return { success: true, message: 'Download already in progress' };
    }
    log.info('[Updater] Manual download triggered');
    setUpdaterState('downloading');
    await autoUpdater.downloadUpdate();
    // Note: setUpdaterState('downloaded') is handled by the 'update-downloaded' event
    return { success: true };
  } catch (error) {
    log.error('[Updater] Download error:', error);
    setUpdaterState('error');
    return { success: false, error: (error as Error).message || 'Operation failed' };
  }
});

ipcMain.handle('app:checkForUpdates', async () => {
  if (downloadedUpdateReady()) { setUpdaterState('downloaded'); return { success: true, updateInfo: downloadedInfo ? { version: downloadedInfo.version, releaseDate: downloadedInfo.releaseDate, releaseNotes: downloadedInfo.releaseNotes } : null }; }
  try {
    // For manual checks, bypass the state machine throttling but still prevent concurrent checks
    if (isUpdateCheckInProgress) {
      return { success: false, error: 'Check already in progress' };
    }
    
    isUpdateCheckInProgress = true;
    lastCheckTime = Date.now();
    setUpdaterState('checking');
    
    log.info('[Updater] Manual check for updates...');
    const result = await autoUpdater.checkForUpdatesAndNotify();
    
    // result contains complex objects (like CancellationToken) that cannot be cloned over IPC.
    // We only return the updateInfo which is serializable.
    if (result && result.isUpdateAvailable && result.updateInfo) {
      log.info('[Updater] Manual check found update:', result.updateInfo.version);
      setUpdaterState('update-available');
      const win = BrowserWindow.getAllWindows()[0];
      if (win && !win.isDestroyed()) {
        win.webContents.send('update-info', result.updateInfo);
      }
      // Auto-start download
      try {
        setUpdaterState('downloading');
        await autoUpdater.downloadUpdate();
      } catch (downloadErr) {
        log.error('[Updater] Auto-download after manual check failed:', downloadErr);
        setUpdaterState('error');
      }
      return { success: true, updateInfo: result.updateInfo };
    }
    // No update available — already on latest version
    log.info('[Updater] Manual check: no updates available');
    setUpdaterState('idle');
    return { success: true, updateInfo: null };
  } catch (error) {
    log.error('[Updater] Manual check error:', error);
    const msg = (error as Error).message || '';
    // A failed re-check must never discard an installer that is already downloaded.
    if (updaterState === 'downloaded') {
      log.warn('[Updater] Manual check failed after download; keeping update ready to install');
      return { success: false, error: msg || 'Update check failed' };
    }
    // 404 means no release found on the current channel — likely already up-to-date
    if (msg.includes('404') || msg.includes('Cannot find') || msg.includes('no published version')) {
      setUpdaterState('idle');
      return { success: true, updateInfo: null };
    }
    // Network errors — show a clean message
    if (
      msg.includes('net::ERR_') ||
      msg.includes('ENOTFOUND') ||
      msg.includes('ECONNREFUSED') ||
      msg.includes('ENETUNREACH') ||
      msg.includes('request failed') ||
      msg.toLowerCase().includes('network')
    ) {
      setUpdaterState('idle');
      return { success: false, error: 'No internet connection' };
    }
    setUpdaterState('error');
    return { success: false, error: msg };
  } finally {
    isUpdateCheckInProgress = false;
  }
});


}
