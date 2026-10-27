import { describe, expect, it } from 'vitest';
import {
  ALL_PERMISSION_KEYS,
  PERMISSION_GROUPS,
  convertLegacyRestrictedPageToPermissions,
  formatRoleName,
  hasPermission,
  isAdminRole,
  isLegacyBillerRole,
  type UserPermissions,
} from '../../src/utils/security/permissions';

describe('isAdminRole', () => {
  it('returns true for admin-equivalent roles (case-insensitive and trimmed)', () => {
    expect(isAdminRole('ADMIN')).toBe(true);
    expect(isAdminRole('admin')).toBe(true);
    expect(isAdminRole('  OWNER  ')).toBe(true);
    expect(isAdminRole('super_admin')).toBe(true);
    expect(isAdminRole('SUPER_ADMIN')).toBe(true);
    expect(isAdminRole('Administrator')).toBe(true);
  });

  it('returns false for non-admin roles and invalid values', () => {
    expect(isAdminRole('STAFF')).toBe(false);
    expect(isAdminRole('BILLER')).toBe(false);
    expect(isAdminRole('MANAGER')).toBe(false);
    expect(isAdminRole('')).toBe(false);
    expect(isAdminRole(null)).toBe(false);
    expect(isAdminRole(undefined)).toBe(false);
  });
});

describe('formatRoleName', () => {
  it('formats known roles into display names', () => {
    expect(formatRoleName('SUPER_ADMIN')).toBe('Super Admin');
    expect(formatRoleName('super_admin')).toBe('Super Admin');
    expect(formatRoleName('ADMIN')).toBe('Admin');
    expect(formatRoleName('OWNER')).toBe('Admin');
    expect(formatRoleName('ADMINISTRATOR')).toBe('Admin');
  });

  it('defaults to Staff for other roles or missing inputs', () => {
    expect(formatRoleName('STAFF')).toBe('Staff');
    expect(formatRoleName('BILLER')).toBe('Staff');
    expect(formatRoleName('MANAGER')).toBe('Staff');
    expect(formatRoleName('')).toBe('Staff');
    expect(formatRoleName(null)).toBe('Staff');
    expect(formatRoleName(undefined)).toBe('Staff');
  });
});

describe('isLegacyBillerRole', () => {
  it('returns true only for exact BILLER string', () => {
    expect(isLegacyBillerRole('BILLER')).toBe(true);
    expect(isLegacyBillerRole('biller')).toBe(false);
    expect(isLegacyBillerRole('STAFF')).toBe(false);
    expect(isLegacyBillerRole(null)).toBe(false);
    expect(isLegacyBillerRole(undefined)).toBe(false);
  });
});

describe('convertLegacyRestrictedPageToPermissions', () => {
  it('returns all permissions when restrictedPage is empty or absent', () => {
    expect(convertLegacyRestrictedPageToPermissions()).toEqual(ALL_PERMISSION_KEYS);
    expect(convertLegacyRestrictedPageToPermissions(null)).toEqual(ALL_PERMISSION_KEYS);
    expect(convertLegacyRestrictedPageToPermissions('')).toEqual(ALL_PERMISSION_KEYS);
    expect(convertLegacyRestrictedPageToPermissions('   ')).toEqual(ALL_PERMISSION_KEYS);
  });

  it('omits permissions of restricted modules', () => {
    const perms = convertLegacyRestrictedPageToPermissions('BILLING,CUSTOMERS');
    expect(perms).not.toContain('sales.create');
    expect(perms).not.toContain('sales.view');
    expect(perms).not.toContain('customers.view');
    expect(perms).toContain('products.view');
    expect(perms).toContain('purchases.view');
  });

  it('handles legacy operational control flags', () => {
    // Restricting BILLING removes sales permissions, but OPT_VIEW_GST re-adds sales.view_gst
    const perms = convertLegacyRestrictedPageToPermissions('BILLING,OPT_VIEW_GST,OPT_VIEW_COST');
    expect(perms).toContain('sales.view_gst');
    expect(perms).toContain('products.view_gst');
    expect(perms).toContain('purchases.view_gst');
    expect(perms).toContain('products.view_cost');
    expect(perms).not.toContain('sales.create');
  });
});

