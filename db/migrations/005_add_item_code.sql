-- 005_add_item_code.sql
-- Add item_code column to products table

ALTER TABLE products 
ADD COLUMN IF NOT EXISTS item_code VARCHAR(10);

-- Create an index for faster searching
CREATE INDEX IF NOT EXISTS idx_products_item_code ON products(item_code);
