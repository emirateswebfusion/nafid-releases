-- Migration: Update Unique Constraint for Products to include sku_barcode

-- Use a DO block to safely add the constraint without dropping/rebuilding if it already exists
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_constraint 
        WHERE conname = 'uq_product_barcode_tenant'
    ) THEN
        ALTER TABLE products ADD CONSTRAINT uq_product_barcode_tenant UNIQUE (tenant_id, sku_barcode);
    END IF;
END $$;
