-- Photos table — stores metadata for photos uploaded to R2
CREATE TABLE photos (
  id TEXT PRIMARY KEY,
  quote_id TEXT NOT NULL REFERENCES quotes(id),
  contractor_id TEXT NOT NULL REFERENCES contractors(id),
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'image/jpeg',
  size INTEGER NOT NULL,
  r2_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_photos_quote ON photos(quote_id, created_at);
CREATE INDEX idx_photos_contractor ON photos(contractor_id);
