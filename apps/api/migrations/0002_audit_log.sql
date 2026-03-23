-- Audit log for compliance-sensitive actions (e.g. right-to-delete)
CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contractor_id TEXT NOT NULL REFERENCES contractors(id),
  action TEXT NOT NULL,           -- 'quote_anonymized' | 'quote_deleted' | etc.
  target_type TEXT NOT NULL,      -- 'quote' | 'appointment' | etc.
  target_id TEXT NOT NULL,        -- ID of the affected record
  details TEXT,                   -- JSON blob with action-specific metadata
  performed_by TEXT NOT NULL,     -- contractor ID of the actor
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_audit_log_contractor ON audit_log(contractor_id);
CREATE INDEX idx_audit_log_target ON audit_log(target_type, target_id);
CREATE INDEX idx_audit_log_created ON audit_log(created_at);
