import type { Db } from './types.js';

/** SQL statements used by services/staffService.ts. Each factory prepares its statement on the given connection. */

export const updateStaffUserId = (db: Db) => db.prepare(`
      UPDATE staff SET user_id = (
        SELECT u.user_id FROM users u 
        WHERE LOWER(u.email) = LOWER(staff.email) AND (u.tenant_id = staff.tenant_id OR staff.tenant_id = 'global')
        LIMIT 1
      )
      WHERE user_id IS NULL AND email IS NOT NULL AND (tenant_id = ? OR ? = 'global')
    `);

export const findUsers = (db: Db) => db.prepare(`
      SELECT u.user_id, u.tenant_id, u.name, u.email, u.role
      FROM users u
      LEFT JOIN staff s ON s.user_id = u.user_id AND (s.tenant_id = u.tenant_id OR s.tenant_id = 'global')
      WHERE s.staff_id IS NULL AND (u.tenant_id = ? OR ? = 'global')
    `);

export const insertStaff = (db: Db) => db.prepare(`
        INSERT OR IGNORE INTO staff (
          staff_id, tenant_id, staff_code, name, phone, email, role_designation, user_id, status, sync_status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, NULL, ?, ?, ?, 'ACTIVE', 'SYNCED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `);

export const countStaff = (db: Db) => db.prepare('SELECT COUNT(*) as cnt FROM staff WHERE tenant_id = ?');

export const findStaffByStaffId = (db: Db) => db.prepare(`
    SELECT s.*, u.email as user_email, u.role as user_role, u.permissions as user_permissions,
      u.login_enabled as user_login_enabled
    FROM staff s
    LEFT JOIN users u ON s.user_id = u.user_id
    WHERE s.staff_id = ? AND s.tenant_id = ? AND s.is_deleted = 0
  `);

export const findOneStaffLedgerByStaffId = (db: Db) => db.prepare(`
    SELECT COALESCE(running_balance, 0) as balance
    FROM staff_ledger
    WHERE staff_id = ? AND tenant_id = ?
    ORDER BY created_at DESC, ledger_id DESC
    LIMIT 1
  `);

export const findStaffByStaffIdStaffIdAndStaffCode = (db: Db) => db.prepare('SELECT staff_id, staff_code, biller_pin_hash FROM staff WHERE staff_id = ? AND tenant_id = ?');

export const findStaffByBillerPinHashAndStatus = (db: Db) => db.prepare(`SELECT staff_id FROM staff WHERE tenant_id = ? AND biller_pin_hash = ? AND staff_id != ? AND is_deleted = 0 AND status = 'ACTIVE'`);

export const updateStaffByStaffId = (db: Db) => db.prepare(`
      UPDATE staff SET
        name = ?, phone = ?, email = ?, role_designation = ?, user_id = ?,
        biller_pin_hash = ?, joining_date = ?, monthly_salary = ?, status = COALESCE(?, status),
        sync_status = 'PENDING', updated_at = ?
      WHERE staff_id = ? AND tenant_id = ?
    `);

export const insertStaff2 = (db: Db) => db.prepare(`
      INSERT INTO staff (
        staff_id, tenant_id, staff_code, name, phone, email, role_designation, user_id,
        biller_pin_hash, joining_date, monthly_salary, status, sync_status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)
    `);

export const findOneStaffSalaryByStaffId = (db: Db) => db.prepare(`SELECT monthly_salary FROM staff_salaries WHERE staff_id = ? AND tenant_id = ? ORDER BY effective_date DESC LIMIT 1`);

export const insertStaffSalary = (db: Db) => db.prepare(`
        INSERT INTO staff_salaries (salary_id, tenant_id, staff_id, monthly_salary, effective_date, notes, sync_status, created_at)
        VALUES (?, ?, ?, ?, ?, 'Salary updated', 'PENDING', ?)
      `);

export const findStaffByBillerPinHash = (db: Db) => db.prepare(`
    SELECT staff_id, staff_code, name, role_designation, status
    FROM staff
    WHERE tenant_id = ? AND biller_pin_hash = ? AND is_deleted = 0
  `);

export const findStaffLedgerByStaffId = (db: Db) => db.prepare(`
    SELECT * FROM staff_ledger
    WHERE tenant_id = ? AND staff_id = ?
    ORDER BY transaction_date DESC, created_at DESC, ledger_id DESC
  `);

export const findStaffByStaffIdStaffIdAndName = (db: Db) => db.prepare('SELECT staff_id, name FROM staff WHERE staff_id = ? AND tenant_id = ?');

export const findOneCashDrawerByStatus = (db: Db) => db.prepare(`SELECT drawer_id FROM cash_drawer WHERE tenant_id = ? AND status = 'OPEN' ORDER BY opened_at DESC LIMIT 1`);

export const insertCashTransaction = (db: Db) => db.prepare(`
        INSERT INTO cash_transactions (
          transaction_id, tenant_id, drawer_id, type, amount, category, notes,
          reference_number, entered_by, entered_by_name, transaction_date, sync_status, created_at, updated_at
        ) VALUES (?, ?, ?, 'CASH_OUT', ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)
      `);

