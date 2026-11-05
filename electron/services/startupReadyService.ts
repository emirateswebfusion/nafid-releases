import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import log from 'electron-log/main';
import { getMainWindow } from './windowRegistry.js';

/** The installer passes only its numeric PID, never an arbitrary output path. */
export function updateReadyMarker(args: readonly string[], userDataDirectory: string): string | null {
  const values = args.filter(arg => arg.startsWith('--nafid-update-ready='));
  if (values.length !== 1) return null;
  const id = values[0].slice('--nafid-update-ready='.length);
  return /^[1-9]\d{0,9}$/.test(id) ? path.join(userDataDirectory, `nafid-update-${id}.ready`) : null;
}

let acknowledged = false;
export function acknowledgeRendererReady(event: { sender: { id: number } }): { success: boolean } {
  const marker = updateReadyMarker(process.argv, app.getPath('userData'));
  if (!marker || acknowledged) return { success: true };
  const win = getMainWindow();
  if (!win || win.isDestroyed() || event.sender.id !== win.webContents.id) return { success: false };
  const signal = () => {
    if (acknowledged) return;
    try {
      fs.writeFileSync(marker, app.getVersion(), 'utf8');
      acknowledged = true;
      log.info('[Startup] Visible renderer ready; installer notified.', marker);
    } catch (error) { log.warn('[Startup] Could not acknowledge installer readiness:', error); }
  };
  if (win.isVisible()) signal();
  else win.once('show', signal);
  return { success: true };
}
