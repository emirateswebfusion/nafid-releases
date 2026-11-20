import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCoreTables } from '../../electron/db/schemaCoreTables';
import { createExtendedTables } from '../../electron/db/schemaExtendedTables';
import { ensureSchemaColumns } from '../../electron/db/schemaColumns';

const state = vi.hoisted(() => ({ db: null as unknown as Database.Database, directory: '' }));
vi.mock('../../electron/db/localDb', () => ({
  getDb: () => state.db,
  getOpenDb: () => state.db,
}));
vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => [] },
  app: { getPath: () => state.directory },
  safeStorage: { isEncryptionAvailable: () => false },
}));

import {
  hashStaffPin,
  getTerminalConfig,
  localAuthenticatePin,
  localAuthenticateUser,
  hasUserPin,
} from '../../electron/services/localAuthService';
vi.mock('../../electron/sync/syncWorker', () => ({setSyncActive: vi.fn()}));
vi.mock('../../electron/services/syncService', () => ({isLanSyncConfigured: () => false}));
import { saveToken, saveOfflineSession, clearToken, lockSession, loginWithPin } from '../../electron/services/authSessionService';
import { resumeCloudSession } from '../../electron/services/cloudSessionRecoveryService';
import { readOfflineSession, readAuthPayload, isTerminalLocked, getTerminalLockMode } from '../../electron/services/authStorage';
import { saveStaff } from '../../electron/services/staffService';
import { setSyncActive } from '../../electron/sync/syncWorker';

