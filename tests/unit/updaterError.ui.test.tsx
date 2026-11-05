// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const fixture = vi.hoisted(() => ({ state: { updateInfo: { version: '2.2.41' } as { version: string } | null, updateReady: true, installError: 'Windows could not start the installer. Download saved.', isInstalling: false, installPhase: 'preparing' as 'preparing' | 'verifying-installer' | 'starting-installer', installUpdate: vi.fn(), init: vi.fn() } }));
vi.mock('../../src/store/updateStore', () => ({ useUpdateStore: () => fixture.state }));
import UpdateBanner from '../../src/components/app/UpdateBanner';
import { UpdateInstallProgress } from '../../src/components/app/UpdateInstallProgress';
beforeEach(() => { fixture.state.updateInfo = { version: '2.2.41' }; fixture.state.updateReady = true; fixture.state.installError = 'Windows could not start the installer. Download saved.'; fixture.state.isInstalling = false; });
afterEach(() => { cleanup(); localStorage.clear(); });
it('shows installer failure even when the announcement was dismissed, retaining the retry action', () => {
  localStorage.setItem('vendora-update-banner-dismissed', String(Date.now()));
  render(<UpdateBanner onOpenSettings={vi.fn()} />);
  expect(screen.getByRole('alert').textContent).toContain('Download saved');
  expect(screen.getByRole('button', { name: /Retry installation/ })).toBeTruthy();
});

it('shows preparation progress even when the update announcement was dismissed', () => {
  fixture.state.installError = ''; fixture.state.isInstalling = true;
  localStorage.setItem('vendora-update-banner-dismissed', String(Date.now()));
  render(<UpdateBanner onOpenSettings={vi.fn()} />);
  expect(screen.getByRole('status').textContent).toContain('Preparing update v2.2.41');
  expect(screen.getByRole('status').textContent).toContain('separate window');
  expect(screen.getByRole('status').textContent).toContain('reopen automatically');
});

it('shows preparation from Settings before announcement metadata has loaded', () => {
  fixture.state.updateInfo = null; fixture.state.updateReady = false; fixture.state.installError = ''; fixture.state.isInstalling = true;
  render(<UpdateBanner onOpenSettings={vi.fn()} />);
  expect(screen.getByRole('status').textContent).toContain('Preparing update');
});

it('reports actual checking and Windows-start phases rather than a fake percentage', () => {
  fixture.state.installError = ''; fixture.state.isInstalling = true; fixture.state.installPhase = 'verifying-installer';
  const view = render(<UpdateBanner onOpenSettings={vi.fn()} />);
  expect(screen.getByRole('status').textContent).toContain('Checking the downloaded update');
  fixture.state.installPhase = 'starting-installer'; view.rerender(<UpdateBanner onOpenSettings={vi.fn()} />);
  expect(screen.getByRole('status').textContent).toContain('Windows is starting the installer');
  expect(screen.getByRole('status').textContent).not.toContain('%');
});
it('shows a measured verification bar and removes the percentage for Windows startup', () => {
  const view = render(<UpdateInstallProgress phase="verifying-installer" percent={37} />);
  expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('37');
  expect(screen.getByText('Verification 37%')).toBeTruthy();
  view.rerender(<UpdateInstallProgress phase="starting-installer" percent={100} />);
  expect(screen.queryByRole('progressbar')).toBeNull();
  expect(screen.getByRole('status').textContent).not.toContain('100%');
});
