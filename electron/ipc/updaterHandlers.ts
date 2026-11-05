import { ipcMain } from 'electron';
import * as updaterService from '../services/updaterService.js';

export function registerUpdaterIpc(): void {
  ipcMain.handle('app:installUpdate', updaterService.installUpdate);
  ipcMain.handle('app:downloadUpdate', updaterService.downloadUpdate);
  ipcMain.handle('app:checkForUpdates', updaterService.checkForUpdates);
}
