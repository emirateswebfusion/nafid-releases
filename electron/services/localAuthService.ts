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
  const existing: any = localAuthSql.findUsersByUserId(db).get(user.user_id, user.email);
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
  const user: any = localAuthSql.findUsers(db).get(email);
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
    const tenantStatusRow: any = localAuthSql.findOneSettingByKey(db).get(user.tenant_id);
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
