import { app, BrowserWindow, ipcMain } from 'electron';
import { autoUpdater } from 'electron-updater';
import log from 'electron-log/main';
import { getMainWindow } from './windowRegistry.js';

type UpdaterState = 'idle' | 'checking' | 'update-available' | 'downloading' | 'downloaded' | 'error';
let updaterState: UpdaterState = 'idle';
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

function canCheckForUpdates(): boolean {
  const now = Date.now();
  if (isUpdateCheckInProgress) return false;
  if (now - lastCheckTime < MIN_CHECK_INTERVAL_MS) return false;
  if (updaterState === 'checking' || updaterState === 'downloading') return false;
  return true;
}



export function setupAutoUpdater(): void {
  const updaterToken = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '';
  if (updaterToken) {
    autoUpdater.requestHeaders = {
      Authorization: `token ${updaterToken}`
    };
    log.info('[Updater] Configured GitHub authorization headers for private repo updates.');
  }

  // Disable auto-download initially - we'll control it via state machine
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

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
ipcMain.handle('app:installUpdate', () => {
  log.info('[Updater] Triggering quitAndInstall...');
  setImmediate(() => {
    try {
      autoUpdater.quitAndInstall(false, true);
    } catch (e) {
      log.error('[Updater] quitAndInstall error:', e);
    }
    setTimeout(() => {
      BrowserWindow.getAllWindows().forEach(w => {
        try { w.destroy(); } catch { /* ignore */ }
      });
      app.exit(0);
    }, 800);
  });
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
