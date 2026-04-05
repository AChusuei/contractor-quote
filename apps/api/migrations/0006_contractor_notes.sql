-- Add contractor_notes column to quotes table for internal contractor use
ALTER TABLE quotes ADD COLUMN contractor_notes TEXT;
