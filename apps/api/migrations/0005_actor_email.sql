-- Add actor_email to quote_activity so super admin actions are attributable.
-- staff_id alone is insufficient because super admins are not in the staff table.
ALTER TABLE quote_activity ADD COLUMN actor_email TEXT;
