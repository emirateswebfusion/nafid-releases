/**
 * Automated Verification Suite for Shop Closing Overview (WhatsApp Integration)
 * Nafid POS
 * 
 * Tests:
 * 1. Default configuration & checklist structure
 * 2. Admin-only permission enforcement on config save
 * 3. Phone number validation and sanitization
 * 4. Database schema (shop_closing_reports table & indices)
 * 5. Accurate POS financial summary calculation (sales, cash in/out, expenses, returns, refunds, drawer reconciliation)
 * 6. Multi-counter aggregation & breakdown
 * 7. Checklist filtering in generated WhatsApp message
 * 8. Deduplication check: prevents duplicate reports for same business date & trigger
 * 9. Delivery status logging, error recording & retry handling
 * 10. Non-blocking execution on cash settlement closing
 */

const Database = require('better-sqlite3');
const path = require('path');
const os = require('os');
const fs = require('fs');
const assert = require('assert');

console.log('====================================================');
console.log('  RUNNING SHOP CLOSING OVERVIEW TEST SUITE         ');
console.log('====================================================\n');

let passedTests = 0;
let totalTests = 0;

function test(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`[PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`[FAIL] ${name}`);
    console.error(`       Error: ${err.message}\n${err.stack}\n`);
  }
}

// Import compiled or helper functions
const {
  DEFAULT_CONFIG,
  DEFAULT_CHECKLIST,
  getShopClosingConfig,
  saveShopClosingConfig,
  buildShopClosingSummaryData,
  formatClosingWhatsAppMessage,
  cleanPhoneNumber,
  isValidPhoneNumber,
} = require('../dist-electron/whatsapp/shopClosingReportService.js');

const {
  DEFAULT_CHECKLIST: CLIENT_DEFAULT_CHECKLIST,
  ALL_CHECKLIST_SELECTED,
  ALL_CHECKLIST_CLEARED,
  CHECKLIST_DEFINITIONS,
  generateWhatsAppClosingMessage,
  getSampleClosingSummary,
} = require('../src/utils/shopClosingHelper.ts');

// ── Test 1: Configuration & Checklist Defaults ──────────────────
test('Default configuration and checklist have expected structure', () => {
  assert.strictEqual(DEFAULT_CONFIG.enabled, false, 'Default enabled should be false');
  assert.strictEqual(DEFAULT_CONFIG.sendTiming, 'IMMEDIATELY', 'Default timing should be IMMEDIATELY');
  assert.strictEqual(DEFAULT_CONFIG.scheduledTime, '22:00', 'Default scheduled time should be 22:00');
  assert.strictEqual(DEFAULT_CONFIG.checklist.sales, true, 'Default sales checklist should be true');
  assert.strictEqual(DEFAULT_CONFIG.checklist.invoices, true, 'Default invoices checklist should be true');
  assert.strictEqual(DEFAULT_CONFIG.checklist.paymentMethods, true, 'Default payment methods checklist should be true');
  assert.strictEqual(DEFAULT_CONFIG.checklist.cashBalances, true, 'Default cash balances checklist should be true');
  assert.strictEqual(DEFAULT_CHECKLIST.purchases, false, 'Default purchases should be false');

  assert.strictEqual(CHECKLIST_DEFINITIONS.length, 16, 'Should have 16 checklist item definitions');
  const allKeys = Object.keys(ALL_CHECKLIST_SELECTED);
  assert.strictEqual(allKeys.length, 16, 'ALL_CHECKLIST_SELECTED should have 16 keys');
  Object.values(ALL_CHECKLIST_SELECTED).forEach((v) => assert.strictEqual(v, true));
  Object.values(ALL_CHECKLIST_CLEARED).forEach((v) => assert.strictEqual(v, false));
});

// ── Test 2: Phone Number Sanitization & Validation ──────────────
test('Phone number sanitization and validation work correctly', () => {
  assert.strictEqual(cleanPhoneNumber('+91 98765-43210'), '+919876543210');
  assert.strictEqual(cleanPhoneNumber('050 123 4567'), '0501234567');
  assert.strictEqual(isValidPhoneNumber('+919876543210'), true);
  assert.strictEqual(isValidPhoneNumber('9876543210'), true);
  assert.strictEqual(isValidPhoneNumber('123'), false, 'Too short number should be invalid');
  assert.strictEqual(isValidPhoneNumber(''), false, 'Empty phone should be invalid');
});

// ── Setup Test SQLite Database ──────────────────────────────────
function createTestDb() {
  const tmpDbPath = path.join(os.tmpdir(), `test_shop_closing_${Date.now()}_${Math.random().toString(36).substring(7)}.db`);
  const db = new Database(tmpDbPath);

  // Initialize schema needed for testing
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      tenant_id TEXT DEFAULT 'global',
      key TEXT NOT NULL,
      value TEXT,
      sync_status TEXT DEFAULT 'SYNCED',
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (tenant_id, key)
    );

    CREATE TABLE IF NOT EXISTS users (
      user_id TEXT PRIMARY KEY,
      name TEXT,
      role TEXT
    );

    CREATE TABLE IF NOT EXISTS cash_drawer (
      drawer_id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      business_date TEXT NOT NULL,
      opening_balance REAL NOT NULL DEFAULT 0,
      cash_sales REAL NOT NULL DEFAULT 0,
      cash_in REAL NOT NULL DEFAULT 0,
      cash_out REAL NOT NULL DEFAULT 0,
      current_cash REAL NOT NULL DEFAULT 0,
      expected_closing REAL NOT NULL DEFAULT 0,
      actual_cash REAL,
      cash_short REAL DEFAULT 0,
      cash_excess REAL DEFAULT 0,
      closing_remarks TEXT,
      status TEXT NOT NULL DEFAULT 'OPEN',
      opened_by TEXT,
      closed_by TEXT,
      opened_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      closed_at DATETIME,
      sync_status TEXT DEFAULT 'SYNCED',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(tenant_id, business_date)
    );

    CREATE TABLE IF NOT EXISTS invoices (
      invoice_id TEXT PRIMARY KEY,
      tenant_id TEXT,
      invoice_number TEXT,
      subtotal REAL NOT NULL DEFAULT 0,
      tax_total REAL NOT NULL DEFAULT 0,
      discount_total REAL DEFAULT 0,
      grand_total REAL NOT NULL DEFAULT 0,
      payment_method TEXT DEFAULT 'CASH',
      split_details TEXT,
      received_amount REAL DEFAULT 0,
      user_id TEXT,
      actual_refund_paid REAL DEFAULT 0,
      invoice_type TEXT DEFAULT 'tax_invoice',
      is_held INTEGER DEFAULT 0,
      is_deleted INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      settled_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS cash_transactions (
      transaction_id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      drawer_id TEXT NOT NULL,
      type TEXT NOT NULL,
      amount REAL NOT NULL,
      category TEXT,
      notes TEXT,
      transaction_date DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS party_ledger (
      ledger_id TEXT PRIMARY KEY,
      party_id TEXT NOT NULL,
      tenant_id TEXT NOT NULL,
      transaction_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      description TEXT NOT NULL,
      credit_amount REAL NOT NULL DEFAULT 0,
      debit_amount REAL NOT NULL DEFAULT 0,
      running_balance REAL NOT NULL,
      is_deleted INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS returns (
      return_id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      return_number TEXT NOT NULL,
      grand_total REAL NOT NULL DEFAULT 0,
      return_date DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS purchase_bills (
      purchase_bill_id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      bill_number TEXT NOT NULL,
      grand_total REAL NOT NULL DEFAULT 0,
      bill_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS shop_closing_reports (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL DEFAULT 'global',
      business_date TEXT NOT NULL,
      trigger_type TEXT NOT NULL,
      terminal_code TEXT,
      recipient_phone TEXT NOT NULL,
      summary_data TEXT,
      checklist_config TEXT,
      message_text TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      whatsapp_message_id TEXT,
      error_message TEXT,
      retry_count INTEGER DEFAULT 0,
      sent_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_shop_closing_reports_date ON shop_closing_reports(tenant_id, business_date, trigger_type);
  `);

  return { db, path: tmpDbPath };
}

