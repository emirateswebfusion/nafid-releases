// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SyncSupportPage } from '../../src/components/super-dashboard/views/SyncSupportPage';
import { useAuthStore } from '../../src/store/authStore';
const load = vi.hoisted(() => vi.fn());
vi.mock('../../src/data/cloud/syncSupport', () => ({ loadSyncSupport: load }));
afterEach(() => { cleanup(); load.mockReset(); });
it.each(['ADMIN', 'STAFF'] as const)('keeps developer reports away from shop %s', role => {
  useAuthStore.setState({ role }); render(<SyncSupportPage />);
  expect(screen.queryByText('Shop sync support')).toBeNull(); expect(load).not.toHaveBeenCalled();
});
it('shows shop and terminal identity with developer record details for SUPER_ADMIN', async () => {
  useAuthStore.setState({ role: 'SUPER_ADMIN' });
  load.mockResolvedValue({ reports: [{ tenant_id: 't', shop_name: 'Test Metals', terminal_id: 'pc01', received_at: '2026-11-20', report: {
    version: '2.2.85', platform: 'win32', observed_at: '2026-11-20', route: 'CLOUD', pending: 75, conflicts: 1, downloads: 0,
    issues: [{ entity: 'party_ledger', entity_id: 'entry-1', code: 'BASE_REQUIRED', row_version: 7, base: '6:pc02', sync_status: 'PENDING', updated_at: '2026-11-19' }] } }] });
  render(<SyncSupportPage />); fireEvent.click(screen.getByRole('button', { name: 'Refresh reports' }));
  expect(await screen.findByText('Test Metals')).toBeTruthy(); expect(screen.getByText(/Terminal: pc01/)).toBeTruthy();
  expect(screen.getByText('entry-1')).toBeTruthy(); expect(screen.getByText('BASE_REQUIRED')).toBeTruthy();
});
