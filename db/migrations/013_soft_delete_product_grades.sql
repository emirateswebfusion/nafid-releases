-- 013_soft_delete_product_grades.sql

ALTER TABLE product_grades ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false;
