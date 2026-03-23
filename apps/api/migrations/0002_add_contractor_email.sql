-- Add email column to contractors table for notification delivery
ALTER TABLE contractors ADD COLUMN email TEXT;

-- Update seed contractor with a dev email
UPDATE contractors SET email = 'admin@centralcabinets.test' WHERE id = 'contractor-001';
