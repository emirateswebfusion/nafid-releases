import type { SettingRow, UserRow } from './typesB.js';
import crypto from 'node:crypto';
import { readTerminalSession, parseTerminalSession } from './terminalSession.js';
import { readAuthPayload, readOfflineSession } from './authStorage.js';
import { cloudTokenUnusable } from '../sync/syncAuth.js';
import { syncState } from '../sync/syncState.js';
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


const PIN_MAX_ATTEMPTS = 5;
const PIN_LOCKOUT_MS = 30_000;

interface PinLockoutEntry { attempts: number; lockedUntil: number }

function readPinLockoutMap(): Record<string, PinLockoutEntry> {
  const db = getOpenDb();
  if (!db) return {};
  try {
    const row = localAuthSql.readPinLockout(db).get() as { value?: string } | undefined;
    if (!row?.value) return {};
    const parsed = JSON.parse(row.value) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, PinLockoutEntry>
      : {};
  } catch {
    return {};
  }
}

function writePinLockoutMap(map: Record<string, PinLockoutEntry>): void {
  const db = getOpenDb();
  if (!db) return;
  try {
    if (Object.keys(map).length === 0) localAuthSql.clearPinLockout(db).run();
    else localAuthSql.savePinLockout(db).run(JSON.stringify(map));
  } catch { /* ignore when settings unavailable */ }
}

/** Clears persistent PIN attempt counters for a shop (e.g. after valid PIN or online login). */
export function clearPinLockout(tenantId?: string): void {
  if (!tenantId) return;
  const map = readPinLockoutMap();
  if (!(tenantId in map)) return;
  delete map[tenantId];
  writePinLockoutMap(map);
}

/** Returns current PIN lockout status for a shop, expiring stale lockouts automatically. */
export function getPinLockoutStatus(tenantId?: string): { locked: boolean; remainingSeconds: number; attemptsRemaining: number } {
  if (!tenantId) return { locked: false, remainingSeconds: 0, attemptsRemaining: PIN_MAX_ATTEMPTS };
  const map = readPinLockoutMap();
  const entry = map[tenantId];
  if (!entry) return { locked: false, remainingSeconds: 0, attemptsRemaining: PIN_MAX_ATTEMPTS };
  const now = Date.now();
  if (entry.lockedUntil > now) {
    return {
      locked: true,
      remainingSeconds: Math.max(1, Math.ceil((entry.lockedUntil - now) / 1000)),
      attemptsRemaining: 0,
    };
  }
  if (entry.lockedUntil > 0) {
    delete map[tenantId];
    writePinLockoutMap(map);
    return { locked: false, remainingSeconds: 0, attemptsRemaining: PIN_MAX_ATTEMPTS };
  }
  const attempts = Math.max(0, Number(entry.attempts) || 0);
  return { locked: false, remainingSeconds: 0, attemptsRemaining: Math.max(0, PIN_MAX_ATTEMPTS - attempts) };
}

function recordPinFailure(tenantId: string): { locked: boolean; remainingSeconds: number; attemptsRemaining: number } {
  const map = readPinLockoutMap();
  const now = Date.now();
  const current = map[tenantId];
  const baseAttempts = current && current.lockedUntil === 0 ? (Number(current.attempts) || 0) : 0;
  const attempts = baseAttempts + 1;
  if (attempts >= PIN_MAX_ATTEMPTS) {
    map[tenantId] = { attempts: PIN_MAX_ATTEMPTS, lockedUntil: now + PIN_LOCKOUT_MS };
    writePinLockoutMap(map);
    return { locked: true, remainingSeconds: Math.ceil(PIN_LOCKOUT_MS / 1000), attemptsRemaining: 0 };
  }
  map[tenantId] = { attempts, lockedUntil: 0 };
  writePinLockoutMap(map);
  return { locked: false, remainingSeconds: 0, attemptsRemaining: PIN_MAX_ATTEMPTS - attempts };
}

export function hashStaffPin(pin: string, tenantId: string): string {
  return crypto.createHash('sha256').update(`${pin}:${tenantId}`).digest('hex');
}