describe('hasPermission', () => {
  it('returns false when user is null or undefined', () => {
    expect(hasPermission(null, 'sales.create')).toBe(false);
    expect(hasPermission(undefined, 'sales.create')).toBe(false);
  });

  it('always grants dashboard access to any user', () => {
    const emptyUser: UserPermissions = { role: 'STAFF', permissions: [] };
    expect(hasPermission(emptyUser, 'dashboard.view')).toBe(true);
    expect(hasPermission(emptyUser, 'dashboard')).toBe(true);
  });

  it('bypasses all checks for admin and owner roles', () => {
    for (const role of ['ADMIN', 'admin', 'SUPER_ADMIN', 'OWNER']) {
      const user: UserPermissions = { role, permissions: [] };
      expect(hasPermission(user, 'sales.create')).toBe(true);
      expect(hasPermission(user, 'settings.business')).toBe(true);
      expect(hasPermission(user, 'nonexistent.permission')).toBe(true);
    }
  });

  it('bypasses checks when wildcard * permission is present', () => {
    const user: UserPermissions = { role: 'STAFF', permissions: ['*'] };
    expect(hasPermission(user, 'sales.delete')).toBe(true);
  });

  it('grants permission on direct match', () => {
    const user: UserPermissions = { role: 'STAFF', permissions: ['sales.discount'] };
    expect(hasPermission(user, 'sales.discount')).toBe(true);
    expect(hasPermission(user, 'sales.delete')).toBe(false);
  });

  it('propagates parent permissions to child permissions', () => {
    const viewer: UserPermissions = { role: 'STAFF', permissions: ['sales.view', 'products.view'] };
    expect(hasPermission(viewer, 'sales.view_gst')).toBe(true);
    expect(hasPermission(viewer, 'sales.view_estimate')).toBe(true);
    expect(hasPermission(viewer, 'products.view_gst')).toBe(true);
    expect(hasPermission(viewer, 'products.view_estimate')).toBe(true);

    const creator: UserPermissions = { role: 'STAFF', permissions: ['sales.create', 'products.create', 'purchases.view'] };
    expect(hasPermission(creator, 'sales.create_gst')).toBe(true);
    expect(hasPermission(creator, 'sales.create_estimate')).toBe(true);
    expect(hasPermission(creator, 'products.create_gst')).toBe(true);
    expect(hasPermission(creator, 'products.create_estimate')).toBe(true);
    expect(hasPermission(creator, 'purchases.view_gst')).toBe(true);
  });

  it('propagates child permissions to parent view / create checks', () => {
    const biller: UserPermissions = { role: 'STAFF', permissions: ['sales.create_gst'] };
    expect(hasPermission(biller, 'sales.create')).toBe(true);

    const reprinter: UserPermissions = { role: 'STAFF', permissions: ['sales.reprint'] };
    expect(hasPermission(reprinter, 'sales.view')).toBe(true);

    const cashUser: UserPermissions = { role: 'STAFF', permissions: ['cash_register.cash_in'] };
    expect(hasPermission(cashUser, 'cash_register.view')).toBe(true);
  });

  it('requires products.create explicitly while retaining broad products.view fallback', () => {
    const readOnlyUser: UserPermissions = { role: 'STAFF', permissions: ['products.view'] };
    expect(hasPermission(readOnlyUser, 'products.view')).toBe(true);
    expect(hasPermission(readOnlyUser, 'products.view_gst')).toBe(true);
    expect(hasPermission(readOnlyUser, 'products.create')).toBe(false);

    const productEditor: UserPermissions = { role: 'STAFF', permissions: ['products.edit'] };
    expect(hasPermission(productEditor, 'products.create')).toBe(false);

    const productCreator: UserPermissions = { role: 'STAFF', permissions: ['products.create'] };
    expect(hasPermission(productCreator, 'products.create')).toBe(true);
    expect(hasPermission(productCreator, 'products.create_gst')).toBe(true);
  });

  it('falls back to restrictedPage string when permissions list is missing', () => {
    const legacyUser: UserPermissions = { role: 'STAFF', permissions: null, restrictedPage: 'INVENTORY' };
    expect(hasPermission(legacyUser, 'sales.create')).toBe(true);
    expect(hasPermission(legacyUser, 'products.create')).toBe(false);
  });
});

describe('PERMISSION_GROUPS and ALL_PERMISSION_KEYS', () => {
  it('contains expected group definitions with unique non-empty keys', () => {
    expect(PERMISSION_GROUPS.length).toBeGreaterThan(5);
    const seen = new Set<string>();
    for (const key of ALL_PERMISSION_KEYS) {
      expect(key.length).toBeGreaterThan(0);
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });
});
