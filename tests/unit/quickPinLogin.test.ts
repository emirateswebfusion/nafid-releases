import { DatabaseSync } from 'node:sqlite';
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCoreTables } from '../../electron/db/schemaCoreTables';
import { createExtendedTables } from '../../electron/db/schemaExtendedTables';
import { ensureSchemaColumns } from '../../electron/db/schemaColumns';

const state = vi.hoisted(() => ({ db: null as unknown as Database.Database }));
vi.mock('../../electron/db/localDb', () => ({
  getDb: () => state.db,
  getOpenDb: () => state.db,
}));
vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => [] },
  app: { getPath: () => '' },
  safeStorage: { isEncryptionAvailable: () => false },
}));

import {
  hashStaffPin,
  getTerminalConfig,
  localAuthenticatePin,
} from '../../electron/services/localAuthService';
import { saveStaff } from '../../electron/services/staffService';

describe('Quick PIN Login & Staff Security', () => {
  let raw: DatabaseSync | undefined;

  beforeEach(() => {
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
});
