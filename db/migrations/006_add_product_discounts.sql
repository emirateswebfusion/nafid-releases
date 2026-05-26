-- Add first-class discount and offer columns to products table
ALTER TABLE products 
ADD COLUMN discount_percent DECIMAL(10,2),
ADD COLUMN discount_flat DECIMAL(10,2),
ADD COLUMN offer_price DECIMAL(10,2);