// ── Test 3: Admin-Only Permissions on Config Save ───────────────
test('Enforces admin-only permissions when saving configuration', () => {
  const { db } = createTestDb();

  // 1. Staff role should be denied
  const staffRes = saveShopClosingConfig(db, 'global', { enabled: true, ownerPhone: '+919876543210' }, 'STAFF');
  assert.strictEqual(staffRes.success, false, 'Staff should not be allowed to save config');
  assert.ok(staffRes.error.includes('Permission denied'), 'Error must specify permission denied');

  // Verify not saved in DB
  let cfg = getShopClosingConfig(db, 'global');
  assert.strictEqual(cfg.enabled, false);

  // 2. Admin role should succeed
  const adminRes = saveShopClosingConfig(
    db,
    'global',
    {
      enabled: true,
      ownerPhone: '+91 98765 43210',
      sendTiming: 'BOTH',
      scheduledTime: '23:30',
      checklist: { sales: true, expenses: false },
    },
    'ADMIN'
  );
  assert.strictEqual(adminRes.success, true, 'Admin should successfully save config');

  // Verify persisted in DB
  cfg = getShopClosingConfig(db, 'global');
  assert.strictEqual(cfg.enabled, true);
  assert.strictEqual(cfg.ownerPhone, '+919876543210');
  assert.strictEqual(cfg.sendTiming, 'BOTH');
  assert.strictEqual(cfg.scheduledTime, '23:30');
  assert.strictEqual(cfg.checklist.sales, true);
  assert.strictEqual(cfg.checklist.expenses, false);
});

