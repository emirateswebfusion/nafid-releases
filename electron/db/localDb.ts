import Database from 'better-sqlite3';
import path from 'path';
import { app } from 'electron';
import fs from 'fs';
import crypto from 'node:crypto';

// ── Local Time Helpers ────────────────────────────────────────────────────
function localTimestamp(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

let db: Database.Database;

export function initDb() {
  const dbPath = path.join(app.getPath('userData'), 'vendora_v2.db');
  
  // Ensure directory exists
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  // Create tables with full schema matching cloud sync expectations
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        user_id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        role TEXT DEFAULT 'BILLER',
        restricted_page TEXT,
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
        FOREIGN KEY (invoice_id) REFERENCES invoices(invoice_id)
    );

    CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id ON invoice_items(invoice_id);

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
        pricing_tier_id TEXT,
        credit_limit REAL NOT NULL DEFAULT 0,
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
        sync_status TEXT DEFAULT 'SYNCED',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (quotation_id) REFERENCES quotations(quotation_id)
    );

    CREATE TABLE IF NOT EXISTS warranties (
        warranty_id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        invoice_id TEXT,
        invoice_item_id TEXT,
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
        total_points_earned REAL NOT NULL DEFAULT 0,
        total_points_redeemed REAL NOT NULL DEFAULT 0,
        current_points_balance REAL NOT NULL DEFAULT 0,
        last_purchase_date DATETIME,
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

    CREATE TABLE IF NOT EXISTS sync_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
    );
  `);

  // Migration: Add missing columns if they don't exist (Idempotent)
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
        'is_deleted'
    ],
    invoice_items: [
        'item_id', 'invoice_id', 'tenant_id', 'product_id', 'name', 'quantity', 'unit_price', 'tax_amount', 'total', 'is_service_item',
        'source_item_id', 'bos_unit_price', 'bos_tax_amount', 'bos_total', 'combo_id', 'combo_details'
    ],
    users: [
        'user_id', 'tenant_id', 'name', 'email', 'role', 'created_at'
    ],
    settings: [
        'tenant_id', 'key', 'value', 'sync_status', 'updated_at'
    ],
    parties: [
        'party_id', 'tenant_id', 'name', 'phone', 'address', 'gstin', 'balance', 'gst_balance', 'estimate_balance', 'balance_type', 'notes', 'last_transaction_date', 'is_deleted', 'sync_status', 'created_at', 'updated_at', 'pricing_tier_id', 'credit_limit'
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
        'quotation_id', 'tenant_id', 'quotation_number', 'customer_name', 'customer_phone', 'customer_address', 'terms_conditions', 'subtotal', 'tax_total', 'grand_total', 'status', 'converted_to_invoice', 'invoice_id', 'sync_status', 'created_at', 'updated_at'
    ],
    quotation_items: [
        'item_id', 'quotation_id', 'tenant_id', 'product_id', 'name', 'quantity', 'weight', 'rate', 'amount', 'sync_status', 'created_at'
    ],
    warranties: [
        'warranty_id', 'tenant_id', 'invoice_id', 'invoice_item_id', 'customer_name', 'customer_phone', 'product_name', 'product_details', 'purchase_date', 'warranty_period_days', 'expiry_date', 'notes', 'sync_status', 'created_at', 'updated_at'
    ],
    purchase_bills: [
        'purchase_bill_id', 'tenant_id', 'bill_number', 'supplier_id', 'supplier_name', 'bill_date', 'invoice_number', 'notes', 'total_amount', 'bill_type', 'sync_status', 'created_at', 'updated_at'
    ],
    purchase_bill_items: [
        'item_id', 'purchase_bill_id', 'tenant_id', 'product_id', 'name', 'quantity', 'purchase_price', 'total_amount', 'selling_price', 'offer_price', 'is_gst_applicable', 'tax_rate_percent', 'hsn_sac_code', 'sync_status', 'created_at', 'updated_at'
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
        'customer_id', 'tenant_id', 'name', 'phone', 'address', 'total_points_earned', 'total_points_redeemed',
        'current_points_balance', 'last_purchase_date', 'sync_status', 'created_at', 'updated_at'
    ],
    returns: [
        'return_id', 'invoice_id', 'tenant_id', 'user_id', 'return_number', 'customer_name', 'customer_phone',
        'subtotal', 'tax_total', 'grand_total', 'reason', 'return_date', 'sync_status', 'created_at', 'updated_at',
        'refund_method', 'adjusted_invoice_number'
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
        'pricing_tier_id', 'tenant_id', 'name', 'is_active', 'sort_order', 'is_deleted',
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
        if (col === 'weight_override_allowed' || col === 'is_service_item' || col === 'is_held' || col === 'is_deleted') {
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

  // Migration: Rename legacy 'CASHIER' role values to 'BILLER'
  db.exec("UPDATE users SET role = 'BILLER' WHERE role = 'CASHIER'");

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
    // Backfill: existing balances are treated as GST balance (legacy behavior)
    db.exec("UPDATE parties SET gst_balance = balance WHERE gst_balance = 0 AND balance != 0");
  } catch (e: any) {
    console.warn('[DB Migration] Failed to add balance/credit_limit columns to parties:', e.message);
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

  // Migration: Add restricted_page column to users
  try {
    const uCols = db.prepare(`PRAGMA table_info(users)`).all().map((c: any) => c.name);
    if (!uCols.includes('restricted_page')) {
      console.log('[DB Migration] Adding restricted_page to users...');
      db.exec("ALTER TABLE users ADD COLUMN restricted_page TEXT");
    }
  } catch (e: any) {
    console.warn('[DB Migration] Failed to add restricted_page to users:', e.message);
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
  } catch (e: any) {
    console.warn('[DB Migration] Failed to add adjustment columns to returns:', e.message);
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

  // Migration: allow temp (billing-only) items — invoice_items & return_items must not
  // FK-reference products, because temp items are sold without creating a products row.
  try {
    const iiSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='invoice_items'").get() as any;
    if (iiSql && /FOREIGN KEY\s*\(\s*product_id\s*\)\s*REFERENCES\s*products/i.test(iiSql.sql)) {
      console.log('[DB Migration] Removing products FK from invoice_items (temp billing items support)...');
      db.exec('PRAGMA foreign_keys=off;');
      const migrateInvoiceItems = db.transaction(() => {
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
              is_service_item INTEGER DEFAULT 0,
              source_item_id TEXT,
              bos_unit_price REAL DEFAULT 0,
              bos_tax_amount REAL DEFAULT 0,
              bos_total REAL DEFAULT 0,
              qty_from_paper_stock REAL DEFAULT 0,
              sync_status TEXT DEFAULT 'PENDING',
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY (invoice_id) REFERENCES invoices(invoice_id)
          );
        `);
        const cols = db.prepare("PRAGMA table_info(invoice_items)").all().map((c: any) => c.name).join(', ');
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
        db.exec(`
          CREATE TABLE return_items_new (
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
        `);
        const cols = db.prepare("PRAGMA table_info(return_items)").all().map((c: any) => c.name).join(', ');
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

