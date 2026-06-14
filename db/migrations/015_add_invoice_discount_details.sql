-- 015_add_invoice_discount_details.sql
-- Add discount_type and discount_value to invoices

ALTER TABLE invoices 
ADD COLUMN IF NOT EXISTS discount_type VARCHAR(20) DEFAULT 'FIXED',
ADD COLUMN IF NOT EXISTS discount_value DECIMAL(12, 2) DEFAULT 0;
