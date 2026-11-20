// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { SyncStatusFooter } from '../../src/components/owner-dashboard/views/SyncStatusFooter';
vi.mock('../../src/components/owner-dashboard/DigitalClock', () => ({ DigitalClock: () => null }));
afterEach(cleanup);
const props = { isSyncing: false, syncComplete: true, shuffledQuotes: [], quoteIndex: 0, QUOTES: [], displayTime: 'yesterday', isLastSyncRecent: false };
it.each(['75 account changes need review. Account changes are waiting to upload.', 'Account data is still downloading.', 'Upload failed'])('keeps diagnostic outcomes out of the customer summary: %s', label => {
  render(<SyncStatusFooter {...props} syncProgress={{ label, percent: 100, recordsSynced: 0, totalRecords: 75 }} />);
  expect(screen.queryByText(label)).toBeNull();
  expect(screen.queryByText('Sync Complete')).toBeNull();
  expect(screen.queryByText('100%')).toBeNull();
  expect(screen.getByText(/Last checked:/)).toBeTruthy();
});
it('shows simple progress without exposing internal table names', () => {
  render(<SyncStatusFooter {...props} isSyncing syncComplete={false} syncProgress={{ label: 'Uploading party_ledger batch 2', percent: 40, recordsSynced: 2, totalRecords: 5 }} />);
  expect(screen.getByText('Syncing...')).toBeTruthy();
  expect(screen.getByText('40%')).toBeTruthy();
  expect(screen.queryByText(/party_ledger/)).toBeNull();
});
it('shows completion for a successful cycle', () => {
  render(<SyncStatusFooter {...props} syncProgress={{ label: 'Sync completed', percent: 100, recordsSynced: 5, totalRecords: 5 }} />);
  expect(screen.getByText('Sync Complete')).toBeTruthy();
});
