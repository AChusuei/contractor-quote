-- Add next_billing_date and Paddle index columns
-- (paddle_customer_id, paddle_subscription_id, billing_status, grace_period_ends_at,
--  monthly_rate_cents were added in 0002_billing_columns.sql)
ALTER TABLE contractors ADD COLUMN next_billing_date TEXT;

CREATE INDEX idx_contractors_paddle_customer ON contractors(paddle_customer_id);
CREATE INDEX idx_contractors_paddle_subscription ON contractors(paddle_subscription_id);
