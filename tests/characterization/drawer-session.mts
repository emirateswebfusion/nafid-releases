// Drawer sessions (electron/services/cashDrawerSession.ts): bills belong to the drawer that is open when they are made,
// including after midnight; a drawer from an earlier day must be closed before today's opens; drawers closed before
// sessions existed keep their totals; auto close (off by default) closes overdue drawers and can be snoozed.
// Usage: EQ_USERDATA=<fresh dir> npx tsx drawer-session.mts <tree>
import path from 'node:path';

const [tree] = process.argv.slice(2);
const load = (p: string) => import(path.join(tree, p));
const { initDb, getDb } = await load('electron/db/localDb.ts');
initDb();
const db = getDb();
const cashier = await load('electron/services/cashierService.ts');
const autoClose = await load('electron/services/cashDrawerAutoCloseService.ts');
const { storeWallClockToUtc, localDate } = await load('electron/services/storeTime.ts');
const { getSessionSinceMs } = await load('electron/services/cashDrawerSession.ts');

const T = 'tenant-1';
const TZ = 'Asia/Kolkata';
const failures: string[] = [];
const check = (label: string, actual: unknown, expected: unknown) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) failures.push(`${label}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
};
const addDays = (date: string, n: number) => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
/** SQLite UTC text of a store wall-clock time. */
const at = (date: string, h: number, m: number) => storeWallClockToUtc(date, h, m, 0, TZ).toISOString().replace('T', ' ').replace('Z', '');
let n = 0;
const bill = (createdAt: string, amount: number) => db.prepare(`INSERT INTO invoices (invoice_id, tenant_id, invoice_number, invoice_type,
  payment_method, subtotal, grand_total, received_amount, created_at) VALUES (?, ?, ?, 'SALE', 'CASH', ?, ?, ?, ?)`)
  .run(`inv-${++n}`, T, `INV-${n}`, amount, amount, amount, createdAt);
const drawer = (id: string) => db.prepare('SELECT * FROM cash_drawer WHERE drawer_id = ?').get(id) as any;
const user = { user_id: 'u-1', user_name: 'Cashier' };

const today = localDate(new Date(), T);
const yesterday = addDays(today, -1);
const older = addDays(today, -5);

// Upgrade: a drawer still open from an earlier day when sessions are installed is closed at the end of its own day
// with that day's bills only (a third shop, seeded before its first drawer call).
const T3 = 'tenant-3';
const stale = addDays(today, -4);
db.prepare(`INSERT INTO cash_drawer (drawer_id, tenant_id, business_date, opening_balance, status, opened_at, created_at, updated_at)
  VALUES ('d-stale', ?, ?, 100, 'OPEN', ?, ?, ?)`).run(T3, stale, at(stale, 9, 0), at(stale, 9, 0), at(stale, 9, 0));
for (const [id, when, amt] of [['t3-a', at(stale, 23, 0), 20], ['t3-b', at(addDays(stale, 1), 10, 0), 70]] as const) {
  db.prepare(`INSERT INTO invoices (invoice_id, tenant_id, invoice_number, invoice_type, payment_method, subtotal, grand_total, received_amount, created_at)
    VALUES (?, ?, ?, 'SALE', 'CASH', ?, ?, ?, ?)`).run(id, T3, id, amt, amt, amt, when);
}
cashier.getDrawer({ tenant_id: T3, business_date: today });
const st = drawer('d-stale');
check('stale open drawer closed on upgrade with its own day', [st.status, st.cash_sales, st.actual_cash, st.closed_at.slice(0, 19)],
  ['CLOSED', 20, 120, at(stale, 23, 59).slice(0, 16).replace(' ', 'T') + ':59']);

// The other shops already run with sessions; a drawer closed before they started (older) keeps its stored totals.
getSessionSinceMs(db, T);
getSessionSinceMs(db, 'tenant-2');
db.prepare(`INSERT INTO cash_drawer (drawer_id, tenant_id, business_date, opening_balance, cash_sales, current_cash, expected_closing,
  actual_cash, status, opened_at, closed_at, created_at, updated_at) VALUES ('d-old', ?, ?, 0, 999, 999, 999, 999, 'CLOSED', ?, ?, ?, ?)`)
  .run(T, older, at(older, 9, 0), at(older, 21, 0), at(older, 9, 0), at(older, 21, 0));
bill(at(older, 12, 0), 10);

// Yesterday's drawer is still open (auto close is off by default) and the shop bills past midnight.
db.prepare(`INSERT INTO cash_drawer (drawer_id, tenant_id, business_date, opening_balance, cash_sales, current_cash, expected_closing,
  status, opened_at, created_at, updated_at) VALUES ('d-y', ?, ?, 1000, 0, 1000, 1000, 'OPEN', ?, ?, ?)`)
  .run(T, yesterday, at(yesterday, 9, 0), at(yesterday, 9, 0), at(yesterday, 9, 0));
bill(at(yesterday, 20, 0), 100);
bill(at(today, 0, 30), 50); // after midnight: a different UTC and local date, same open drawer

const shown = cashier.getDrawer({ tenant_id: T, business_date: today });
check('open drawer shown for today', [shown?.drawer_id, shown?.status], ['d-y', 'OPEN']);
check('after-midnight bill counted in the open drawer', shown?.cash_sales, 150);
check('history drawer frozen', drawer('d-old').cash_sales, 999);

const blocked = cashier.setOpeningBalance({ tenant_id: T, opening_balance: 500, ...user });
check('opening today blocked while yesterday is open', [blocked?.success, blocked?.error, blocked?.business_date], [false, 'PREVIOUS_DRAWER_OPEN', yesterday]);

const closed = cashier.dayClosing({ tenant_id: T, actual_cash: 1150, business_date: yesterday, ...user });
check('closing yesterday', [closed?.success, closed?.expected_closing, closed?.cash_short, closed?.cash_excess], [true, 1150, 0, 0]);

// A bill after the close belongs to the next session.
await new Promise((r) => setTimeout(r, 1100));
bill(new Date().toISOString().replace('T', ' ').replace('Z', ''), 30);
const opened = cashier.setOpeningBalance({ tenant_id: T, opening_balance: 500, ...user });
check('opening today after closing yesterday', opened?.success, true);
const todays = cashier.getDrawer({ tenant_id: T, business_date: today });
check('new drawer is today', [todays?.business_date?.slice(0, 10), todays?.status], [today, 'OPEN']);
check('bill after the close counted in the new session', todays?.cash_sales, 30);
cashier.getHistory({ tenant_id: T });
check('closed session keeps its bills', drawer('d-y').cash_sales, 150);
check('history drawer still frozen', drawer('d-old').cash_sales, 999);

// Auto close (a second shop, so the drawers above stay out of it): off -> nothing due.
const T2 = 'tenant-2';
db.prepare(`INSERT INTO cash_drawer (drawer_id, tenant_id, business_date, opening_balance, status, opened_at, created_at, updated_at)
  VALUES ('d-due', ?, ?, 0, 'OPEN', ?, ?, ?)`).run(T2, addDays(today, -3), at(addDays(today, -3), 9, 0), at(addDays(today, -3), 9, 0), at(addDays(today, -3), 9, 0));
db.prepare(`INSERT INTO invoices (invoice_id, tenant_id, invoice_number, invoice_type, payment_method, subtotal, grand_total, received_amount, created_at)
  VALUES ('inv-t2', ?, 'T2-1', 'SALE', 'CASH', 40, 40, 40, ?)`).run(T2, at(addDays(today, -3), 12, 0));
check('auto close off', autoClose.getAutoCloseStatus({ tenant_id: T2 }).is_due, false);
db.prepare(`INSERT INTO settings (tenant_id, key, value, sync_status) VALUES (?, 'cash_drawer_auto_close', 'true', 'PENDING')`).run(T2);
db.prepare(`INSERT INTO settings (tenant_id, key, value, sync_status) VALUES (?, 'cash_drawer_auto_close_time', '"23:30"', 'PENDING')`).run(T2);
// A drawer forgotten three days ago: its 23:30 is long past.
const due = autoClose.getAutoCloseStatus({ tenant_id: T2 });
check('overdue drawer is due', [due.enabled, due.drawer_id, due.is_due], [true, 'd-due', true]);
const snoozed = autoClose.snoozeAutoClose({ tenant_id: T2, drawer_id: 'd-due', minutes: 30 });
const dueIn = Math.round((Date.parse(snoozed.status.due_at) - Date.now()) / 60000);
check('snooze moves the due time 30 min ahead', [snoozed.success, snoozed.status.is_due, dueIn], [true, false, 30]);
const now = autoClose.autoCloseNow({ tenant_id: T2, drawer_id: 'd-due', ...user });
const after = drawer('d-due');
check('close now', [now.success, after.status, after.actual_cash, after.cash_short, after.cash_excess], [true, 'CLOSED', 40, 0, 0]);
check('close now on a closed drawer', autoClose.autoCloseNow({ tenant_id: T2, drawer_id: 'd-due', ...user }).success, false);

// Backstop: an open drawer more than 15 min past its due time is closed by the main process.
db.prepare(`INSERT INTO cash_drawer (drawer_id, tenant_id, business_date, opening_balance, status, opened_at, created_at, updated_at)
  VALUES ('d-late', ?, ?, 0, 'OPEN', ?, ?, ?)`).run(T2, addDays(today, -2), at(addDays(today, -2), 9, 0), at(addDays(today, -2), 9, 0), at(addDays(today, -2), 9, 0));
cashier.getDrawer({ tenant_id: T2, business_date: today });
check('overdue drawer auto-closed', drawer('d-late').status, 'CLOSED');
check('first shop untouched by the second', [drawer('d-y').cash_sales, drawer(todays.drawer_id).status], [150, 'OPEN']);

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('drawer sessions: ok');
process.exit(0);