export function upsertCustomerRecord(
  db: Database.Database,
  tenantId: string,
  rawName?: string | null,
  rawPhone?: string | null,
  rawAddress?: string | null
): string | null {
  if (!db || !tenantId) return null;
  const name = (rawName || '').trim().replace(/\s+/g, ' ');
  const phone = (rawPhone || '').trim() || null;
  const address = (rawAddress || '').trim() || null;

  if (!name && !phone) return null;

  try {
    let existing: any = null;
    if (phone) {
      existing = db.prepare('SELECT customer_id, name, phone, address FROM customers WHERE tenant_id = ? AND phone = ?').get(tenantId, phone);
    }
    if (!existing && name) {
      const candidates = db.prepare('SELECT customer_id, name, phone, address FROM customers WHERE tenant_id = ? AND name = ? COLLATE NOCASE').all(tenantId, name);
      if (candidates && candidates.length > 0) {
        existing = candidates[0];
      } else {
        const allCust = db.prepare('SELECT customer_id, name, phone, address FROM customers WHERE tenant_id = ?').all(tenantId);
        const normTarget = name.toLowerCase().replace(/\s+/g, ' ');
        existing = allCust.find((c: any) => (c.name || '').trim().toLowerCase().replace(/\s+/g, ' ') === normTarget);
      }
    }

    const displayName = name || phone!;

    if (existing) {
      db.prepare(`
        UPDATE customers
        SET name = ?,
            phone = COALESCE(?, phone),
            address = COALESCE(?, address),
            last_purchase_date = CURRENT_TIMESTAMP,
            sync_status = CASE WHEN sync_status = 'SYNCED' THEN 'PENDING' ELSE sync_status END,
            updated_at = CURRENT_TIMESTAMP
        WHERE customer_id = ?
      `).run(displayName, phone, address, existing.customer_id);
      return existing.customer_id as string;
    } else {
      const customer_id = crypto.randomUUID();
      db.prepare(`
        INSERT INTO customers (customer_id, tenant_id, name, phone, address, total_points_earned, total_points_redeemed, current_points_balance, last_purchase_date, sync_status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 0, 0, 0, CURRENT_TIMESTAMP, 'PENDING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).run(customer_id, tenantId, displayName, phone, address);
      return customer_id;
    }
  } catch (err: any) {
    console.error('[DB] upsertCustomerRecord error:', err.message);
    return null;
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
          AND (
            (invoices.customer_phone IS NOT NULL AND TRIM(invoices.customer_phone) != '' AND c.phone = TRIM(invoices.customer_phone))
            OR (c.name = TRIM(invoices.customer_name) COLLATE NOCASE)
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

