-- Add billing fields to contractors table
ALTER TABLE contractors ADD COLUMN billing_status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE contractors ADD COLUMN monthly_rate_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE contractors ADD COLUMN billing_exempt INTEGER NOT NULL DEFAULT 0;
ALTER TABLE contractors ADD COLUMN paddle_customer_id TEXT;
ALTER TABLE contractors ADD COLUMN grace_period_ends_at TEXT;
