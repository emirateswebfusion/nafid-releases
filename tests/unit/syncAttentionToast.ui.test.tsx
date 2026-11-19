// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SyncAttentionToast } from '../../src/components/app/SyncAttentionToast';
afterEach(cleanup);
it('shows review outcomes outside the dashboard, supports dismissal and clears on success', () => {
  const view = render(<SyncAttentionToast label="2 account changes need review; local data retained" complete />);
  expect(screen.getByRole('alert').textContent).toContain('local data retained');
  fireEvent.click(screen.getByRole('button'));
  expect(screen.queryByRole('alert')).toBeNull();
  view.rerender(<SyncAttentionToast label="3 account changes need review; local data retained" complete />);
  expect(screen.getByRole('alert').textContent).toContain('3 account changes');
  view.rerender(<SyncAttentionToast label="Sync completed" complete />);
  expect(screen.queryByRole('alert')).toBeNull();
});
