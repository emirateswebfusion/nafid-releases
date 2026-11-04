// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
const fixture = vi.hoisted(() => ({ state: { updateInfo: { version: '2.2.41' }, updateReady: true, installError: 'Windows could not start the installer. Download saved.', isInstalling: false, installUpdate: vi.fn(), init: vi.fn() } }));
vi.mock('../../src/store/updateStore', () => ({ useUpdateStore: () => fixture.state }));
import UpdateBanner from '../../src/components/app/UpdateBanner';
afterEach(() => { cleanup(); localStorage.clear(); });
it('shows installer failure even when the announcement was dismissed, retaining the retry action', () => {
  localStorage.setItem('vendora-update-banner-dismissed', String(Date.now()));
  render(<UpdateBanner onOpenSettings={vi.fn()} />);
  expect(screen.getByRole('alert').textContent).toContain('Download saved');
  expect(screen.getByRole('button', { name: /Retry installation/ })).toBeTruthy();
});
