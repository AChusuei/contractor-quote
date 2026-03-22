-- Initial schema for contractor quote platform
-- D1 (SQLite) migration

-- Contractors (one row per tenant)
CREATE TABLE contractors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  logo_url TEXT,
  calendar_url TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Quotes
CREATE TABLE quotes (
  id TEXT PRIMARY KEY,
  contractor_id TEXT NOT NULL REFERENCES contractors(id),
  schema_version INTEGER NOT NULL DEFAULT 1,
  -- Filterable contact fields
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  cell TEXT,
  job_site_address TEXT NOT NULL,
  property_type TEXT NOT NULL,
  budget_range TEXT NOT NULL,
  how_did_you_find_us TEXT,
  referred_by_contractor TEXT,
  -- Scope blob (all project scope fields as JSON)
  scope JSON,
  -- Quote flow
  quote_path TEXT, -- 'site_visit' | 'estimate_requested'
  photo_session_id TEXT,
  public_token TEXT UNIQUE, -- 256-bit crypto-random for magic link
  -- Admin fields
  status TEXT NOT NULL DEFAULT 'lead',
  contractor_notes TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Status history (append-only log)
CREATE TABLE quote_status_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quote_id TEXT NOT NULL REFERENCES quotes(id),
  status TEXT NOT NULL,
  timestamp TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Appointments
CREATE TABLE appointments (
  id TEXT PRIMARY KEY,
  quote_id TEXT NOT NULL REFERENCES quotes(id),
  contractor_id TEXT NOT NULL REFERENCES contractors(id),
  slot_date TEXT NOT NULL,
  slot_period TEXT NOT NULL, -- 'morning' | 'afternoon' | 'evening'
  status TEXT NOT NULL DEFAULT 'pending',
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes for common queries
CREATE INDEX idx_quotes_contractor ON quotes(contractor_id);
CREATE INDEX idx_quotes_status ON quotes(status);
CREATE INDEX idx_quotes_budget ON quotes(budget_range);
CREATE INDEX idx_quotes_token ON quotes(public_token);
CREATE INDEX idx_quotes_created ON quotes(created_at);
CREATE INDEX idx_status_history_quote ON quote_status_history(quote_id);
CREATE INDEX idx_appointments_contractor ON appointments(contractor_id);
CREATE INDEX idx_appointments_date ON appointments(slot_date);
CREATE INDEX idx_appointments_quote ON appointments(quote_id);

-- Seed: default contractor for dev
INSERT INTO contractors (id, name, logo_url) VALUES (
  'contractor-001',
  'Central Cabinets',
  NULL
);
