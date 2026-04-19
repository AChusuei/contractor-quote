-- Add account_disabled toggle to contractors table
ALTER TABLE contractors ADD COLUMN account_disabled INTEGER DEFAULT 0;
