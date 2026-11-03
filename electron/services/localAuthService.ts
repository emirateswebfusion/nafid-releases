import type { SettingRow, UserRow } from './typesB.js';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { getOpenDb } from '../db/localDb.js';
import { toIsoTimestamp } from '../utils/timestamps.js';
import * as localAuthSql from '../db/statements/localAuth.js';

/** Offline login: caches cloud users locally (bcrypt hash) and authenticates against them when the network is down. */

export function parsePermissionList(value: unknown, restrictedPage?: unknown): string[] {
  let perms: string[] = [];
  if (Array.isArray(value)) perms = value.filter((permission): permission is string => typeof permission === 'string' && permission !== '*');
  else if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) perms = parsed.filter((permission): permission is string => typeof permission === 'string' && permission !== '*');
    } catch {
      perms = [];
    }
  }

  if (perms.length === 0 && typeof restrictedPage === 'string' && restrictedPage.trim()) {
    const list = restrictedPage.split(',').map(s => s.trim().toUpperCase());
    if (!list.includes('BILLING')) {
      perms.push('sales.view', 'sales.view_gst', 'sales.view_estimate', 'sales.create', 'sales.create_gst', 'sales.create_estimate', 'sales.edit', 'sales.delete', 'sales.discount', 'sales.refund', 'sales.reprint');
    }
    if (!list.includes('INVENTORY')) perms.push('products.view', 'products.view_gst', 'products.view_estimate', 'products.create', 'products.create_gst', 'products.create_estimate', 'products.edit', 'products.stock_adjust');
    if (!list.includes('CUSTOMERS')) perms.push('customers.view', 'customers.create', 'customers.edit', 'customers.ledger');
    if (!list.includes('PURCHASES')) perms.push('purchases.view', 'purchases.view_gst', 'purchases.view_estimate', 'purchases.create', 'purchases.edit');
    if (!list.includes('CASH_REGISTER')) perms.push('cash_register.view', 'cash_register.cash_in', 'cash_register.cash_out', 'cash_register.settlement');
    if (!list.includes('QUOTATIONS')) perms.push('quotations.view', 'quotations.create', 'quotations.edit');
    if (!list.includes('SCRAP')) perms.push('scrap.view', 'scrap.create', 'scrap.edit');
    if (!list.includes('WARRANTY')) perms.push('warranties.view', 'warranties.create', 'warranties.edit');
    if (!list.includes('REPORTS')) perms.push('reports.view', 'reports.financial', 'reports.export');
    if (!list.includes('SETTINGS')) perms.push('settings.view', 'settings.edit');
  }

  return perms;
}

// ── Local User Authentication Caching ──────────────────────────────────────
export function localSaveUser(user: {
  user_id: string;
  tenant_id: string;
  name: string;
  email: string;
  password_hash?: string;
  clear_password_hash?: boolean;
  role?: string;
  restricted_page?: string;
  permissions?: string[];
  login_enabled?: boolean;
}) {
  const db = getOpenDb();
  if (!db || !user.email) return;
  const existing: UserRow = localAuthSql.findUsersByUserId(db).get(user.user_id, user.email) as UserRow;
  const now = toIsoTimestamp();

  if (existing) {
    localAuthSql.updateUserByUserId(db).run(
      user.user_id,
      user.tenant_id,
      user.name || user.email,
      user.email,
      user.role || 'STAFF',
      user.clear_password_hash ? 1 : 0,
      user.password_hash || null,
      user.restricted_page || null,
      user.permissions === undefined ? null : JSON.stringify(user.permissions),
      user.login_enabled === undefined ? null : (user.login_enabled ? 1 : 0),
      existing.user_id
    );
  } else {
    localAuthSql.insertUser(db).run(
      user.user_id || crypto.randomUUID(),
      user.tenant_id,
      user.name || user.email,
      user.email,
      user.password_hash || null,
      user.role || 'STAFF',
      user.restricted_page || null,
      JSON.stringify(user.permissions || []),
      user.login_enabled === false ? 0 : 1,
      now
    );
  }
}

export function localAuthenticateUser(email: string, password: string): {
  success: boolean;
  error?: string;
  user?: {
    user_id: string;
    tenant_id: string;
    name: string;
    email: string;
    role: string;
    restricted_page?: string;
    permissions: string[];
    login_enabled: boolean;
  };
} {
  const db = getOpenDb();
  if (!db) return { success: false, error: 'Local database unavailable' };
  const user: UserRow = localAuthSql.findUsers(db).get(email) as UserRow;
  if (!user) {
    return { success: false, error: 'User not found in local database cache. Please login online once.' };
  }
  if (!user.password_hash) {
    return { success: false, error: 'Local password hash missing. Please login online once to sync credentials.' };
  }
  if (user.login_enabled === 0) {
    return { success: false, error: 'System login is disabled for this account' };
  }

  try {
    const tenantStatusRow: SettingRow = localAuthSql.findOneSettingByKey(db).get(user.tenant_id) as SettingRow;
    if (tenantStatusRow?.value === 'TERMINATED' || tenantStatusRow?.value === 'SUSPENDED') {
      return { success: false, error: 'This store subscription has been terminated or suspended by administration.' };
    }
  } catch { /* ignore */ }

  const isValid = bcrypt.compareSync(password, user.password_hash);
  if (!isValid) {
    return { success: false, error: 'Invalid credentials' };
  }

  return {
    success: true,
    user: {
      user_id: user.user_id,
      tenant_id: user.tenant_id,
      name: user.name,
      email: user.email,
      role: user.role,
      permissions: parsePermissionList(user.permissions, user.restricted_page),
      login_enabled: user.login_enabled !== 0,
      restricted_page: user.restricted_page,
    }
  };
}


