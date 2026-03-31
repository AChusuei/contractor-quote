-- Platform admins — super users managed via the admin UI.
-- The PLATFORM_ADMIN_EMAILS env var remains the bootstrap mechanism;
-- any email in that var is always treated as a platform admin regardless
-- of this table. This table stores dynamically-added admins.
CREATE TABLE platform_admins (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_platform_admins_email ON platform_admins(email);
