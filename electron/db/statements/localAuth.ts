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