function isTerminalCloudSyncReady(tenantId?: string): boolean {
  if (!tenantId) return false;
  const auth = readAuthPayload();
  return Boolean(
    auth?.tenant_id === tenantId &&
    auth?.jwt_token &&
    !cloudTokenUnusable(auth.jwt_token) &&
    !syncState.authExpiredNotified
  );
}

export function getTerminalConfig(): {
  isConfigured: boolean; tenant_id?: string; shop_name?: string; user_name?: string; role?: string; user_id?: string;
  cloud_sync_ready?: boolean; lockout_remaining_seconds?: number;
} {
  const db = getOpenDb();
  if (!db) return { isConfigured: false };
  const session = readTerminalSession() || parseTerminalSession(readOfflineSession()) || parseTerminalSession(readAuthPayload());
  if (session) {
    const lockout = getPinLockoutStatus(session.tenant_id);
    return {
      isConfigured: true,
      ...session,
      cloud_sync_ready: isTerminalCloudSyncReady(session.tenant_id),
      ...(lockout.locked ? { lockout_remaining_seconds: lockout.remainingSeconds } : {}),
    };
  }
  // An older install with multiple shops needs an explicit email login to choose the shop.
  const tenants = localAuthSql.listConfiguredTenants(db).all() as { tenant_id: string }[];
  if (tenants.length !== 1) return { isConfigured: false };
  const tenantId = tenants[0].tenant_id;
  const shop = localAuthSql.findSettingShopName(db).get(tenantId, tenantId) as { value?: string } | undefined;
  const lockout = getPinLockoutStatus(tenantId);
  return {
    isConfigured: true,
    tenant_id: tenantId,
    shop_name: shop?.value || 'My Shop',
    cloud_sync_ready: isTerminalCloudSyncReady(tenantId),
    ...(lockout.locked ? { lockout_remaining_seconds: lockout.remainingSeconds } : {}),
  };
}

export function localAuthenticatePin(payload: { pin: string; tenant_id?: string }): {
  success: boolean;
  error?: string;
  remaining_seconds?: number;
  attempts_remaining?: number;
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
  if (!pin || !/^\d{4}$/.test(pin.trim())) {
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

  const lockout = getPinLockoutStatus(tenantId);
  if (lockout.locked) {
    return {
      success: false,
      error: `Too many failed attempts. Locked for ${lockout.remainingSeconds}s.`,
      remaining_seconds: lockout.remainingSeconds,
      attempts_remaining: 0,
    };
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

  const fail = (reason: string) => {
    const next = recordPinFailure(tenantId);
    return next.locked
      ? { success: false, error: `Too many failed attempts. Locked for ${next.remainingSeconds}s.`, remaining_seconds: next.remainingSeconds, attempts_remaining: 0 }
      : { success: false, error: reason, attempts_remaining: next.attemptsRemaining };
  };

  const staff = localAuthSql.findStaffByPinHash(db).get(tenantId, pinHash) as StaffPinRow | undefined;
  if (!staff) return fail('Invalid PIN');
  if (staff.status !== 'ACTIVE') return fail('Staff account is inactive');
  if (staff.user_login_enabled === 0) return fail('System login is disabled for this account');

  clearPinLockout(tenantId);

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

/** Checks whether a specific user/staff has an active 4-digit PIN configured. */
export function hasUserPin(params: { tenant_id?: string; user_id?: string; email?: string }): { has_pin: boolean } {
  const db = getOpenDb();
  if (!db || !params?.tenant_id || (!params.user_id && !params.email)) return { has_pin: false };
  try {
    const tenantId = params.tenant_id.trim();
    const userId = params.user_id?.trim() || '__NO_USER__';
    const email = params.email?.trim().toLowerCase() || '__NO_EMAIL__';
    const row = localAuthSql.checkUserHasPin(db).get(tenantId, userId, userId, userId, email, email);
    return { has_pin: Boolean(row) };
  } catch {
    return { has_pin: false };
  }
}
