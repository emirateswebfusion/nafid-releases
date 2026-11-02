import type { Database } from 'better-sqlite3';
export type ServiceDb = Pick<Database, 'prepare'>;
export type CloudAccessUpdate = Parameters<typeof import('../sync/cloudAccess.js').updateCloudAccessConfig>[0];
export interface SettingRow {
    key: string;
    tenant_id: string;
    value: string;
}
export interface ColumnRow {
    name: string;
}
export interface AuthPayload {
    jwt_token?: string;
    token?: string;
    tenant_id?: string;
    user?: {
        tenant_id?: string;
    };
    terminal_id?: string;
}
export interface LoyaltyConfig {
    enabled?: boolean;
    earningRate?: number;
    awardPointsOnPending?: boolean;
}
export interface LoyaltyTotals {
    totEarned: number;
    totRedeemed: number;
    totSales: number;
    lastPurchase: string | null;
}
export interface CustomerCreditRow {
    customer_id: string;
    party_id: string;
    tenant_id: string;
    name: string;
    phone: string;
    address: string;
    balance: number | string;
    party_balance: number;
    credit_limit: number;
    credit_period_enabled: number | boolean;
    party_credit_period_enabled: number | boolean;
    credit_period_days: number;
    party_credit_period_days: number;
    restrict_on_credit_expiry: number | boolean;
    current_points_balance: number;
    has_overdue: boolean;
    overdue_bills_count: number;
    overdue_amount: number;
    oldest_overdue_days: number;
    gst_balance: number | string;
    estimate_balance: number | string;
}
export interface CustomerInput {
    customer_id?: string;
    tenant_id: string;
    name: string;
    phone?: string;
    address?: string;
    gstin?: string;
    notes?: string;
    pricing_tier_id?: string;
    credit_limit?: number;
    credit_period_enabled?: boolean | number;
    credit_period_days?: number | string;
    credit_period_basis?: string;
    restrict_on_credit_expiry?: boolean | number;
}
export interface CreditInvoice extends Record<string, unknown> {
    invoice_id: string;
    invoice_number: string;
    payment_method: string;
    split_details: string | Record<string, unknown> | null;
    balance_amount: number;
    grand_total: number;
    received_amount: number;
    created_at: string;
    due_date: string | null;
}
export interface EnrichedCreditInvoice extends CreditInvoice {
    is_overdue: boolean;
    outstanding_amount: number;
    overdue_days: number;
}
export interface LedgerRow {
    ledger_id: string;
    party_id: string;
    debit_amount: number;
    credit_amount: number;
    reference_number: string;
    description?: string | null;
}
export interface InvoiceRow extends CreditInvoice {
    counts_in_revenue?: number;
    stock_applied?: number;
    bill_purpose?: string;
    tenant_id: string;
    user_id: string;
    invoice_type: string;
    customer_id?: string;
    customer_name?: string;
    customer_phone?: string;
    customer_address?: string;
    customer_gstin?: string;
    customer_state?: string;
    subtotal: number;
    tax_total: number;
    discount_total: number;
    discount_type?: string;
    discount_value?: number;
    scrap_deduction?: number;
    scrap_invoice_number?: string;
    return_deduction?: number;
    return_invoice_number?: string;
    cgst_total?: number;
    sgst_total?: number;
    igst_total?: number;
    supply_type?: string;
    actual_refund_paid?: number;
    notes?: string;
    description?: string;
    points_earned?: number;
    points_redeemed?: number;
    points_redeemed_discount?: number;
    previous_points_balance?: number;
    is_staff?: boolean;
    isStaffCustomer?: boolean;
    staff_id?: string;
    hold_note?: string;
}
export interface InvoiceItem extends Record<string, unknown> {
    item_id: string;
    product_id: string;
    name: string;
    quantity: number;
    unit_price: number;
    tax_amount: number;
    total: number;
    isCombo?: boolean;
    combo_id?: string;
    combo_items?: Array<{
        product_id: string;
        quantity: number;
    }>;
    pieces_sold?: number;
    pieces_override?: number;
    isServiceItem?: boolean;
    is_service_item?: number;
    combo_details?: string;
    billing_type?: string;
    uom?: string;
    unit?: string;
    cgst_rate?: number;
    sgst_rate?: number;
    igst_rate?: number;
    cgst_amount?: number;
    sgst_amount?: number;
    igst_amount?: number;
    hsn_sac_code?: string;
    supply_type?: string;
    created_at?: string;
    weight?: number;
    rate?: number;
    amount?: number;
    hsn_code?: string;
    tax_rate_percent?: number;
    discount_amount?: number;
    discount_percent?: number;
    taxable_amount?: number;
}
export interface CheckoutPayload extends InvoiceRow {
    items: InvoiceItem[];
    scrap_items?: Array<{
        transaction_id: string;
        scrap_category_id: string;
        quantity: number;
        rate: number;
        total_amount: number;
        payment_status?: string;
    }>;
}
export interface CheckoutResult {
    success: boolean;
    invoice_id?: string;
    invoice_number?: string;
    created_at?: string | null;
    error?: string;
}
export interface ComboRow extends Record<string, unknown> {
    items_json: string;
}
export interface GradeInput {
    grade_id: string;
    tenant_id: string;
    category: string;
    grade_name: string;
    rate: number;
    purchase_price?: number;
    offer_price?: number | null;
}
export interface UserRow {
    user_id: string;
    tenant_id: string;
    name: string;
    email: string;
    role: string;
    password_hash: string;
    login_enabled: number;
    permissions: string;
    restricted_page?: string;
}
export interface StaffRow extends Record<string, unknown> {
    staff_id: string;
    staff_code: string;
    name: string;
    status: string;
    role_designation: string;
    user_permissions: string;
    user_restricted_page: string;
    biller_pin_hash: string | null;
}
export interface ProductRow {
    product_id: string;
    name: string;
    sku_barcode: string;
    base_price: number;
    current_stock: number;
    domain_attributes: string;
}
export interface EcommerceSettings {
    fusioncart_url: string;
    store_id: number;
    vendor_id: number;
    store_slug: string;
    store_name: string;
    store_description?: string;
    contact_email?: string;
    contact_phone?: string;
}
export interface VendorRegistration extends EcommerceSettings {
    city?: string;
    address?: string;
    pincode?: string;
    contact_name?: string;
    name: string;
    email: string;
    phone?: string;
}
export interface EcommerceMapping {
    is_online_enabled: number;
    online_title_override: string | null;
    online_description_override: string | null;
    online_price_override: number | null;
    fusioncart_product_id: number | null;
}
export interface FusionStore {
    id: number;
    vendor_id?: number;
    vendor?: {
        id: number;
    };
    is_approved: number;
    status: number;
    store_name: string;
    slug: string;
}
export interface FusionProduct {
    id: number;
}
export interface FusionOrder extends Record<string, unknown> {
    store_id?: number;
    store?: {
        id: number;
    };
}
export interface PaymentSourceInput {
    source_id: string;
    tenant_id: string;
    name: string;
    type: string;
    is_active?: number;
    is_enabled?: number | boolean;
    opening_balance?: number | string;
    current_balance?: number;
    balance?: number;
    bank_name?: string;
    holder_name?: string;
    upi_id?: string;
    sort_order?: number;
    is_default?: number | boolean;
    created_by?: string;
    created_by_name?: string;
    account_number?: string;
    ifsc_code?: string;
    notes?: string;
}
export interface PaymentTransactionInput {
    transaction_id: string;
    tenant_id: string;
    source_id: string;
    type: string;
    amount: number;
    category?: string;
    notes?: string;
    entered_by?: string;
    entered_by_name?: string;
    description?: string;
    reference_number?: string;
    user_id?: string;
    user_name?: string;
    transaction_date?: string;
}
export interface PricingTierInput {
    pricing_tier_id: string;
    tenant_id: string;
    name: string;
    description?: string;
    is_default?: number | boolean | string;
    is_active?: number | boolean | string;
    sort_order?: number;
}
export interface PurchaseBillRow {
    purchase_bill_id: string;
    tenant_id: string;
    supplier_id: string;
    bill_number: string;
    bill_type: string;
    payment_type: string;
    total_amount: number;
    payment_method: string;
    grand_total: number;
}
export interface CashTransactionRow {
    transaction_id: string;
    drawer_id: string;
    amount: number;
    type: string;
}
export interface CashDrawerRow {
    drawer_id: string;
    cash_in: number;
    cash_out: number;
    current_cash: number;
    opening_balance: number;
    cash_sales: number;
    expected_closing: number;
}
export interface QuotationInput extends Record<string, unknown> {
    quotation_id: string;
    tenant_id: string;
    quotation_number: string;
    customer_name?: string;
    customer_phone?: string;
    customer_address?: string;
    customer_gstin?: string;
    customer_state?: string;
    is_gst?: number;
    discount_total?: number;
    round_off?: number;
    biller_name?: string;
    terms_conditions?: string;
    subtotal: number;
    tax_total: number;
    grand_total: number;
    created_at?: string;
    items: InvoiceItem[];
}
export interface ReturnRow extends Record<string, unknown> {
    return_id: string;
    tenant_id: string;
    invoice_id: string;
    return_number: string;
    created_at: string;
    customer_name: string;
    customer_phone: string;
    customer_address: string;
    total_refund: number;
    grand_total: number;
    payment_method: string;
    refund_method: string;
    user_id: string;
    user_name: string;
    /** Original bill fields joined by `findReturnsByReturnNumber3`. */
    orig_invoice_number?: string | null;
    orig_customer_id?: string | null;
    orig_customer_name?: string | null;
    orig_customer_phone?: string | null;
    orig_customer_address?: string | null;
    orig_customer_gstin?: string | null;
}
export interface WarrantyInput {
    warranty_id: string;
    tenant_id: string;
    invoice_id?: string;
    invoice_item_id?: string;
    bill_number?: string;
    brand?: string;
    customer_name: string;
    customer_phone?: string;
    product_name: string;
    product_details?: string;
    purchase_date: string;
    warranty_period_days: number;
    expiry_date: string;
    notes?: string;
}
