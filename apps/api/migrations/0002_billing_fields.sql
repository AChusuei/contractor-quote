-- Add Paddle billing fields to contractors table
ALTER TABLE contractors ADD COLUMN paddle_customer_id TEXT;
ALTER TABLE contractors ADD COLUMN paddle_subscription_id TEXT;
ALTER TABLE contractors ADD COLUMN billing_status TEXT NOT NULL DEFAULT 'trialing';
ALTER TABLE contractors ADD COLUMN grace_period_ends_at TEXT;
ALTER TABLE contractors ADD COLUMN monthly_rate_cents INTEGER;
ALTER TABLE contractors ADD COLUMN next_billing_date TEXT;

CREATE INDEX idx_contractors_paddle_customer ON contractors(paddle_customer_id);
CREATE INDEX idx_contractors_paddle_subscription ON contractors(paddle_subscription_id);
