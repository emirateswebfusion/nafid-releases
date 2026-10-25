import type Database from 'better-sqlite3';

/** Creates the remaining tables (returns, customers / loyalty, payment sources, pricing tiers, combos, staff, sync meta, e-commerce, shop closing) and the indexes, if missing. Part of initDb, run in order. */
export function createExtendedTables(db: Database.Database) {
  db.exec(`
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
        deleted_at DATETIME,
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
        deleted_at DATETIME,
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
        deleted_at DATETIME,
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
        deleted_at DATETIME,
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
        deleted_at DATETIME,
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
        deleted_at DATETIME,
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
    CREATE INDEX IF NOT EXISTS idx_returns_invoice_id ON returns(invoice_id);
    CREATE INDEX IF NOT EXISTS idx_return_items_return_id ON return_items(return_id);
    CREATE INDEX IF NOT EXISTS idx_return_items_invoice_item_id ON return_items(invoice_item_id);
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
}
