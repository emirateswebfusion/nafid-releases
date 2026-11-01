import { afterEach, beforeEach, expect, it, vi } from 'vitest';

type Listener = (...args: unknown[]) => void;

const fixture = vi.hoisted(() => {
  const listeners = new Map<string, Set<Listener>>();
  const bucket = (event: string) => {
    let set = listeners.get(event);
    if (!set) {
      set = new Set<Listener>();
      listeners.set(event, set);
    }
    return set;
  };
  return {
    handlers: new Map<string, (...args: unknown[]) => unknown>(),
    listeners,
    bucket,
    emit: (event: string, ...args: unknown[]) => {
      for (const listener of [...bucket(event)]) listener(...args);
    },
    quitAndInstall: vi.fn(),
    appExit: vi.fn(),
    appQuit: vi.fn(),
    appOn: vi.fn(),
    getMainWindow: vi.fn(() => null),
  };
});

vi.mock('electron', () => ({
  app: { on: fixture.appOn, exit: fixture.appExit, quit: fixture.appQuit },
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) => fixture.handlers.set(channel, handler),
  },
}));

vi.mock('electron-updater', () => ({
  autoUpdater: {
    quitAndInstall: fixture.quitAndInstall,
    checkForUpdatesAndNotify: vi.fn(),
    downloadUpdate: vi.fn(),
    on: (event: string, listener: Listener) => fixture.bucket(event).add(listener),
    once: (event: string, listener: Listener) => fixture.bucket(event).add(listener),
    removeListener: (event: string, listener: Listener) => fixture.bucket(event).delete(listener),
  },
}));

vi.mock('electron-log/main', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../electron/services/windowRegistry.js', () => ({ getMainWindow: fixture.getMainWindow }));

import { registerUpdaterIpc, setupAutoUpdater } from '../../electron/services/updaterService';

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  fixture.quitAndInstall.mockReset();
  fixture.handlers.clear();
  fixture.listeners.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

it('does not quit the app when no update has been downloaded', () => {
  registerUpdaterIpc();
  const install = fixture.handlers.get('app:installUpdate');
  expect(install).toBeTypeOf('function');

  const result = install?.();

  expect(result).toEqual({ success: false, error: expect.any(String) });
  expect(fixture.quitAndInstall).not.toHaveBeenCalled();
  expect(fixture.appExit).not.toHaveBeenCalled();
  expect(fixture.appQuit).not.toHaveBeenCalled();
});

it('triggers the silent installer once an update is downloaded', () => {
  setupAutoUpdater();
  fixture.emit('update-downloaded', { version: '2.2.12' });
  registerUpdaterIpc();

  const result = fixture.handlers.get('app:installUpdate')?.();

  expect(fixture.quitAndInstall).toHaveBeenCalledWith(true, true);
  expect(result).toEqual({ success: true });
  expect(fixture.appExit).not.toHaveBeenCalled();
});

it('keeps the app open and reports the error when the installer cannot start', () => {
  setupAutoUpdater();
  fixture.emit('update-downloaded', { version: '2.2.12' });
  fixture.quitAndInstall.mockImplementation(() => {
    fixture.emit('error', new Error("No update filepath provided, can't quit and install"));
  });
  registerUpdaterIpc();

  const install = fixture.handlers.get('app:installUpdate');
  const result = install?.();

  expect(result).toEqual({ success: false, error: expect.stringContaining('No update filepath') });
  expect(fixture.appExit).not.toHaveBeenCalled();
  expect(fixture.appQuit).not.toHaveBeenCalled();

  // The failed installer is unusable: a second click must not reach quitAndInstall again.
  const second = install?.();
  expect(second).toEqual({ success: false, error: expect.stringContaining('No downloaded update') });
  expect(fixture.quitAndInstall).toHaveBeenCalledTimes(1);
});
