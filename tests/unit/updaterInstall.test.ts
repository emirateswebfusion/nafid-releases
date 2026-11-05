import { afterEach, beforeEach, expect, it, vi } from 'vitest';

type Listener = (...args: unknown[]) => void;
const fixture = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  listeners: new Map<string, Set<Listener>>(),
  launch: vi.fn(), quitAndInstall: vi.fn(), appQuit: vi.fn(), check: vi.fn(), platform: 'win32',
}));
const bucket = (event: string) => {
  let set = fixture.listeners.get(event);
  if (!set) { set = new Set(); fixture.listeners.set(event, set); }
  return set;
};
vi.mock('node:process', () => ({ get platform() { return fixture.platform; } }));
vi.mock('electron', () => ({
  app: { on: vi.fn(), quit: fixture.appQuit }, BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle: (channel: string, handler: (...args: unknown[]) => unknown) => fixture.handlers.set(channel, handler) },
}));
vi.mock('electron-updater', () => ({ autoUpdater: {
  quitAndInstall: fixture.quitAndInstall, checkForUpdatesAndNotify: fixture.check, downloadUpdate: vi.fn(),
  on: (event: string, listener: Listener) => bucket(event).add(listener),
  once: (event: string, listener: Listener) => bucket(event).add(listener),
  removeListener: (event: string, listener: Listener) => bucket(event).delete(listener),
} }));
vi.mock('electron-log/main', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock('../../electron/services/windowRegistry.js', () => ({ getMainWindow: () => null }));
vi.mock('../../electron/services/windowsInstallerLauncher.js', () => ({ launchWindowsUpdate: fixture.launch }));

const emit = (event: string, info: unknown) => { for (const fn of bucket(event)) fn(info); };
const downloaded = () => emit('update-downloaded', { version: '2.2.41', downloadedFile: 'C:/cache/update.exe', files: [{ url: 'update.exe', sha512: 'checksum' }] });
const install = () => fixture.handlers.get('app:installUpdate')?.();
beforeEach(async () => {
  vi.resetModules(); vi.useFakeTimers(); vi.resetAllMocks(); fixture.handlers.clear(); fixture.listeners.clear(); fixture.platform = 'win32';
  const service = await import('../../electron/services/updaterService');
  service.setupAutoUpdater(); const handlers = await import('../../electron/ipc/updaterHandlers'); handlers.registerUpdaterIpc();
});
afterEach(() => vi.useRealTimers());

it('does not quit or launch without a downloaded installer', async () => {
  expect(await install()).toEqual({ success: false, error: expect.any(String) });
  expect(fixture.launch).not.toHaveBeenCalled(); expect(fixture.appQuit).not.toHaveBeenCalled();
});
it('waits for Windows to accept the installer before quitting', async () => {
  downloaded(); let accept: (value: { success: true }) => void = () => {};
  fixture.launch.mockImplementation(() => new Promise(resolve => { accept = resolve; }));
  const pending = install();
  expect(fixture.appQuit).not.toHaveBeenCalled();
  expect(fixture.launch).toHaveBeenCalledWith({ file: 'C:/cache/update.exe', sha512: 'checksum' }, expect.any(Function));
  accept({ success: true }); expect(await pending).toEqual({ success: true });
  await vi.advanceTimersByTimeAsync(0);
  expect(fixture.appQuit).toHaveBeenCalledOnce(); expect(fixture.quitAndInstall).not.toHaveBeenCalled();
});
it('keeps POS open after delayed spawn failure and retries the same verified download', async () => {
  downloaded();
  fixture.launch.mockImplementation(async () => { await Promise.resolve(); return { success: false, error: 'spawn UNKNOWN', installerReady: true }; });
  expect(await install()).toMatchObject({ success: false, installerReady: true });
  await vi.advanceTimersByTimeAsync(0); expect(fixture.appQuit).not.toHaveBeenCalled();
  expect(await install()).toMatchObject({ success: false, installerReady: true });
  expect(fixture.launch).toHaveBeenCalledTimes(2);
});
it('prevents duplicate installer processes from concurrent clicks', async () => {
  downloaded(); fixture.launch.mockReturnValue(new Promise(() => {}));
  void install(); expect(await install()).toMatchObject({ success: false, error: expect.stringContaining('already starting') });
  expect(fixture.launch).toHaveBeenCalledOnce();
});
it('keeps a downloaded update ready during rechecks and disables unverified install on app quit', async () => {
  downloaded(); expect(await fixture.handlers.get('app:checkForUpdates')?.()).toMatchObject({ success: true, updateInfo: { version: '2.2.41' } });
  expect(fixture.check).not.toHaveBeenCalled();
  const { autoUpdater } = await import('electron-updater'); expect(autoUpdater.autoInstallOnAppQuit).toBe(false);
});
it('retains the native updater on non-Windows platforms', async () => {
  fixture.platform = 'darwin'; downloaded();
  expect(await install()).toEqual({ success: true }); expect(fixture.quitAndInstall).toHaveBeenCalledWith(false, true);
  expect(fixture.launch).not.toHaveBeenCalled();
});
