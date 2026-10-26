import type { CashDrawerRow, LedgerRow, ServiceDb, StaffRow, UserRow } from './typesB.js';
import crypto from 'node:crypto';
import { getDb } from '../db/localDb.js';
import { toIsoTimestamp } from '../utils/timestamps.js';
import { parsePermissionList } from './localAuthService.js';
import * as staffSql from '../db/statements/staff.js';
/** Staff use-cases: staff records, biller PIN, staff ledger (salary/advances/purchases) and attendance. */

// ── Staff Management & Finance DB Handlers ─────────────────────────────────────

function hashStaffPin(pin: string, tenantId: string): string {
  return crypto.createHash('sha256').update(`${pin}:${tenantId}`).digest('hex');
}

/** IPC `db:getStaff` */
export function getStaff(params: { tenant_id: string; search?: string; status?: string }) {
  const db = getDb();
  const tenantId = params.tenant_id;

  // Auto-reconcile: link any unlinked staff rows by matching email
  try {
    staffSql.updateStaffUserId(db).run(tenantId, tenantId);

    // Auto-backfill: any user in users table that doesn't have a corresponding staff record
    const unlinkedUsers = staffSql.findUsers(db).all(tenantId, tenantId) as UserRow[];

    if (unlinkedUsers.length > 0) {
      const insertStaffStmt = staffSql.insertStaff(db);
      for (const u of unlinkedUsers) {
        const countRow = staffSql.countStaff(db).get(u.tenant_id) as { cnt: number };
        const nextSeq = (countRow?.cnt || 0) + 1;
        const staffCode = `STF-${String(nextSeq).padStart(4, '0')}`;
        const roleDesig = ['ADMIN', 'OWNER', 'ADMINISTRATOR'].includes((u.role || '').toUpperCase()) ? 'ADMIN' : 'STAFF';
        insertStaffStmt.run(crypto.randomUUID(), u.tenant_id, staffCode, u.name || u.email, u.email, roleDesig, u.user_id);
      }
    }
  } catch (reconcileErr) {
    console.warn('[getStaff] Auto-reconcile error:', reconcileErr);
  }

  const { statement, sqlParams } = staffSql.getStaffStatement(db, { tenantId, params });
  const rows = statement.all(...sqlParams) as StaffRow[];
  return rows.map((r: StaffRow) => ({
    ...r,
    permissions: parsePermissionList(r.user_permissions, r.user_restricted_page),
    has_pin: Boolean(r.biller_pin_hash),
    biller_pin_hash: undefined,
  }));
}

function getStaffById(params: { tenant_id: string; staff_id: string }) {
  const db = getDb();
  const row: StaffRow = staffSql.findStaffByStaffId(db).get(params.staff_id, params.tenant_id) as StaffRow;

  if (!row) return null;

  const current_balance = staffSql.findOneStaffLedgerByStaffId(db).get(params.staff_id, params.tenant_id) as { balance: number };

  return {
    ...row,
    permissions: parsePermissionList(row.user_permissions),
    current_balance: current_balance?.balance || 0,
    has_pin: Boolean(row.biller_pin_hash),
    biller_pin_hash: undefined,
  };
}

/** IPC `db:saveStaff` */
export function saveStaff(params: {
  staff_id?: string;
  tenant_id: string;
  name: string;
  phone?: string;
  email?: string;
  role_designation?: string;
  user_id?: string | null;
  joining_date?: string;
  monthly_salary?: number;
  status?: 'ACTIVE' | 'INACTIVE';
  biller_pin?: string;
}) {
  const db = getDb();
  const tenantId = params.tenant_id;
  const staffId = params.staff_id || crypto.randomUUID();
  const name = params.name.trim();
  if (!name) throw new Error('Staff name is required');

  const existing = staffSql.findStaffByStaffIdStaffIdAndStaffCode(db).get(staffId, tenantId) as StaffRow;

  let staffCode = existing?.staff_code;
  if (!staffCode) {
    const countRow = staffSql.countStaff(db).get(tenantId) as { cnt: number };
    const nextSeq = (countRow?.cnt || 0) + 1;
    staffCode = `STF-${String(nextSeq).padStart(4, '0')}`;
  }

  let pinHash = existing?.biller_pin_hash || null;
  if (params.biller_pin !== undefined) {
    if (params.biller_pin && params.biller_pin.trim().length === 4) {
      const newHash = hashStaffPin(params.biller_pin.trim(), tenantId);
      const dup = staffSql.findStaffByBillerPinHashAndStatus(db).get(tenantId, newHash, staffId);
      if (dup) throw new Error('This 4-digit PIN is already assigned to another staff member');
      pinHash = newHash;
    } else if (params.biller_pin === '' || params.biller_pin === null) {
      pinHash = null;
    }
  }

  const now = toIsoTimestamp(new Date());

  if (existing) {
    staffSql.updateStaffByStaffId(db).run(
      name, params.phone || null, params.email || null, params.role_designation || null, params.user_id || null,
      pinHash, params.joining_date || null, params.monthly_salary || 0, params.status || 'ACTIVE',
      now, staffId, tenantId
    );
  } else {
    staffSql.insertStaff2(db).run(
      staffId, tenantId, staffCode, name, params.phone || null, params.email || null,
      params.role_designation || null, params.user_id || null, pinHash,
      params.joining_date || null, params.monthly_salary || 0, params.status || 'ACTIVE',
      now, now
    );
  }

  if (params.monthly_salary !== undefined && params.monthly_salary !== null) {
    const latestSalary: { monthly_salary: number } = staffSql.findOneStaffSalaryByStaffId(db).get(staffId, tenantId) as { monthly_salary: number };
    if (!latestSalary || Number(latestSalary.monthly_salary) !== Number(params.monthly_salary)) {
      staffSql.insertStaffSalary(db).run(crypto.randomUUID(), tenantId, staffId, params.monthly_salary, now.split(' ')[0], now);
    }
  }

  return getStaffById({ tenant_id: tenantId, staff_id: staffId });
}

