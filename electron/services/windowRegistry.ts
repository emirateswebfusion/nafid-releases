import type { BrowserWindow } from 'electron';

/** Process-wide handle to the main window (set by main.ts, read by services/handlers). */
let mainWindow: BrowserWindow | null = null;

export function setMainWindow(win: BrowserWindow | null) {
  mainWindow = win;
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}
