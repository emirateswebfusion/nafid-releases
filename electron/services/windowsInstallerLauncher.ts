import { app } from 'electron';
import { Worker } from 'node:worker_threads';
import path from 'node:path';
import type { DownloadedWindowsInstaller, InstallerLaunchResult } from './windowsUpdateInstaller.js';

/** CreateProcess can block for many seconds during Windows scanning. Keep it off Electron's UI thread. */
export function launchWindowsUpdate(installer: DownloadedWindowsInstaller, onPhase: (phase: string, percent?: number) => void): Promise<InstallerLaunchResult> {
  const workerFile = app.isPackaged
    ? path.join(process.resourcesPath, 'app.asar.unpacked/dist-electron/services/windowsInstallerWorker.js')
    : path.join(__dirname, 'windowsInstallerWorker.js');
  return new Promise(resolve => {
    let settled = false;
    const finish = (result: InstallerLaunchResult) => { if (!settled) { settled = true; resolve(result); } };
    const failed = () => finish({ success: false, installerReady: true, error: 'Windows could not start the installer. Nafid is still open; please retry.' });
    try {
      const worker = new Worker(workerFile, { workerData: installer });
      worker.on('message', (message: unknown) => {
        if (!message || typeof message !== 'object') return;
        if ('phase' in message && (message.phase === 'verifying-installer' || message.phase === 'starting-installer')) {
          const percent = 'percent' in message && typeof message.percent === 'number' && Number.isFinite(message.percent) && message.percent >= 0 && message.percent <= 100 ? message.percent : undefined;
          onPhase(message.phase, percent);
        }
        if (!('result' in message) || !message.result || typeof message.result !== 'object') return;
        const result = message.result;
        if ('success' in result && result.success === true) finish({ success: true });
        else if ('success' in result && result.success === false && 'error' in result && typeof result.error === 'string' && 'installerReady' in result && typeof result.installerReady === 'boolean') {
          finish({ success: false, error: result.error, installerReady: result.installerReady });
        }
      });
      worker.once('error', failed);
      worker.once('exit', () => { if (!settled) failed(); });
    } catch { failed(); }
  });
}
