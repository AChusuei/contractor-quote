-- Migration: audit_events table for compliance logging
-- Logs all modifications to staff records, contractor profiles, and super admin actions.

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  actor_email TEXT NOT NULL,
  actor_type TEXT NOT NULL CHECK(actor_type IN ('super_admin', 'staff', 'system')),
  entity_type TEXT NOT NULL CHECK(entity_type IN ('staff', 'contractor', 'super_user')),
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('create', 'update', 'delete', 'impersonate')),
  details TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_events_entity ON audit_events(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_actor ON audit_events(actor_email);
CREATE INDEX IF NOT EXISTS idx_audit_events_created_at ON audit_events(created_at);