export function hashStaffPin(pin: string, tenantId: string): string {
  return crypto.createHash('sha256').update(`${pin}:${tenantId}`).digest('hex');
}

export function getTerminalConfig(): {
  isConfigured: boolean;
  tenant_id?: string;
  shop_name?: string;
} {
  const db = getOpenDb();
  if (!db) return { isConfigured: false };
  try {
    const activeSetting = localAuthSql.findActiveTenant(db).get() as { tenant_id?: string; shop_name?: string } | undefined;
    if (activeSetting?.tenant_id) {
      return {
        isConfigured: true,
        tenant_id: activeSetting.tenant_id,
        shop_name: activeSetting.shop_name || 'My Shop',
      };
    }
    const anyUser = localAuthSql.findAnyTenant(db).get() as { tenant_id?: string; shop_name?: string } | undefined;
    if (anyUser?.tenant_id) {
      return {
        isConfigured: true,
        tenant_id: anyUser.tenant_id,
        shop_name: anyUser.shop_name || 'My Shop',
      };
    }
    return { isConfigured: false };
  } catch {
    return { isConfigured: false };
  }
}

export function localAuthenticatePin(payload: { pin: string; tenant_id?: string }): {
  success: boolean;
  error?: string;
  user?: {
    user_id: string;
    tenant_id: string;
    name: string;
    email: string | null;
    role: 'ADMIN' | 'STAFF';
    permissions: string[];
    shop_name?: string;
  };
} {
  const db = getOpenDb();
  if (!db) return { success: false, error: 'Local database unavailable' };

  const { pin } = payload || {};
  if (!pin || pin.trim().length !== 4) {
    return { success: false, error: 'PIN must be exactly 4 digits' };
  }

  let tenantId = payload?.tenant_id?.trim();
  let shopName = 'My Shop';

  if (!tenantId) {
    const config = getTerminalConfig();
    if (!config.isConfigured || !config.tenant_id) {
      return { success: false, error: 'Terminal not configured with any store. Please login with Email & Password first.' };
    }
    tenantId = config.tenant_id;
    if (config.shop_name) shopName = config.shop_name;
  } else {
    try {
      const snRow = localAuthSql.findSettingShopName(db).get(tenantId, tenantId) as { value?: string } | undefined;
      if (snRow?.value) shopName = snRow.value;
    } catch { /* ignore */ }
  }

  try {
    const tenantStatusRow: SettingRow = localAuthSql.findOneSettingByKey(db).get(tenantId) as SettingRow;
    if (tenantStatusRow?.value === 'TERMINATED' || tenantStatusRow?.value === 'SUSPENDED') {
      return { success: false, error: 'This store subscription has been terminated or suspended by administration.' };
    }
  } catch { /* ignore */ }

  const pinHash = hashStaffPin(pin.trim(), tenantId);
  interface StaffPinRow {
    staff_id: string;
    staff_code: string;
    name: string;
    role_designation: string | null;
    user_id: string | null;
    status: string;
    tenant_id: string;
    user_email: string | null;
    user_role: string | null;
    user_permissions: string | null;
    user_restricted_page: string | null;
    user_login_enabled: number | null;
  }

  const staff = localAuthSql.findStaffByPinHash(db).get(tenantId, pinHash) as StaffPinRow | undefined;
  if (!staff) {
    return { success: false, error: 'Invalid PIN' };
  }

  if (staff.status !== 'ACTIVE') {
    return { success: false, error: 'Staff account is inactive' };
  }

  if (staff.user_login_enabled === 0) {
    return { success: false, error: 'System login is disabled for this account' };
  }

  const rawRole = (staff.user_role || staff.role_designation || '').toUpperCase();
  const isAdmin = rawRole === 'ADMIN' || rawRole === 'OWNER' || rawRole === 'SUPER_ADMIN' || rawRole === 'ADMINISTRATOR';
  const role: 'ADMIN' | 'STAFF' = isAdmin ? 'ADMIN' : 'STAFF';

  const permissions = isAdmin
    ? ['*']
    : parsePermissionList(staff.user_permissions, staff.user_restricted_page);

  const finalPermissions = permissions.length > 0 ? permissions : ['sales.view', 'sales.create', 'sales.reprint'];
  const resolvedUserId = staff.user_id || staff.staff_id;

  return {
    success: true,
    user: {
      user_id: resolvedUserId,
      tenant_id: tenantId,
      name: staff.name,
      email: staff.user_email || null,
      role,
      permissions: finalPermissions,
      shop_name: shopName,
    }
  };
}
