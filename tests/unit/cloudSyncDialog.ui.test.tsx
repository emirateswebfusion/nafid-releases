// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SessionExpiredModal } from '../../src/components/app/SessionExpiredModal';
const fixture = vi.hoisted(() => ({ resume: vi.fn() }));
vi.mock('../../src/store/cloudSyncRecovery', () => ({ resumeCloudSync: fixture.resume }));
afterEach(cleanup);
beforeEach(() => { vi.resetAllMocks(); });
const fill = () => {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'owner@example.test' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password' } });
};
it('shows an inline failure and can close without logging out', async () => {
  const close = vi.fn(); fixture.resume.mockResolvedValue({ success: false, error: 'Cloud unavailable' });
  render(<SessionExpiredModal isOpen onClose={close} />); fill();
  fireEvent.click(screen.getByRole('button', { name: 'Sign in to reconnect' }));
  expect((await screen.findByRole('alert')).textContent).toContain('Cloud unavailable');
  expect(screen.getByText('Cloud unavailable')).toBeTruthy(); expect(close).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Continue working offline' })); expect(close).toHaveBeenCalledOnce();
});
it('prevents duplicate submits, allows closing during a request, and cancels late results', async () => {
  let finish!: (value: { success: boolean }) => void;
  fixture.resume.mockImplementation(() => new Promise(resolve => { finish = resolve; })); const close = vi.fn();
  const view = render(<SessionExpiredModal isOpen onClose={close} />); fill();
  fireEvent.click(screen.getByRole('button', { name: 'Sign in to reconnect' }));
  fireEvent.submit(screen.getByLabelText('Email').closest('form')!); expect(fixture.resume).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole('button', { name: 'Continue working offline' }));
  const signal = fixture.resume.mock.calls[0][3] as AbortSignal; expect(signal.aborted).toBe(true);
  view.rerender(<SessionExpiredModal isOpen={false} onClose={close} />);
  finish({ success: true }); await waitFor(() => expect(close).toHaveBeenCalledOnce());
});
it('closes on successful recovery and clears inputs when reopened', async () => {
  fixture.resume.mockResolvedValue({ success: true }); const close = vi.fn();
  const view = render(<SessionExpiredModal isOpen onClose={close} />); fill();
  fireEvent.click(screen.getByRole('button', { name: 'Sign in to reconnect' }));
  await waitFor(() => expect(close).toHaveBeenCalledOnce());
  view.rerender(<SessionExpiredModal isOpen={false} onClose={close} />);
  view.rerender(<SessionExpiredModal isOpen onClose={close} />);
  expect((screen.getByLabelText('Password') as HTMLInputElement).value).toBe('');
});