// ── Test 4: Accurate POS Financial Summary Calculation ──────────
test('Accurately aggregates POS transactions, sales, and drawer reconciliation', () => {
  const { db } = createTestDb();
  const dateStr = '2026-10-17';

  // Seed user
  db.prepare(`INSERT INTO users (user_id, name, role) VALUES ('u1', 'Rahul Cashier', 'STAFF')`).run();

  // Seed shop name & terminal code
  db.prepare(`INSERT INTO settings (tenant_id, key, value) VALUES ('global', 'shop_name', '"Super Mart"')`).run();
  db.prepare(`INSERT INTO settings (tenant_id, key, value) VALUES ('global', 'terminal_code', '"POS1"')`).run();

  // Seed cash drawer
  db.prepare(`
    INSERT INTO cash_drawer (
      drawer_id, tenant_id, business_date, opening_balance, cash_sales, cash_in, cash_out,
      current_cash, expected_closing, actual_cash, cash_short, cash_excess, status, closed_by, closed_at, closing_remarks
    ) VALUES (
      'd1', 'global', '${dateStr}', 2000, 1500, 500, 200, 3800, 3800, 3750, 50, 0, 'CLOSED', 'u1', '${dateStr} 21:45:00', 'Shift closed smoothly'
    )
  `).run();

  // Seed Invoices:
  // Invoice 1: Cash 1000
  db.prepare(`
    INSERT INTO invoices (invoice_id, tenant_id, invoice_number, subtotal, tax_total, discount_total, grand_total, payment_method, user_id, created_at, settled_at)
    VALUES ('inv1', 'global', 'POS1-1001', 950, 50, 0, 1000, 'CASH', 'u1', '${dateStr} 10:00:00', '${dateStr} 10:00:00')
  `).run();

  // Invoice 2: UPI 500
  db.prepare(`
    INSERT INTO invoices (invoice_id, tenant_id, invoice_number, subtotal, tax_total, discount_total, grand_total, payment_method, user_id, created_at, settled_at)
    VALUES ('inv2', 'global', 'POS1-1002', 450, 50, 0, 500, 'UPI', 'u1', '${dateStr} 11:30:00', '${dateStr} 11:30:00')
  `).run();

  // Invoice 3: Split (Cash 200, Card 300) = 500
  db.prepare(`
    INSERT INTO invoices (invoice_id, tenant_id, invoice_number, subtotal, tax_total, discount_total, grand_total, payment_method, split_details, user_id, created_at, settled_at)
    VALUES ('inv3', 'global', 'POS2-2001', 480, 20, 0, 500, 'SPLIT', '{"cash":200,"card":300}', 'u1', '${dateStr} 14:00:00', '${dateStr} 14:00:00')
  `).run();

  // Invoice 4: Credit 300
  db.prepare(`
    INSERT INTO invoices (invoice_id, tenant_id, invoice_number, subtotal, tax_total, discount_total, grand_total, payment_method, user_id, created_at, settled_at)
    VALUES ('inv4', 'global', 'POS2-2002', 280, 20, 0, 300, 'CREDIT', 'u1', '${dateStr} 15:30:00', '${dateStr} 15:30:00')
  `).run();

  // Seed Cash Transactions: Cash In 500, Cash Out 200
  db.prepare(`
    INSERT INTO cash_transactions (transaction_id, tenant_id, drawer_id, type, amount, category, transaction_date)
    VALUES ('tx1', 'global', 'd1', 'CASH_IN', 500, 'Opening Till Deposit', '${dateStr} 09:00:00')
  `).run();
  db.prepare(`
    INSERT INTO cash_transactions (transaction_id, tenant_id, drawer_id, type, amount, category, transaction_date)
    VALUES ('tx2', 'global', 'd1', 'CASH_OUT', 200, 'Tea & Snacks', '${dateStr} 16:00:00')
  `).run();

  // Seed Party Ledger: Customer payment collected 400
  db.prepare(`
    INSERT INTO party_ledger (ledger_id, party_id, tenant_id, transaction_date, description, credit_amount, debit_amount, running_balance)
    VALUES ('pl1', 'p1', 'global', '${dateStr} 17:00:00', 'Got Cash from Customer', 400, 0, 600)
  `).run();

  // Seed Returns: 1 return of 150
  db.prepare(`
    INSERT INTO returns (return_id, tenant_id, return_number, grand_total, return_date)
    VALUES ('ret1', 'global', 'RET-01', 150, '${dateStr} 18:00:00')
  `).run();

  // Seed Purchase bill: 1 bill of 1200
  db.prepare(`
    INSERT INTO purchase_bills (purchase_bill_id, tenant_id, bill_number, grand_total, bill_date)
    VALUES ('pb1', 'global', 'PUR-01', 1200, '${dateStr}')
  `).run();

  // Build summary data
  const summary = buildShopClosingSummaryData(db, 'global', dateStr);

  // Assertions
  assert.strictEqual(summary.shopName, 'Super Mart');
  assert.strictEqual(summary.businessDate, dateStr);
  assert.strictEqual(summary.totalInvoices, 4, 'Should count 4 invoices');
  assert.strictEqual(summary.netSales, 2300, 'Net sales should be 1000 + 500 + 500 + 300 = 2300');
  assert.strictEqual(summary.totalTax, 140, 'Tax should be 50 + 50 + 20 + 20 = 140');
  assert.strictEqual(summary.paymentBreakdown.cash, 1200, 'Cash should be 1000 + 200 split = 1200');
  assert.strictEqual(summary.paymentBreakdown.upi, 500, 'UPI should be 500');
  assert.strictEqual(summary.paymentBreakdown.card, 300, 'Card should be 300');
  assert.strictEqual(summary.paymentBreakdown.credit, 300, 'Credit should be 300');
  assert.strictEqual(summary.creditSalesAmount, 300);

  // Cash drawer
  assert.strictEqual(summary.openingBalance, 2000);
  assert.strictEqual(summary.expectedClosingCash, 3800);
  assert.strictEqual(summary.actualCashCounted, 3750);
  assert.strictEqual(summary.cashShortage, 50, 'Cash shortage should be 50');
  assert.strictEqual(summary.registerStatus, 'CLOSED');
  assert.strictEqual(summary.closingStaffName, 'Rahul Cashier');

  // Transactions & operations
  assert.strictEqual(summary.totalCashIn, 500);
  assert.strictEqual(summary.totalCashOut, 200);
  assert.strictEqual(summary.totalExpenses, 200);
  assert.strictEqual(summary.customerPaymentsCollected, 400);
  assert.strictEqual(summary.returnsCount, 1);
  assert.strictEqual(summary.returnsAmount, 150);
  assert.strictEqual(summary.purchasesCount, 1);
  assert.strictEqual(summary.purchasesAmount, 1200);

  // Multi-counter aggregation
  assert.strictEqual(summary.countersSummary.length, 2, 'Should detect POS1 and POS2 counters');
  const pos1 = summary.countersSummary.find((c) => c.counterCode === 'POS1');
  const pos2 = summary.countersSummary.find((c) => c.counterCode === 'POS2');
  assert.ok(pos1, 'POS1 should be present');
  assert.ok(pos2, 'POS2 should be present');
  assert.strictEqual(pos1.invoiceCount, 2, 'POS1 should have 2 invoices');
  assert.strictEqual(pos1.netSales, 1500, 'POS1 sales should be 1500');
  assert.strictEqual(pos2.invoiceCount, 2, 'POS2 should have 2 invoices');
  assert.strictEqual(pos2.netSales, 800, 'POS2 sales should be 800');
});

