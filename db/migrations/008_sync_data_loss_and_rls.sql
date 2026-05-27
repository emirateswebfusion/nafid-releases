-- 008_sync_data_loss_and_rls.sql
-- Add missing columns that cause data loss on sync
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_gst_applicable BOOLEAN DEFAULT true;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50) DEFAULT 'CASH';

-- Force RLS so that the Express backend (running as table owner) cannot bypass it
ALTER TABLE products FORCE ROW LEVEL SECURITY;
ALTER TABLE invoices FORCE ROW LEVEL SECURITY;
ALTER TABLE invoice_items FORCE ROW LEVEL SECURITY;
