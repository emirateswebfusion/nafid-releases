-- Migration: Add user_id to invoices
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='user_id') THEN
    ALTER TABLE invoices ADD COLUMN user_id UUID;
  END IF;
END $$;
