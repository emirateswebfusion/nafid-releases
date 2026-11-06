// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AuthErrorToast } from '../../src/components/app/AuthErrorToast';
import { useAuthStore } from '../../src/store/authStore';
afterEach(() => { cleanup(); useAuthStore.setState({ authError: null }); });
it('shows and dismisses a failed sign-out through the shared notification component', () => {
  useAuthStore.setState({ authError: 'Sign-out could not finish. Please retry.' });
  render(<AuthErrorToast />); expect(screen.getByRole('alert').textContent).toContain('Sign-out could not finish');
  fireEvent.click(screen.getByRole('button', { name: /close/i }));
  expect(useAuthStore.getState().authError).toBeNull();
});
