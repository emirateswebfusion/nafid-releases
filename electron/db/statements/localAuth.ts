import type { Db } from './types.js';

/** SQL statements used by services/localAuthService.ts. Each factory prepares its statement on the given connection. */

export const findUsersByUserId = (db: Db) => db.prepare(`SELECT user_id, password_hash FROM users WHERE user_id = ? OR LOWER(email) = LOWER(?)`);

export const updateUserByUserId = (db: Db) => db.prepare(`
      UPDATE users SET
        user_id = ?, tenant_id = ?, name = ?, email = ?, role = COALESCE(?, role),
        password_hash = CASE WHEN ? = 1 THEN NULL ELSE COALESCE(?, password_hash) END,
        restricted_page = COALESCE(?, restricted_page),
        permissions = COALESCE(?, permissions),
        login_enabled = COALESCE(?, login_enabled)
      WHERE user_id = ?
    `);

export const insertUser = (db: Db) => db.prepare(`
      INSERT INTO users (user_id, tenant_id, name, email, password_hash, role, restricted_page, permissions, login_enabled, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

export const findUsers = (db: Db) => db.prepare(`SELECT user_id, tenant_id, name, email, role, password_hash, restricted_page, permissions, login_enabled FROM users WHERE LOWER(email) = LOWER(?)`);

export const findOneSettingByKey = (db: Db) => db.prepare(`SELECT value FROM settings WHERE key = 'tenant_status' AND (tenant_id = ? OR tenant_id = 'global') LIMIT 1`);

export const findActiveTenant = (db: Db) => db.prepare(`
  SELECT tenant_id, value as shop_name
  FROM settings
  WHERE key = 'shop_name' AND tenant_id != 'global' AND tenant_id IS NOT NULL AND TRIM(tenant_id) != ''
  LIMIT 1
`);

export const findAnyTenant = (db: Db) => db.prepare(`
  SELECT tenant_id, name as shop_name FROM users WHERE tenant_id IS NOT NULL AND TRIM(tenant_id) != '' LIMIT 1
`);

export const findStaffByPinHash = (db: Db) => db.prepare(`
  SELECT s.staff_id, s.staff_code, s.name, s.role_designation, s.user_id, s.status, s.tenant_id,
         u.email as user_email, u.role as user_role, u.permissions as user_permissions,
         u.restricted_page as user_restricted_page, u.login_enabled as user_login_enabled
  FROM staff s
  LEFT JOIN users u ON (u.user_id = s.user_id OR LOWER(u.email) = LOWER(s.email)) AND u.tenant_id = s.tenant_id
  WHERE s.tenant_id = ? AND s.biller_pin_hash = ? AND s.is_deleted = 0
`);

export const findSettingShopName = (db: Db) => db.prepare(`
  SELECT value FROM settings WHERE (tenant_id = ? OR tenant_id = 'global') AND key = 'shop_name' ORDER BY (CASE WHEN tenant_id = ? THEN 1 ELSE 2 END) ASC LIMIT 1
`);


/** Last successful session belongs to this PC and must never sync between terminals. */
export const saveTerminalSession = (db: Db) => db.prepare(`
  INSERT INTO settings (tenant_id, key, value, sync_status, updated_at)
  VALUES ('global', 'last_active_terminal_session', ?, 'LOCAL', CURRENT_TIMESTAMP)
  ON CONFLICT(tenant_id, key) DO UPDATE SET value = excluded.value, sync_status = 'LOCAL', updated_at = CURRENT_TIMESTAMP
`);
export const readTerminalSession = (db: Db) => db.prepare(`SELECT value FROM settings WHERE tenant_id = 'global' AND key = 'last_active_terminal_session'`);
export const readPinLockout = (db: Db) => db.prepare(`SELECT value FROM settings WHERE tenant_id = 'global' AND key = 'pin_lockout_state'`);
export const savePinLockout = (db: Db) => db.prepare(`
  INSERT INTO settings (tenant_id, key, value, sync_status, updated_at)
  VALUES ('global', 'pin_lockout_state', ?, 'LOCAL', CURRENT_TIMESTAMP)
  ON CONFLICT(tenant_id, key) DO UPDATE SET value = excluded.value, sync_status = 'LOCAL', updated_at = CURRENT_TIMESTAMP
`);
export const clearPinLockout = (db: Db) => db.prepare(`DELETE FROM settings WHERE tenant_id = 'global' AND key = 'pin_lockout_state'`);
export const listConfiguredTenants = (db: Db) => db.prepare(`
  SELECT tenant_id FROM settings WHERE key = 'shop_name' AND tenant_id NOT IN ('global', 'unset', '')
  UNION SELECT tenant_id FROM users WHERE tenant_id NOT IN ('global', 'unset', '')
`);
