-- Migration: Update Unique Constraint for Products to include brand_manufacturer

-- Drop the old unique index that restricts items with the same name across different brands
DROP INDEX IF EXISTS idx_uq_product_name_tenant;

-- Add the new unique index that factors in the brand manufacturer
CREATE UNIQUE INDEX IF NOT EXISTS idx_uq_product_name_brand_tenant ON products(tenant_id, name, brand_manufacturer);
