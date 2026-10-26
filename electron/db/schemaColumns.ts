import type Database from 'better-sqlite3';

/** Adds any column of the expected schema that an older database is missing (per-table column list). Part of initDb, run in order. */
export function ensureSchemaColumns(db: Database.Database) {
  const schemaMap: Record<string, string[]> = {
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
    let existingCols: string[];
    try {
      const info = db.prepare(`PRAGMA table_info(${table})`).all();
      existingCols = info.map((c: unknown) => (c as { name: string }).name);
    } catch (e) {
      console.warn(`[DB Migration] Could not retrieve table_info for ${table}:`, (e as Error).message);
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
        } catch (e) {
          console.warn(`[DB Migration] Failed to add column ${col} to ${table}:`, (e as Error).message);
        }
      }
    }
  }
}