export const updateCashDrawerByDrawerId = (db: Db) => db.prepare(`
        UPDATE cash_drawer
        SET cash_out = cash_out + ?,
            current_cash = opening_balance + cash_sales + cash_in - (cash_out + ?),
            expected_closing = opening_balance + cash_sales + cash_in - (cash_out + ?),
            updated_at = ?
        WHERE drawer_id = ?
      `);

export const insertStaffTransaction = (db: Db) => db.prepare(`
    INSERT INTO staff_transactions (
      transaction_id, tenant_id, staff_id, type, amount, payment_method, payment_source_id,
      cash_transaction_id, reference_number, notes, created_by, created_by_name,
      transaction_date, sync_status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)
  `);

export const findOneStaffLedgerByStaffId2 = (db: Db) => db.prepare(`
    SELECT running_balance FROM staff_ledger
    WHERE tenant_id = ? AND staff_id = ?
    ORDER BY transaction_date DESC, created_at DESC, ledger_id DESC
    LIMIT 1
  `);

export const insertStaffLedger = (db: Db) => db.prepare(`
    INSERT INTO staff_ledger (
      ledger_id, tenant_id, staff_id, transaction_id, transaction_date, description,
      debit_amount, credit_amount, running_balance, reference_type, created_by, sync_status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)
  `);

export const findStaffLedgerByStaffId2 = (db: Db) => db.prepare(`
    SELECT ledger_id, debit_amount, credit_amount 
    FROM staff_ledger 
    WHERE staff_id = ? AND (tenant_id = ? OR tenant_id = 'global')
    ORDER BY transaction_date ASC, created_at ASC, ledger_id ASC
  `);

export const updateStaffLedgerRunningBalance = (db: Db) => db.prepare(`UPDATE staff_ledger SET running_balance = ? WHERE ledger_id = ?`);

export const findStaffAttendanceByStaffIdAndDate = (db: Db) => db.prepare(`SELECT attendance_id FROM staff_attendance WHERE tenant_id = ? AND staff_id = ? AND date = ?`);

export const updateStaffAttendanceByAttendanceId = (db: Db) => db.prepare(`
      UPDATE staff_attendance SET
        status = ?, check_in_time = COALESCE(?, check_in_time), check_out_time = COALESCE(?, check_out_time),
        notes = COALESCE(?, notes), created_by = COALESCE(?, created_by), sync_status = 'PENDING', updated_at = ?
      WHERE attendance_id = ?
    `);

export const insertStaffAttendance = (db: Db) => db.prepare(`
      INSERT INTO staff_attendance (
        attendance_id, tenant_id, staff_id, date, status, check_in_time, check_out_time,
        notes, created_by, sync_status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)
    `);

/** Builds and prepares the dynamic query of `getStaff` (filters appended in code; user values are bound). */
export function getStaffStatement(db: Db, args: { tenantId: string; params: { tenant_id: string; search?: string | undefined; status?: string | undefined; } }) {
  const { tenantId, params } = args;
  let sql = `
    SELECT s.*, u.email as user_email, u.role as user_role, u.permissions as user_permissions,
      u.restricted_page as user_restricted_page,
      u.login_enabled as user_login_enabled,
      (
        SELECT COALESCE(running_balance, 0)
        FROM staff_ledger sl
        WHERE sl.staff_id = s.staff_id AND sl.tenant_id = s.tenant_id
        ORDER BY sl.created_at DESC, sl.ledger_id DESC
        LIMIT 1
      ) as current_balance
    FROM staff s
    LEFT JOIN users u ON s.user_id = u.user_id
    WHERE (s.tenant_id = ? OR ? = 'global') AND s.is_deleted = 0
  `;
  const sqlParams: any[] = [tenantId, tenantId];
  if (params.status && params.status !== 'ALL') {
    sql += ` AND s.status = ?`;
    sqlParams.push(params.status);
  }
  if (params.search && params.search.trim()) {
    const q = `%${params.search.trim()}%`;
    sql += ` AND (s.name LIKE ? OR s.phone LIKE ? OR s.email LIKE ? OR s.staff_code LIKE ?)`;
    sqlParams.push(q, q, q, q);
  }
  sql += ` ORDER BY s.status ASC, s.created_at DESC`;
  return { statement: db.prepare(sql), sqlParams };
}

/** Builds and prepares the dynamic query of `getStaffAttendance` (filters appended in code; user values are bound). */
export function getStaffAttendanceStatement(db: Db, args: { tenant_id: string; staff_id: string | undefined; date: string | undefined; month: string | undefined }) {
  const { tenant_id, staff_id, date, month } = args;
  let sql = `
    SELECT sa.*, s.name as staff_name, s.staff_code
    FROM staff_attendance sa
    JOIN staff s ON sa.staff_id = s.staff_id
    WHERE sa.tenant_id = ?
  `;
  const sqlParams: any[] = [tenant_id];
  if (staff_id) {
    sql += ` AND sa.staff_id = ?`;
    sqlParams.push(staff_id);
  }
  if (date) {
    sql += ` AND sa.date = ?`;
    sqlParams.push(date);
  } else if (month) {
    sql += ` AND sa.date LIKE ?`;
    sqlParams.push(`${month}%`);
  }
  sql += ` ORDER BY sa.date DESC, s.name ASC`;
  return { statement: db.prepare(sql), sqlParams };
}
