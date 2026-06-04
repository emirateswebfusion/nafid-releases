-- Add first-class discount and offer columns to products table
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS discount_percent DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS discount_flat DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS offer_price DECIMAL(10,2);
