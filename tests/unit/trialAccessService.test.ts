vi.mock('../../electron/sync/syncWorker', () => ({ setSyncActive: vi.fn() }));
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const state = vi.hoisted(() => ({ directory: '', db: undefined as import('node:sqlite').DatabaseSync | undefined }));
vi.mock('../../electron/db/localDb', () => ({ getOpenDb: () => state.db }));
vi.mock('../../electron/services/localAuthService', () => ({ localSaveUser: vi.fn() }));
vi.mock('electron', () => ({ app: { getPath: () => state.directory }, safeStorage: {
  isEncryptionAvailable: () => false, encryptString: (text: string) => Buffer.from(text), decryptString: (bytes: Buffer) => bytes.toString('utf8'),
} }));

const now = Date.parse('2026-10-30T10:00:00Z');
const token = (tenant: string, seconds = 3600) => `header.${Buffer.from(JSON.stringify({ tenant_id: tenant, trial: true, exp: now / 1000 + seconds, trial_expires_at: '2026-11-15T10:00:00Z' })).toString('base64url')}.signature`;
beforeEach(() => {
  vi.resetModules(); vi.useFakeTimers(); vi.setSystemTime(now);
  state.directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nafid-trial-access-'));
  state.db = new DatabaseSync(':memory:');
  state.db.exec('CREATE TABLE trial_access_registry (tenant_id TEXT PRIMARY KEY)');
});
afterEach(() => { vi.useRealTimers(); state.db?.close(); fs.rmSync(state.directory, { recursive: true, force: true }); });

describe('persistent trial access', () => {
  it('does not restrict paid shops', async () => {
    const service = await import('../../electron/services/trialAccessService');
    expect(service.getTrialAccess({ tenant_id: 'paid' })).toEqual({ is_trial: false, allowed: true });
  });
  it('keeps the deadline across sign-out and a process restart', async () => {
    const service = await import('../../electron/services/trialAccessService');
    service.rememberTrialToken(token('trial'));
    expect(service.getTrialAccess({ tenant_id: 'trial' }).allowed).toBe(true);
    vi.setSystemTime(now + 3600000); vi.resetModules();
    const restored = await import('../../electron/services/trialAccessService');
    expect(restored.getTrialAccess({ tenant_id: 'trial' }).allowed).toBe(false);
    expect(() => restored.assertTrialAccess('trial')).toThrow('renew');
  });
  it('remembers online denial until a new approved session is saved', async () => {
    const service = await import('../../electron/services/trialAccessService');
    service.rememberTrialToken(token('trial'));
    service.blockTrialAccess({ tenant_id: 'trial' });
    expect(service.getTrialAccess({ tenant_id: 'trial' }).allowed).toBe(false);
    service.rememberTrialToken(token('trial'));
    expect(service.getTrialAccess({ tenant_id: 'trial' }).allowed).toBe(true);
  });
  it('blocks database actions at the main-process boundary after lease expiry', async () => {
    const service = await import('../../electron/services/trialAccessService');
    service.rememberTrialToken(token('trial'));
    fs.writeFileSync(path.join(state.directory, 'config.json'), JSON.stringify({ tenant_id: 'trial', jwt_token: token('trial') }));
    expect(() => service.assertCurrentTrialAccess()).not.toThrow();
    vi.setSystemTime(now + 3600000);
    expect(() => service.assertCurrentTrialAccess()).toThrow('renew');
  });
  it('fails closed if a known trial loses its allowance file after sign-out', async () => {
    const service = await import('../../electron/services/trialAccessService');
    service.rememberTrialToken(token('trial'));
    state.db!.prepare('INSERT OR IGNORE INTO trial_access_registry VALUES (?)').run('trial');
    fs.unlinkSync(path.join(state.directory, 'trial-access.enc')); vi.resetModules();
    const restored = await import('../../electron/services/trialAccessService');
    expect(restored.getTrialAccess({ tenant_id: 'trial' })).toMatchObject({ is_trial: true, allowed: false });
    expect(() => restored.assertTrialAccess('trial')).toThrow();
  });
  it('allows a fresh online login to recover a damaged allowance file', async () => {
    fs.writeFileSync(path.join(state.directory, 'trial-access.enc'), '{broken');
    const service = await import('../../electron/services/trialAccessService');
    expect(() => service.rememberTrialToken(token('trial'))).not.toThrow();
    expect(service.getTrialAccess({ tenant_id: 'trial' }).allowed).toBe(true);
  });
  it('does not block paid users when an unrelated trial allowance file is damaged', async () => {
    fs.writeFileSync(path.join(state.directory, 'trial-access.enc'), '{broken');
    const service = await import('../../electron/services/trialAccessService');
    expect(service.getTrialAccess({ tenant_id: 'paid' })).toEqual({ is_trial: false, allowed: true });
  });
  it('rejects a refresh response for the previous user at the persistence boundary', async () => {
    const { refreshTrialSession } = await import('../../electron/services/trialSessionService');
    const current = { tenant_id: 'trial', user_id: 'new-user', jwt_token: 'new-login', email: 'new@example.test' };
    fs.writeFileSync(path.join(state.directory, 'config.json'), JSON.stringify(current));
    const result = refreshTrialSession({ expected_token: 'old-login', token: token('trial'), tenant_id: 'trial', user_id: 'old-user', role: 'ADMIN', permissions: ['*'], user_name: 'Old', restricted_page: null });
    expect(result.success).toBe(false);
    expect(JSON.parse(fs.readFileSync(path.join(state.directory, 'config.json'), 'utf8'))).toEqual(current);
  });
  it('preserves the original email and password cache when renewing a session', async () => {
    const { refreshTrialSession } = await import('../../electron/services/trialSessionService');
    const current = { tenant_id: 'trial', user_id: 'owner', jwt_token: 'original', email: 'owner@example.test', password_hash: 'cached-hash', shop_name: 'Shop' };
    fs.writeFileSync(path.join(state.directory, 'config.json'), JSON.stringify(current));
    expect(refreshTrialSession({ expected_token: 'original', token: token('trial'), tenant_id: 'trial', user_id: 'owner', role: 'ADMIN', permissions: ['*'], user_name: 'Owner Name', restricted_page: null }).success).toBe(true);
    const saved = JSON.parse(fs.readFileSync(path.join(state.directory, 'config.json'), 'utf8'));
    expect(saved.email).toBe('owner@example.test'); expect(saved.password_hash).toBe('cached-hash');
  });
});