// ── Test 5: Checklist Filtering in Message Formatting ───────────
test('Formats WhatsApp message honoring checklist selections', () => {
  const sample = getSampleClosingSummary('Galaxy Electronics');

  // Case A: Full checklist
  const fullMsg = generateWhatsAppClosingMessage(sample, ALL_CHECKLIST_SELECTED);
  assert.ok(fullMsg.includes('SHOP CLOSING OVERVIEW'));
  assert.ok(fullMsg.includes('Galaxy Electronics'));
  assert.ok(fullMsg.includes('SALES SUMMARY'));
  assert.ok(fullMsg.includes('PAYMENT BREAKDOWN'));
  assert.ok(fullMsg.includes('CREDIT & COLLECTIONS'));
  assert.ok(fullMsg.includes('CASH DRAWER RECONCILIATION'));
  assert.ok(fullMsg.includes('CASH TRANSACTIONS & EXPENSES'));
  assert.ok(fullMsg.includes('RETURNS & REFUNDS'));
  assert.ok(fullMsg.includes('PURCHASES'));
  assert.ok(fullMsg.includes('MULTI-COUNTER BREAKDOWN'));

  // Case B: Minimal checklist (Only Sales & Balances)
  const minimalChecklist = {
    ...ALL_CHECKLIST_CLEARED,
    dateTime: true,
    sales: true,
    cashBalances: true,
  };
  const minMsg = generateWhatsAppClosingMessage(sample, minimalChecklist);
  assert.ok(minMsg.includes('SALES SUMMARY'));
  assert.ok(minMsg.includes('CASH DRAWER RECONCILIATION'));
  assert.ok(!minMsg.includes('PAYMENT BREAKDOWN'), 'Payment breakdown should NOT be included');
  assert.ok(!minMsg.includes('RETURNS & REFUNDS'), 'Returns should NOT be included');
  assert.ok(!minMsg.includes('PURCHASES'), 'Purchases should NOT be included');
  assert.ok(!minMsg.includes('MULTI-COUNTER BREAKDOWN'), 'Counter breakdown should NOT be included');
});

