-- Super users — platform-level super admins managed via the admin UI.
-- Replaces the PLATFORM_ADMIN_EMAILS env var approach.
-- This table is the single source of truth for super admin access.
CREATE TABLE super_users (
  id TEXT PRIMARY KEY,
  clerk_user_id TEXT,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_super_users_email ON super_users(email);

-- Seed: initial super user
INSERT INTO super_users (id, email, name) VALUES ('su-001', 'alan.chusuei@gmail.com', 'Alan Chusuei');
