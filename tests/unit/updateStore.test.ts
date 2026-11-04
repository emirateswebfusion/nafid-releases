import { beforeEach, describe, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({
  installUpdate: vi.fn(),
  checkForUpdates: vi.fn(),
  onUpdateStatus: vi.fn(),
  onUpdateProgress: vi.fn(),
  onUpdateInfo: vi.fn(),
}));

vi.mock('../../src/data/app', () => ({
  appApi: { installUpdate: fixture.installUpdate, checkForUpdates: fixture.checkForUpdates },
}));
vi.mock('../../src/data/events', () => ({
  bridgeEvents: {
    onUpdateStatus: fixture.onUpdateStatus,
    onUpdateProgress: fixture.onUpdateProgress,
    onUpdateInfo: fixture.onUpdateInfo,
  },
}));
vi.mock('../../src/data/client', () => ({ isDesktopRuntime: () => true }));

import { useUpdateStore } from '../../src/store/updateStore';

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  vi.clearAllMocks();
  useUpdateStore.setState({
    updateInfo: null,
    updateReady: false,
    isDownloading: false,
    downloadProgress: null,
    initialized: false,
    installError: null,
    isInstalling: false,
  });
  fixture.checkForUpdates.mockResolvedValue({ success: true, updateInfo: null });
});

describe('update store install handling', () => {
  it('reports an install failure without starting a download loop', async () => {
    useUpdateStore.setState({ updateReady: true, updateInfo: { version: '2.2.8' } });
    fixture.installUpdate.mockResolvedValue({ success: false, error: 'No downloaded update is ready to install.' });

    useUpdateStore.getState().installUpdate();
    await flush();

    expect(fixture.checkForUpdates).not.toHaveBeenCalled();
    expect(useUpdateStore.getState().updateReady).toBe(false);
    expect(useUpdateStore.getState().isDownloading).toBe(false);
    expect(useUpdateStore.getState().installError).toContain('No downloaded update');
  });

  it('does not re-check after a successful install trigger', async () => {
    useUpdateStore.setState({ updateReady: true, updateInfo: { version: '2.2.8' } });
    fixture.installUpdate.mockResolvedValue({ success: true });

    useUpdateStore.getState().installUpdate();
    await flush();

    expect(fixture.checkForUpdates).not.toHaveBeenCalled();
    expect(useUpdateStore.getState().updateReady).toBe(true);
  });

  it('does not leave a downloading spinner when the recovery check fails', async () => {
    useUpdateStore.setState({ updateReady: true, updateInfo: { version: '2.2.8' } });
    fixture.installUpdate.mockResolvedValue({ success: false, error: 'No downloaded update is ready to install.' });
    fixture.checkForUpdates.mockResolvedValue({ success: false, error: 'No internet connection' });

    useUpdateStore.getState().installUpdate();
    await flush();

    expect(useUpdateStore.getState().updateReady).toBe(false);
    expect(useUpdateStore.getState().isDownloading).toBe(false);
  });

  it('clears a stale restart button when the main process reports an error', () => {
    let onStatus: ((status: string) => void) | undefined;
    fixture.onUpdateStatus.mockImplementation((callback: (status: string) => void) => {
      onStatus = callback;
    });
    useUpdateStore.setState({ updateReady: true, isDownloading: true });

    useUpdateStore.getState().init();
    onStatus?.('error');

    expect(useUpdateStore.getState().updateReady).toBe(false);
    expect(useUpdateStore.getState().isDownloading).toBe(false);
    expect(useUpdateStore.getState().downloadProgress).toBeNull();
  });
});

it('preserves a verified installer after a launch failure and guards repeated clicks', async () => {
  useUpdateStore.setState({ updateReady: true });
  fixture.installUpdate.mockResolvedValue({ success: false, error: 'Windows could not start the installer', installerReady: true });
  useUpdateStore.getState().installUpdate(); useUpdateStore.getState().installUpdate();
  await flush();
  expect(fixture.installUpdate).toHaveBeenCalledOnce();
  expect(fixture.checkForUpdates).not.toHaveBeenCalled();
  expect(useUpdateStore.getState()).toMatchObject({ updateReady: true, isInstalling: false, installError: 'Windows could not start the installer' });
});