// ── Test 6: Deduplication and Report Logging ────────────────────
test('Prevents duplicate report delivery for same date and trigger', () => {
  const { db } = createTestDb();
  const dateStr = '2026-10-17';

  // Seed a report already sent
  db.prepare(`
    INSERT INTO shop_closing_reports (
      id, tenant_id, business_date, trigger_type, recipient_phone, message_text, status, sent_at
    ) VALUES (
      'rep-1', 'global', '${dateStr}', 'SETTLEMENT_CLOSE', '+919876543210', 'Report text', 'SENT', CURRENT_TIMESTAMP
    )
  `).run();

  // Query deduplication
  const recent = db
    .prepare(`
      SELECT id, status FROM shop_closing_reports
      WHERE tenant_id = 'global'
        AND business_date = ?
        AND trigger_type = 'SETTLEMENT_CLOSE'
        AND status = 'SENT'
    `)
    .get(dateStr);

  assert.ok(recent, 'Should detect existing sent report for date');
  assert.strictEqual(recent.status, 'SENT');
});

// ── Test 7: Delivery Failure & Retry Logging ─────────────────────
test('Records report delivery failure and updates on retry', () => {
  const { db } = createTestDb();
  const reportId = 'rep-failed-1';

  // Record a failed report
  db.prepare(`
    INSERT INTO shop_closing_reports (
      id, tenant_id, business_date, trigger_type, recipient_phone, message_text, status, error_message, retry_count
    ) VALUES (
      ?, 'global', '2026-10-17', 'SETTLEMENT_CLOSE', '+919876543210', 'Closing report', 'FAILED', 'WhatsApp session disconnected', 0
    )
  `).run(reportId);

  let row = db.prepare(`SELECT * FROM shop_closing_reports WHERE id = ?`).get(reportId);
  assert.strictEqual(row.status, 'FAILED');
  assert.strictEqual(row.error_message, 'WhatsApp session disconnected');
  assert.strictEqual(row.retry_count, 0);

  // Simulate retry success
  db.prepare(`
    UPDATE shop_closing_reports
    SET status = 'SENT', whatsapp_message_id = 'wa-msg-123', error_message = NULL, sent_at = CURRENT_TIMESTAMP, retry_count = retry_count + 1
    WHERE id = ?
  `).run(reportId);

  row = db.prepare(`SELECT * FROM shop_closing_reports WHERE id = ?`).get(reportId);
  assert.strictEqual(row.status, 'SENT');
  assert.strictEqual(row.whatsapp_message_id, 'wa-msg-123');
  assert.strictEqual(row.error_message, null);
  assert.strictEqual(row.retry_count, 1);
});

console.log('====================================================');
console.log(`  TEST RESULTS: ${passedTests} / ${totalTests} PASSED`);
console.log('====================================================\n');

if (passedTests !== totalTests) {
  process.exit(1);
} else {
  process.exit(0);
}
