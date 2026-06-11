-- 011_add_billing_type_and_grades.sql

CREATE TABLE IF NOT EXISTS product_grades (
    grade_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    category VARCHAR(100) NOT NULL,
    grade_name VARCHAR(100) NOT NULL,
    rate DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_grade_tenant UNIQUE (tenant_id, category, grade_name)
);

CREATE INDEX IF NOT EXISTS idx_product_grades_tenant_id ON product_grades(tenant_id);

-- Enable RLS
ALTER TABLE product_grades ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_product_grades') THEN
        CREATE POLICY tenant_isolation_product_grades 
            ON product_grades
            USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);
    END IF;
END $$;

-- Alter Products table
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS billing_type VARCHAR(20) DEFAULT 'PIECE',
ADD COLUMN IF NOT EXISTS grade_id UUID REFERENCES product_grades(grade_id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS pricing_mode VARCHAR(20) DEFAULT 'FIXED_PRICE',
ADD COLUMN IF NOT EXISTS average_weight_per_piece DECIMAL(10, 3),
ADD COLUMN IF NOT EXISTS weight_override_allowed BOOLEAN DEFAULT false;
