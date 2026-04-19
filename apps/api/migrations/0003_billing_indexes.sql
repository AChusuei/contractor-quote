-- Add indexes for Paddle billing lookup fields
CREATE INDEX idx_contractors_paddle_customer ON contractors(paddle_customer_id);
CREATE INDEX idx_contractors_paddle_subscription ON contractors(paddle_subscription_id);