describe('Quick PIN Login & Staff Security', () => {
  let raw: DatabaseSync | undefined;

  beforeEach(() => {
    state.directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nafid-pin-'));
    raw = new DatabaseSync(':memory:');
    const sql = raw;
    state.db = Object.assign(sql, {
      transaction: (fn: () => unknown) => () => {
        sql.exec('SAVEPOINT test_tx');
        try {
          const result = fn();
          sql.exec('RELEASE test_tx');
          return result;
        } catch (e) {
          sql.exec('ROLLBACK TO test_tx;RELEASE test_tx');
          throw e;
        }
      },
    }) as unknown as Database.Database;

    createCoreTables(state.db);
    createExtendedTables(state.db);
    ensureSchemaColumns(state.db);
  });

  afterEach(() => {
    raw?.close();
    fs.rmSync(state.directory, {recursive:true,force:true});
  });

  it('reconnects owner cloud credentials while preserving the authenticated cashier on disk', () => {
    saveOfflineSession({ tenant_id: 'shop', user_id: 'cashier', role: 'STAFF', user_name: 'Cashier', shop_name: 'Shop', permissions: ['sales.create'] });
    const token = `h.${Buffer.from(JSON.stringify({ exp: 4102444800, tenant_id: 'shop', user_id: 'owner' })).toString('base64url')}.s`;
    expect(resumeCloudSession({ expected_tenant_id: 'shop', expected_user_id: 'cashier', credentials: {
      tenant_id: 'shop', user_id: 'owner', role: 'ADMIN', jwt_token: token, shop_name: 'Shop', user_name: 'Owner', permissions: ['*'],
    } })).toEqual({ success: true });
    expect(readOfflineSession()).toMatchObject({ user_id: 'cashier', role: 'STAFF', permissions: ['sales.create'] });
    expect(readAuthPayload()).toMatchObject({ jwt_token: token, user_id: 'owner' });
    expect(getTerminalConfig()).toMatchObject({ user_id: 'cashier', role: 'STAFF' });
  });
  it.each(['missing', 'stale'])('reconnects a restored cloud session with %s terminal display context', (context) => {
    const expired = `h.${Buffer.from(JSON.stringify({ exp: 1 })).toString('base64url')}.s`;
    saveToken({ tenant_id: 'shop', user_id: 'owner', role: 'ADMIN', jwt_token: expired });
    if (context === 'missing') raw!.exec("DELETE FROM settings WHERE key='last_active_terminal_session'");
    else rememberTerminalSession({ tenant_id: 'old-shop', user_id: 'old-user', role: 'STAFF' });
    const token = `h.${Buffer.from(JSON.stringify({ exp: 4102444800 })).toString('base64url')}.s`;
    expect(resumeCloudSession({ expected_tenant_id: 'shop', expected_user_id: 'owner', credentials: {
      tenant_id: 'shop', user_id: 'owner', role: 'ADMIN', jwt_token: token,
    } })).toEqual({ success: true });
    expect(readAuthPayload()).toMatchObject({ jwt_token: token });
    expect(readOfflineSession()).toMatchObject({ tenant_id: 'shop', user_id: 'owner', role: 'ADMIN' });
  });
  it('does not grant recovery from remembered terminal context after sign-out', () => {
    saveOfflineSession({ tenant_id: 'shop', user_id: 'cashier', role: 'STAFF' });
    expect(clearToken().success).toBe(true);
    const token = `h.${Buffer.from(JSON.stringify({ exp: 4102444800 })).toString('base64url')}.s`;
    expect(resumeCloudSession({ expected_tenant_id: 'shop', expected_user_id: 'cashier', credentials: {
      tenant_id: 'shop', user_id: 'owner', role: 'ADMIN', jwt_token: token,
    } }).success).toBe(false);
    expect(readAuthPayload()).toBeNull();
    expect(readOfflineSession()).toBeNull();
  });
  it('rejects recovery for a different shop or a stale local session before writing credentials', () => {
    saveOfflineSession({ tenant_id: 'shop', user_id: 'cashier', role: 'STAFF', permissions: ['sales.create'] });
    const credentials = { tenant_id: 'other-shop', user_id: 'owner', role: 'ADMIN', jwt_token: 'jwt' };
    expect(resumeCloudSession({ expected_tenant_id: 'shop', expected_user_id: 'cashier', credentials }).success).toBe(false);
    expect(resumeCloudSession({ expected_tenant_id: 'shop', expected_user_id: 'old-user', credentials: { ...credentials, tenant_id: 'shop' } }).success).toBe(false);
    expect(readAuthPayload()).toBeNull(); expect(readOfflineSession()).toMatchObject({ user_id: 'cashier' });
  });
  it('generates deterministic PIN hashes scoped to tenant_id', () => {
    const hash1 = hashStaffPin('1234', 'tenant-a');
    const hash2 = hashStaffPin('1234', 'tenant-a');
    const hashOtherTenant = hashStaffPin('1234', 'tenant-b');

    expect(hash1).toBe(hash2);
    expect(hash1).not.toBe(hashOtherTenant);
  });

  it('detects configured terminal shop from settings', () => {
    raw?.prepare('INSERT INTO settings (tenant_id, key, value) VALUES (?, ?, ?)').run(
      'tenant-manaar',
      'shop_name',
      'Manaar Metals'
    );

    const config = getTerminalConfig();
    expect(config.isConfigured).toBe(true);
    expect(config.tenant_id).toBe('tenant-manaar');
    expect(config.shop_name).toBe('Manaar Metals');
  });

  it('rejects platform token and offline session persistence without side effects', () => {
    const token = `h.${Buffer.from(JSON.stringify({ role: 'SUPER_ADMIN', tenant_id: 'SYSTEM', exp: 4102444800 })).toString('base64url')}.s`;
    expect(saveToken({ jwt_token: token, role: 'ADMIN', tenant_id: 'shop', user_id: 'central' })).toMatchObject({ success: false });
    expect(saveOfflineSession({ role: 'SUPER_ADMIN', tenant_id: 'shop', user_id: 'central' })).toMatchObject({ success: false });
    expect(readAuthPayload()).toBeNull(); expect(readOfflineSession()).toBeNull();
  });

  it('rejects a legacy platform account instead of upgrading its PIN to shop ADMIN', () => {
    const tenant = 'legacy-shop';
    raw!.prepare("INSERT INTO staff(staff_id,tenant_id,staff_code,name,role_designation,biller_pin_hash,status,is_deleted) VALUES('platform',?,'P1','Platform','SUPER_ADMIN',?,'ACTIVE',0)").run(tenant, hashStaffPin('4321', tenant));
    expect(localAuthenticatePin({ pin: '4321', tenant_id: tenant })).toMatchObject({ success: false, error: expect.stringContaining('Central Web Portal') });
    expect(readOfflineSession()).toBeNull();
  });
  it('rejects platform accounts from the local password cache before returning credentials', () => {
    raw!.prepare("INSERT INTO users(user_id,tenant_id,name,email,role,password_hash,login_enabled) VALUES('platform','legacy-shop','Platform','platform@example.test','SUPER_ADMIN',?,1)").run(bcrypt.hashSync('fixture-password', 4));
    expect(localAuthenticateUser('platform@example.test', 'fixture-password')).toMatchObject({ success: false, error: expect.stringContaining('Central Web Portal') });
  });

  it('authenticates active staff with valid 4-digit PIN', () => {
    const tenantId = 'tenant-manaar';
    const pin = '4321';
    const pinHash = hashStaffPin(pin, tenantId);

    raw?.prepare('INSERT INTO settings (tenant_id, key, value) VALUES (?, ?, ?)').run(
      tenantId,
      'shop_name',
      'Manaar Metals'
    );

    raw?.prepare(
      `INSERT INTO staff (staff_id, tenant_id, staff_code, name, role_designation, biller_pin_hash, status, is_deleted)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run('staff-suhaib', tenantId, 'STF-0001', 'Suhaib', 'STAFF', pinHash, 'ACTIVE', 0);

    const result = localAuthenticatePin({ pin, tenant_id: tenantId });
    expect(result.success).toBe(true);
    expect(result.user).toBeDefined();
    expect(result.user?.name).toBe('Suhaib');
    expect(result.user?.role).toBe('STAFF');
    expect(result.user?.shop_name).toBe('Manaar Metals');
    expect(result.user?.permissions).toContain('sales.create');
  });

  it('rejects invalid PIN', () => {
    const tenantId = 'tenant-manaar';
    const pinHash = hashStaffPin('1111', tenantId);

    raw?.prepare('INSERT INTO settings (tenant_id, key, value) VALUES (?, ?, ?)').run(
      tenantId,
      'shop_name',
      'Manaar Metals'
    );

    raw?.prepare(
      `INSERT INTO staff (staff_id, tenant_id, staff_code, name, role_designation, biller_pin_hash, status, is_deleted)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run('staff-1', tenantId, 'STF-0001', 'Staff Member', 'STAFF', pinHash, 'ACTIVE', 0);

    const result = localAuthenticatePin({ pin: '9999', tenant_id: tenantId });
    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid PIN');
  });

  it('rejects PIN if staff account is INACTIVE', () => {
    const tenantId = 'tenant-manaar';
    const pin = '1234';
    const pinHash = hashStaffPin(pin, tenantId);

    raw?.prepare('INSERT INTO settings (tenant_id, key, value) VALUES (?, ?, ?)').run(
      tenantId,
      'shop_name',
      'Manaar Metals'
    );

    raw?.prepare(
      `INSERT INTO staff (staff_id, tenant_id, staff_code, name, role_designation, biller_pin_hash, status, is_deleted)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run('staff-2', tenantId, 'STF-0002', 'Inactive Staff', 'STAFF', pinHash, 'INACTIVE', 0);

    const result = localAuthenticatePin({ pin, tenant_id: tenantId });
    expect(result.success).toBe(false);
    expect(result.error).toBe('Staff account is inactive');
  });

  it('rejects PIN if linked system login is disabled', () => {
    const tenantId = 'tenant-manaar';
    const pin = '1234';
    const pinHash = hashStaffPin(pin, tenantId);

    raw?.prepare('INSERT INTO settings (tenant_id, key, value) VALUES (?, ?, ?)').run(
      tenantId,
      'shop_name',
      'Manaar Metals'
    );

    raw?.prepare(
      `INSERT INTO users (user_id, tenant_id, name, email, login_enabled, role)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run('user-3', tenantId, 'Disabled User', 'disabled@shop.com', 0, 'STAFF');

    raw?.prepare(
      `INSERT INTO staff (staff_id, tenant_id, staff_code, name, user_id, role_designation, biller_pin_hash, status, is_deleted)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run('staff-3', tenantId, 'STF-0003', 'Disabled User', 'user-3', 'STAFF', pinHash, 'ACTIVE', 0);

    const result = localAuthenticatePin({ pin, tenant_id: tenantId });
    expect(result.success).toBe(false);
    expect(result.error).toBe('System login is disabled for this account');
  });

  it('enforces multi-tenant isolation: PIN from one shop cannot login to another', () => {
    const tenantA = 'shop-a';
    const tenantB = 'shop-b';
    const pin = '5555';
    const pinHashA = hashStaffPin(pin, tenantA);

    raw?.prepare('INSERT INTO settings (tenant_id, key, value) VALUES (?, ?, ?)').run(
      tenantB,
      'shop_name',
      'Shop B'
    );

    raw?.prepare(
      `INSERT INTO staff (staff_id, tenant_id, staff_code, name, role_designation, biller_pin_hash, status, is_deleted)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run('staff-a', tenantA, 'STF-0001', 'Shop A Cashier', 'STAFF', pinHashA, 'ACTIVE', 0);

    // Terminal is registered to Shop B, cashier enters Shop A PIN
    const result = localAuthenticatePin({ pin, tenant_id: tenantB });
    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid PIN');
  });

  it('prevents deactivating Admin accounts in saveStaff', () => {
    const tenantId = 'tenant-manaar';
    raw?.prepare(
      `INSERT INTO staff (staff_id, tenant_id, staff_code, name, role_designation, status, is_deleted)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run('admin-staff', tenantId, 'STF-0000', 'Shop Owner', 'ADMIN', 'ACTIVE', 0);

    expect(() =>
      saveStaff({
        tenant_id: tenantId,
        staff_id: 'admin-staff',
        name: 'Shop Owner',
        status: 'INACTIVE',
      })
    ).toThrow('Admin accounts cannot be deactivated');
  });
  it('restores the last shop and user instead of selecting the first shop', () => {
    raw!.exec("INSERT INTO settings (tenant_id,key,value) VALUES ('shop-a','shop_name','Shop A'),('shop-b','shop_name','Shop B')");
    raw!.prepare(`INSERT INTO staff (staff_id,tenant_id,staff_code,name,role_designation,biller_pin_hash,status,is_deleted)
      VALUES ('haroon','shop-b','B1','Haroon','ADMIN',?,'ACTIVE',0)`).run(hashStaffPin('4321','shop-b'));
    expect(getTerminalConfig().isConfigured).toBe(false);
    rememberTerminalSession({ tenant_id:'shop-b',user_id:'haroon',user_name:'Haroon',shop_name:'Shop B',role:'ADMIN' });
    expect(getTerminalConfig()).toMatchObject({tenant_id:'shop-b',user_name:'Haroon',shop_name:'Shop B',role:'ADMIN'});
    expect(localAuthenticatePin({pin:'4321'})).toMatchObject({success:true,user:{tenant_id:'shop-b',name:'Haroon'}});
    expect(raw!.prepare("SELECT sync_status FROM settings WHERE key='last_active_terminal_session'").get()?.sync_status).toBe('LOCAL');
    rememberTerminalSession({ tenant_id:'shop-a',user_id:'mohammed',user_name:'Mohammed',shop_name:'Shop A',role:'ADMIN' });
    expect(getTerminalConfig()).toMatchObject({tenant_id:'shop-a',user_name:'Mohammed'});
  });
  it('does not accept non-digit PINs', () => {
    expect(localAuthenticatePin({pin:'abcd'})).toMatchObject({success:false,error:'PIN must be exactly 4 digits'});
  });

  it('keeps display context through online login, offline login and logout without keeping credentials', () => {
    expect(saveToken({tenant_id:'t1',user_id:'u1',user_name:'Mohammed',shop_name:'Shop One',role:'ADMIN',email:'qa@example.test',jwt_token:'fixture'}).success).toBe(true);
    expect(clearToken().success).toBe(true);
    expect(getTerminalConfig()).toMatchObject({tenant_id:'t1',user_name:'Mohammed',role:'ADMIN'});
    expect(saveOfflineSession({tenant_id:'t2',user_id:'u2',user_name:'Haroon',shop_name:'Shop Two',role:'STAFF'}).success).toBe(true);
    expect(clearToken().success).toBe(true);
    expect(getTerminalConfig()).toMatchObject({tenant_id:'t2',user_name:'Haroon',shop_name:'Shop Two'});
    const value=raw!.prepare("SELECT value FROM settings WHERE key='last_active_terminal_session'").get()?.value;
    expect(String(value)).not.toContain('fixture');expect(String(value)).not.toContain('jwt_token');
    expect(fs.readdirSync(state.directory)).toEqual([]);
  });

  it('preserves valid cloud token when staff authenticates with PIN on configured shop', () => {
    const tenantId = 'shop-cloud';
    saveToken({
      tenant_id: tenantId,
      user_id: 'owner-1',
      user_name: 'Shop Owner',
      shop_name: 'Cloud Metals',
      role: 'ADMIN',
      email: 'owner@example.test',
      jwt_token: 'valid.jwt.token'
    });
    raw!.prepare("INSERT INTO staff (staff_id, tenant_id, staff_code, name, role_designation, biller_pin_hash, status, is_deleted) VALUES ('staff-pin', 'shop-cloud', 'S1', 'Cashier', 'STAFF', ?, 'ACTIVE', 0)").run(hashStaffPin('1234', tenantId));
    const res = loginWithPin({ pin: '1234', tenant_id: tenantId });
    expect(res.success).toBe(true);
    expect((res as { token?: string }).token).toBe('valid.jwt.token');
    expect(getTerminalConfig()).toMatchObject({ tenant_id: tenantId, user_name: 'Cashier' });
    const configPath = path.join(state.directory, 'config.json');
    expect(fs.existsSync(configPath)).toBe(true);
    const saved = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    expect(saved.jwt_token).toBe('valid.jwt.token');
    expect(saved.user_name).toBe('Shop Owner');
    expect(readOfflineSession()).toMatchObject({ user_name: 'Cashier', role: 'STAFF' });
  });
  it('does not change the owner email/password record when an unlinked cashier signs in with PIN', () => {
    const password = 'owner-password';
    saveToken({ tenant_id: 'shop', user_id: 'owner', email: 'owner@example.test', user_name: 'Owner', role: 'ADMIN',
      jwt_token: 'valid.jwt.token', password_hash: bcrypt.hashSync(password, 4) });
    raw!.prepare("INSERT INTO staff (staff_id,tenant_id,staff_code,name,role_designation,biller_pin_hash,status,is_deleted) VALUES ('cashier','shop','C1','Cashier','STAFF',?,'ACTIVE',0)").run(hashStaffPin('1234', 'shop'));
    const original = fs.readFileSync(path.join(state.directory, 'config.json'), 'utf8');
    expect(loginWithPin({ pin: '1234', tenant_id: 'shop' }).success).toBe(true);
    expect(localAuthenticateUser('owner@example.test', password)).toMatchObject({ success: true, user: { user_id: 'owner', role: 'ADMIN' } });
    expect(fs.readFileSync(path.join(state.directory, 'config.json'), 'utf8')).toBe(original);
    expect(readOfflineSession()).toMatchObject({ user_id: 'cashier', role: 'STAFF' });
  });
  it('keeps usable terminal cloud credentials active for cached password login too', () => {
    saveToken({ tenant_id: 'shop', user_id: 'owner', role: 'ADMIN', jwt_token: 'valid.jwt.token' });
    vi.mocked(setSyncActive).mockClear();
    expect(saveOfflineSession({ tenant_id: 'shop', user_id: 'cashier', role: 'STAFF', permissions: ['sales.create'] }))
      .toMatchObject({ success: true, cloud_sync_ready: true });
    expect(setSyncActive).toHaveBeenLastCalledWith(true);
  });

  it('lockSession preserves cloud credentials for the next PIN sign-in while clearing offline user session', () => {
    const token = `h.${Buffer.from(JSON.stringify({ exp: 4102444800 })).toString('base64url')}.s`;
    saveToken({ tenant_id: 'shop', user_id: 'owner', user_name: 'Owner', shop_name: 'Shop', role: 'ADMIN', jwt_token: token });
    raw!.prepare("INSERT INTO staff (staff_id,tenant_id,staff_code,name,role_designation,biller_pin_hash,status,is_deleted) VALUES ('cashier','shop','C1','Cashier','STAFF',?,'ACTIVE',0)").run(hashStaffPin('1234', 'shop'));

    vi.mocked(setSyncActive).mockClear();
    expect(lockSession()).toEqual({ success: true, cloud_sync_ready: true });
    expect(isTerminalLocked()).toBe(true);
    expect(readOfflineSession()).toBeNull();
    expect(readAuthPayload()).toMatchObject({ jwt_token: token, tenant_id: 'shop' });
    expect(getTerminalConfig()).toMatchObject({ isConfigured: true, tenant_id: 'shop', cloud_sync_ready: true });
    expect(setSyncActive).toHaveBeenLastCalledWith(true);

    const res = loginWithPin({ pin: '1234' });
    expect(res).toMatchObject({ success: true, cloud_sync_ready: true, user: { user_id: 'cashier' } });
    expect(isTerminalLocked()).toBe(false);
    expect(readOfflineSession()).toMatchObject({ user_id: 'cashier' });
  });

  it('persists PIN lockout in SQLite across calls and clears it on online login', () => {
    const tenantId = 'shop-lockout';
    raw!.prepare("INSERT INTO settings (tenant_id, key, value) VALUES (?, 'shop_name', 'Lockout Shop')").run(tenantId);
    raw!.prepare("INSERT INTO staff (staff_id,tenant_id,staff_code,name,role_designation,biller_pin_hash,status,is_deleted) VALUES ('cashier',?,'C1','Cashier','STAFF',?,'ACTIVE',0)").run(tenantId, hashStaffPin('1234', tenantId));

    for (let i = 1; i <= 4; i++) {
      expect(localAuthenticatePin({ pin: '9999', tenant_id: tenantId })).toMatchObject({
        success: false,
        error: 'Invalid PIN',
        attempts_remaining: 5 - i,
      });
    }
    expect(localAuthenticatePin({ pin: '9999', tenant_id: tenantId })).toMatchObject({
      success: false,
      remaining_seconds: 30,
      attempts_remaining: 0,
    });
    expect(getTerminalConfig()).toMatchObject({ isConfigured: true, tenant_id: tenantId, lockout_remaining_seconds: 30 });
    expect(localAuthenticatePin({ pin: '1234', tenant_id: tenantId })).toMatchObject({
      success: false,
      attempts_remaining: 0,
    });

    saveToken({ tenant_id: tenantId, user_id: 'owner', role: 'ADMIN', jwt_token: 'valid.jwt.token' });
    expect(localAuthenticatePin({ pin: '1234', tenant_id: tenantId })).toMatchObject({ success: true });
  });

  it('checks if a user has a PIN configured and tracks lock mode accordingly', () => {
    const tenantId = 'shop-pin-check';
    raw!.prepare("INSERT INTO settings (tenant_id, key, value) VALUES (?, 'shop_name', 'Pin Check Shop')").run(tenantId);

    // 1. User without staff record has no PIN
    expect(hasUserPin({ tenant_id: tenantId, user_id: 'usr-no-pin', email: 'none@shop.com' })).toEqual({ has_pin: false });

    // 2. Staff without biller_pin_hash has no PIN
    raw!.prepare("INSERT INTO staff (staff_id, tenant_id, staff_code, name, role_designation, user_id, email, status, is_deleted) VALUES ('stf-1', ?, 'S1', 'Staff 1', 'STAFF', 'usr-1', 'staff1@shop.com', 'ACTIVE', 0)").run(tenantId);
    expect(hasUserPin({ tenant_id: tenantId, user_id: 'usr-1' })).toEqual({ has_pin: false });
    expect(hasUserPin({ tenant_id: tenantId, email: 'staff1@shop.com' })).toEqual({ has_pin: false });

    // 3. Setting PIN updates hasUserPin to true
    raw!.prepare("UPDATE staff SET biller_pin_hash = ? WHERE staff_id = 'stf-1'").run(hashStaffPin('4321', tenantId));
    expect(hasUserPin({ tenant_id: tenantId, user_id: 'usr-1' })).toEqual({ has_pin: true });
    expect(hasUserPin({ tenant_id: tenantId, email: 'STAFF1@SHOP.COM' })).toEqual({ has_pin: true });

    // 4. Inactive or deleted staff does not count as having active PIN
    raw!.prepare("UPDATE staff SET status = 'INACTIVE' WHERE staff_id = 'stf-1'").run();
    expect(hasUserPin({ tenant_id: tenantId, user_id: 'usr-1' })).toEqual({ has_pin: false });

    raw!.prepare("UPDATE staff SET status = 'ACTIVE', is_deleted = 1 WHERE staff_id = 'stf-1'").run();
    expect(hasUserPin({ tenant_id: tenantId, user_id: 'usr-1' })).toEqual({ has_pin: false });

    // 5. Locking with prefer_email sets email lock mode
    lockSession({ prefer_email: true });
    expect(isTerminalLocked()).toBe(true);
    expect(getTerminalLockMode()).toBe('email');

    // 6. Locking without prefer_email sets pin lock mode
    lockSession({ prefer_email: false });
    expect(isTerminalLocked()).toBe(true);
    expect(getTerminalLockMode()).toBe('pin');

    clearToken();
    expect(isTerminalLocked()).toBe(false);
    expect(getTerminalLockMode()).toBeNull();
  });

  it('prevents PIN collision and user switching by strictly verifying PIN against the locked user', () => {
    const tenantId = 'shop-collision-test';
    raw!.prepare("INSERT INTO settings (tenant_id, key, value) VALUES (?, 'shop_name', 'Collision Shop')").run(tenantId);

    // Two staff members have the EXACT SAME PIN '1234'
    const pinHash = hashStaffPin('1234', tenantId);
    raw!.prepare("INSERT INTO staff (staff_id, tenant_id, staff_code, name, role_designation, user_id, biller_pin_hash, status, is_deleted) VALUES ('staff-a', ?, 'SA', 'Alice', 'STAFF', 'usr-a', ?, 'ACTIVE', 0)").run(tenantId, pinHash);
    raw!.prepare("INSERT INTO staff (staff_id, tenant_id, staff_code, name, role_designation, user_id, biller_pin_hash, status, is_deleted) VALUES ('staff-b', ?, 'SB', 'Bob', 'STAFF', 'usr-b', ?, 'ACTIVE', 0)").run(tenantId, pinHash);

    // Alice locked the terminal
    saveOfflineSession({
      tenant_id: tenantId,
      user_id: 'usr-a',
      user_name: 'Alice',
      shop_name: 'Collision Shop',
      role: 'STAFF',
      permissions: ['sales.create'],
    });
    lockSession();

    // When terminal is locked for Alice, entering 1234 unlocks Alice's session, never switching to Bob
    const res = loginWithPin({ pin: '1234', tenant_id: tenantId, user_id: 'usr-a' });
    expect(res).toMatchObject({
      success: true,
      user: expect.objectContaining({ user_id: 'usr-a', name: 'Alice' }),
    });

    // Unlocking with Bob's PIN while locked for Alice fails
    const bobRes = loginWithPin({ pin: '5678', tenant_id: tenantId, user_id: 'usr-a' });
    expect(bobRes).toMatchObject({ success: false, error: 'Invalid PIN' });
  });

});

import { rememberTerminalSession } from '../../electron/services/terminalSession';
// Uses the same disposable schema as the authentication scenarios above.
