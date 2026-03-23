-- Data deletion audit log for CCPA / right-to-delete compliance
-- Stores metadata about what was deleted, but NOT the deleted PII itself.

CREATE TABLE data_deletion_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contractor_id TEXT NOT NULL REFERENCES contractors(id),
  request_type TEXT NOT NULL, -- 'ccpa' | 'customer' | 'contractor'
  requested_by TEXT NOT NULL, -- staff ID or 'customer' or 'system'
  email_hash TEXT NOT NULL,   -- SHA-256 hash of the deleted email (for dedup, not re-identification)
  quotes_deleted INTEGER NOT NULL DEFAULT 0,
  photos_deleted INTEGER NOT NULL DEFAULT 0,
  appointments_deleted INTEGER NOT NULL DEFAULT 0,
  activity_records_deleted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_deletion_log_contractor ON data_deletion_log(contractor_id);
CREATE INDEX idx_deletion_log_created ON data_deletion_log(created_at);
CREATE INDEX idx_deletion_log_email_hash ON data_deletion_log(email_hash);