/** IPC `db:verifyBillerPin` */
export function verifyBillerPin(params: { tenant_id: string; pin: string }) {
  const db = getDb();
  const { tenant_id, pin } = params;
  if (!pin || pin.trim().length !== 4) {
    return { success: false, error: 'PIN must be exactly 4 digits' };
  }
  const hash = hashStaffPin(pin.trim(), tenant_id);
  const staffMember: StaffRow = staffSql.findStaffByBillerPinHash(db).get(tenant_id, hash) as StaffRow;

  if (!staffMember) {
    return { success: false, error: 'Invalid Biller PIN' };
  }
  if (staffMember.status !== 'ACTIVE') {
    return { success: false, error: 'Staff account is inactive' };
  }

  return {
    success: true,
    staff: {
      staff_id: staffMember.staff_id,
      staff_code: staffMember.staff_code,
      name: staffMember.name,
      role_designation: staffMember.role_designation,
    }
  };
}

/** IPC `db:getStaffLedger` */
export function getStaffLedger(params: { tenant_id: string; staff_id: string }) {
  const db = getDb();
  const rows = staffSql.findStaffLedgerByStaffId(db).all(params.tenant_id, params.staff_id);
  return rows;
}

/** IPC `db:addStaffTransaction` */
export function addStaffTransaction(params: {
  tenant_id: string;
  staff_id: string;
  type: 'ADVANCE' | 'SALARY_PAYMENT' | 'BONUS' | 'DEDUCTION' | 'SALARY_ACCRUAL' | 'ADJUSTMENT' | 'STAFF_PURCHASE';
  amount: number;
  payment_method?: string;
  payment_source_id?: string;
  reference_number?: string;
  notes?: string;
  user_id?: string;
  user_name?: string;
  create_cash_transaction?: boolean;
}) {
  const db = getDb();
  const { tenant_id, staff_id, type, amount, payment_method = 'CASH', payment_source_id, reference_number, notes, user_id, user_name } = params;
  if (amount <= 0) throw new Error('Transaction amount must be greater than zero');

  const staff = staffSql.findStaffByStaffIdStaffIdAndName(db).get(staff_id, tenant_id) as StaffRow;
  if (!staff) throw new Error('Staff member not found');

  const now = toIsoTimestamp(new Date());
  const txId = crypto.randomUUID();
  let cashTxId: string | null = null;

  if (params.create_cash_transaction !== false && (type === 'ADVANCE' || type === 'SALARY_PAYMENT') && payment_method === 'CASH') {
    const activeDrawer: CashDrawerRow = staffSql.findOneCashDrawerByStatus(db).get(tenant_id) as CashDrawerRow;
    if (activeDrawer) {
      cashTxId = crypto.randomUUID();
      const catName = type === 'ADVANCE' ? 'Staff Advance' : 'Staff Salary Payment';
      staffSql.insertCashTransaction(db).run(
        cashTxId, tenant_id, activeDrawer.drawer_id, amount, catName,
        `Paid to ${staff.name}${notes ? ': ' + notes : ''}`, reference_number || null,
        user_id || null, user_name || null, now, now, now
      );

      staffSql.updateCashDrawerByDrawerId(db).run(amount, amount, amount, now, activeDrawer.drawer_id);
    }
  }

  staffSql.insertStaffTransaction(db).run(
    txId, tenant_id, staff_id, type, amount, payment_method, payment_source_id || null,
    cashTxId, reference_number || null, notes || null, user_id || null, user_name || null,
    now, now, now
  );

  let debitAmt = 0;
  let creditAmt = 0;
  let desc = '';

  switch (type) {
    case 'SALARY_ACCRUAL':
      debitAmt = amount;
      desc = `Monthly Salary Accrual${notes ? ': ' + notes : ''}`;
      break;
    case 'BONUS':
      debitAmt = amount;
      desc = `Bonus / Incentive${notes ? ': ' + notes : ''}`;
      break;
    case 'ADVANCE':
      creditAmt = amount;
      desc = `Salary Advance (${payment_method})${notes ? ': ' + notes : ''}`;
      break;
    case 'SALARY_PAYMENT':
      creditAmt = amount;
      desc = `Salary Payment (${payment_method})${notes ? ': ' + notes : ''}`;
      break;
    case 'DEDUCTION':
      creditAmt = amount;
      desc = `Deduction${notes ? ': ' + notes : ''}`;
      break;
    case 'STAFF_PURCHASE':
      creditAmt = amount;
      desc = `Staff Purchase - Bill #${reference_number || 'CREDIT'}${notes ? ': ' + notes : ''}`;
      break;
    case 'ADJUSTMENT':
      if (amount >= 0) { debitAmt = amount; desc = `Balance Adjustment (+)${notes ? ': ' + notes : ''}`; }
      else { creditAmt = Math.abs(amount); desc = `Balance Adjustment (-)${notes ? ': ' + notes : ''}`; }
      break;
  }

  const prevBalanceRow: { running_balance: number } = staffSql.findOneStaffLedgerByStaffId2(db).get(tenant_id, staff_id) as { running_balance: number };

  const prevBal = Number(prevBalanceRow?.running_balance || 0);
  const newBal = prevBal + debitAmt - creditAmt;

  const ledgerId = crypto.randomUUID();
  staffSql.insertStaffLedger(db).run(
    ledgerId, tenant_id, staff_id, txId, now, desc,
    debitAmt, creditAmt, newBal, type, user_id || null, now
  );

  return {
    success: true,
    transaction_id: txId,
    ledger_id: ledgerId,
    new_balance: newBal
  };
}

