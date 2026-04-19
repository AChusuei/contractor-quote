-- Add indexes for Paddle billing fields on contractors table
CREATE INDEX IF NOT EXISTS idx_contractors_paddle_customer ON contractors(paddle_customer_id);
CREATE INDEX IF NOT EXISTS idx_contractors_paddle_subscription ON contractors(paddle_subscription_id);
