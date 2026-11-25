// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
const fixture = vi.hoisted(() => ({ sync: vi.fn(), available: true }));
vi.mock('../../src/data/client', () => ({ hasBridge: () => fixture.available }));
vi.mock('../../src/data/sync', () => ({ syncApi: { manualCloudSync: fixture.sync } }));
vi.mock('../../src/store/authStore', () => ({ useAuthStore: { getState: () => ({ tenantId: 'shop', userId: 'owner', token: 'token' }) } }));
import { ManualSyncPanel } from '../../src/components/settings/tabs/ManualSyncPanel';
afterEach(() => { cleanup(); vi.clearAllMocks(); fixture.available = true; });
it('requires explicit source confirmation, prevents duplicate submissions and keeps diagnostics off the shop UI', async () => {
  let finish!: (result: { status: string; message: string }) => void;
  fixture.sync.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  render(<ManualSyncPanel />);
  const button = screen.getByRole('button', { name: 'Sync now' });
  fireEvent.click(button); fireEvent.click(button);
  expect(fixture.sync).not.toHaveBeenCalled();
  const confirm = screen.getByRole('button', { name: 'Confirm and continue' });
  expect((confirm as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(confirm); fireEvent.click(confirm);
  expect(fixture.sync).toHaveBeenCalledTimes(1);
  expect(fixture.sync).toHaveBeenCalledWith({ confirm_complete: true });
  expect((button as HTMLButtonElement).disabled).toBe(true);
  await act(async () => finish({ status: 'QUEUED', message: 'private diagnostic details must not be shown' }));
  expect(screen.getByRole('status').textContent).toBe('Request saved. You can continue working.');
  expect(screen.queryByText('private diagnostic details must not be shown')).toBeNull();
  expect((button as HTMLButtonElement).disabled).toBe(false);
});
it('does not offer native cloud sync on unsupported clients', () => {
  fixture.available = false; render(<ManualSyncPanel />);
  expect(screen.queryByRole('button')).toBeNull();
});
