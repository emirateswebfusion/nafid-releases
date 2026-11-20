import { afterEach, expect, it, vi } from 'vitest';
const fixture = vi.hoisted(() => ({ allowed: true, auth: { tenant_id: 'shop', jwt_token: 'test-token' }, fetch: vi.fn() }));
vi.mock('electron', () => ({ app: { getVersion: () => '2.2.85' } }));
vi.mock('../../electron/db/localDb', () => ({ getDb: () => ({}) }));
vi.mock('../../electron/sync/syncConfig', () => ({ getAuthConfig: () => fixture.auth }));
vi.mock('../../electron/sync/cloudAccess', () => ({ calculateEffectiveCloudAccess: () => ({ isCloudAllowed: fixture.allowed }) }));
vi.mock('../../electron/db/statements/sync/accountMetadata', () => ({
  read: () => ({ get: () => ({ value: 'pc01' }) }), pendingAccounts: () => ({ get: () => ({ n: 2 }) }),
  activeAccountConflicts: () => ({ get: () => ({ n: 1 }) }), countConflicts: () => ({ get: () => ({ n: 0 }) }),
}));
vi.mock('../../electron/db/statements/sync/supportReport', () => ({ accountIssues: () => ({ all: () => [
  { entity: 'party_ledger', entity_id: 'entry', row_version: 2, sync_status: 'PENDING', base: '1:other',
    updated_at: '2026-11-20', reason: 'Sync conflict: baseline required secret@example.com', name: 'Private name', amount: 100 },
] }) }));
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); fixture.fetch.mockReset(); fixture.allowed = true; });
it('uploads bounded metadata without raw errors or financial/customer values and throttles cycles', async () => {
  vi.resetModules(); vi.stubEnv('VENDORA_CLOUD_API', 'https://example.test');
  fixture.fetch.mockResolvedValue({ ok: true }); vi.stubGlobal('fetch', fixture.fetch);
  const { reportSyncSupport } = await import('../../electron/sync/supportReport');
  await reportSyncSupport(); await reportSyncSupport();
  expect(fixture.fetch).toHaveBeenCalledTimes(1);
  const body = JSON.parse(fixture.fetch.mock.calls[0][1].body);
  expect(body).toMatchObject({ terminal_id: 'pc01', conflicts: 1, issues: [{ entity_id: 'entry', code: 'BASE_REQUIRED' }] });
  expect(JSON.stringify(body)).not.toMatch(/secret@|Private name|amount/);
});
it('respects disabled cloud access', async () => {
  vi.resetModules(); vi.stubEnv('VENDORA_CLOUD_API', 'https://example.test'); fixture.allowed = false;
  vi.stubGlobal('fetch', fixture.fetch);
  await (await import('../../electron/sync/supportReport')).reportSyncSupport();
  expect(fixture.fetch).not.toHaveBeenCalled();
});