export function recalcStaffLedgerBalances(dbInstance: ServiceDb | null | undefined, tenantId: string, staffId: string) {
  const db = getDb();
  const targetDb = dbInstance || db;
  const rows = staffSql.findStaffLedgerByStaffId2(targetDb).all(staffId, tenantId) as LedgerRow[];

  let running = 0;
  for (const r of rows) {
    const debit = Number(r.debit_amount || 0);
    const credit = Number(r.credit_amount || 0);
    running = Math.round((running + debit - credit) * 100) / 100;
    staffSql.updateStaffLedgerRunningBalance(targetDb).run(running, r.ledger_id);
  }
}

/** IPC `db:getStaffAttendance` */
export function getStaffAttendance(params: { tenant_id: string; staff_id?: string; date?: string; month?: string }) {
  const db = getDb();
  const { tenant_id, staff_id, date, month } = params;
  const { statement, sqlParams } = staffSql.getStaffAttendanceStatement(db, { tenant_id, staff_id, date, month });
  return statement.all(...sqlParams);
}

/** IPC `db:saveStaffAttendance` */
export function saveStaffAttendance(params: {
  tenant_id: string;
  staff_id: string;
  date: string;
  status: 'PRESENT' | 'ABSENT' | 'HALF_DAY' | 'LEAVE' | 'HOLIDAY';
  check_in_time?: string;
  check_out_time?: string;
  notes?: string;
  user_id?: string;
}) {
  const db = getDb();
  const { tenant_id, staff_id, date, status, check_in_time, check_out_time, notes, user_id } = params;
  const now = toIsoTimestamp(new Date());
  const existing: { attendance_id: string } = staffSql.findStaffAttendanceByStaffIdAndDate(db).get(tenant_id, staff_id, date) as { attendance_id: string };

  if (existing) {
    staffSql.updateStaffAttendanceByAttendanceId(db).run(status, check_in_time || null, check_out_time || null, notes || null, user_id || null, now, existing.attendance_id);
    return { success: true, attendance_id: existing.attendance_id };
  } else {
    const id = crypto.randomUUID();
    staffSql.insertStaffAttendance(db).run(id, tenant_id, staff_id, date, status, check_in_time || null, check_out_time || null, notes || null, user_id || null, now, now);
    return { success: true, attendance_id: id };
  }
}
