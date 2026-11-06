import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const fixture = vi.hoisted(() => ({ directory: '' }));
vi.mock('electron', () => ({ app: { getPath: () => fixture.directory }, safeStorage: { isEncryptionAvailable: () => false } }));
vi.mock('../../electron/db/localDb', () => ({ getDb: () => { throw new Error('No test database'); } }));
vi.mock('../../electron/sync/syncProgress', () => ({ getTotalPendingRecords: () => 0 }));
import { readAuthPayload } from '../../electron/services/authStorage';
import { getAuthConfig } from '../../electron/sync/syncConfig';
beforeEach(() => { fixture.directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nafid-auth-read-')); });
afterEach(() => fs.rmSync(fixture.directory, { recursive: true, force: true }));
it.each(['malformed', 'unreadable'])('uses the same valid fallback for UI and sync when encrypted auth is %s', async failure => {
  const expected = { jwt_token: 'new-token', tenant_id: 'shop' };
  fs.writeFileSync(path.join(fixture.directory, 'config.json'), JSON.stringify(expected));
  if (failure === 'malformed') fs.writeFileSync(path.join(fixture.directory, 'auth.enc'), '{broken');
  else fs.mkdirSync(path.join(fixture.directory, 'auth.enc'));
  expect(readAuthPayload()).toEqual(expected); expect(getAuthConfig()).toEqual(expected);
});
