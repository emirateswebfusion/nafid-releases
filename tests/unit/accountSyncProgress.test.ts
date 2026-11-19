import { beforeEach, expect, it, vi } from 'vitest';
const fixture = vi.hoisted(() => ({ label: '1 account change needs review. Changes kept on this computer.' as string | null, send: vi.fn() }));
vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => [{ webContents: { send: fixture.send, isDestroyed: () => false } }] } }));
vi.mock('../../electron/db/localDb', () => ({ getDb: () => ({}) }));
vi.mock('../../electron/sync/syncConfig', () => ({ getAuthConfig: () => ({ tenant_id: 'shop' }) }));
vi.mock('../../electron/sync/accountMetadata', () => ({ accountSyncNotice: () => fixture.label }));
import { notifyCycleComplete } from '../../electron/sync/syncProgress';
beforeEach(() => fixture.send.mockClear());
it('background completion broadcasts unresolved account state before the completion event', () => {
  fixture.label = '1 account change needs review. Changes kept on this computer.';
  notifyCycleComplete();
  expect(fixture.send.mock.calls[0]).toEqual(['sync:progress', expect.objectContaining({ label: fixture.label })]);
  expect(fixture.send.mock.calls[1]).toEqual(['sync:cycle-complete']);
});
it('a clear account queue does not fabricate a warning', () => {
  fixture.label = null; notifyCycleComplete();
  expect(fixture.send.mock.calls).toEqual([['sync:cycle-complete']]);
});
