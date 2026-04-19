-- Add Paddle billing columns to contractors table
ALTER TABLE contractors ADD COLUMN paddle_customer_id TEXT;
ALTER TABLE contractors ADD COLUMN paddle_subscription_id TEXT;
ALTER TABLE contractors ADD COLUMN billing_status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE contractors ADD COLUMN grace_period_ends_at TEXT;
ALTER TABLE contractors ADD COLUMN monthly_rate_cents INTEGER;
ALTER TABLE contractors ADD COLUMN billing_exempt INTEGER NOT NULL DEFAULT 0;
