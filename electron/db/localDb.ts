import Database from 'better-sqlite3';
import path from 'path';
import { app } from 'electron';
import fs from 'fs';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';

// ── Local Time Helpers ────────────────────────────────────────────────────
function localTimestamp(d: Date | string | number = new Date()): string {
  const dateObj = d instanceof Date ? d : new Date(d);
  return isNaN(dateObj.getTime()) ? new Date().toISOString() : dateObj.toISOString();
}

function parsePermissionList(value: unknown, restrictedPage?: unknown): string[] {
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

let db: Database.Database;

export function initDb() {
  const dbPath = path.join(app.getPath('userData'), 'vendora_v2.db');
  
  // Ensure directory exists
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  // Self-healing migration: if current database does not exist or is empty (0 bytes), search legacy/alternate AppData directories to restore user's database
  if (!fs.existsSync(dbPath) || fs.statSync(dbPath).size === 0) {
    try {
      const appData = app.getPath('appData');
      const candidates = [
        path.join(appData, 'nafid', 'vendora_v2.db'),
        path.join(appData, 'nafid', 'vendora.db'),
        path.join(appData, 'com.nafid', 'vendora_v2.db'),
        path.join(appData, 'vendora', 'vendora_v2.db'),
        path.join(appData, 'Vendora', 'vendora_v2.db'),
        path.join(appData, 'Nafid', 'vendora.db'),
      ];

      for (const src of candidates) {
        if (fs.existsSync(src) && fs.statSync(src).size > 0 && src !== dbPath) {
          // Validate the candidate database has minimum required schema before copying
          let isValid = false;
          try {
            const testDb = new Database(src, { readonly: true });
            const tables = testDb.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[];
            const tableNames = tables.map(t => t.name);
            // Check for critical tables and columns that migrations depend on
            const hasProducts = tableNames.includes('products');
            const hasInvoices = tableNames.includes('invoices');
            const hasParties = tableNames.includes('parties');
            let hasIsDeleted = false;
            if (hasProducts) {
              const cols = testDb.prepare("PRAGMA table_info(products)").all() as { name: string }[];
              hasIsDeleted = cols.some(c => c.name === 'is_deleted');
            }
            testDb.close();
            isValid = hasProducts && hasInvoices && hasParties && hasIsDeleted;
          } catch {
            isValid = false;
          }

          if (isValid) {
            console.log(`[DB Self-Healing] Found compatible legacy database at ${src}. Restoring to ${dbPath}...`);
            fs.copyFileSync(src, dbPath);
            const wal = `${src}-wal`;
            const shm = `${src}-shm`;
            if (fs.existsSync(wal)) fs.copyFileSync(wal, `${dbPath}-wal`);
            if (fs.existsSync(shm)) fs.copyFileSync(shm, `${dbPath}-shm`);
            break;
          } else {
            console.log(`[DB Self-Healing] Skipping incompatible legacy database at ${src} (missing required schema)`);
          }
        }
      }
    } catch (copyErr) {
      console.error('[DB Self-Healing] Database recovery check error:', copyErr);
    }
  }

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('synchronous = NORMAL');

  // Register string cleaner function for special-character insensitive searches
  try {
    db.function('CLEAN_STR', (str: unknown) => {
      if (typeof str !== 'string' && typeof str !== 'number') return '';
      return String(str).toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
    });
  } catch (e) {
    console.warn('[DB] Failed to register CLEAN_STR UDF:', e);
  }

  // Create tables with full schema matching cloud sync expectations
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        user_id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT,
        role TEXT DEFAULT 'STAFF',
        restricted_page TEXT,
        permissions TEXT DEFAULT '[]',
        login_enabled INTEGER NOT NULL DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS product_grades (
        grade_id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        category TEXT NOT NULL,
        grade_name TEXT NOT NULL,
        rate REAL NOT NULL DEFAULT 0,
        purchase_price REAL NOT NULL DEFAULT 0,
        offer_price REAL,
        is_deleted INTEGER DEFAULT 0,
        sync_status TEXT DEFAULT 'SYNCED',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(tenant_id, category, grade_name)
    );

    CREATE TABLE IF NOT EXISTS products (
        product_id TEXT PRIMARY KEY,
        tenant_id TEXT,
        name TEXT NOT NULL,
        sku_barcode TEXT,
        item_code TEXT,
        category TEXT,
        hsn_sac_code TEXT,
        purchase_price REAL DEFAULT 0,
        base_price REAL NOT NULL,
        is_gst_applicable INTEGER DEFAULT 1,
        tax_rate_percent REAL DEFAULT 0,
        uom TEXT DEFAULT 'Pcs',
        brand_manufacturer TEXT,
        current_stock REAL DEFAULT 0,
        reorder_level REAL DEFAULT 0,
        domain_attributes TEXT DEFAULT '{}',
        discount_percent REAL,
        discount_flat REAL,
        offer_price REAL,
        is_deleted INTEGER DEFAULT 0,
        billing_type TEXT DEFAULT 'PIECE',
        grade_id TEXT,
        pricing_mode TEXT DEFAULT 'FIXED_PRICE',
        average_weight_per_piece REAL,
        weight_override_allowed INTEGER DEFAULT 0,
        is_service_item INTEGER DEFAULT 0,
        sync_status TEXT DEFAULT 'SYNCED',
        print_status TEXT DEFAULT 'PENDING',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(tenant_id, name, brand_manufacturer),
        UNIQUE(tenant_id, sku_barcode)
    );

    CREATE TABLE IF NOT EXISTS invoices (
        invoice_id TEXT PRIMARY KEY,
        tenant_id TEXT,
        invoice_number TEXT,
        invoice_type TEXT DEFAULT 'tax_invoice',
        customer_id TEXT,
        customer_name TEXT,
        customer_phone TEXT,
        customer_gstin TEXT,
        customer_state TEXT,
        customer_address TEXT,
        subtotal REAL NOT NULL DEFAULT 0,
        tax_total REAL NOT NULL DEFAULT 0,
        discount_total REAL DEFAULT 0,
        discount_type TEXT DEFAULT 'FIXED',
        discount_value REAL DEFAULT 0,
        grand_total REAL NOT NULL DEFAULT 0,
        payment_method TEXT DEFAULT 'CASH',
        split_details TEXT,
        received_amount REAL DEFAULT 0,
        balance_amount REAL DEFAULT 0,
        user_id TEXT,
        return_deduction REAL DEFAULT 0,
        return_invoice_number TEXT,
        is_deleted INTEGER DEFAULT 0,
        sync_status TEXT DEFAULT 'PENDING',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        settled_at DATETIME,
        held_until DATETIME,
        is_held INTEGER DEFAULT 0,
        hold_note TEXT,
        due_date DATETIME,
        scrap_deduction REAL DEFAULT 0,
        scrap_invoice_number TEXT,
        points_earned REAL DEFAULT 0,
        points_redeemed REAL DEFAULT 0,
        points_redeemed_discount REAL DEFAULT 0,
        previous_points_balance REAL DEFAULT 0,
        remaining_points_balance REAL DEFAULT 0,
        converted_from_invoice_id TEXT,
        converted_from_invoice_number TEXT,
        converted_to_invoice_id TEXT,
        converted_to_invoice_number TEXT,
        biller_staff_id TEXT,
        sales_staff_id TEXT,
        cgst_total REAL DEFAULT 0,
        sgst_total REAL DEFAULT 0,
        igst_total REAL DEFAULT 0,
        supply_type TEXT DEFAULT 'INTRA',
        actual_refund_paid REAL DEFAULT 0,
        notes TEXT,
        description TEXT,
        UNIQUE(tenant_id, invoice_number)
    );

    CREATE TABLE IF NOT EXISTS invoice_items (
        item_id TEXT PRIMARY KEY,
        invoice_id TEXT NOT NULL,
        tenant_id TEXT,
        product_id TEXT NOT NULL,
        name TEXT,
        quantity REAL NOT NULL,
        unit_price REAL NOT NULL,
        tax_amount REAL NOT NULL DEFAULT 0,
        total REAL NOT NULL,
        pieces_sold INTEGER,
        billing_type TEXT,
        uom TEXT,
        is_service_item INTEGER DEFAULT 0,
        sync_status TEXT DEFAULT 'PENDING',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        combo_id TEXT,
        combo_details TEXT,
        cgst_rate REAL,
        sgst_rate REAL,
        igst_rate REAL,
        cgst_amount REAL,
        sgst_amount REAL,
        igst_amount REAL,
        hsn_sac_code TEXT,
        supply_type TEXT,
        source_item_id TEXT,
        bos_unit_price REAL,
        bos_tax_amount REAL,
        bos_total REAL,
        qty_from_paper_stock REAL,
        FOREIGN KEY (invoice_id) REFERENCES invoices(invoice_id),
        FOREIGN KEY (product_id) REFERENCES products(product_id)
    );


    CREATE TABLE IF NOT EXISTS parties (
        party_id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        name TEXT NOT NULL,
        phone TEXT,
        address TEXT,
        gstin TEXT,
        balance REAL NOT NULL DEFAULT 0,
        gst_balance REAL NOT NULL DEFAULT 0,
        estimate_balance REAL NOT NULL DEFAULT 0,
        balance_type TEXT DEFAULT 'GST',
        pricing_tier_id TEXT,
        credit_limit REAL NOT NULL DEFAULT 0,
        credit_period_enabled INTEGER DEFAULT 0,
        credit_period_days INTEGER DEFAULT 30,
        credit_period_basis TEXT DEFAULT 'BILL_BASED',
        restrict_on_credit_expiry INTEGER DEFAULT 1,
        whatsapp_alerts_enabled INTEGER DEFAULT 1,
        party_type TEXT DEFAULT 'CUSTOMER',
        custom_category TEXT,
        notes TEXT,
        last_transaction_date DATETIME,
        is_deleted INTEGER DEFAULT 0,
        sync_status TEXT DEFAULT 'SYNCED',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
        balance_type TEXT DEFAULT 'GST',
        payment_method TEXT,
        reference_number TEXT,
        created_by TEXT,
        created_by_name TEXT,
        is_deleted INTEGER DEFAULT 0,
        sync_status TEXT DEFAULT 'SYNCED',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (party_id) REFERENCES parties(party_id)
    );

    CREATE TABLE IF NOT EXISTS settings (
        tenant_id TEXT DEFAULT 'global',
        key TEXT NOT NULL,
        value TEXT,
        sync_status TEXT DEFAULT 'SYNCED',
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (tenant_id, key)
    );

    CREATE TABLE IF NOT EXISTS scrap_categories (
        scrap_category_id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        name TEXT NOT NULL,
        purchase_price REAL DEFAULT 0,
        selling_price REAL DEFAULT 0,
        current_stock REAL DEFAULT 0,
        unit TEXT DEFAULT 'Kgs',
        is_deleted INTEGER DEFAULT 0,
        sync_status TEXT DEFAULT 'SYNCED',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(tenant_id, name)
    );

    CREATE TABLE IF NOT EXISTS scrap_transactions (
        transaction_id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('PURCHASE', 'SALE')),
        scrap_category_id TEXT NOT NULL,
        quantity REAL NOT NULL,
        rate REAL NOT NULL,
        total_amount REAL NOT NULL,
        party_name TEXT,
        customer_phone TEXT,
        customer_address TEXT,
        notes TEXT,
        scrap_invoice_number TEXT,
        payment_status TEXT DEFAULT 'CASH',
        is_deleted INTEGER DEFAULT 0,
        transaction_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        sync_status TEXT DEFAULT 'SYNCED',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS quotations (
        quotation_id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        quotation_number TEXT NOT NULL,
        customer_name TEXT,
        customer_phone TEXT,
        customer_address TEXT,
        customer_gstin TEXT,
        customer_state TEXT,
        is_gst INTEGER DEFAULT 0,
        discount_total REAL DEFAULT 0,
        round_off REAL DEFAULT 0,
        biller_name TEXT,
        terms_conditions TEXT,
        subtotal REAL NOT NULL DEFAULT 0,
        tax_total REAL NOT NULL DEFAULT 0,
        grand_total REAL NOT NULL DEFAULT 0,
        status TEXT DEFAULT 'ACTIVE',
        converted_to_invoice INTEGER DEFAULT 0,
        invoice_id TEXT,
        sync_status TEXT DEFAULT 'SYNCED',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(tenant_id, quotation_number)
    );

    CREATE TABLE IF NOT EXISTS quotation_items (
        item_id TEXT PRIMARY KEY,
        quotation_id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        product_id TEXT,
        name TEXT NOT NULL,
        quantity REAL NOT NULL DEFAULT 1,
        weight REAL,
        rate REAL NOT NULL DEFAULT 0,
        amount REAL NOT NULL DEFAULT 0,
        hsn_code TEXT,
        uom TEXT,
        tax_rate_percent REAL DEFAULT 0,
        discount_amount REAL DEFAULT 0,
        discount_percent REAL DEFAULT 0,
        taxable_amount REAL DEFAULT 0,
        cgst_amount REAL DEFAULT 0,
        sgst_amount REAL DEFAULT 0,
        igst_amount REAL DEFAULT 0,
        sync_status TEXT DEFAULT 'SYNCED',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (quotation_id) REFERENCES quotations(quotation_id)
    );

    CREATE TABLE IF NOT EXISTS warranties (
        warranty_id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        invoice_id TEXT,
        invoice_item_id TEXT,
        bill_number TEXT,
        brand TEXT,
        customer_name TEXT NOT NULL,
        customer_phone TEXT,
        product_name TEXT NOT NULL,
        product_details TEXT,
        purchase_date TEXT NOT NULL,
        warranty_period_days INTEGER NOT NULL,
        expiry_date TEXT NOT NULL,
        notes TEXT,
        sync_status TEXT DEFAULT 'SYNCED',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS purchase_bills (
        purchase_bill_id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        bill_number TEXT NOT NULL,
        supplier_id TEXT,
        supplier_name TEXT NOT NULL,
        bill_date TEXT,
        invoice_number TEXT,
        notes TEXT,
        total_amount REAL DEFAULT 0,
        bill_type TEXT DEFAULT 'GST',
        payment_type TEXT DEFAULT 'CASH',
        sync_status TEXT DEFAULT 'SYNCED',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(tenant_id, bill_number),
        FOREIGN KEY (supplier_id) REFERENCES parties(party_id)
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

    CREATE TABLE IF NOT EXISTS cash_transactions (
        transaction_id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        drawer_id TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('CASH_IN', 'CASH_OUT')),
        amount REAL NOT NULL,
        category TEXT,
        notes TEXT,
        reference_number TEXT,
        entered_by TEXT,
        entered_by_name TEXT,
        transaction_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        sync_status TEXT DEFAULT 'SYNCED',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (drawer_id) REFERENCES cash_drawer(drawer_id)
    );

    CREATE TABLE IF NOT EXISTS cashier_audit_log (
        audit_id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        drawer_id TEXT,
        action TEXT NOT NULL,
        details TEXT,
        performed_by TEXT,
        performed_by_name TEXT,
        performed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        sync_status TEXT DEFAULT 'SYNCED',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS cash_categories (
        category_id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('CASH_IN', 'CASH_OUT')),
        sort_order INTEGER DEFAULT 0,
        is_default INTEGER DEFAULT 0,
        sync_status TEXT DEFAULT 'SYNCED',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS purchase_bill_items (
        item_id TEXT PRIMARY KEY,
        purchase_bill_id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        product_id TEXT NOT NULL,
        name TEXT NOT NULL,
        quantity REAL NOT NULL DEFAULT 0,
        purchase_price REAL NOT NULL DEFAULT 0,
        total_amount REAL NOT NULL DEFAULT 0,
        selling_price REAL DEFAULT 0,
        offer_price REAL DEFAULT 0,
        is_gst_applicable INTEGER DEFAULT 1,
        tax_rate_percent REAL DEFAULT 0,
        hsn_sac_code TEXT,
        skip_stock_update INTEGER DEFAULT 0,
        sync_status TEXT DEFAULT 'SYNCED',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (purchase_bill_id) REFERENCES purchase_bills(purchase_bill_id),
        FOREIGN KEY (product_id) REFERENCES products(product_id)
    );

    CREATE TABLE IF NOT EXISTS returns (
        return_id TEXT PRIMARY KEY,
        invoice_id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        user_id TEXT,
        return_number TEXT NOT NULL,
        customer_name TEXT,
        customer_phone TEXT,
        customer_address TEXT,
        subtotal REAL NOT NULL DEFAULT 0,
        tax_total REAL NOT NULL DEFAULT 0,
        grand_total REAL NOT NULL DEFAULT 0,
        reason TEXT,
        return_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        refund_method TEXT,
        adjusted_invoice_number TEXT,
        adjusted_amount REAL NOT NULL DEFAULT 0,
        sync_status TEXT DEFAULT 'PENDING',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(tenant_id, return_number),
        FOREIGN KEY (invoice_id) REFERENCES invoices(invoice_id)
    );

    CREATE TABLE IF NOT EXISTS return_items (
        return_item_id TEXT PRIMARY KEY,
        return_id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        invoice_item_id TEXT,
        product_id TEXT NOT NULL,
        name TEXT,
        quantity REAL NOT NULL,
        unit_price REAL NOT NULL,
        tax_amount REAL NOT NULL DEFAULT 0,
        total REAL NOT NULL,
        sync_status TEXT DEFAULT 'PENDING',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (return_id) REFERENCES returns(return_id)
    );

    CREATE TABLE IF NOT EXISTS customers (
        customer_id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        name TEXT NOT NULL,
        phone TEXT,
        address TEXT,
        gstin TEXT,
        notes TEXT,
        pricing_tier_id TEXT,
        credit_limit REAL DEFAULT 0,
        credit_period_enabled INTEGER DEFAULT 0,
        credit_period_days INTEGER DEFAULT 30,
        credit_period_basis TEXT DEFAULT 'BILL_BASED',
        restrict_on_credit_expiry INTEGER DEFAULT 1,
        total_points_earned REAL NOT NULL DEFAULT 0,
        total_points_redeemed REAL NOT NULL DEFAULT 0,
        current_points_balance REAL NOT NULL DEFAULT 0,
        last_purchase_date DATETIME,
        is_deleted INTEGER DEFAULT 0,
        sync_status TEXT DEFAULT 'SYNCED',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(tenant_id, phone)
    );

    CREATE TABLE IF NOT EXISTS loyalty_transactions (
        transaction_id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        customer_id TEXT NOT NULL,
        invoice_id TEXT,
        transaction_type TEXT NOT NULL,
        points REAL NOT NULL,
        points_balance_before REAL NOT NULL,
        points_balance_after REAL NOT NULL,
        reference_number TEXT,
        description TEXT,
        created_by TEXT,
        sync_status TEXT DEFAULT 'SYNCED',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (customer_id) REFERENCES customers(customer_id),
        FOREIGN KEY (invoice_id) REFERENCES invoices(invoice_id)
    );

    CREATE TABLE IF NOT EXISTS payment_sources (
        source_id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('BANK', 'CARD', 'UPI')),
        bank_name TEXT,
        account_number TEXT,
        holder_name TEXT,
        upi_id TEXT,
        opening_balance REAL NOT NULL DEFAULT 0,
        current_balance REAL NOT NULL DEFAULT 0,
        is_default INTEGER DEFAULT 0,
        is_enabled INTEGER DEFAULT 1,
        sort_order INTEGER DEFAULT 0,
        is_deleted INTEGER DEFAULT 0,
        sync_status TEXT DEFAULT 'SYNCED',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS payment_source_transactions (
        transaction_id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        source_id TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('CASH_IN', 'CASH_OUT')),
        amount REAL NOT NULL,
        category TEXT,
        reference_number TEXT,
        notes TEXT,
        transaction_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        running_balance REAL NOT NULL DEFAULT 0,
        entered_by TEXT,
        entered_by_name TEXT,
        sync_status TEXT DEFAULT 'SYNCED',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (source_id) REFERENCES payment_sources(source_id)
    );

    CREATE TABLE IF NOT EXISTS pricing_tiers (
        pricing_tier_id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        name TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        sort_order INTEGER NOT NULL DEFAULT 0,
        is_default INTEGER DEFAULT 0,
        is_deleted INTEGER DEFAULT 0,
        sync_status TEXT DEFAULT 'SYNCED',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(tenant_id, name)
    );

    CREATE TABLE IF NOT EXISTS product_pricing (
        product_pricing_id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        product_id TEXT NOT NULL,
        pricing_tier_id TEXT NOT NULL,
        price REAL NOT NULL DEFAULT 0,
        is_deleted INTEGER DEFAULT 0,
        sync_status TEXT DEFAULT 'SYNCED',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(product_id, pricing_tier_id),
        FOREIGN KEY (product_id) REFERENCES products(product_id),
        FOREIGN KEY (pricing_tier_id) REFERENCES pricing_tiers(pricing_tier_id)
    );

    CREATE TABLE IF NOT EXISTS combo_offers (
        combo_id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        name TEXT NOT NULL,
        sku_barcode TEXT,
        combo_price REAL NOT NULL DEFAULT 0,
        is_active INTEGER DEFAULT 1,
        is_deleted INTEGER DEFAULT 0,
        description TEXT,
        sync_status TEXT DEFAULT 'SYNCED',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(tenant_id, sku_barcode)
    );

    CREATE TABLE IF NOT EXISTS combo_items (
        combo_item_id TEXT PRIMARY KEY,
        combo_id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        product_id TEXT NOT NULL,
        quantity REAL NOT NULL DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (combo_id) REFERENCES combo_offers(combo_id) ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES products(product_id)
    );

    CREATE TABLE IF NOT EXISTS staff (
        staff_id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        staff_code TEXT NOT NULL,
        name TEXT NOT NULL,
        phone TEXT,
        email TEXT,
        role_designation TEXT,
        user_id TEXT,
        biller_pin_hash TEXT,
        joining_date TEXT,
        monthly_salary REAL DEFAULT 0,
        status TEXT DEFAULT 'ACTIVE',
        is_deleted INTEGER DEFAULT 0,
        sync_status TEXT DEFAULT 'SYNCED',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(tenant_id, staff_code)
    );

    CREATE TABLE IF NOT EXISTS staff_salaries (
        salary_id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        staff_id TEXT NOT NULL,
        monthly_salary REAL NOT NULL,
        effective_date TEXT NOT NULL,
        notes TEXT,
        created_by TEXT,
        sync_status TEXT DEFAULT 'SYNCED',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (staff_id) REFERENCES staff(staff_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS staff_transactions (
        transaction_id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        staff_id TEXT NOT NULL,
        type TEXT NOT NULL,
        amount REAL NOT NULL,
        payment_method TEXT DEFAULT 'CASH',
        payment_source_id TEXT,
        cash_transaction_id TEXT,
        reference_number TEXT,
        notes TEXT,
        created_by TEXT,
        created_by_name TEXT,
        transaction_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        sync_status TEXT DEFAULT 'SYNCED',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (staff_id) REFERENCES staff(staff_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS staff_ledger (
        ledger_id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        staff_id TEXT NOT NULL,
        transaction_id TEXT,
        transaction_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        description TEXT NOT NULL,
        debit_amount REAL DEFAULT 0,
        credit_amount REAL DEFAULT 0,
        running_balance REAL NOT NULL,
        reference_type TEXT,
        created_by TEXT,
        sync_status TEXT DEFAULT 'SYNCED',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (staff_id) REFERENCES staff(staff_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS staff_attendance (
        attendance_id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        staff_id TEXT NOT NULL,
        date TEXT NOT NULL,
        status TEXT NOT NULL,
        check_in_time TEXT,
        check_out_time TEXT,
        notes TEXT,
        created_by TEXT,
        sync_status TEXT DEFAULT 'SYNCED',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(tenant_id, staff_id, date),
        FOREIGN KEY (staff_id) REFERENCES staff(staff_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS sync_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ecommerce_settings (
        tenant_id TEXT PRIMARY KEY,
        fusioncart_url TEXT DEFAULT 'http://localhost:5050/api',
        store_id INTEGER,
        vendor_id INTEGER,
        store_name TEXT,
        store_slug TEXT,
        store_description TEXT,
        contact_email TEXT,
        contact_phone TEXT,
        registration_status TEXT DEFAULT 'NOT_REQUESTED',
        rejection_reason TEXT,
        last_sync_at DATETIME,
        last_sync_status TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS ecommerce_product_mappings (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        product_id TEXT NOT NULL,
        fusioncart_product_id INTEGER,
        is_online_enabled INTEGER DEFAULT 0,
        online_title_override TEXT,
        online_description_override TEXT,
        online_price_override REAL,
        sync_status TEXT DEFAULT 'PENDING',
        last_error TEXT,
        last_synced_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(tenant_id, product_id)
    );

    CREATE TABLE IF NOT EXISTS ecommerce_sync_logs (
        log_id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        status TEXT NOT NULL,
        details TEXT,
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

    -- Indexes (created after all tables to avoid forward references)
    CREATE INDEX IF NOT EXISTS idx_shop_closing_reports_date ON shop_closing_reports(tenant_id, business_date, trigger_type);
    CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id ON invoice_items(invoice_id);
    CREATE INDEX IF NOT EXISTS idx_invoice_items_tenant_product ON invoice_items(tenant_id, product_id);
    CREATE INDEX IF NOT EXISTS idx_products_tenant_deleted ON products(tenant_id, is_deleted);
    CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(sku_barcode);
    CREATE INDEX IF NOT EXISTS idx_products_item_code ON products(item_code);
    CREATE INDEX IF NOT EXISTS idx_products_grade ON products(grade_id);
    CREATE INDEX IF NOT EXISTS idx_invoices_tenant_type_deleted ON invoices(tenant_id, invoice_type, is_deleted);
    CREATE INDEX IF NOT EXISTS idx_purchase_bill_items_tenant_product ON purchase_bill_items(tenant_id, product_id);
    CREATE INDEX IF NOT EXISTS idx_purchase_bills_tenant_supplier ON purchase_bills(tenant_id, supplier_name);
    CREATE INDEX IF NOT EXISTS idx_product_pricing_tenant_product ON product_pricing(tenant_id, product_id, is_deleted);
    CREATE INDEX IF NOT EXISTS idx_pricing_tiers_tenant ON pricing_tiers(tenant_id, is_deleted);
    CREATE INDEX IF NOT EXISTS idx_ecommerce_product_mappings_tenant_product ON ecommerce_product_mappings(tenant_id, product_id);
    CREATE INDEX IF NOT EXISTS idx_ecommerce_sync_logs_tenant ON ecommerce_sync_logs(tenant_id, created_at);

    -- Performance indexes for customer list & detail queries
    CREATE INDEX IF NOT EXISTS idx_customers_tenant_deleted ON customers(tenant_id, is_deleted);
    CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
    CREATE INDEX IF NOT EXISTS idx_customers_customer_id ON customers(customer_id, tenant_id);
    CREATE INDEX IF NOT EXISTS idx_parties_tenant_phone ON parties(tenant_id, phone, is_deleted);
    CREATE INDEX IF NOT EXISTS idx_parties_tenant_deleted ON parties(tenant_id, is_deleted);
    CREATE INDEX IF NOT EXISTS idx_party_ledger_party_id ON party_ledger(party_id, tenant_id, is_deleted);
    CREATE INDEX IF NOT EXISTS idx_invoices_customer_tenant ON invoices(customer_id, tenant_id, is_deleted);
    CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_customer ON loyalty_transactions(customer_id, tenant_id);
  `);
  const schemaMap: any = {
    product_grades: [
        'tenant_id', 'category', 'grade_name', 'rate', 'purchase_price', 'offer_price', 'is_deleted', 'sync_status', 'created_at', 'updated_at'
    ],
    products: [
        'tenant_id', 'hsn_sac_code', 'is_gst_applicable', 'uom', 'brand_manufacturer', 
        'reorder_level', 'domain_attributes', 'is_deleted', 'sync_status', 'item_code',
        'discount_percent', 'discount_flat', 'offer_price', 'created_at',
        'billing_type', 'grade_id', 'pricing_mode', 'average_weight_per_piece', 'weight_override_allowed',
        'print_status', 'is_service_item'
    ],
    invoices: [
        'tenant_id', 'invoice_number', 'invoice_type', 'subtotal', 'tax_total', 
        'discount_total', 'discount_type', 'discount_value', 'grand_total', 'payment_method', 'split_details', 'user_id', 'sync_status',
        'customer_gstin', 'customer_state', 'customer_address', 'received_amount', 'balance_amount', 'updated_at',
        'scrap_deduction', 'scrap_invoice_number',
        'return_deduction', 'return_invoice_number',
        'customer_id', 'points_earned', 'points_redeemed', 'points_redeemed_discount', 'previous_points_balance', 'remaining_points_balance',
        'held_until', 'is_held', 'hold_note',
        'converted_from_invoice_id', 'converted_from_invoice_number',
        'converted_to_invoice_id', 'converted_to_invoice_number',
        'settled_at',
        'is_deleted',
        'biller_staff_id', 'sales_staff_id',
        'due_date',
        'cgst_total', 'sgst_total', 'igst_total', 'supply_type', 'actual_refund_paid', 'notes', 'description'
    ],
    staff: [
        'staff_id', 'tenant_id', 'staff_code', 'name', 'phone', 'email', 'role_designation', 'user_id', 'biller_pin_hash', 'joining_date', 'monthly_salary', 'status', 'is_deleted', 'sync_status', 'created_at', 'updated_at'
    ],
    staff_salaries: [
        'salary_id', 'tenant_id', 'staff_id', 'monthly_salary', 'effective_date', 'notes', 'created_by', 'sync_status', 'created_at'
    ],
    staff_transactions: [
        'transaction_id', 'tenant_id', 'staff_id', 'type', 'amount', 'payment_method', 'payment_source_id', 'cash_transaction_id', 'reference_number', 'notes', 'created_by', 'created_by_name', 'transaction_date', 'sync_status', 'created_at', 'updated_at'
    ],
    staff_ledger: [
        'ledger_id', 'tenant_id', 'staff_id', 'transaction_id', 'transaction_date', 'description', 'debit_amount', 'credit_amount', 'running_balance', 'reference_type', 'created_by', 'sync_status', 'created_at'
    ],
    staff_attendance: [
        'attendance_id', 'tenant_id', 'staff_id', 'date', 'status', 'check_in_time', 'check_out_time', 'notes', 'created_by', 'sync_status', 'created_at', 'updated_at'
    ],
    invoice_items: [
        'item_id', 'invoice_id', 'tenant_id', 'product_id', 'name', 'quantity', 'unit_price', 'tax_amount', 'total', 'is_service_item',
        'pieces_sold', 'billing_type', 'uom', 'sync_status', 'created_at',
        'combo_id', 'combo_details',
        'cgst_rate', 'sgst_rate', 'igst_rate', 'cgst_amount', 'sgst_amount', 'igst_amount', 'hsn_sac_code', 'supply_type',
        'source_item_id', 'bos_unit_price', 'bos_tax_amount', 'bos_total', 'qty_from_paper_stock'
    ],
    users: [
        'user_id', 'tenant_id', 'name', 'email', 'role', 'created_at'
    ],
    settings: [
        'tenant_id', 'key', 'value', 'sync_status', 'updated_at'
    ],
    parties: [
        'party_id', 'tenant_id', 'name', 'phone', 'address', 'gstin', 'balance', 'gst_balance', 'estimate_balance', 'balance_type', 'notes', 'last_transaction_date', 'is_deleted', 'sync_status', 'created_at', 'updated_at', 'pricing_tier_id', 'credit_limit', 'credit_period_enabled', 'credit_period_days', 'credit_period_basis', 'restrict_on_credit_expiry', 'party_type', 'custom_category'
    ],
    party_ledger: [
        'ledger_id', 'party_id', 'tenant_id', 'transaction_date', 'description', 'credit_amount', 'debit_amount', 'running_balance', 'balance_type', 'payment_method', 'reference_number', 'created_by', 'created_by_name', 'is_deleted', 'sync_status', 'created_at', 'updated_at'
    ],
    scrap_categories: [
        'scrap_category_id', 'tenant_id', 'name', 'purchase_price', 'selling_price', 'current_stock', 'unit', 'is_deleted', 'sync_status', 'created_at', 'updated_at'
    ],
    scrap_transactions: [
        'transaction_id', 'tenant_id', 'type', 'scrap_category_id', 'quantity', 'rate', 'total_amount', 'party_name', 'customer_phone', 'customer_address', 'notes', 'transaction_date', 'is_deleted', 'sync_status', 'created_at', 'updated_at', 'scrap_invoice_number'
    ],
    quotations: [
        'quotation_id', 'tenant_id', 'quotation_number', 'customer_name', 'customer_phone', 'customer_address', 'customer_gstin', 'customer_state', 'is_gst', 'discount_total', 'round_off', 'biller_name', 'terms_conditions', 'subtotal', 'tax_total', 'grand_total', 'status', 'converted_to_invoice', 'invoice_id', 'sync_status', 'created_at', 'updated_at'
    ],
    quotation_items: [
        'item_id', 'quotation_id', 'tenant_id', 'product_id', 'name', 'quantity', 'weight', 'rate', 'amount', 'hsn_code', 'uom', 'tax_rate_percent', 'discount_amount', 'discount_percent', 'taxable_amount', 'cgst_amount', 'sgst_amount', 'igst_amount', 'sync_status', 'created_at'
    ],
    warranties: [
        'warranty_id', 'tenant_id', 'invoice_id', 'invoice_item_id', 'bill_number', 'brand', 'customer_name', 'customer_phone', 'product_name', 'product_details', 'purchase_date', 'warranty_period_days', 'expiry_date', 'notes', 'sync_status', 'created_at', 'updated_at'
    ],
    purchase_bills: [
        'purchase_bill_id', 'tenant_id', 'bill_number', 'supplier_id', 'supplier_name', 'bill_date', 'invoice_number', 'notes', 'total_amount', 'bill_type', 'sync_status', 'created_at', 'updated_at'
    ],
    purchase_bill_items: [
        'item_id', 'purchase_bill_id', 'tenant_id', 'product_id', 'name', 'quantity', 'purchase_price', 'total_amount', 'selling_price', 'offer_price', 'is_gst_applicable', 'tax_rate_percent', 'hsn_sac_code', 'skip_stock_update', 'sync_status', 'created_at', 'updated_at'
    ],
    cash_drawer: [
        'drawer_id', 'tenant_id', 'business_date', 'opening_balance', 'cash_sales', 'cash_in', 'cash_out',
        'current_cash', 'expected_closing', 'actual_cash', 'cash_short', 'cash_excess', 'closing_remarks',
        'status', 'opened_by', 'closed_by', 'opened_at', 'closed_at', 'sync_status', 'created_at', 'updated_at'
    ],
    cash_transactions: [
        'transaction_id', 'tenant_id', 'drawer_id', 'type', 'amount', 'category', 'notes', 'reference_number',
        'entered_by', 'entered_by_name', 'transaction_date', 'sync_status', 'created_at', 'updated_at'
    ],
    cashier_audit_log: [
        'audit_id', 'tenant_id', 'drawer_id', 'action', 'details', 'performed_by', 'performed_by_name',
        'performed_at', 'sync_status', 'created_at'
    ],
    customers: [
        'customer_id', 'tenant_id', 'name', 'phone', 'address', 'gstin', 'notes', 'total_points_earned', 'total_points_redeemed',
        'current_points_balance', 'pricing_tier_id', 'credit_limit', 'credit_period_enabled', 'credit_period_days', 'credit_period_basis', 'restrict_on_credit_expiry', 'last_purchase_date', 'is_deleted', 'sync_status', 'created_at', 'updated_at'
    ],
    returns: [
        'return_id', 'invoice_id', 'tenant_id', 'user_id', 'return_number', 'customer_name', 'customer_phone', 'customer_address',
        'subtotal', 'tax_total', 'grand_total', 'reason', 'return_date', 'sync_status', 'created_at', 'updated_at',
        'refund_method', 'adjusted_invoice_number', 'adjusted_amount'
    ],
    return_items: [
        'return_item_id', 'return_id', 'tenant_id', 'invoice_item_id', 'product_id', 'name', 'quantity',
        'unit_price', 'tax_amount', 'total', 'sync_status', 'created_at'
    ],
    loyalty_transactions: [
        'transaction_id', 'tenant_id', 'customer_id', 'invoice_id', 'transaction_type', 'points',
        'points_balance_before', 'points_balance_after', 'reference_number', 'description', 'created_by',
        'sync_status', 'created_at', 'updated_at'
    ],
    cash_categories: [
        'category_id', 'tenant_id', 'name', 'type', 'sort_order', 'is_default', 'sync_status', 'created_at', 'updated_at'
    ],
    payment_sources: [
        'source_id', 'tenant_id', 'name', 'type', 'bank_name', 'account_number', 'holder_name',
        'upi_id', 'opening_balance', 'current_balance', 'is_default', 'is_enabled', 'sort_order',
        'is_deleted', 'sync_status', 'created_at', 'updated_at'
    ],
    payment_source_transactions: [
        'transaction_id', 'tenant_id', 'source_id', 'type', 'amount', 'category', 'reference_number',
        'notes', 'transaction_date', 'running_balance', 'entered_by', 'entered_by_name',
        'sync_status', 'created_at', 'updated_at'
    ],
    pricing_tiers: [
        'pricing_tier_id', 'tenant_id', 'name', 'is_active', 'sort_order', 'is_default', 'is_deleted',
        'sync_status', 'created_at', 'updated_at'
    ],
    product_pricing: [
        'product_pricing_id', 'tenant_id', 'product_id', 'pricing_tier_id', 'price',
        'is_deleted', 'sync_status', 'created_at', 'updated_at'
    ]
  };

  for (const table in schemaMap) {
    let existingCols: string[] = [];
    try {
      const info = db.prepare(`PRAGMA table_info(${table})`).all();
      existingCols = info.map((c: any) => c.name);
    } catch (e: any) {
      console.warn(`[DB Migration] Could not retrieve table_info for ${table}:`, e.message);
      continue;
    }

    for (const col of schemaMap[table]) {
      if (!existingCols.includes(col)) {
        console.log(`[DB Migration] Adding missing column ${col} to ${table} table...`);
        // We use TEXT or REAL depending on column name suffix or type
        let type = 'TEXT';
        if (['weight_override_allowed', 'is_service_item', 'is_held', 'is_deleted', 'is_default', 'is_active', 'is_enabled', 'is_gst'].includes(col)) {
          type = 'INTEGER DEFAULT 0';
        } else if (col === 'print_status') {
          type = "TEXT DEFAULT 'PENDING'";
        } else if (['discount_percent', 'discount_flat', 'offer_price', 'average_weight_per_piece', 'rate', 'points_earned', 'points_redeemed', 'points_redeemed_discount', 'previous_points_balance', 'remaining_points_balance'].includes(col)) {
          type = 'REAL';
        } else if (col.includes('price') || col.includes('total') || col.includes('amount') || col.includes('tax') || col.includes('stock') || col.includes('level') || col.includes('deduction')) {
          type = 'REAL DEFAULT 0';
        } else if (col === 'created_at' || col === 'updated_at') {
          type = 'DATETIME'; // SQLite does not allow CURRENT_TIMESTAMP in ALTER TABLE ADD COLUMN
        }
        try {
          db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`);
        } catch (e: any) {
          console.warn(`[DB Migration] Failed to add column ${col} to ${table}:`, e.message);
        }
      }
    }
  }
  
  // Cleanup/Migration for legacy columns (if any existed before restoration)
  try {
     // Normalize pricing_tiers is_default column values to INTEGER 0 / 1
     db.exec("UPDATE pricing_tiers SET is_default = 0 WHERE is_default = '0' OR is_default IS NULL OR is_default = 'false'");
     db.exec("UPDATE pricing_tiers SET is_default = 1 WHERE is_default = '1' OR is_default = 'true' OR is_default = true");

     // If user had total_amount instead of grand_total
     const invInfo = db.prepare(`PRAGMA table_info(invoices)`).all();
     if (invInfo.some((c: any) => c.name === 'total_amount') && invInfo.some((c: any) => c.name === 'grand_total')) {
        db.exec("UPDATE invoices SET grand_total = total_amount WHERE grand_total = 0 AND total_amount > 0");
     }
  } catch (e) {}

  // Sanitize empty string sku_barcodes to NULL before applying unique constraints
  // SQLite treats multiple NULLs as distinct, but multiple empty strings as duplicates
  try {
    db.exec("UPDATE products SET sku_barcode = NULL WHERE trim(sku_barcode) = ''");
  } catch (e: any) {
    console.warn('[DB Migration] Failed to sanitize empty sku_barcodes:', e.message);
  }

  // Self-healing migration for paper purchase price and paper MRP
  try {
    const stalePaperProducts = db.prepare(`
      SELECT pbi.product_id, pbi.purchase_price, pbi.selling_price, p.domain_attributes
      FROM purchase_bill_items pbi
      JOIN purchase_bills pb ON pbi.purchase_bill_id = pb.purchase_bill_id
      JOIN products p ON pbi.product_id = p.product_id
      WHERE (pb.bill_type = 'GST' OR pbi.skip_stock_update = 1)
      ORDER BY pbi.rowid ASC
    `).all() as any[];
    for (const row of stalePaperProducts) {
      let da: Record<string, any> = {};
      try { da = JSON.parse(row.domain_attributes || '{}'); } catch {}
      let changed = false;
      if (row.purchase_price > 0 && !da.gst_purchase_price) {
        da.gst_purchase_price = row.purchase_price;
        da.paper_purchase_price = row.purchase_price;
        changed = true;
      }
      if (row.selling_price > 0 && !da.paper_mrp) {
        da.paper_mrp = row.selling_price;
        da.paper_base_price = row.selling_price;
        changed = true;
      }
      if (changed) {
        db.prepare(`UPDATE products SET domain_attributes = ? WHERE product_id = ?`).run(JSON.stringify(da), row.product_id);
      }
    }
  } catch (e: any) {
    console.warn('[DB Migration] Failed to sync paper domain attributes:', e.message);
  }

  // Repair historical incomplete quotations that have non-zero total but 0 items due to legacy sync
  try {
    const repairedCount = db.prepare(`
      UPDATE quotations
      SET sync_status = 'PENDING'
      WHERE (subtotal > 0 OR grand_total > 0)
        AND (status IS NULL OR status != 'DELETED')
        AND quotation_id NOT IN (SELECT DISTINCT quotation_id FROM quotation_items WHERE quotation_id IS NOT NULL);
    `).run().changes;
    if (repairedCount > 0) {
      console.log(`[DB Migration] Flagged ${repairedCount} incomplete historical quotations for item re-sync.`);
    }
  } catch (e: any) {
    console.warn('[DB Migration] Failed to flag incomplete quotations for re-sync:', e.message);
  }

  // Deduplicate historical quotation_items, keeping only the latest revision batch per quotation
  try {
    const dedupedCount = db.prepare(`
      DELETE FROM quotation_items
      WHERE created_at != (
        SELECT MAX(qi2.created_at)
        FROM quotation_items qi2
        WHERE qi2.quotation_id = quotation_items.quotation_id
      )
    `).run().changes;
    if (dedupedCount > 0) {
      console.log(`[DB Migration] Cleaned up ${dedupedCount} stale/duplicate quotation items.`);
    }
  } catch (e: any) {
    console.warn('[DB Migration] Failed to deduplicate quotation items:', e.message);
  }

  // Deduplicate actual sku_barcode conflicts before applying unique constraints
  try {
    db.exec(`
      UPDATE products 
      SET sku_barcode = sku_barcode || '-dup-' || substr(product_id, 1, 4),
          sync_status = 'PENDING',
          updated_at = CURRENT_TIMESTAMP
      WHERE product_id NOT IN (
          SELECT MIN(product_id)
          FROM products
          WHERE sku_barcode IS NOT NULL
          GROUP BY tenant_id, sku_barcode
      ) AND sku_barcode IS NOT NULL
    `);
  } catch (e: any) {
    console.warn('[DB Migration] Failed to deduplicate sku_barcodes:', e.message);
  }

  // Ensure unique indexes for existing installations
  try {
    db.exec("DROP INDEX IF EXISTS idx_uq_product_name_tenant");
    db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_uq_product_name_brand_tenant ON products(tenant_id, name, brand_manufacturer)");
  } catch (e: any) {
    console.warn('[DB Migration] Could not create unique index for name/brand. Duplicate data might exist.', e.message);
  }

  try {
    db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_uq_product_barcode_tenant ON products(tenant_id, sku_barcode)");
  } catch (e: any) {
    console.warn('[DB Migration] Could not create unique index for barcode. Duplicate data might exist.', e.message);
  }

  try {
    db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_uq_invoice_number_tenant ON invoices(tenant_id, invoice_number)");
  } catch (e: any) {
    console.warn('[DB Migration] Could not create unique index for invoice number. Duplicate data might exist.', e.message);
  }

  try {
    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_parties_tenant_name_phone_customer 
      ON parties(tenant_id, name, phone) 
      WHERE party_type = 'CUSTOMER' AND (is_deleted IS NULL OR is_deleted = 0);
    `);
  } catch (e: any) {
    console.warn('[DB Migration] Could not create unique index for parties:', e.message);
  }

  // Fix inline constraint for products table by recreating it if needed
  try {
    const tableSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='products'").get() as any;
    if (tableSql && (!/UNIQUE\s*\([^)]*brand_manufacturer[^)]*\)/i.test(tableSql.sql) || !/UNIQUE\s*\([^)]*sku_barcode[^)]*\)/i.test(tableSql.sql))) {
      console.log('[DB Migration] Recreating products table to fix inline UNIQUE constraint...');
      db.exec('PRAGMA foreign_keys=off;');
      
      const migrateTable = db.transaction(() => {
        db.exec(`
          CREATE TABLE products_new (
              product_id TEXT PRIMARY KEY,
              tenant_id TEXT,
              name TEXT NOT NULL,
              sku_barcode TEXT,
              item_code TEXT,
              category TEXT,
              hsn_sac_code TEXT,
              purchase_price REAL DEFAULT 0,
              base_price REAL NOT NULL,
              is_gst_applicable INTEGER DEFAULT 1,
              tax_rate_percent REAL DEFAULT 0,
              uom TEXT DEFAULT 'Pcs',
              brand_manufacturer TEXT,
              current_stock REAL DEFAULT 0,
              reorder_level REAL DEFAULT 0,
              domain_attributes TEXT DEFAULT '{}',
              discount_percent REAL,
              discount_flat REAL,
              offer_price REAL,
              is_deleted INTEGER DEFAULT 0,
              billing_type TEXT DEFAULT 'PIECE',
              grade_id TEXT,
              pricing_mode TEXT DEFAULT 'FIXED_PRICE',
              average_weight_per_piece REAL,
              weight_override_allowed INTEGER DEFAULT 0,
              sync_status TEXT DEFAULT 'SYNCED',
              print_status TEXT DEFAULT 'PENDING',
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              UNIQUE(tenant_id, name, brand_manufacturer),
              UNIQUE(tenant_id, sku_barcode)
          );
        `);
        const columnsInfo = db.prepare("PRAGMA table_info(products)").all();
        const columnNames = columnsInfo.map((c: any) => c.name).join(', ');
        db.exec(`INSERT INTO products_new (${columnNames}) SELECT ${columnNames} FROM products;`);
        db.exec('DROP TABLE products;');
        db.exec('ALTER TABLE products_new RENAME TO products;');
      });
      
      migrateTable();
      db.exec('PRAGMA foreign_keys=on;');
      console.log('[DB Migration] Products table recreated successfully.');
    }
  } catch (e: any) {
    console.warn('[DB Migration] Failed to recreate products table for constraint update:', e.message);
  }

  // Fix NOT NULL constraint for product_grades.offer_price by recreating it if needed
  try {
    const info = db.prepare("PRAGMA table_info(product_grades)").all() as any[];
    const offerPriceCol = info.find(c => c.name === 'offer_price');
    if (offerPriceCol && offerPriceCol.notnull === 1) {
      console.log('[DB Migration] Recreating product_grades table to allow NULL for offer_price...');
      db.exec('PRAGMA foreign_keys=off;');
      
      const migrateGradesTable = db.transaction(() => {
        db.exec(`
          CREATE TABLE product_grades_new (
              grade_id TEXT PRIMARY KEY,
              tenant_id TEXT NOT NULL,
              category TEXT NOT NULL,
              grade_name TEXT NOT NULL,
              rate REAL NOT NULL DEFAULT 0,
              purchase_price REAL NOT NULL DEFAULT 0,
              offer_price REAL,
              is_deleted INTEGER DEFAULT 0,
              sync_status TEXT DEFAULT 'SYNCED',
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              UNIQUE(tenant_id, category, grade_name)
          );
        `);
        const columnsInfo = db.prepare("PRAGMA table_info(product_grades)").all();
        const columnNames = columnsInfo.map((c: any) => c.name).join(', ');
        db.exec(`INSERT INTO product_grades_new (${columnNames}) SELECT ${columnNames} FROM product_grades;`);
        db.exec('DROP TABLE product_grades;');
        db.exec('ALTER TABLE product_grades_new RENAME TO product_grades;');
      });
      
      migrateGradesTable();
      db.exec('PRAGMA foreign_keys=on;');
      console.log('[DB Migration] Product_grades table recreated successfully.');
    }
  } catch (e: any) {
    console.warn('[DB Migration] Failed to recreate product_grades table:', e.message);
  }

  // Repair corrupted invoice_items foreign key pointing to products_old
  try {
    const invItemsInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='invoice_items'").get() as any;
    if (invItemsInfo && invItemsInfo.sql.includes('products_old')) {
      console.log('[DB Migration] Repairing corrupted invoice_items foreign key...');
      db.exec('PRAGMA foreign_keys=off;');
      const repairTable = db.transaction(() => {
         db.exec(`
          CREATE TABLE invoice_items_new (
              item_id TEXT PRIMARY KEY,
              invoice_id TEXT NOT NULL,
              tenant_id TEXT,
              product_id TEXT NOT NULL,
              name TEXT,
              quantity REAL NOT NULL,
              unit_price REAL NOT NULL,
              tax_amount REAL DEFAULT 0,
              total REAL NOT NULL,
              FOREIGN KEY (invoice_id) REFERENCES invoices(invoice_id),
              FOREIGN KEY (product_id) REFERENCES products(product_id)
          );
         `);
         const cols = db.prepare("PRAGMA table_info(invoice_items)").all().map((c: any) => c.name).join(', ');
         db.exec(`INSERT INTO invoice_items_new (${cols}) SELECT ${cols} FROM invoice_items;`);
         db.exec('DROP TABLE invoice_items;');
         db.exec('ALTER TABLE invoice_items_new RENAME TO invoice_items;');
      });
      repairTable();
      db.exec('PRAGMA foreign_keys=on;');
      console.log('[DB Migration] invoice_items repaired successfully.');
    }
  } catch (e: any) {
    console.warn('[DB Migration] Failed to repair invoice_items table:', e.message);
  }

  // Migrate settings table to include tenant_id if it's missing
  try {
    const settingsInfo = db.prepare(`PRAGMA table_info(settings)`).all();
    if (!settingsInfo.some((c: any) => c.name === 'tenant_id')) {
      console.log('[DB Migration] Upgrading settings table to support tenant_id...');
      db.exec(`
        CREATE TABLE settings_new (
            tenant_id TEXT DEFAULT 'global',
            key TEXT NOT NULL,
            value TEXT,
            sync_status TEXT DEFAULT 'SYNCED',
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (tenant_id, key)
        );
        INSERT INTO settings_new (key, value, updated_at) SELECT key, value, updated_at FROM settings;
        DROP TABLE settings;
        ALTER TABLE settings_new RENAME TO settings;
      `);
    }
  } catch (e: any) {
    console.warn('[DB Migration] Failed to migrate settings table', e.message);
  }

  // Ensure defaults for is_deleted are set for legacy data
  db.exec("UPDATE products SET is_deleted = 0 WHERE is_deleted IS NULL");

  // HSN/SAC-coded products belong to the GST list, including zero-rated items.
  try {
    const promoted = db.prepare(`
      UPDATE products
      SET is_gst_applicable = 1, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
      WHERE COALESCE(is_deleted, 0) = 0
        AND COALESCE(is_gst_applicable, 0) <> 1
        AND TRIM(COALESCE(hsn_sac_code, '')) <> ''
    `).run().changes;
    if (promoted > 0) {
      console.log(`[DB Migration] Marked ${promoted} HSN/SAC-coded products as GST-applicable.`);
    }
  } catch (e: any) {
    console.warn('[DB Migration] Failed to classify HSN/SAC-coded products:', e.message);
  }

  // Backfill created_at and updated_at for existing rows
  db.exec("UPDATE products SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL");
  db.exec("UPDATE products SET updated_at = CURRENT_TIMESTAMP WHERE updated_at IS NULL");

  // Fix inconsistent ISO date strings in all tables
  const dateFixQueries = [
    "UPDATE products SET created_at = REPLACE(REPLACE(created_at, 'T', ' '), 'Z', '') WHERE created_at LIKE '%T%Z'",
    "UPDATE products SET updated_at = REPLACE(REPLACE(updated_at, 'T', ' '), 'Z', '') WHERE updated_at LIKE '%T%Z'",
    "UPDATE invoices SET created_at = REPLACE(REPLACE(created_at, 'T', ' '), 'Z', '') WHERE created_at LIKE '%T%Z'",
    "UPDATE users SET created_at = REPLACE(REPLACE(created_at, 'T', ' '), 'Z', '') WHERE created_at LIKE '%T%Z'",
    "UPDATE settings SET updated_at = REPLACE(REPLACE(updated_at, 'T', ' '), 'Z', '') WHERE updated_at LIKE '%T%Z'",
    "UPDATE product_grades SET created_at = REPLACE(REPLACE(created_at, 'T', ' '), 'Z', '') WHERE created_at LIKE '%T%Z'",
    "UPDATE product_grades SET updated_at = REPLACE(REPLACE(updated_at, 'T', ' '), 'Z', '') WHERE updated_at LIKE '%T%Z'",
    "UPDATE parties SET created_at = REPLACE(REPLACE(created_at, 'T', ' '), 'Z', '') WHERE created_at LIKE '%T%Z'",
    "UPDATE parties SET updated_at = REPLACE(REPLACE(updated_at, 'T', ' '), 'Z', '') WHERE updated_at LIKE '%T%Z'",
    "UPDATE pricing_tiers SET created_at = REPLACE(REPLACE(created_at, 'T', ' '), 'Z', '') WHERE created_at LIKE '%T%Z'",
    "UPDATE pricing_tiers SET updated_at = REPLACE(REPLACE(updated_at, 'T', ' '), 'Z', '') WHERE updated_at LIKE '%T%Z'",
    "UPDATE product_pricing SET created_at = REPLACE(REPLACE(created_at, 'T', ' '), 'Z', '') WHERE created_at LIKE '%T%Z'",
    "UPDATE product_pricing SET updated_at = REPLACE(REPLACE(updated_at, 'T', ' '), 'Z', '') WHERE updated_at LIKE '%T%Z'",
    "UPDATE party_ledger SET created_at = REPLACE(REPLACE(created_at, 'T', ' '), 'Z', '') WHERE created_at LIKE '%T%Z'",
    "UPDATE party_ledger SET updated_at = REPLACE(REPLACE(updated_at, 'T', ' '), 'Z', '') WHERE updated_at LIKE '%T%Z'",
  ];
  for (const q of dateFixQueries) {
    try { db.exec(q); } catch (e: any) { console.warn('[DB] Date fix query failed:', e.message); }
  }

  // Clean up any corrupted settings that contain operation failure error objects
  try {
    db.exec("DELETE FROM settings WHERE value = '{\"error\":\"Operation failed\"}'");
  } catch (e: any) {
    console.warn('[DB Migration] Settings cleanup failed:', e.message);
  }

  // Migrate legacy scrap_items data into scrap_categories (categories ARE items now)
  try {
    const hasScrapItems = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='scrap_items'").get();
    if (hasScrapItems) {
      const legacyItems: any[] = db.prepare(
        "SELECT si.*, sc.name as cat_name FROM scrap_items si LEFT JOIN scrap_categories sc ON si.scrap_category_id = sc.scrap_category_id WHERE si.is_deleted = 0"
      ).all();
      for (const item of legacyItems) {
        if (item.scrap_category_id && item.cat_name) {
          // Item has a category: add its stock to the category
          db.prepare(`UPDATE scrap_categories SET current_stock = COALESCE(current_stock,0) + ?, purchase_price = MAX(COALESCE(purchase_price,0), ?), selling_price = MAX(COALESCE(selling_price,0), ?), sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE scrap_category_id = ?`).run(
            item.current_stock || 0, item.purchase_price || 0, item.selling_price || 0, item.scrap_category_id
          );
        } else {
          // Item without a category: create a new category with this item's data
          const existing = db.prepare("SELECT scrap_category_id FROM scrap_categories WHERE tenant_id = ? AND name = ?").get(item.tenant_id, item.name);
          if (!existing) {
            db.prepare(`
              INSERT INTO scrap_categories (scrap_category_id, tenant_id, name, purchase_price, selling_price, current_stock, unit, is_deleted, sync_status, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'PENDING', ?, ?)
            `).run(item.scrap_item_id, item.tenant_id, item.name, item.purchase_price || 0, item.selling_price || 0, item.current_stock || 0, item.unit || 'Kgs', item.created_at || localTimestamp(), item.updated_at || localTimestamp());
          }
        }
      }
      // Migrate scrap_transactions to reference scrap_categories
      const legacyTxs: any[] = db.prepare(
        `SELECT st.*, si.scrap_category_id as si_cat_id FROM scrap_transactions st LEFT JOIN scrap_items si ON st.scrap_item_id = si.scrap_item_id`
      ).all();
      for (const tx of legacyTxs) {
        const catId = tx.si_cat_id || tx.scrap_category_id;
        if (catId && !tx.scrap_category_id) {
          db.prepare("UPDATE scrap_transactions SET scrap_category_id = ? WHERE transaction_id = ?").run(catId, tx.transaction_id);
        }
      }
      // Drop the scrap_items table
      db.exec("DROP TABLE IF EXISTS scrap_items");
      console.log('[DB Migration] Legacy scrap_items data migrated to scrap_categories');
    }
  } catch (e: any) {
    console.warn('[DB Migration] Scrap items migration skipped:', e.message);
  }

  // Drop legacy scrap_item_id / scarp_item_id columns from scrap_transactions
  // Recreate the table to ensure the column is fully removed (more reliable than ALTER DROP COLUMN)
  try {
    const scrapTxCols = db.prepare(`PRAGMA table_info(scrap_transactions)`).all().map((c: any) => c.name);
    const hasLegacyCol = scrapTxCols.includes('scrap_item_id') || scrapTxCols.includes('scarp_item_id');
    if (hasLegacyCol) {
      console.log('[DB Migration] Recreating scrap_transactions to remove legacy columns...');
      db.exec('PRAGMA foreign_keys=off;');
      const migrateScrapTx = db.transaction(() => {
        db.exec(`
          CREATE TABLE scrap_transactions_new (
            transaction_id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL,
            type TEXT NOT NULL CHECK(type IN ('PURCHASE', 'SALE')),
            scrap_category_id TEXT NOT NULL,
            quantity REAL NOT NULL,
            rate REAL NOT NULL,
            total_amount REAL NOT NULL,
            party_name TEXT,
            customer_phone TEXT,
            customer_address TEXT,
            notes TEXT,
            transaction_date DATETIME DEFAULT CURRENT_TIMESTAMP,
            sync_status TEXT DEFAULT 'SYNCED',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            scrap_invoice_number TEXT
          );
        `);
        const cols = db.prepare("PRAGMA table_info(scrap_transactions)").all()
          .map((c: any) => c.name)
          .filter((n: string) => !['scrap_item_id', 'scarp_item_id'].includes(n))
          .join(', ');
        db.exec(`INSERT INTO scrap_transactions_new (${cols}) SELECT ${cols} FROM scrap_transactions;`);
        db.exec('DROP TABLE scrap_transactions;');
        db.exec('ALTER TABLE scrap_transactions_new RENAME TO scrap_transactions;');
      });
      migrateScrapTx();
      db.exec('PRAGMA foreign_keys=on;');
      console.log('[DB Migration] scrap_transactions recreated successfully.');
    }
  } catch (e: any) {
    console.warn('[DB Migration] Failed to recreate scrap_transactions table:', e.message);
  }

  // Migration: Add payment_status/scrap_invoice_number column to scrap_transactions
  try {
    const scrapTxCols = db.prepare(`PRAGMA table_info(scrap_transactions)`).all().map((c: any) => c.name);
    if (!scrapTxCols.includes('scrap_invoice_number')) {
      console.log('[DB Migration] Adding scrap_invoice_number to scrap_transactions...');
      db.exec("ALTER TABLE scrap_transactions ADD COLUMN scrap_invoice_number TEXT");
    }
    if (!scrapTxCols.includes('payment_status')) {
      console.log('[DB Migration] Adding payment_status to scrap_transactions...');
      db.exec("ALTER TABLE scrap_transactions ADD COLUMN payment_status TEXT DEFAULT 'CASH'");
    }
    if (!scrapTxCols.includes('customer_phone')) {
      console.log('[DB Migration] Adding customer_phone to scrap_transactions...');
      db.exec("ALTER TABLE scrap_transactions ADD COLUMN customer_phone TEXT");
    }
    if (!scrapTxCols.includes('customer_address')) {
      console.log('[DB Migration] Adding customer_address to scrap_transactions...');
      db.exec("ALTER TABLE scrap_transactions ADD COLUMN customer_address TEXT");
    }
  } catch (e: any) {
    console.warn('[DB Migration] Failed to add scrap_transactions columns:', e.message);
  }

  // Migration: Add is_deleted column to scrap_transactions
  try {
    const scrapTxCols = db.prepare(`PRAGMA table_info(scrap_transactions)`).all().map((c: any) => c.name);
    if (!scrapTxCols.includes('is_deleted')) {
      console.log('[DB Migration] Adding is_deleted to scrap_transactions...');
      db.exec("ALTER TABLE scrap_transactions ADD COLUMN is_deleted INTEGER DEFAULT 0");
    }
  } catch (e: any) {
    console.warn('[DB Migration] Failed to add is_deleted to scrap_transactions:', e.message);
  }

  // Migration: Add missing columns to invoices explicitly (including split_details)
  try {
    const invCols = db.prepare(`PRAGMA table_info(invoices)`).all().map((c: any) => c.name);
    const invoiceColsToEnsure: Record<string, string> = {
      split_details: 'TEXT',
      held_until: 'DATETIME',
      is_held: 'INTEGER DEFAULT 0',
      hold_note: 'TEXT',
      scrap_deduction: 'REAL DEFAULT 0',
      scrap_invoice_number: 'TEXT',
      return_deduction: 'REAL DEFAULT 0',
      return_invoice_number: 'TEXT',
      customer_id: 'TEXT',
      points_earned: 'REAL DEFAULT 0',
      points_redeemed: 'REAL DEFAULT 0',
      points_redeemed_discount: 'REAL DEFAULT 0',
      previous_points_balance: 'REAL DEFAULT 0',
      remaining_points_balance: 'REAL DEFAULT 0',
      converted_from_invoice_id: 'TEXT',
      converted_from_invoice_number: 'TEXT',
      converted_to_invoice_id: 'TEXT',
      converted_to_invoice_number: 'TEXT',
      is_deleted: 'INTEGER DEFAULT 0',
      actual_refund_paid: 'REAL DEFAULT 0',
      notes: 'TEXT',
      description: 'TEXT',
    };

    for (const [colName, colType] of Object.entries(invoiceColsToEnsure)) {
      if (!invCols.includes(colName)) {
        console.log(`[DB Migration] Adding missing column ${colName} (${colType}) to invoices...`);
        try {
          db.exec(`ALTER TABLE invoices ADD COLUMN ${colName} ${colType}`);
        } catch (colErr: any) {
          console.warn(`[DB Migration] Failed to add column ${colName} to invoices:`, colErr.message);
        }
      }
    }

    // Normalize string '0.0' or '0' or NULL to integer 0 for clean SQLite queries across all tables
    const tablesToNormalize = ['invoices', 'products', 'parties', 'scrap_categories', 'product_grades', 'pricing_tiers', 'product_pricing'];
    for (const tbl of tablesToNormalize) {
      try {
        db.exec(`UPDATE ${tbl} SET is_deleted = 0 WHERE is_deleted = '0.0' OR is_deleted = '0' OR is_deleted = 0.0 OR is_deleted IS NULL;`);
      } catch {}
    }
  } catch (e: any) {
    console.warn('[DB Migration] Failed to add/normalize columns in invoices:', e.message);
  }

  // Migration: Fix non-UUID product_pricing_id in product_pricing
  try {
    const invalidRows = db.prepare(`
      SELECT product_pricing_id, product_id, pricing_tier_id, tenant_id 
      FROM product_pricing 
      WHERE product_pricing_id NOT LIKE '________-____-____-____-____________'
    `).all() as any[];
    if (Array.isArray(invalidRows) && invalidRows.length > 0) {
      const updStmt = db.prepare(`UPDATE product_pricing SET product_pricing_id = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE product_id = ? AND pricing_tier_id = ? AND tenant_id = ?`);
      for (const r of invalidRows) {
        updStmt.run(crypto.randomUUID(), r.product_id, r.pricing_tier_id, r.tenant_id);
      }
    }
  } catch (e: any) {
    console.warn('[DB Migration] Failed to fix non-UUID product_pricing_id:', e.message);
  }

  // Migration: Add bill_type column to purchase_bills
  try {
    const pbCols = db.prepare(`PRAGMA table_info(purchase_bills)`).all().map((c: any) => c.name);
    if (!pbCols.includes('bill_type')) {
      console.log('[DB Migration] Adding bill_type to purchase_bills...');
      db.exec("ALTER TABLE purchase_bills ADD COLUMN bill_type TEXT DEFAULT 'GST'");
    }
  } catch (e: any) {
    console.warn('[DB Migration] Failed to add bill_type to purchase_bills:', e.message);
  }

  // Migration: Normalize business_date in cash_drawer to pure YYYY-MM-DD
  try {
    const drawers = db.prepare(`SELECT drawer_id, business_date FROM cash_drawer WHERE business_date IS NOT NULL`).all() as any[];
    if (Array.isArray(drawers) && drawers.length > 0) {
      const upd = db.prepare(`UPDATE cash_drawer SET business_date = ? WHERE drawer_id = ?`);
      for (const d of drawers) {
        if (d.business_date) {
          let str = String(d.business_date).trim();
          let clean = str;
          if (/^\d{2}[-/]\d{2}[-/]\d{4}$/.test(str)) {
            const parts = str.split(/[-/]/);
            clean = `${parts[2]}-${parts[1]}-${parts[0]}`;
          } else if (str.includes('T') || str.includes('Z') || str.includes(' ')) {
            const dt = new Date(str.includes('Z') || str.includes('+') ? str : str.replace(' ', 'T'));
            if (!isNaN(dt.getTime())) {
              const pad = (n: number) => String(n).padStart(2, '0');
              clean = `${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())}`;
            } else {
              clean = str.slice(0, 10);
            }
          }
          if (clean !== d.business_date && /^\d{4}-\d{2}-\d{2}$/.test(clean)) {
            upd.run(clean, d.drawer_id);
          }
        }
      }
    }
  } catch (e: any) {
    console.warn('[DB Migration] Failed to normalize business_date in cash_drawer:', e.message);
  }

  // Migration: Add invoice_number column to purchase_bills
  try {
    const pbCols3 = db.prepare(`PRAGMA table_info(purchase_bills)`).all().map((c: any) => c.name);
    if (!pbCols3.includes('invoice_number')) {
      console.log('[DB Migration] Adding invoice_number to purchase_bills...');
      db.exec("ALTER TABLE purchase_bills ADD COLUMN invoice_number TEXT");
    }
    } catch (e: any) {
      console.warn('[DB Migration] Failed to add invoice_number to purchase_bills:', e.message);
    }

    // Migration: Add payment_type column to purchase_bills
    try {
      const pbCols4 = db.prepare(`PRAGMA table_info(purchase_bills)`).all().map((c: any) => c.name);
      if (!pbCols4.includes('payment_type')) {
        console.log('[DB Migration] Adding payment_type to purchase_bills...');
        db.exec("ALTER TABLE purchase_bills ADD COLUMN payment_type TEXT DEFAULT 'CASH'");
      }
    } catch (e: any) {
      console.warn('[DB Migration] Failed to add payment_type to purchase_bills:', e.message);
    }

  // Migration: Consolidate user roles to SUPER_ADMIN, ADMIN, STAFF
  db.exec("UPDATE users SET role = 'ADMIN' WHERE role IN ('OWNER', 'ADMINISTRATOR')");
  db.exec("UPDATE users SET role = 'STAFF' WHERE role IN ('BILLER', 'CASHIER')");

  // Migration: Add gst_balance & estimate_balance columns to parties
  try {
    const partyCols = db.prepare(`PRAGMA table_info(parties)`).all().map((c: any) => c.name);
    if (!partyCols.includes('gst_balance')) {
      console.log('[DB Migration] Adding gst_balance to parties...');
      db.exec("ALTER TABLE parties ADD COLUMN gst_balance REAL NOT NULL DEFAULT 0");
    }
    if (!partyCols.includes('estimate_balance')) {
      console.log('[DB Migration] Adding estimate_balance to parties...');
      db.exec("ALTER TABLE parties ADD COLUMN estimate_balance REAL NOT NULL DEFAULT 0");
    }
    if (!partyCols.includes('credit_limit')) {
      console.log('[DB Migration] Adding credit_limit to parties...');
      db.exec("ALTER TABLE parties ADD COLUMN credit_limit REAL NOT NULL DEFAULT 0");
    }
    if (!partyCols.includes('party_type')) {
      console.log('[DB Migration] Adding party_type to parties...');
      db.exec("ALTER TABLE parties ADD COLUMN party_type TEXT DEFAULT 'CUSTOMER'");
    }
    if (!partyCols.includes('custom_category')) {
      console.log('[DB Migration] Adding custom_category to parties...');
      db.exec("ALTER TABLE parties ADD COLUMN custom_category TEXT");
    }
    if (!partyCols.includes('credit_period_enabled')) {
      console.log('[DB Migration] Adding credit_period_enabled to parties...');
      db.exec("ALTER TABLE parties ADD COLUMN credit_period_enabled INTEGER DEFAULT 0");
    }
    if (!partyCols.includes('credit_period_days')) {
      console.log('[DB Migration] Adding credit_period_days to parties...');
      db.exec("ALTER TABLE parties ADD COLUMN credit_period_days INTEGER DEFAULT 30");
    }
    if (!partyCols.includes('credit_period_basis')) {
      console.log('[DB Migration] Adding credit_period_basis to parties...');
      db.exec("ALTER TABLE parties ADD COLUMN credit_period_basis TEXT DEFAULT 'BILL_BASED'");
    }
    if (!partyCols.includes('restrict_on_credit_expiry')) {
      console.log('[DB Migration] Adding restrict_on_credit_expiry to parties...');
      db.exec("ALTER TABLE parties ADD COLUMN restrict_on_credit_expiry INTEGER DEFAULT 1");
    }
    if (!partyCols.includes('whatsapp_alerts_enabled')) {
      console.log('[DB Migration] Adding whatsapp_alerts_enabled to parties...');
      db.exec("ALTER TABLE parties ADD COLUMN whatsapp_alerts_enabled INTEGER DEFAULT 1");
    }

    // Customers table credit columns migration
    const custCols = db.prepare(`PRAGMA table_info(customers)`).all().map((c: any) => c.name);
    if (!custCols.includes('credit_limit')) {
      console.log('[DB Migration] Adding credit_limit to customers...');
      db.exec("ALTER TABLE customers ADD COLUMN credit_limit REAL DEFAULT 0");
    }
    if (!custCols.includes('credit_period_enabled')) {
      console.log('[DB Migration] Adding credit_period_enabled to customers...');
      db.exec("ALTER TABLE customers ADD COLUMN credit_period_enabled INTEGER DEFAULT 0");
    }
    if (!custCols.includes('credit_period_days')) {
      console.log('[DB Migration] Adding credit_period_days to customers...');
      db.exec("ALTER TABLE customers ADD COLUMN credit_period_days INTEGER DEFAULT 30");
    }
    if (!custCols.includes('credit_period_basis')) {
      console.log('[DB Migration] Adding credit_period_basis to customers...');
      db.exec("ALTER TABLE customers ADD COLUMN credit_period_basis TEXT DEFAULT 'BILL_BASED'");
    }
    if (!custCols.includes('restrict_on_credit_expiry')) {
      console.log('[DB Migration] Adding restrict_on_credit_expiry to customers...');
      db.exec("ALTER TABLE customers ADD COLUMN restrict_on_credit_expiry INTEGER DEFAULT 1");
    }
    if (!custCols.includes('gstin')) {
      console.log('[DB Migration] Adding gstin to customers...');
      db.exec("ALTER TABLE customers ADD COLUMN gstin TEXT");
    }
    if (!custCols.includes('notes')) {
      console.log('[DB Migration] Adding notes to customers...');
      db.exec("ALTER TABLE customers ADD COLUMN notes TEXT");
    }

    // Backfill: existing balances are treated as GST balance (legacy behavior)
    db.exec("UPDATE parties SET gst_balance = balance WHERE gst_balance = 0 AND balance != 0");
  } catch (e: any) {
    console.warn('[DB Migration] Failed to add balance/credit_limit/credit_period columns to parties/customers:', e.message);
  }

  // Migration: Add balance_type & payment_method columns to party_ledger
  try {
    const ledgerCols = db.prepare(`PRAGMA table_info(party_ledger)`).all().map((c: any) => c.name);
    if (!ledgerCols.includes('balance_type')) {
      console.log('[DB Migration] Adding balance_type to party_ledger...');
      db.exec("ALTER TABLE party_ledger ADD COLUMN balance_type TEXT DEFAULT 'GST'");
    }
    if (!ledgerCols.includes('payment_method')) {
      console.log('[DB Migration] Adding payment_method to party_ledger...');
      db.exec("ALTER TABLE party_ledger ADD COLUMN payment_method TEXT");
    }
  } catch (e: any) {
    console.warn('[DB Migration] Failed to add columns to party_ledger:', e.message);
  }

  // Migration: Add restricted_page and password_hash columns to users
  try {
    const uCols = db.prepare(`PRAGMA table_info(users)`).all().map((c: any) => c.name);
    if (!uCols.includes('restricted_page')) {
      console.log('[DB Migration] Adding restricted_page to users...');
      db.exec("ALTER TABLE users ADD COLUMN restricted_page TEXT");
    }
    if (!uCols.includes('password_hash')) {
      console.log('[DB Migration] Adding password_hash to users...');
      db.exec("ALTER TABLE users ADD COLUMN password_hash TEXT");
    }
    if (!uCols.includes('permissions')) {
      console.log('[DB Migration] Adding permissions to users...');
      db.exec("ALTER TABLE users ADD COLUMN permissions TEXT DEFAULT '[]'");
    }
    if (!uCols.includes('login_enabled')) {
      console.log('[DB Migration] Adding login_enabled to users...');
      db.exec('ALTER TABLE users ADD COLUMN login_enabled INTEGER NOT NULL DEFAULT 1');
    }
  } catch (e: any) {
    console.warn('[DB Migration] Failed to add columns to users:', e.message);
  }

  // Migration: Backfill settled_at for historical non-pending invoices where settled_at IS NULL
  try {
    const invCols = db.prepare(`PRAGMA table_info(invoices)`).all().map((c: any) => c.name);
    if (invCols.includes('settled_at')) {
      db.exec("UPDATE invoices SET settled_at = created_at WHERE payment_method NOT IN ('PENDING', 'HOLD_DRAFT') AND (settled_at IS NULL OR settled_at = '')");
    }
  } catch (e: any) {
    console.warn('[DB Migration] Failed to backfill settled_at:', e.message);
  }

  // Migration: Add partial-adjustment columns to returns
  try {
    const retCols = db.prepare(`PRAGMA table_info(returns)`).all().map((c: any) => c.name);
    if (!retCols.includes('adjusted_amount')) {
      console.log('[DB Migration] Adding adjusted_amount to returns...');
      db.exec("ALTER TABLE returns ADD COLUMN adjusted_amount REAL NOT NULL DEFAULT 0");
    }
    if (!retCols.includes('adjusted_invoice_number')) {
      console.log('[DB Migration] Adding adjusted_invoice_number to returns...');
      db.exec("ALTER TABLE returns ADD COLUMN adjusted_invoice_number TEXT");
    }
    if (!retCols.includes('customer_address')) {
      console.log('[DB Migration] Adding customer_address to returns...');
      db.exec("ALTER TABLE returns ADD COLUMN customer_address TEXT");
    }
  } catch (e: any) {
    console.warn('[DB Migration] Failed to add adjustment columns to returns:', e.message);
  }

  // Migration: Recalibrate return totals for historical returns where original invoice had a discount
  try {
    const historicalReturns = db.prepare(`
      SELECT r.return_id, r.invoice_id, r.subtotal as ret_subtotal, r.grand_total as ret_grand_total,
             i.subtotal as inv_subtotal, i.discount_total as inv_discount, COALESCE(i.points_redeemed_discount, 0) as inv_points_disc
      FROM returns r
      JOIN invoices i ON r.invoice_id = i.invoice_id
      WHERE i.subtotal > 0 AND (COALESCE(i.discount_total, 0) + COALESCE(i.points_redeemed_discount, 0)) > 0
    `).all() as any[];

    if (historicalReturns.length > 0) {
      const updateReturnStmt = db.prepare(`UPDATE returns SET subtotal = ?, grand_total = ? WHERE return_id = ?`);
      const updateReturnItemStmt = db.prepare(`UPDATE return_items SET unit_price = ?, total = ? WHERE return_item_id = ?`);
      const getReturnItemsStmt = db.prepare(`SELECT return_item_id, quantity, unit_price, total FROM return_items WHERE return_id = ?`);

      db.transaction(() => {
        for (const ret of historicalReturns) {
          const invSubtotal = Number(ret.inv_subtotal) || 0;
          const invDiscount = (Number(ret.inv_discount) || 0) + (Number(ret.inv_points_disc) || 0);
          if (invSubtotal <= 0 || invDiscount <= 0) continue;
          const discountRatio = Math.min(1, Math.max(0, invDiscount / invSubtotal));

          const rItems = getReturnItemsStmt.all(ret.return_id) as any[];
          let newRetSubtotal = 0;
          for (const item of rItems) {
            const currentPrice = Number(item.unit_price) || 0;
            const currentTotal = Number(item.total) || 0;
            const effPrice = Number((currentPrice * (1 - discountRatio)).toFixed(2));
            const effTotal = Number((effPrice * Number(item.quantity)).toFixed(2));
            if (Math.abs(currentTotal - effTotal) > 0.01) {
              updateReturnItemStmt.run(effPrice, effTotal, item.return_item_id);
              newRetSubtotal += effTotal;
            } else {
              newRetSubtotal += currentTotal;
            }
          }
          if (newRetSubtotal > 0 && Math.abs(Number(ret.ret_grand_total) - newRetSubtotal) > 0.01) {
            updateReturnStmt.run(newRetSubtotal, newRetSubtotal, ret.return_id);
          }
        }
      })();
    }
  } catch (e: any) {
    console.warn('[DB Migration] Recalibrating return totals failed:', e.message);
  }

  // Migration: Add skip_stock_update to purchase_bill_items and qty_from_paper_stock to invoice_items
  try {
    const pbiCols = db.prepare(`PRAGMA table_info(purchase_bill_items)`).all().map((c: any) => c.name);
    if (!pbiCols.includes('skip_stock_update')) {
      console.log('[DB Migration] Adding skip_stock_update to purchase_bill_items...');
      db.exec("ALTER TABLE purchase_bill_items ADD COLUMN skip_stock_update INTEGER DEFAULT 0");
    }
  } catch (e: any) {
    console.warn('[DB Migration] Failed to add skip_stock_update to purchase_bill_items:', e.message);
  }

  try {
    const iiCols = db.prepare(`PRAGMA table_info(invoice_items)`).all().map((c: any) => c.name);
    if (!iiCols.includes('qty_from_paper_stock')) {
      console.log('[DB Migration] Adding qty_from_paper_stock to invoice_items...');
      db.exec("ALTER TABLE invoice_items ADD COLUMN qty_from_paper_stock REAL DEFAULT 0");
    }
    if (!iiCols.includes('pieces_sold')) {
      console.log('[DB Migration] Adding pieces_sold to invoice_items...');
      db.exec("ALTER TABLE invoice_items ADD COLUMN pieces_sold INTEGER");
    }
    if (!iiCols.includes('billing_type')) {
      console.log('[DB Migration] Adding billing_type to invoice_items...');
      db.exec("ALTER TABLE invoice_items ADD COLUMN billing_type TEXT");
    }
    if (!iiCols.includes('uom')) {
      console.log('[DB Migration] Adding uom to invoice_items...');
      db.exec("ALTER TABLE invoice_items ADD COLUMN uom TEXT");
    }
  } catch (e: any) {
    console.warn('[DB Migration] Failed to add columns to invoice_items:', e.message);
  }

  try {
    const wCols = db.prepare(`PRAGMA table_info(warranties)`).all().map((c: any) => c.name);
    if (!wCols.includes('bill_number')) {
      console.log('[DB Migration] Adding bill_number to warranties...');
      db.exec("ALTER TABLE warranties ADD COLUMN bill_number TEXT");
    }
    if (!wCols.includes('brand')) {
      console.log('[DB Migration] Adding brand to warranties...');
      db.exec("ALTER TABLE warranties ADD COLUMN brand TEXT");
    }
  } catch (e: any) {
    console.warn('[DB Migration] Failed to add columns to warranties:', e.message);
  }

  // Migration: allow temp (billing-only) items — invoice_items & return_items must not
  // FK-reference products, because temp items are sold without creating a products row.
  try {
    const iiSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='invoice_items'").get() as any;
    if (iiSql && /FOREIGN KEY\s*\(\s*product_id\s*\)\s*REFERENCES\s*products/i.test(iiSql.sql)) {
      console.log('[DB Migration] Removing products FK from invoice_items (temp billing items support)...');
      db.exec('PRAGMA foreign_keys=off;');
      const migrateInvoiceItems = db.transaction(() => {
        const tableCols = db.prepare("PRAGMA table_info(invoice_items)").all() as any[];
        const colDefs = tableCols.map((c: any) => {
          let def = `"${c.name}" ${c.type}`;
          if (c.pk) def += ' PRIMARY KEY';
          if (c.notnull && !c.pk) def += ' NOT NULL';
          if (c.dflt_value !== null) def += ` DEFAULT ${c.dflt_value}`;
          return def;
        }).join(',\n              ');
        db.exec(`
          CREATE TABLE invoice_items_new (
              ${colDefs},
              FOREIGN KEY (invoice_id) REFERENCES invoices(invoice_id)
          );
        `);
        const cols = tableCols.map((c: any) => `"${c.name}"`).join(', ');
        db.exec(`INSERT INTO invoice_items_new (${cols}) SELECT ${cols} FROM invoice_items;`);
        db.exec('DROP TABLE invoice_items;');
        db.exec('ALTER TABLE invoice_items_new RENAME TO invoice_items;');
      });
      migrateInvoiceItems();
      db.exec('PRAGMA foreign_keys=on;');
      console.log('[DB Migration] invoice_items products FK removed successfully.');
    }
  } catch (e: any) {
    console.warn('[DB Migration] Failed to update invoice_items schema:', e.message);
  }

  try {
    const riSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='return_items'").get() as any;
    if (riSql && /FOREIGN KEY\s*\(\s*product_id\s*\)\s*REFERENCES\s*products/i.test(riSql.sql)) {
      console.log('[DB Migration] Removing products FK from return_items (temp billing items support)...');
      db.exec('PRAGMA foreign_keys=off;');
      const migrateReturnItems = db.transaction(() => {
        const tableCols = db.prepare("PRAGMA table_info(return_items)").all() as any[];
        const colDefs = tableCols.map((c: any) => {
          let def = `"${c.name}" ${c.type}`;
          if (c.pk) def += ' PRIMARY KEY';
          if (c.notnull && !c.pk) def += ' NOT NULL';
          if (c.dflt_value !== null) def += ` DEFAULT ${c.dflt_value}`;
          return def;
        }).join(',\n              ');
        db.exec(`
          CREATE TABLE return_items_new (
              ${colDefs},
              FOREIGN KEY (return_id) REFERENCES returns(return_id)
          );
        `);
        const cols = tableCols.map((c: any) => `"${c.name}"`).join(', ');
        db.exec(`INSERT INTO return_items_new (${cols}) SELECT ${cols} FROM return_items;`);
        db.exec('DROP TABLE return_items;');
        db.exec('ALTER TABLE return_items_new RENAME TO return_items;');
      });
      migrateReturnItems();
      db.exec('PRAGMA foreign_keys=on;');
      console.log('[DB Migration] return_items products FK removed successfully.');
    }
  } catch (e: any) {
    console.warn('[DB Migration] Failed to update return_items schema:', e.message);
  }

  // Clean up legacy dummy default printer_config ('192.168.1.100') if present so it doesn't override real printers
  try {
    db.exec("DELETE FROM settings WHERE key = 'printer_config' AND value LIKE '%192.168.1.100%'");
  } catch (e: any) {
    console.warn('[DB Migration] Dummy printer_config cleanup failed:', e.message);
  }

  // Initialize hardware defaults if empty
  const hasPrinter = db.prepare("SELECT 1 FROM settings WHERE key = 'printer_config'").get();
  if (!hasPrinter) {
    db.prepare("INSERT INTO settings (tenant_id, key, value) VALUES (?, ?, ?)").run(
      'global',
      'printer_config', 
      JSON.stringify({ type: 'none' })
    );
  }
  
  const hasScale = db.prepare("SELECT 1 FROM settings WHERE key = 'scale_config'").get();
  if (!hasScale) {
    db.prepare("INSERT INTO settings (tenant_id, key, value) VALUES (?, ?, ?)").run(
      'global',
      'scale_config', 
      JSON.stringify({ path: 'COM3', baudRate: 9600 })
    );
  }

  // Ensure Terminal Role is set to PRIMARY Master Server
  try {
    const netSyncRow = db.prepare("SELECT value FROM settings WHERE key = 'network_sync_config'").get() as { value: string } | undefined;
    if (!netSyncRow) {
      db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run(
        'network_sync_config',
        JSON.stringify({ syncMode: 'HYBRID', lanRole: 'PRIMARY', lanHostIp: '', lanPort: 3888, syncFrequency: 'BALANCED' })
      );
    } else {
      const parsed = typeof netSyncRow.value === 'string' ? JSON.parse(netSyncRow.value) : netSyncRow.value;
      if (parsed && parsed.lanRole === 'SECONDARY') {
        parsed.lanRole = 'PRIMARY';
        db.prepare("UPDATE settings SET value = ? WHERE key = 'network_sync_config'").run(JSON.stringify(parsed));
        console.log('[DB Migration] Set network_sync_config terminal role to PRIMARY Master Server.');
      }
    }
  } catch (e: any) {
    console.error('[DB Migration] Error setting network_sync_config to PRIMARY:', e.message);
  }

  // Clean up legacy records with 0.0 offer_price
  try {
    db.exec(`
      UPDATE products SET offer_price = NULL WHERE offer_price = 0.0;
      UPDATE product_grades SET offer_price = NULL WHERE offer_price = 0.0;
    `);
    console.log('[DB Migration] Cleaned up legacy 0.0 offer prices to NULL.');
  } catch (e: any) {
    console.error('[DB Migration] Failed to run offer_price cleanup migration:', e.message);
  }

  // Backfill customer records from past transactions
  backfillCustomersFromInvoices(db);

  // Auto-deduplicate customer and party records to keep balances clean and prevent duplicates
  autoDeduplicateCustomersAndParties(db);

  // Ensure shop_closing_reports table exists
  try {
    db.exec(`
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
  } catch (e: any) {
    console.error('[DB Migration] shop_closing_reports table ensure error:', e.message);
  }
}

export function ensureInvoiceColumnsExist(targetDb?: Database.Database) {
  const d = targetDb || db;
  if (!d) return;
  try {
    const invCols = d.prepare(`PRAGMA table_info(invoices)`).all().map((c: any) => c.name);
    const invoiceColsToEnsure: Record<string, string> = {
      split_details: 'TEXT',
      held_until: 'DATETIME',
      is_held: 'INTEGER DEFAULT 0',
      hold_note: 'TEXT',
      scrap_deduction: 'REAL DEFAULT 0',
      scrap_invoice_number: 'TEXT',
      return_deduction: 'REAL DEFAULT 0',
      return_invoice_number: 'TEXT',
      customer_id: 'TEXT',
      points_earned: 'REAL DEFAULT 0',
      points_redeemed: 'REAL DEFAULT 0',
      points_redeemed_discount: 'REAL DEFAULT 0',
      previous_points_balance: 'REAL DEFAULT 0',
      remaining_points_balance: 'REAL DEFAULT 0',
      converted_from_invoice_id: 'TEXT',
      converted_from_invoice_number: 'TEXT',
      converted_to_invoice_id: 'TEXT',
      converted_to_invoice_number: 'TEXT',
      is_deleted: 'INTEGER DEFAULT 0',
      // GST split (Indian GST Act compliance)
      cgst_total: 'REAL DEFAULT 0',
      sgst_total: 'REAL DEFAULT 0',
      igst_total: 'REAL DEFAULT 0',
      supply_type: "TEXT DEFAULT 'INTRA'",
      actual_refund_paid: 'REAL DEFAULT 0',
      due_date: 'DATETIME',
    };

    for (const [colName, colType] of Object.entries(invoiceColsToEnsure)) {
      if (!invCols.includes(colName)) {
        console.log(`[DB Migration] Auto-ensuring missing column ${colName} (${colType}) in invoices...`);
        try {
          d.exec(`ALTER TABLE invoices ADD COLUMN ${colName} ${colType}`);
        } catch (colErr: any) {
          console.warn(`[DB Migration] Failed to auto-add column ${colName} to invoices:`, colErr.message);
        }
      }
    }

    const itemCols = d.prepare(`PRAGMA table_info(invoice_items)`).all().map((c: any) => c.name);
    const itemColsToEnsure: Record<string, string> = {
      pieces_sold: 'INTEGER',
      is_service_item: 'INTEGER DEFAULT 0',
      combo_id: 'TEXT',
      combo_details: 'TEXT',
      // GST split (Indian GST Act compliance — stored per line item for GSTR reporting)
      cgst_rate:    'REAL DEFAULT 0',
      sgst_rate:    'REAL DEFAULT 0',
      igst_rate:    'REAL DEFAULT 0',
      cgst_amount:  'REAL DEFAULT 0',
      sgst_amount:  'REAL DEFAULT 0',
      igst_amount:  'REAL DEFAULT 0',
      hsn_sac_code: 'TEXT',
      supply_type:  "TEXT DEFAULT 'INTRA'",
    };
    for (const [colName, colType] of Object.entries(itemColsToEnsure)) {
      if (!itemCols.includes(colName)) {
        console.log(`[DB Migration] Auto-ensuring missing column ${colName} (${colType}) in invoice_items...`);
        try {
          d.exec(`ALTER TABLE invoice_items ADD COLUMN ${colName} ${colType}`);
        } catch (colErr: any) {
          console.warn(`[DB Migration] Failed to auto-add column ${colName} to invoice_items:`, colErr.message);
        }
      }
    }

    // Migration: Fix legacy held bills that stole standard invoice numbers
    try {
      d.exec(`
        UPDATE invoices
        SET invoice_number = 'HLD-' || invoice_id
        WHERE (invoice_type IN ('HOLD', 'RECALLED_HOLD', 'EXPIRED_HOLD') OR is_held = 1)
          AND (invoice_number NOT LIKE '%HLD%' OR invoice_number IS NULL)
      `);
    } catch (e: any) {
      console.warn('[DB Migration] Fix legacy held invoice numbers error:', e.message);
    }

    // Migration: Clean up erroneous paper prices on Real products in domain_attributes
    try {
      const realProds = d.prepare(`
        SELECT product_id, domain_attributes 
        FROM products 
        WHERE domain_attributes LIKE '%"gst_type":"REAL"%' 
          AND (domain_attributes LIKE '%paper_purchase_price%' OR domain_attributes LIKE '%paper_mrp%' OR domain_attributes LIKE '%gst_purchase_price%')
      `).all() as { product_id: string; domain_attributes: string }[];

      for (const prod of realProds) {
        try {
          const da = JSON.parse(prod.domain_attributes || '{}');
          if (da.gst_type === 'REAL' && (!da.paper_stock || Number(da.paper_stock) <= 0)) {
            delete da.paper_purchase_price;
            delete da.paper_mrp;
            delete da.paper_base_price;
            delete da.gst_purchase_price;
            d.prepare(`UPDATE products SET domain_attributes = ?, updated_at = CURRENT_TIMESTAMP WHERE product_id = ?`).run(JSON.stringify(da), prod.product_id);
          }
        } catch {}
      }
    } catch (e: any) {
      console.warn('[DB Migration] Clean real product paper attributes error:', e.message);
    }
  } catch (e: any) {
    console.warn('[DB Migration] Auto-ensure columns error:', e.message);
  }
}

export function getDb() {
  if (!db) {
    initDb();
  } else {
    ensureInvoiceColumnsExist(db);
  }
  return db;
}

export function deterministicUUID(seed: string): string {
  const hash = crypto.createHash('sha1').update(seed).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

/**
 * CustomerIdentityService - Single authoritative source for customer/party identity resolution
 * Replaces all scattered matching logic across the codebase
 */
export class CustomerIdentityService {
  /**
   * Find or create a customer and their corresponding party record atomically
   * Uses deterministic IDs based on stable business keys (phone or name+tenant)
   */
  static findOrCreateCustomerAndParty(
    db: Database.Database,
    tenantId: string,
    rawData: {
      customer_id?: string | null;
      name?: string | null;
      phone?: string | null;
      address?: string | null;
      gstin?: string | null;
      notes?: string | null;
      pricing_tier_id?: string | null;
      credit_limit?: number | string;
      credit_period_enabled?: boolean | number;
      credit_period_days?: number | string;
      credit_period_basis?: string;
      restrict_on_credit_expiry?: boolean | number | string;
    }
  ): { customer_id: string; party_id: string; isNew: boolean } | null {
    if (!db || !tenantId) return null;

    const name = (rawData.name || '').trim().replace(/\s+/g, ' ');
    const phone = (rawData.phone || '').trim() || null;
    const address = (rawData.address || '').trim() || null;
    const gstin = (rawData.gstin || '').trim().toUpperCase() || null;
    const notes = (rawData.notes || '').trim() || null;
    const pricingTierId = rawData.pricing_tier_id || null;
    const creditLimit = rawData.credit_limit !== undefined && rawData.credit_limit !== null
      ? Math.max(0, Number(rawData.credit_limit) || 0)
      : null;
    const creditPeriodEnabled = rawData.credit_period_enabled !== undefined && rawData.credit_period_enabled !== null
      ? (rawData.credit_period_enabled ? 1 : 0)
      : null;
    const creditPeriodDays = rawData.credit_period_days !== undefined && rawData.credit_period_days !== null
      ? Math.max(1, parseInt(String(rawData.credit_period_days || 30), 10) || 30)
      : null;
    const creditPeriodBasis = rawData.credit_period_basis || null;
    const restrictOnCreditExpiry = rawData.restrict_on_credit_expiry !== undefined && rawData.restrict_on_credit_expiry !== null
      ? (String(rawData.restrict_on_credit_expiry) === 'false' || String(rawData.restrict_on_credit_expiry) === '0' ? 0 : 1)
      : null;

    if (!name && !phone && !rawData.customer_id) return null;

    const phoneClean = (phone || '').replace(/\D/g, '');
    const displayName = name || phone || 'Customer';
    const now = new Date().toISOString();

    try {
      // ========== LOOKUP PHASE ==========
      // Look up existingCustomer and existingParty INDEPENDENTLY
      // Priority: 1) customer_id  2) Exact name + phone  3) Phone match (last 10 digits)  4) Case-insensitive name
      
      let existingCustomer: any = null;
      let existingParty: any = null;

      // 0. Try direct customer_id / party_id match first if provided
      if (rawData.customer_id) {
        existingCustomer = db.prepare(`
          SELECT * FROM customers 
          WHERE tenant_id = ? AND customer_id = ? AND (is_deleted IS NULL OR is_deleted = 0)
          LIMIT 1
        `).get(tenantId, rawData.customer_id);

        existingParty = db.prepare(`
          SELECT * FROM parties 
          WHERE tenant_id = ? AND party_id = ? AND (is_deleted IS NULL OR is_deleted = 0)
          LIMIT 1
        `).get(tenantId, rawData.customer_id);
      }

      // 1. Try exact name + phone match
      if (name && phone) {
        if (!existingCustomer) {
          existingCustomer = db.prepare(`
            SELECT * FROM customers 
            WHERE tenant_id = ? AND (is_deleted IS NULL OR is_deleted = 0)
              AND LOWER(TRIM(name)) = LOWER(TRIM(?)) AND phone = ?
            LIMIT 1
          `).get(tenantId, name, phone);
        }

        if (!existingParty) {
          existingParty = db.prepare(`
            SELECT * FROM parties 
            WHERE tenant_id = ? AND (is_deleted IS NULL OR is_deleted = 0)
              AND (party_type = 'CUSTOMER' OR party_type IS NULL)
              AND LOWER(TRIM(name)) = LOWER(TRIM(?)) AND phone = ?
            ORDER BY created_at ASC
            LIMIT 1
          `).get(tenantId, name, phone);
        }
      }

      // 2. Try phone match (cleaned, last 10 digits)
      if (phoneClean.length >= 7) {
        const last10 = phoneClean.slice(-10);
        if (!existingCustomer) {
          existingCustomer = db.prepare(`
            SELECT * FROM customers 
            WHERE tenant_id = ? AND (is_deleted IS NULL OR is_deleted = 0)
              AND REPLACE(REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '+', ''), '(', '') LIKE ?
            LIMIT 1
          `).get(tenantId, `%${last10}`);
        }
        if (!existingParty) {
          existingParty = db.prepare(`
            SELECT * FROM parties 
            WHERE tenant_id = ? AND (is_deleted IS NULL OR is_deleted = 0)
              AND (party_type = 'CUSTOMER' OR party_type IS NULL)
              AND REPLACE(REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '+', ''), '(', '') LIKE ?
            ORDER BY created_at ASC
            LIMIT 1
          `).get(tenantId, `%${last10}`);
        }
      }

      // 3. Try case-insensitive name match
      if (name) {
        if (!existingCustomer) {
          existingCustomer = db.prepare(`
            SELECT * FROM customers 
            WHERE tenant_id = ? AND (is_deleted IS NULL OR is_deleted = 0)
              AND LOWER(TRIM(name)) = LOWER(TRIM(?))
            ORDER BY 
              CASE WHEN phone IS NOT NULL AND phone != '' THEN 0 ELSE 1 END,
              created_at ASC
            LIMIT 1
          `).get(tenantId, name);
        }
        if (!existingParty) {
          existingParty = db.prepare(`
            SELECT * FROM parties 
            WHERE tenant_id = ? AND (is_deleted IS NULL OR is_deleted = 0)
              AND (party_type = 'CUSTOMER' OR party_type IS NULL)
              AND LOWER(TRIM(name)) = LOWER(TRIM(?))
            ORDER BY 
              CASE WHEN phone IS NOT NULL AND phone != '' THEN 0 ELSE 1 END,
              created_at ASC
            LIMIT 1
          `).get(tenantId, name);
        }
      }

      // 4. Cross-check: If customer found but party not found, search party by customer's phone or name
      if (existingCustomer && !existingParty) {
        const cPhone = (existingCustomer.phone || '').trim();
        const cClean = cPhone.replace(/\D/g, '');
        const cName = (existingCustomer.name || '').trim();
        if (cClean.length >= 7) {
          existingParty = db.prepare(`
            SELECT * FROM parties 
            WHERE tenant_id = ? AND (is_deleted IS NULL OR is_deleted = 0)
              AND (party_type = 'CUSTOMER' OR party_type IS NULL)
              AND REPLACE(REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '+', ''), '(', '') LIKE ?
            ORDER BY created_at ASC
            LIMIT 1
          `).get(tenantId, `%${cClean.slice(-10)}`);
        }
        if (!existingParty && cName) {
          existingParty = db.prepare(`
            SELECT * FROM parties 
            WHERE tenant_id = ? AND (is_deleted IS NULL OR is_deleted = 0)
              AND (party_type = 'CUSTOMER' OR party_type IS NULL)
              AND LOWER(TRIM(name)) = LOWER(TRIM(?))
            ORDER BY created_at ASC
            LIMIT 1
          `).get(tenantId, cName);
        }
      }

      // 5. Fallback check for parties matching idx_parties_tenant_name_phone_customer
      if (!existingParty && displayName) {
        existingParty = db.prepare(`
          SELECT * FROM parties 
          WHERE tenant_id = ? AND (is_deleted IS NULL OR is_deleted = 0)
            AND (party_type = 'CUSTOMER' OR party_type IS NULL)
            AND name = ? AND (phone = ? OR (phone IS NULL AND ? IS NULL))
          LIMIT 1
        `).get(tenantId, displayName, phone, phone);
      }

      const isNew = !existingCustomer && !existingParty;
      let finalCustomerId = existingCustomer?.customer_id;
      let finalPartyId = existingParty?.party_id;

      // ========== PROCESS CUSTOMER ==========
      if (existingCustomer) {
        try {
          const custHasRealName = existingCustomer.name && !['customer', 'walk-in', 'walk in', 'default'].includes(existingCustomer.name.trim().toLowerCase());
          const finalCustName = custHasRealName ? existingCustomer.name : (displayName || existingCustomer.name);
          const finalCustPhone = (existingCustomer.phone && existingCustomer.phone.trim() !== '') ? existingCustomer.phone : (phone || null);
          const finalCustAddress = (existingCustomer.address && existingCustomer.address.trim() !== '') ? existingCustomer.address : (address || null);
          const finalCustGstin = (existingCustomer.gstin && existingCustomer.gstin.trim() !== '') ? existingCustomer.gstin : (gstin || null);
          const finalCustNotes = (existingCustomer.notes && existingCustomer.notes.trim() !== '') ? existingCustomer.notes : (notes || null);

          db.prepare(`
            UPDATE customers
            SET name = ?, phone = ?, address = ?,
                gstin = ?, notes = ?,
                is_deleted = 0,
                last_purchase_date = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE customer_id = ?
          `).run(
            finalCustName, finalCustPhone, finalCustAddress, finalCustGstin, finalCustNotes,
            now, existingCustomer.customer_id
          );
        } catch (_) {
          try {
            db.prepare(`
              UPDATE customers
              SET last_purchase_date = ?, is_deleted = 0, updated_at = CURRENT_TIMESTAMP
              WHERE customer_id = ?
            `).run(now, existingCustomer.customer_id);
          } catch {}
        }
      } else {
        const customerSeedKey = phoneClean.length >= 7
          ? `cust:${tenantId}:${phoneClean.slice(-10)}`
          : `cust:${tenantId}:${name.toLowerCase()}:${Date.now()}`;
        finalCustomerId = deterministicUUID(customerSeedKey);

        try {
          db.prepare(`
            INSERT INTO customers (
              customer_id, tenant_id, name, phone, address, gstin, notes, pricing_tier_id,
              credit_limit, credit_period_enabled, credit_period_days, credit_period_basis, restrict_on_credit_expiry,
              total_points_earned, total_points_redeemed, current_points_balance, last_purchase_date,
              is_deleted, sync_status, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, 0, 'PENDING', ?, ?)
          `).run(
            finalCustomerId, tenantId, displayName, phone, address, gstin, notes, pricingTierId,
            creditLimit ?? 0, creditPeriodEnabled ?? 0, creditPeriodDays ?? 30, creditPeriodBasis ?? 'BILL_BASED', restrictOnCreditExpiry ?? 0,
            now, now, now
          );
        } catch (insertCustErr: any) {
          const fallbackCust: any = db.prepare(`
            SELECT customer_id FROM customers 
            WHERE tenant_id = ? AND (
              customer_id = ? 
              OR (phone IS NOT NULL AND phone = ?)
              OR (? != '' AND phone IS NOT NULL AND REPLACE(REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '+', ''), '(', '') LIKE ?)
              OR (name IS NOT NULL AND LOWER(TRIM(name)) = LOWER(TRIM(?)))
            ) LIMIT 1
          `).get(tenantId, finalCustomerId, phone, phoneClean.length >= 7 ? `%${phoneClean.slice(-10)}` : '', phoneClean.length >= 7 ? `%${phoneClean.slice(-10)}` : '', name);
          if (fallbackCust) {
            finalCustomerId = fallbackCust.customer_id;
            try {
              db.prepare('UPDATE customers SET is_deleted = 0, updated_at = CURRENT_TIMESTAMP WHERE customer_id = ?').run(finalCustomerId);
            } catch {}
          }
        }
      }

      // ========== PROCESS PARTY ==========
      if (existingParty) {
        try {
          const partyHasRealName = existingParty.name && !['customer', 'walk-in', 'walk in', 'default'].includes(existingParty.name.trim().toLowerCase());
          const finalPartyName = partyHasRealName ? existingParty.name : (displayName || existingParty.name);
          const finalPartyPhone = (existingParty.phone && existingParty.phone.trim() !== '') ? existingParty.phone : (phone || null);
          const finalPartyAddress = (existingParty.address && existingParty.address.trim() !== '') ? existingParty.address : (address || null);
          const finalPartyGstin = (existingParty.gstin && existingParty.gstin.trim() !== '') ? existingParty.gstin : (gstin || null);
          const finalPartyNotes = (existingParty.notes && existingParty.notes.trim() !== '') ? existingParty.notes : (notes || null);

          const wasDeleted = existingParty.is_deleted === 1;
          const phoneChanged = !existingParty.phone && finalPartyPhone;
          const addrChanged = !existingParty.address && finalPartyAddress;
          const gstinChanged = !existingParty.gstin && finalPartyGstin;
          const nameChanged = !partyHasRealName && finalPartyName !== existingParty.name;

          if (wasDeleted || phoneChanged || addrChanged || gstinChanged || nameChanged) {
            db.prepare(`
              UPDATE parties
              SET name = ?, phone = ?, address = ?, gstin = ?, notes = ?,
                  is_deleted = 0,
                  sync_status = CASE WHEN sync_status = 'SYNCED' THEN 'PENDING' ELSE sync_status END,
                  updated_at = CURRENT_TIMESTAMP
              WHERE party_id = ?
            `).run(
              finalPartyName, finalPartyPhone, finalPartyAddress, finalPartyGstin, finalPartyNotes,
              existingParty.party_id
            );
          }
        } catch (_) {
          try {
            db.prepare('UPDATE parties SET is_deleted = 0 WHERE party_id = ?').run(existingParty.party_id);
          } catch {}
        }
      } else {
        const partySeedKey = phoneClean.length >= 7
          ? `party:${tenantId}:${phoneClean.slice(-10)}`
          : `party:${tenantId}:${name.toLowerCase()}:${Date.now()}`;
        finalPartyId = deterministicUUID(partySeedKey);

        try {
          db.prepare(`
            INSERT INTO parties (
              party_id, tenant_id, name, phone, address, gstin, notes,
              balance, gst_balance, estimate_balance, balance_type, party_type,
              pricing_tier_id, credit_limit,
              credit_period_enabled, credit_period_days, credit_period_basis, restrict_on_credit_expiry,
              is_deleted, sync_status, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 'RECEIVABLE', 'CUSTOMER', ?, ?, ?, ?, ?, ?, 0, 'PENDING', ?, ?)
          `).run(
            finalPartyId, tenantId, displayName, phone, address, gstin, notes,
            pricingTierId, creditLimit ?? 0, creditPeriodEnabled ?? 0, creditPeriodDays ?? 30, creditPeriodBasis ?? 'BILL_BASED', restrictOnCreditExpiry ?? 0,
            now, now
          );
        } catch (insertPartyErr: any) {
          const fallbackParty: any = db.prepare(`
            SELECT party_id FROM parties 
            WHERE tenant_id = ? AND (
              party_id = ? 
              OR (LOWER(TRIM(name)) = LOWER(TRIM(?)) AND (phone = ? OR (phone IS NULL AND ? IS NULL)))
              OR (? != '' AND phone IS NOT NULL AND REPLACE(REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '+', ''), '(', '') LIKE ?)
              OR (LOWER(TRIM(name)) = LOWER(TRIM(?)))
            )
            ORDER BY 
              CASE WHEN is_deleted = 0 THEN 0 ELSE 1 END,
              created_at ASC
            LIMIT 1
          `).get(tenantId, finalPartyId, displayName, phone, phone, phoneClean.length >= 7 ? `%${phoneClean.slice(-10)}` : '', phoneClean.length >= 7 ? `%${phoneClean.slice(-10)}` : '', name);

          if (fallbackParty) {
            finalPartyId = fallbackParty.party_id;
            try {
              db.prepare('UPDATE parties SET is_deleted = 0, updated_at = CURRENT_TIMESTAMP WHERE party_id = ?').run(finalPartyId);
            } catch {}
          } else {
            console.warn('[CustomerIdentityService] Could not insert party and fallback lookup failed:', insertPartyErr.message);
            throw insertPartyErr;
          }
        }
      }

      return {
        customer_id: finalCustomerId!,
        party_id: finalPartyId!,
        isNew
      };
    } catch (err: any) {
      console.error('[CustomerIdentityService] Error:', err.message);
      return null;
    }
  }

  /**
   * Find existing customer by various criteria (read-only)
   */
  static findCustomer(
    db: Database.Database,
    tenantId: string,
    criteria: { name?: string; phone?: string; customer_id?: string }
  ): any | null {
    if (!db || !tenantId) return null;
    const { name, phone, customer_id } = criteria;

    if (customer_id) {
      return db.prepare('SELECT * FROM customers WHERE customer_id = ? AND tenant_id = ? AND (is_deleted IS NULL OR is_deleted = 0)')
        .get(customer_id, tenantId);
    }

    const phoneClean = (phone || '').replace(/\D/g, '');
    
    // 1. Phone match
    if (phoneClean.length >= 7) {
      const last10 = phoneClean.slice(-10);
      const found = db.prepare(`
        SELECT * FROM customers 
        WHERE tenant_id = ? AND (is_deleted IS NULL OR is_deleted = 0)
          AND REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '+', '') LIKE ?
        LIMIT 1
      `).get(tenantId, `%${last10}`);
      if (found) return found;
    }

    // 2. Exact name + phone
    if (name && phone) {
      const found = db.prepare(`
        SELECT * FROM customers 
        WHERE tenant_id = ? AND (is_deleted IS NULL OR is_deleted = 0)
          AND name = ? AND phone = ?
        LIMIT 1
      `).get(tenantId, name.trim().replace(/\s+/g, ' '), phone.trim());
      if (found) return found;
    }

    // 3. Exact name
    if (name) {
      const found = db.prepare(`
        SELECT * FROM customers 
        WHERE tenant_id = ? AND (is_deleted IS NULL OR is_deleted = 0)
          AND LOWER(TRIM(name)) = LOWER(?)
        ORDER BY CASE WHEN phone IS NOT NULL AND phone != '' THEN 0 ELSE 1 END, created_at ASC
        LIMIT 1
      `).get(tenantId, name.trim().replace(/\s+/g, ' '));
      if (found) return found;
    }

    return null;
  }

  /**
   * Find existing party by various criteria (read-only)
   */
  static findParty(
    db: Database.Database,
    tenantId: string,
    criteria: { name?: string; phone?: string; party_id?: string; party_type?: string }
  ): any | null {
    if (!db || !tenantId) return null;
    const { name, phone, party_id, party_type = 'CUSTOMER' } = criteria;

    if (party_id) {
      return db.prepare('SELECT * FROM parties WHERE party_id = ? AND tenant_id = ? AND (is_deleted IS NULL OR is_deleted = 0)')
        .get(party_id, tenantId);
    }

    const phoneClean = (phone || '').replace(/\D/g, '');
    
    // 1. Phone match
    if (phoneClean.length >= 7) {
      const last10 = phoneClean.slice(-10);
      const found = db.prepare(`
        SELECT * FROM parties 
        WHERE tenant_id = ? AND (is_deleted IS NULL OR is_deleted = 0)
          AND party_type = ? AND REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '+', '') LIKE ?
        LIMIT 1
      `).get(tenantId, party_type, `%${last10}`);
      if (found) return found;
    }

    // 2. Exact name + phone
    if (name && phone) {
      const found = db.prepare(`
        SELECT * FROM parties 
        WHERE tenant_id = ? AND (is_deleted IS NULL OR is_deleted = 0)
          AND party_type = ? AND name = ? AND phone = ?
        LIMIT 1
      `).get(tenantId, party_type, name.trim().replace(/\s+/g, ' '), phone.trim());
      if (found) return found;
    }

    // 3. Exact name
    if (name) {
      const found = db.prepare(`
        SELECT * FROM parties 
        WHERE tenant_id = ? AND (is_deleted IS NULL OR is_deleted = 0)
          AND party_type = ? AND LOWER(TRIM(name)) = LOWER(?)
        ORDER BY CASE WHEN phone IS NOT NULL AND phone != '' THEN 0 ELSE 1 END, created_at ASC
        LIMIT 1
      `).get(tenantId, party_type, name.trim().replace(/\s+/g, ' '));
      if (found) return found;
    }

    return null;
  }
}

export function upsertCustomerRecord(
  db: Database.Database,
  tenantId: string,
  rawName?: string | null,
  rawPhone?: string | null,
  rawAddress?: string | null
): string | null {
  // Delegate to the new unified CustomerIdentityService for consistency
  const result = CustomerIdentityService.findOrCreateCustomerAndParty(db, tenantId, {
    name: rawName,
    phone: rawPhone,
    address: rawAddress
  });
  return result?.customer_id || null;
}

function recalcPartyBalanceLocal(d: Database.Database, partyId: string) {
  try {
    const rows: any = d.prepare(`
      SELECT 
        COALESCE(SUM(CASE WHEN balance_type = 'GST' THEN credit_amount - debit_amount ELSE 0 END), 0) AS gst,
        COALESCE(SUM(CASE WHEN balance_type = 'ESTIMATE' THEN credit_amount - debit_amount ELSE 0 END), 0) AS estimate,
        COALESCE(SUM(credit_amount - debit_amount), 0) AS total
      FROM party_ledger WHERE party_id = ? AND (is_deleted IS NULL OR is_deleted = 0)
    `).get(partyId);
    const gst = Math.round((parseFloat(rows?.gst) || 0) * 100) / 100;
    const estimate = Math.round((parseFloat(rows?.estimate) || 0) * 100) / 100;
    const total = Math.round((gst + estimate) * 100) / 100;
    const latest: any = d.prepare(`
      SELECT transaction_date FROM party_ledger 
      WHERE party_id = ? AND (is_deleted IS NULL OR is_deleted = 0) 
      ORDER BY transaction_date DESC LIMIT 1
    `).get(partyId);
    d.prepare(`
      UPDATE parties 
      SET balance = ?, gst_balance = ?, estimate_balance = ?, last_transaction_date = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP 
      WHERE party_id = ?
    `).run(total, gst, estimate, latest ? latest.transaction_date : null, partyId);
    return total;
  } catch (err: any) {
    console.error('[recalcPartyBalanceLocal error]:', err.message);
    return 0;
  }
}

export function autoDeduplicateCustomersAndParties(targetDb?: Database.Database): { merged_customers: number; merged_parties: number } {
  const d = targetDb || db;
  if (!d) return { merged_customers: 0, merged_parties: 0 };

  let mergedCustomers = 0;
  let mergedParties = 0;

  try {
    // 1. DEDUPLICATE CUSTOMERS
    const custTenants = d.prepare('SELECT DISTINCT tenant_id FROM customers').all().map((r: any) => r.tenant_id);
    for (const tenantId of custTenants) {
      const custs = d.prepare(`
        SELECT customer_id, tenant_id, name, phone, address, total_points_earned, total_points_redeemed, current_points_balance, created_at
        FROM customers 
        WHERE tenant_id = ? AND (is_deleted IS NULL OR is_deleted = 0)
      `).all(tenantId) as any[];

      const n = custs.length;
      if (n <= 1) continue;

      const parent = Array.from({ length: n }, (_, i) => i);
      function find(i: number): number {
        if (parent[i] === i) return i;
        parent[i] = find(parent[i]);
        return parent[i];
      }
      function union(i: number, j: number) {
        const rootI = find(i);
        const rootJ = find(j);
        if (rootI !== rootJ) parent[rootI] = rootJ;
      }

      const phoneMap = new Map<string, number>();
      const nameMap = new Map<string, number>();

      for (let i = 0; i < n; i++) {
        const c = custs[i];
        const normName = (c.name || '').trim().toLowerCase().replace(/\s+/g, ' ');
        const cleanPhone = (c.phone || '').replace(/\D/g, '');
        const last10 = cleanPhone.length >= 7 ? cleanPhone.slice(-10) : null;

        // Phone match alone does not merge; different people can share numbers
        // Only exact normalized names merge duplicates
        if (normName && normName.length >= 2 && last10 && !last10.startsWith('0000')) {
          const comboKey = normName + ":" + last10;
          if (phoneMap.has(comboKey)) union(i, phoneMap.get(comboKey)!);
          else phoneMap.set(comboKey, i);
        }

        if (normName && normName.length >= 2) {
          if (nameMap.has(normName)) {
            union(i, nameMap.get(normName)!);
          } else {
            nameMap.set(normName, i);
          }
        }
      }

      const clusters = new Map<number, any[]>();
      for (let i = 0; i < n; i++) {
        const root = find(i);
        if (!clusters.has(root)) clusters.set(root, []);
        clusters.get(root)!.push(custs[i]);
      }

      for (const [_, list] of clusters) {
        if (list.length <= 1) continue;

        // Sort: prefer record with a valid phone, then older created_at
        list.sort((a: any, b: any) => {
          const aClean = (a.phone || '').replace(/\D/g, '');
          const bClean = (b.phone || '').replace(/\D/g, '');
          const aHasValidPhone = aClean.length >= 7 && !aClean.startsWith('0000') ? 1 : 0;
          const bHasValidPhone = bClean.length >= 7 && !bClean.startsWith('0000') ? 1 : 0;
          if (aHasValidPhone !== bHasValidPhone) return bHasValidPhone - aHasValidPhone;
          const timeA = new Date(a.created_at || 0).getTime();
          const timeB = new Date(b.created_at || 0).getTime();
          return timeA - timeB;
        });

        const primary = list[0];
        const duplicates = list.slice(1);

        let totEarned = primary.total_points_earned || 0;
        let totRedeemed = primary.total_points_redeemed || 0;
        let bestAddr = primary.address;
        let bestPhone = primary.phone;
        mergedCustomers += duplicates.length;

        for (const dup of duplicates) {
          totEarned += dup.total_points_earned || 0;
          totRedeemed += dup.total_points_redeemed || 0;
          if (!bestAddr && dup.address) bestAddr = dup.address;
          if (!bestPhone && dup.phone) bestPhone = dup.phone;

          d.prepare('UPDATE invoices SET customer_id = ? WHERE customer_id = ?').run(primary.customer_id, dup.customer_id);
          d.prepare('UPDATE loyalty_transactions SET customer_id = ? WHERE customer_id = ?').run(primary.customer_id, dup.customer_id);
          d.prepare("UPDATE customers SET is_deleted = 1, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE customer_id = ?").run(dup.customer_id);
        }

        const bal = totEarned - totRedeemed;
        d.prepare(`
          UPDATE customers 
          SET address = COALESCE(?, address),
              phone = COALESCE(?, phone),
              total_points_earned = ?,
              total_points_redeemed = ?,
              current_points_balance = ?,
              sync_status = 'PENDING',
              updated_at = CURRENT_TIMESTAMP
          WHERE customer_id = ?
        `).run(bestAddr, bestPhone, totEarned, totRedeemed, bal, primary.customer_id);
      }
    }

    // 2. DEDUPLICATE PARTIES (same party_type and phone/name)
    const partyTenants = d.prepare('SELECT DISTINCT tenant_id FROM parties').all().map((r: any) => r.tenant_id);
    for (const tenantId of partyTenants) {
      const parties = d.prepare(`
        SELECT party_id, tenant_id, name, phone, address, gstin, balance, gst_balance, estimate_balance, balance_type, party_type, credit_limit, notes, created_at
        FROM parties 
        WHERE tenant_id = ? AND (is_deleted IS NULL OR is_deleted = 0)
      `).all(tenantId) as any[];

      const n = parties.length;
      if (n <= 1) continue;

      const parent = Array.from({ length: n }, (_, i) => i);
      function find(i: number): number {
        if (parent[i] === i) return i;
        parent[i] = find(parent[i]);
        return parent[i];
      }
      function union(i: number, j: number) {
        const rootI = find(i);
        const rootJ = find(j);
        if (rootI !== rootJ) parent[rootI] = rootJ;
      }

      const phoneMap = new Map<string, number>();
      const nameMap = new Map<string, number>();

      for (let i = 0; i < n; i++) {
        const p = parties[i];
        const pType = (p.party_type || 'CUSTOMER').toUpperCase();
        const normName = (p.name || '').trim().toLowerCase().replace(/\s+/g, ' ');
        const cleanPhone = (p.phone || '').replace(/\D/g, '');
        const last10 = cleanPhone.length >= 7 ? cleanPhone.slice(-10) : null;

        // Phone match alone does not merge; different people can share numbers
        // Only exact same party_type + normalized name merge duplicates
        if (normName && normName.length >= 3 && last10 && !last10.startsWith('0000')) {
          const comboKey = pType + ":" + normName + ":" + last10;
          if (phoneMap.has(comboKey)) union(i, phoneMap.get(comboKey)!);
          else phoneMap.set(comboKey, i);
        }
        // end combo phone key

        if (normName && normName.length >= 3) {
          const nameKey = `${pType}:${normName}`;
          if (nameMap.has(nameKey)) {
            union(i, nameMap.get(nameKey)!);
          } else {
            nameMap.set(nameKey, i);
          }
        }
      }

      const clusters = new Map<number, any[]>();
      for (let i = 0; i < n; i++) {
        const root = find(i);
        if (!clusters.has(root)) clusters.set(root, []);
        clusters.get(root)!.push(parties[i]);
      }

      for (const [_, list] of clusters) {
        if (list.length <= 1) continue;

        // Prefer party with non-zero balance / ledger entries, then older created_at
        list.sort((a: any, b: any) => {
          const balA = Math.abs(a.balance || 0);
          const balB = Math.abs(b.balance || 0);
          if (balA !== balB) return balB - balA;
          const timeA = new Date(a.created_at || 0).getTime();
          const timeB = new Date(b.created_at || 0).getTime();
          return timeA - timeB;
        });

        const primary = list[0];
        const duplicates = list.slice(1);

        let bestPhone = primary.phone;
        let bestAddr = primary.address;
        let bestGstin = primary.gstin;
        mergedParties += duplicates.length;

        for (const dup of duplicates) {
          if (!bestPhone && dup.phone) bestPhone = dup.phone;
          if (!bestAddr && dup.address) bestAddr = dup.address;
          if (!bestGstin && dup.gstin) bestGstin = dup.gstin;

          d.prepare("UPDATE party_ledger SET party_id = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE party_id = ?").run(primary.party_id, dup.party_id);
          try {
            d.prepare('UPDATE purchase_bills SET supplier_id = ? WHERE supplier_id = ?').run(primary.party_id, dup.party_id);
          } catch {}
          d.prepare("UPDATE parties SET is_deleted = 1, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE party_id = ?").run(dup.party_id);
        }

        d.prepare(`
          UPDATE parties 
          SET phone = COALESCE(?, phone),
              address = COALESCE(?, address),
              gstin = COALESCE(?, gstin),
              sync_status = 'PENDING',
              updated_at = CURRENT_TIMESTAMP
          WHERE party_id = ?
        `).run(bestPhone, bestAddr, bestGstin, primary.party_id);

        recalcPartyBalanceLocal(d, primary.party_id);
      }
    }
    console.log('[DB Auto-Deduplication] Completed clean deduplication of customers and parties.');

    // Create partial unique indexes after deduplication to prevent future duplicates
    try {
      d.exec(`DROP INDEX IF EXISTS idx_customers_tenant_name_no_phone;`);
      d.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_tenant_name_no_phone 
        ON customers(tenant_id, name) 
        WHERE (phone IS NULL OR phone = '') AND (is_deleted IS NULL OR is_deleted = 0);
      `);
      d.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_parties_tenant_name_phone_customer 
        ON parties(tenant_id, name, phone) 
        WHERE party_type = 'CUSTOMER' AND (is_deleted IS NULL OR is_deleted = 0);
      `);
      console.log('[DB Auto-Deduplication] Partial unique indexes created/verified.');
    } catch (idxErr: any) {
      console.warn('[DB Auto-Deduplication] Could not create partial unique indexes:', idxErr.message);
    }

    return { merged_customers: mergedCustomers, merged_parties: mergedParties };
  } catch (err: any) {
    console.error('[DB Auto-Deduplication Error]:', err.message);
    return { merged_customers: 0, merged_parties: 0 };
  }
}

export function backfillCustomersFromInvoices(db: Database.Database) {
  try {
    console.log('[DB Migration] Running customer backfill from past transactions...');

    // Clean up legacy empty strings in phone and address to NULL so UNIQUE(tenant_id, phone) constraint is respected
    db.exec(`UPDATE customers SET phone = NULL WHERE phone IS NOT NULL AND TRIM(phone) = ''`);
    db.exec(`UPDATE customers SET address = NULL WHERE address IS NOT NULL AND TRIM(address) = ''`);

    const invoiceCustomers = db.prepare(`
      SELECT tenant_id, customer_name, customer_phone, customer_address
      FROM invoices
      WHERE (customer_name IS NOT NULL AND TRIM(customer_name) != '')
         OR (customer_phone IS NOT NULL AND TRIM(customer_phone) != '')
      GROUP BY tenant_id, COALESCE(NULLIF(TRIM(customer_phone), ''), TRIM(customer_name))
    `).all() as any[];

    for (const c of invoiceCustomers) {
      upsertCustomerRecord(db, c.tenant_id || 'global', c.customer_name, c.customer_phone, c.customer_address);
    }

    db.exec(`
      UPDATE invoices
      SET customer_id = (
        SELECT customer_id FROM customers c
        WHERE c.tenant_id = invoices.tenant_id
          AND (c.is_deleted IS NULL OR c.is_deleted = 0)
          AND (
            (invoices.customer_phone IS NOT NULL AND TRIM(invoices.customer_phone) != '' AND c.phone IS NOT NULL AND c.phone != '' AND
             REPLACE(REPLACE(REPLACE(c.phone, ' ', ''), '-', ''), '+', '') LIKE '%' || SUBSTR(REPLACE(REPLACE(REPLACE(invoices.customer_phone, ' ', ''), '-', ''), '+', ''), -10))
            OR (LOWER(REPLACE(TRIM(c.name), '  ', ' ')) = LOWER(REPLACE(TRIM(invoices.customer_name), '  ', ' ')))
          )
        LIMIT 1
      )
      WHERE customer_id IS NULL
        AND (
          (customer_name IS NOT NULL AND TRIM(customer_name) != '')
          OR (customer_phone IS NOT NULL AND TRIM(customer_phone) != '')
        );
    `);

    const scrapCustomers = db.prepare(`
      SELECT tenant_id, party_name as customer_name, customer_phone, customer_address
      FROM scrap_transactions
      WHERE (party_name IS NOT NULL AND TRIM(party_name) != '')
         OR (customer_phone IS NOT NULL AND TRIM(customer_phone) != '')
      GROUP BY tenant_id, COALESCE(NULLIF(TRIM(customer_phone), ''), TRIM(party_name))
    `).all() as any[];

    for (const c of scrapCustomers) {
      upsertCustomerRecord(db, c.tenant_id || 'global', c.customer_name, c.customer_phone, c.customer_address);
    }

    const returnCustomers = db.prepare(`
      SELECT tenant_id, customer_name, customer_phone
      FROM returns
      WHERE (customer_name IS NOT NULL AND TRIM(customer_name) != '')
         OR (customer_phone IS NOT NULL AND TRIM(customer_phone) != '')
      GROUP BY tenant_id, COALESCE(NULLIF(TRIM(customer_phone), ''), TRIM(customer_name))
    `).all() as any[];

    for (const c of returnCustomers) {
      upsertCustomerRecord(db, c.tenant_id || 'global', c.customer_name, c.customer_phone, null);
    }

    console.log('[DB Migration] Customer backfill complete.');
  } catch (err: any) {
    console.error('[DB Migration] Failed customer backfill:', err.message);
  }
}

// ── Staff Management & Finance DB Handlers ─────────────────────────────────────

function hashStaffPin(pin: string, tenantId: string): string {
  return crypto.createHash('sha256').update(`${pin}:${tenantId}`).digest('hex');
}

export function dbGetStaff(params: { tenant_id: string; search?: string; status?: string }) {
  const tenantId = params.tenant_id;

  // Auto-reconcile: link any unlinked staff rows by matching email
  try {
    db.prepare(`
      UPDATE staff SET user_id = (
        SELECT u.user_id FROM users u 
        WHERE LOWER(u.email) = LOWER(staff.email) AND (u.tenant_id = staff.tenant_id OR staff.tenant_id = 'global')
        LIMIT 1
      )
      WHERE user_id IS NULL AND email IS NOT NULL AND (tenant_id = ? OR ? = 'global')
    `).run(tenantId, tenantId);

    // Auto-backfill: any user in users table that doesn't have a corresponding staff record
    const unlinkedUsers = db.prepare(`
      SELECT u.user_id, u.tenant_id, u.name, u.email, u.role
      FROM users u
      LEFT JOIN staff s ON s.user_id = u.user_id AND (s.tenant_id = u.tenant_id OR s.tenant_id = 'global')
      WHERE s.staff_id IS NULL AND (u.tenant_id = ? OR ? = 'global')
    `).all(tenantId, tenantId) as any[];

    if (unlinkedUsers.length > 0) {
      const insertStaffStmt = db.prepare(`
        INSERT OR IGNORE INTO staff (
          staff_id, tenant_id, staff_code, name, phone, email, role_designation, user_id, status, sync_status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, NULL, ?, ?, ?, 'ACTIVE', 'SYNCED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `);
      for (const u of unlinkedUsers) {
        const countRow = db.prepare('SELECT COUNT(*) as cnt FROM staff WHERE tenant_id = ?').get(u.tenant_id) as any;
        const nextSeq = (countRow?.cnt || 0) + 1;
        const staffCode = `STF-${String(nextSeq).padStart(4, '0')}`;
        const roleDesig = ['ADMIN', 'OWNER', 'ADMINISTRATOR'].includes((u.role || '').toUpperCase()) ? 'ADMIN' : 'STAFF';
        insertStaffStmt.run(crypto.randomUUID(), u.tenant_id, staffCode, u.name || u.email, u.email, roleDesig, u.user_id);
      }
    }
  } catch (reconcileErr) {
    console.warn('[dbGetStaff] Auto-reconcile error:', reconcileErr);
  }

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
  const rows = db.prepare(sql).all(...sqlParams);
  return rows.map((r: any) => ({
    ...r,
    permissions: parsePermissionList(r.user_permissions, r.user_restricted_page),
    has_pin: Boolean(r.biller_pin_hash),
    biller_pin_hash: undefined,
  }));
}

export function dbGetStaffById(params: { tenant_id: string; staff_id: string }) {
  const row: any = db.prepare(`
    SELECT s.*, u.email as user_email, u.role as user_role, u.permissions as user_permissions,
      u.login_enabled as user_login_enabled
    FROM staff s
    LEFT JOIN users u ON s.user_id = u.user_id
    WHERE s.staff_id = ? AND s.tenant_id = ? AND s.is_deleted = 0
  `).get(params.staff_id, params.tenant_id);

  if (!row) return null;

  const current_balance = db.prepare(`
    SELECT COALESCE(running_balance, 0) as balance
    FROM staff_ledger
    WHERE staff_id = ? AND tenant_id = ?
    ORDER BY created_at DESC, ledger_id DESC
    LIMIT 1
  `).get(params.staff_id, params.tenant_id) as any;

  return {
    ...row,
    permissions: parsePermissionList(row.user_permissions),
    current_balance: current_balance?.balance || 0,
    has_pin: Boolean(row.biller_pin_hash),
    biller_pin_hash: undefined,
  };
}

export function dbSaveStaff(params: {
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
  const tenantId = params.tenant_id;
  const staffId = params.staff_id || crypto.randomUUID();
  const name = params.name.trim();
  if (!name) throw new Error('Staff name is required');

  const existing = db.prepare('SELECT staff_id, staff_code, biller_pin_hash FROM staff WHERE staff_id = ? AND tenant_id = ?').get(staffId, tenantId) as any;

  let staffCode = existing?.staff_code;
  if (!staffCode) {
    const countRow = db.prepare('SELECT COUNT(*) as cnt FROM staff WHERE tenant_id = ?').get(tenantId) as any;
    const nextSeq = (countRow?.cnt || 0) + 1;
    staffCode = `STF-${String(nextSeq).padStart(4, '0')}`;
  }

  let pinHash = existing?.biller_pin_hash || null;
  if (params.biller_pin !== undefined) {
    if (params.biller_pin && params.biller_pin.trim().length === 4) {
      const newHash = hashStaffPin(params.biller_pin.trim(), tenantId);
      const dup = db.prepare('SELECT staff_id FROM staff WHERE tenant_id = ? AND biller_pin_hash = ? AND staff_id != ? AND is_deleted = 0 AND status = "ACTIVE"').get(tenantId, newHash, staffId);
      if (dup) throw new Error('This 4-digit PIN is already assigned to another staff member');
      pinHash = newHash;
    } else if (params.biller_pin === '' || params.biller_pin === null) {
      pinHash = null;
    }
  }

  const now = localTimestamp(new Date());

  if (existing) {
    db.prepare(`
      UPDATE staff SET
        name = ?, phone = ?, email = ?, role_designation = ?, user_id = ?,
        biller_pin_hash = ?, joining_date = ?, monthly_salary = ?, status = COALESCE(?, status),
        sync_status = 'PENDING', updated_at = ?
      WHERE staff_id = ? AND tenant_id = ?
    `).run(
      name, params.phone || null, params.email || null, params.role_designation || null, params.user_id || null,
      pinHash, params.joining_date || null, params.monthly_salary || 0, params.status || 'ACTIVE',
      now, staffId, tenantId
    );
  } else {
    db.prepare(`
      INSERT INTO staff (
        staff_id, tenant_id, staff_code, name, phone, email, role_designation, user_id,
        biller_pin_hash, joining_date, monthly_salary, status, sync_status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)
    `).run(
      staffId, tenantId, staffCode, name, params.phone || null, params.email || null,
      params.role_designation || null, params.user_id || null, pinHash,
      params.joining_date || null, params.monthly_salary || 0, params.status || 'ACTIVE',
      now, now
    );
  }

  if (params.monthly_salary !== undefined && params.monthly_salary !== null) {
    const latestSalary: any = db.prepare(`SELECT monthly_salary FROM staff_salaries WHERE staff_id = ? AND tenant_id = ? ORDER BY effective_date DESC LIMIT 1`).get(staffId, tenantId);
    if (!latestSalary || Number(latestSalary.monthly_salary) !== Number(params.monthly_salary)) {
      db.prepare(`
        INSERT INTO staff_salaries (salary_id, tenant_id, staff_id, monthly_salary, effective_date, notes, sync_status, created_at)
        VALUES (?, ?, ?, ?, ?, 'Salary updated', 'PENDING', ?)
      `).run(crypto.randomUUID(), tenantId, staffId, params.monthly_salary, now.split(' ')[0], now);
    }
  }

  return dbGetStaffById({ tenant_id: tenantId, staff_id: staffId });
}

export function dbVerifyBillerPin(params: { tenant_id: string; pin: string }) {
  const { tenant_id, pin } = params;
  if (!pin || pin.trim().length !== 4) {
    return { success: false, error: 'PIN must be exactly 4 digits' };
  }
  const hash = hashStaffPin(pin.trim(), tenant_id);
  const staffMember: any = db.prepare(`
    SELECT staff_id, staff_code, name, role_designation, status
    FROM staff
    WHERE tenant_id = ? AND biller_pin_hash = ? AND is_deleted = 0
  `).get(tenant_id, hash);

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

export function dbGetStaffLedger(params: { tenant_id: string; staff_id: string }) {
  const rows = db.prepare(`
    SELECT * FROM staff_ledger
    WHERE tenant_id = ? AND staff_id = ?
    ORDER BY transaction_date DESC, created_at DESC, ledger_id DESC
  `).all(params.tenant_id, params.staff_id);
  return rows;
}

export function dbAddStaffTransaction(params: {
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
  const { tenant_id, staff_id, type, amount, payment_method = 'CASH', payment_source_id, reference_number, notes, user_id, user_name } = params;
  if (amount <= 0) throw new Error('Transaction amount must be greater than zero');

  const staff = db.prepare('SELECT staff_id, name FROM staff WHERE staff_id = ? AND tenant_id = ?').get(staff_id, tenant_id) as any;
  if (!staff) throw new Error('Staff member not found');

  const now = localTimestamp(new Date());
  const txId = crypto.randomUUID();
  let cashTxId: string | null = null;

  if (params.create_cash_transaction !== false && (type === 'ADVANCE' || type === 'SALARY_PAYMENT') && payment_method === 'CASH') {
    const activeDrawer: any = db.prepare(`SELECT drawer_id FROM cash_drawer WHERE tenant_id = ? AND status = 'OPEN' ORDER BY opened_at DESC LIMIT 1`).get(tenant_id);
    if (activeDrawer) {
      cashTxId = crypto.randomUUID();
      const catName = type === 'ADVANCE' ? 'Staff Advance' : 'Staff Salary Payment';
      db.prepare(`
        INSERT INTO cash_transactions (
          transaction_id, tenant_id, drawer_id, type, amount, category, notes,
          reference_number, entered_by, entered_by_name, transaction_date, sync_status, created_at, updated_at
        ) VALUES (?, ?, ?, 'CASH_OUT', ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)
      `).run(
        cashTxId, tenant_id, activeDrawer.drawer_id, amount, catName,
        `Paid to ${staff.name}${notes ? ': ' + notes : ''}`, reference_number || null,
        user_id || null, user_name || null, now, now, now
      );

      db.prepare(`
        UPDATE cash_drawer
        SET cash_out = cash_out + ?,
            current_cash = opening_balance + cash_sales + cash_in - (cash_out + ?),
            expected_closing = opening_balance + cash_sales + cash_in - (cash_out + ?),
            updated_at = ?
        WHERE drawer_id = ?
      `).run(amount, amount, amount, now, activeDrawer.drawer_id);
    }
  }

  db.prepare(`
    INSERT INTO staff_transactions (
      transaction_id, tenant_id, staff_id, type, amount, payment_method, payment_source_id,
      cash_transaction_id, reference_number, notes, created_by, created_by_name,
      transaction_date, sync_status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)
  `).run(
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

  const prevBalanceRow: any = db.prepare(`
    SELECT running_balance FROM staff_ledger
    WHERE tenant_id = ? AND staff_id = ?
    ORDER BY transaction_date DESC, created_at DESC, ledger_id DESC
    LIMIT 1
  `).get(tenant_id, staff_id);

  const prevBal = Number(prevBalanceRow?.running_balance || 0);
  const newBal = prevBal + debitAmt - creditAmt;

  const ledgerId = crypto.randomUUID();
  db.prepare(`
    INSERT INTO staff_ledger (
      ledger_id, tenant_id, staff_id, transaction_id, transaction_date, description,
      debit_amount, credit_amount, running_balance, reference_type, created_by, sync_status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)
  `).run(
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

export function recalcStaffLedgerBalances(dbInstance: any, tenantId: string, staffId: string) {
  const targetDb = dbInstance || db;
  const rows = targetDb.prepare(`
    SELECT ledger_id, debit_amount, credit_amount 
    FROM staff_ledger 
    WHERE staff_id = ? AND (tenant_id = ? OR tenant_id = 'global')
    ORDER BY transaction_date ASC, created_at ASC, ledger_id ASC
  `).all(staffId, tenantId) as any[];

  let running = 0;
  for (const r of rows) {
    const debit = Number(r.debit_amount || 0);
    const credit = Number(r.credit_amount || 0);
    running = Math.round((running + debit - credit) * 100) / 100;
    targetDb.prepare(`UPDATE staff_ledger SET running_balance = ?, updated_at = CURRENT_TIMESTAMP WHERE ledger_id = ?`).run(running, r.ledger_id);
  }
}

export function dbGetStaffAttendance(params: { tenant_id: string; staff_id?: string; date?: string; month?: string }) {
  const { tenant_id, staff_id, date, month } = params;
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
  return db.prepare(sql).all(...sqlParams);
}

export function dbSaveStaffAttendance(params: {
  tenant_id: string;
  staff_id: string;
  date: string;
  status: 'PRESENT' | 'ABSENT' | 'HALF_DAY' | 'LEAVE' | 'HOLIDAY';
  check_in_time?: string;
  check_out_time?: string;
  notes?: string;
  user_id?: string;
}) {
  const { tenant_id, staff_id, date, status, check_in_time, check_out_time, notes, user_id } = params;
  const now = localTimestamp(new Date());
  const existing: any = db.prepare(`SELECT attendance_id FROM staff_attendance WHERE tenant_id = ? AND staff_id = ? AND date = ?`).get(tenant_id, staff_id, date);

  if (existing) {
    db.prepare(`
      UPDATE staff_attendance SET
        status = ?, check_in_time = COALESCE(?, check_in_time), check_out_time = COALESCE(?, check_out_time),
        notes = COALESCE(?, notes), created_by = COALESCE(?, created_by), sync_status = 'PENDING', updated_at = ?
      WHERE attendance_id = ?
    `).run(status, check_in_time || null, check_out_time || null, notes || null, user_id || null, now, existing.attendance_id);
    return { success: true, attendance_id: existing.attendance_id };
  } else {
    const id = crypto.randomUUID();
    db.prepare(`
      INSERT INTO staff_attendance (
        attendance_id, tenant_id, staff_id, date, status, check_in_time, check_out_time,
        notes, created_by, sync_status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)
    `).run(id, tenant_id, staff_id, date, status, check_in_time || null, check_out_time || null, notes || null, user_id || null, now, now);
    return { success: true, attendance_id: id };
  }
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
  if (!db || !user.email) return;
  const existing: any = db.prepare(`SELECT user_id, password_hash FROM users WHERE user_id = ? OR LOWER(email) = LOWER(?)`).get(user.user_id, user.email);
  const now = localTimestamp();

  if (existing) {
    db.prepare(`
      UPDATE users SET
        user_id = ?, tenant_id = ?, name = ?, email = ?, role = COALESCE(?, role),
        password_hash = CASE WHEN ? = 1 THEN NULL ELSE COALESCE(?, password_hash) END,
        restricted_page = COALESCE(?, restricted_page),
        permissions = COALESCE(?, permissions),
        login_enabled = COALESCE(?, login_enabled)
      WHERE user_id = ?
    `).run(
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
    db.prepare(`
      INSERT INTO users (user_id, tenant_id, name, email, password_hash, role, restricted_page, permissions, login_enabled, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
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
  if (!db) return { success: false, error: 'Local database unavailable' };
  const user: any = db.prepare(`SELECT user_id, tenant_id, name, email, role, password_hash, restricted_page, permissions, login_enabled FROM users WHERE LOWER(email) = LOWER(?)`).get(email);
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
    const tenantStatusRow: any = db.prepare(`SELECT value FROM settings WHERE key = 'tenant_status' AND (tenant_id = ? OR tenant_id = 'global') LIMIT 1`).get(user.tenant_id);
    if (tenantStatusRow?.value === 'TERMINATED' || tenantStatusRow?.value === 'SUSPENDED') {
      return { success: false, error: 'This store subscription has been terminated or suspended by administration.' };
    }
  } catch {}

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

export function dbEmergencyPurgeLocalData(wipeMode: 'ALL_DATA' | 'SALES_AND_CASH_ONLY' = 'ALL_DATA'): { success: boolean; clearedTables: string[]; error?: string } {
  const d = getDb();
  if (!d) return { success: false, clearedTables: [], error: 'Database not initialized' };

  const salesAndCashTables = [
    'invoices',
    'invoice_items',
    'returns',
    'return_items',
    'quotations',
    'quotation_items',
    'purchase_bills',
    'purchase_bill_items',
    'parties',
    'party_ledger',
    'cash_drawer',
    'cash_transactions',
    'cashier_audit_log',
    'cash_categories',
    'scrap_transactions',
    'scrap_categories',
    'warranties',
    'customers',
    'loyalty_transactions',
    'payment_source_transactions',
    'staff_salaries',
    'staff_transactions',
    'staff_ledger',
    'shop_closing_reports',
    'ecommerce_sync_logs',
  ];

  const fullWipeExtraTables = [
    'products',
    'product_grades',
    'pricing_tiers',
    'product_pricing',
    'combo_offers',
    'combo_items',
    'staff',
    'staff_attendance',
    'payment_sources',
    'ecommerce_settings',
    'ecommerce_product_mappings',
    'sync_meta',
    'users',
    'settings',
  ];

  const targetTables = wipeMode === 'SALES_AND_CASH_ONLY'
    ? salesAndCashTables
    : [...salesAndCashTables, ...fullWipeExtraTables];

  const cleared: string[] = [];

  const purgeTx = d.transaction(() => {
    d.pragma('foreign_keys = OFF');
    for (const table of targetTables) {
      try {
        const tableCheck = d.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?").get(table);
        if (tableCheck) {
          d.exec(`DELETE FROM ${table};`);
          cleared.push(table);
        }
      } catch (err) {
        console.warn(`[EmergencyPurge] Table delete warning for ${table}:`, err);
      }
    }
    try {
      d.exec("DELETE FROM sqlite_sequence WHERE name IN ('" + targetTables.join("','") + "');");
    } catch {}
    d.pragma('foreign_keys = ON');
  });

  try {
    purgeTx();
    console.log(`[EmergencyPurge] Purged ${cleared.length} tables in mode: ${wipeMode}`);

    try {
      d.pragma('wal_checkpoint(TRUNCATE)');
      d.exec('VACUUM;');
    } catch (vacErr) {
      console.warn('[EmergencyPurge] VACUUM warning:', vacErr);
    }

    try {
      const appData = app.getPath('appData');
      const candidates = [
        path.join(appData, 'nafid', 'vendora_v2.db'),
        path.join(appData, 'nafid', 'vendora.db'),
        path.join(appData, 'com.nafid', 'vendora_v2.db'),
        path.join(appData, 'vendora', 'vendora_v2.db'),
        path.join(appData, 'Vendora', 'vendora_v2.db'),
        path.join(appData, 'Nafid', 'vendora.db'),
      ];
      for (const cand of candidates) {
        if (fs.existsSync(cand)) {
          try { fs.unlinkSync(cand); } catch {}
          if (fs.existsSync(`${cand}-wal`)) try { fs.unlinkSync(`${cand}-wal`); } catch {}
          if (fs.existsSync(`${cand}-shm`)) try { fs.unlinkSync(`${cand}-shm`); } catch {}
        }
      }
    } catch (candErr) {
      console.warn('[EmergencyPurge] Candidate cleanup warning:', candErr);
    }

    return { success: true, clearedTables: cleared };
  } catch (err: any) {
    console.error('[EmergencyPurge] Fatal error purging local DB:', err);
    return { success: false, clearedTables: cleared, error: err?.message || 'Purge failed' };
  }
}




