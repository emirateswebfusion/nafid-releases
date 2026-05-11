-- 001_initial_schema.sql
-- Multi-Tenant POS PostgreSQL Schema

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Tenants Table
CREATE TABLE IF NOT EXISTS tenants (
    tenant_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    domain_type VARCHAR(50) NOT NULL, -- e.g., 'JEWELRY', 'HARDWARE', 'GROCERY'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Users Table (one tenant can have many users with different roles)
CREATE TABLE IF NOT EXISTS users (
    user_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'CASHIER', -- 'OWNER' | 'CASHIER'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_tenant_id ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- 2. Products Table
CREATE TABLE IF NOT EXISTS products (
    product_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    sku_barcode VARCHAR(100),
    category VARCHAR(100),
    hsn_sac_code VARCHAR(20),
    purchase_price DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    base_price DECIMAL(12, 2) NOT NULL,
    tax_rate_percent DECIMAL(5, 2) DEFAULT 0.00,
    uom VARCHAR(20), -- Unit of Measure (e.g., kg, pcs, grams)
    brand_manufacturer VARCHAR(100),
    current_stock DECIMAL(10, 3) DEFAULT 0,
    reorder_level DECIMAL(10, 3) DEFAULT 0,
    domain_attributes JSONB, -- Hybrid EAV for domain specific properties
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_product_name_tenant UNIQUE (tenant_id, name)
);

-- Index for JSONB querying
CREATE INDEX IF NOT EXISTS idx_products_domain_attributes ON products USING GIN (domain_attributes);
CREATE INDEX IF NOT EXISTS idx_products_tenant_id ON products(tenant_id);

-- 3. Invoices Table
CREATE TABLE IF NOT EXISTS invoices (
    invoice_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    invoice_number VARCHAR(50) NOT NULL,
    invoice_type VARCHAR(20) NOT NULL, -- 'GST', 'BILL_OF_SUPPLY'
    customer_name VARCHAR(255),
    customer_phone VARCHAR(20),
    subtotal DECIMAL(12, 2) NOT NULL,
    tax_total DECIMAL(12, 2) NOT NULL,
    discount_total DECIMAL(12, 2) DEFAULT 0,
    grand_total DECIMAL(12, 2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    -- No sync_status here, this is the cloud DB
    CONSTRAINT uq_invoice_number_tenant UNIQUE (tenant_id, invoice_number)
);

CREATE INDEX IF NOT EXISTS idx_invoices_tenant_id ON invoices(tenant_id);

-- 4. Invoice Items Table
CREATE TABLE IF NOT EXISTS invoice_items (
    item_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_id UUID NOT NULL REFERENCES invoices(invoice_id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(product_id),
    quantity DECIMAL(10, 3) NOT NULL,
    unit_price DECIMAL(12, 2) NOT NULL,
    tax_amount DECIMAL(12, 2) NOT NULL,
    total DECIMAL(12, 2) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_invoice_items_tenant_id ON invoice_items(tenant_id);

-- 5. Notifications Table
CREATE TABLE IF NOT EXISTS notifications (
    notification_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,   -- 'LOW_STOCK' | 'SYNC_ERROR' | 'GENERAL'
    title VARCHAR(255) NOT NULL,
    body TEXT,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notifications_tenant_id ON notifications(tenant_id);

-------------------------------------------------------------------------------
-- ROW LEVEL SECURITY (RLS) POLICIES
-------------------------------------------------------------------------------

-- Enable RLS
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;

-- Products Policy: User can only access products where tenant_id matches the current_setting
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_products') THEN
        CREATE POLICY tenant_isolation_products 
            ON products
            USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);
    END IF;
END $$;

-- Invoices Policy
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_invoices') THEN
        CREATE POLICY tenant_isolation_invoices 
            ON invoices
            USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);
    END IF;
END $$;

-- Invoice Items Policy
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_invoice_items') THEN
        CREATE POLICY tenant_isolation_invoice_items 
            ON invoice_items
            USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);
    END IF;
END $$;

-- Note: In application backend logic (e.g. Node.js with pg), you must execute:
-- SET LOCAL app.current_tenant_id = 'the-uuid-here';
-- before running queries in a transaction to access tenant data.
