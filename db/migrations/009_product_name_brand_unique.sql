-- Migration: Update Unique Constraint for Products to include brand_manufacturer

-- Drop the old unique constraint (PostgreSQL syntax)
ALTER TABLE products DROP CONSTRAINT IF EXISTS uq_product_name_tenant;

-- Add the new unique constraint that factors in the brand manufacturer
ALTER TABLE products ADD CONSTRAINT uq_product_name_brand_tenant UNIQUE (tenant_id, name, brand_manufacturer);
