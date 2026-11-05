// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../src/data/app', () => ({ appApi: { checkForUpdates: vi.fn(), installUpdate: vi.fn() } }));
vi.mock('../../src/data/events', () => ({ bridgeEvents: {} }));
vi.mock('../../src/components/settings/whatsNew', () => ({ getWhatsNewItems: () => [] }));
import { useUpdateStore } from '../../src/store/updateStore';
import { useSettingsUpdater } from '../../src/components/settings/hooks/useSettingsUpdater';
import { SystemPreferencesTab } from '../../src/components/settings/tabs/SystemPreferencesTab';

const install = vi.fn();
function SettingsUpdates() {
  const { updateInfo, updateReady, updateStatus, isDownloading, downloadProgress, lastChecked } = useSettingsUpdater();
  return <SystemPreferencesTab appVersion="v2.2.43" {...{ updateInfo, updateReady, updateStatus, isDownloading, downloadProgress, lastChecked }} whatsNewLang="en" setWhatsNewLang={() => {}} handleInstallUpdate={install} handleRetryDownload={() => {}}/>;
}
beforeEach(() => {
  install.mockClear();
  useUpdateStore.setState({ initialized: true, updateInfo: null, updateReady: false, isDownloading: false, downloadProgress: null, isChecking: false, checkError: null, lastChecked: null, installError: null, isInstalling: false });
});
afterEach(cleanup);
it('shows the ready action and metadata immediately after the dashboard downloaded an update', () => {
  useUpdateStore.setState({ updateReady: true, updateInfo: { version: '2.2.44' } });
  render(<SettingsUpdates/>);
  expect(screen.getByText(/v2.2.44 Ready to Install/)).toBeDefined();
  fireEvent.click(screen.getByRole('button', { name: 'Restart to Update' }));
  expect(install).toHaveBeenCalledOnce();
});
it('keeps installation available even when release metadata is missing', () => {
  useUpdateStore.setState({ updateReady: true });
  render(<SettingsUpdates/>);
  expect(screen.getByRole('button', { name: 'Restart to Update' })).toBeDefined();
});
it('uses the current global snapshot after Settings closes and reopens', () => {
  const first = render(<SettingsUpdates/>);
  expect(screen.queryByRole('button', { name: 'Restart to Update' })).toBeNull();
  first.unmount();
  act(() => useUpdateStore.setState({ updateReady: true, updateInfo: { version: '2.2.45' } }));
  render(<SettingsUpdates/>);
  expect(screen.getByText(/v2.2.45 Ready to Install/)).toBeDefined();
  expect(screen.getByRole('button', { name: 'Restart to Update' })).toBeDefined();
});
