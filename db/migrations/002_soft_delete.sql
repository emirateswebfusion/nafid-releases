-- Migration: Add Soft Delete support to products
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='is_deleted') THEN
    ALTER TABLE products ADD COLUMN is_deleted BOOLEAN DEFAULT FALSE;
  END IF;
END $$;

-- Update RLS policies to exclude deleted items by default if needed, 
-- but for sync we want to see them.
-- Actually, the sync endpoint needs to see them to tell the edge to delete them.
