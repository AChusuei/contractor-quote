import { env } from "cloudflare:test"

// ---------------------------------------------------------------------------
// Combined schema — all migrations merged into a single DDL
// ---------------------------------------------------------------------------

const SCHEMA_STATEMENTS = [
  `CREATE TABLE contractors (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT, logo_url TEXT, calendar_url TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')))`,
  `CREATE TABLE quotes (id TEXT PRIMARY KEY, contractor_id TEXT NOT NULL REFERENCES contractors(id), schema_version INTEGER NOT NULL DEFAULT 1, name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT NOT NULL, cell TEXT, job_site_address TEXT NOT NULL, property_type TEXT NOT NULL, budget_range TEXT NOT NULL, how_did_you_find_us TEXT, referred_by_contractor TEXT, scope JSON, quote_path TEXT, photo_session_id TEXT, public_token TEXT UNIQUE, status TEXT NOT NULL DEFAULT 'lead', created_at TEXT NOT NULL DEFAULT (datetime('now')))`,
  `CREATE TABLE staff (id TEXT PRIMARY KEY, contractor_id TEXT NOT NULL REFERENCES contractors(id), clerk_user_id TEXT, name TEXT NOT NULL, email TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'admin', phone TEXT, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT (datetime('now')))`,
  `CREATE TABLE quote_activity (id INTEGER PRIMARY KEY AUTOINCREMENT, quote_id TEXT NOT NULL REFERENCES quotes(id), contractor_id TEXT NOT NULL REFERENCES contractors(id), staff_id TEXT REFERENCES staff(id), type TEXT NOT NULL, content TEXT, old_value TEXT, new_value TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')))`,
  `CREATE TABLE appointments (id TEXT PRIMARY KEY, quote_id TEXT NOT NULL REFERENCES quotes(id), contractor_id TEXT NOT NULL REFERENCES contractors(id), slot_date TEXT NOT NULL, slot_period TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', notes TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')))`,
  `CREATE TABLE photos (id TEXT PRIMARY KEY, quote_id TEXT NOT NULL REFERENCES quotes(id), contractor_id TEXT NOT NULL REFERENCES contractors(id), filename TEXT NOT NULL, content_type TEXT NOT NULL DEFAULT 'image/jpeg', size INTEGER NOT NULL, r2_key TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL DEFAULT (datetime('now')))`,
  `CREATE INDEX idx_quotes_contractor ON quotes(contractor_id)`,
  `CREATE INDEX idx_quotes_status ON quotes(status)`,
  `CREATE INDEX idx_quotes_budget ON quotes(budget_range)`,
  `CREATE INDEX idx_quotes_token ON quotes(public_token)`,
  `CREATE INDEX idx_quotes_created ON quotes(created_at)`,
  `CREATE INDEX idx_staff_contractor ON staff(contractor_id)`,
  `CREATE INDEX idx_activity_quote ON quote_activity(quote_id, created_at)`,
  `CREATE INDEX idx_activity_staff ON quote_activity(staff_id)`,
  `CREATE INDEX idx_appointments_contractor ON appointments(contractor_id)`,
  `CREATE INDEX idx_appointments_date ON appointments(slot_date)`,
  `CREATE INDEX idx_appointments_quote ON appointments(quote_id)`,
  `CREATE INDEX idx_photos_quote ON photos(quote_id, created_at)`,
  `CREATE INDEX idx_photos_contractor ON photos(contractor_id)`,
]

// ---------------------------------------------------------------------------
// Database setup
// ---------------------------------------------------------------------------

export async function setupDb() {
  await env.DB.batch(SCHEMA_STATEMENTS.map((sql) => env.DB.prepare(sql)))
}

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

export async function seedContractor(
  overrides: Partial<{ id: string; name: string; email: string | null }> = {}
) {
  const c = {
    id: "contractor-001",
    name: "Central Cabinets",
    email: "admin@centralcabinets.test" as string | null,
    ...overrides,
  }
  await env.DB.prepare(
    "INSERT INTO contractors (id, name, email) VALUES (?, ?, ?)"
  )
    .bind(c.id, c.name, c.email)
    .run()
  return c
}

export async function seedQuote(
  contractorId: string,
  overrides: Partial<{
    id: string
    name: string
    email: string
    phone: string
    cell: string | null
    jobSiteAddress: string
    propertyType: string
    budgetRange: string
    howDidYouFindUs: string | null
    referredByContractor: string | null
    scope: string | null
    quotePath: string | null
    photoSessionId: string | null
    publicToken: string
    status: string
  }> = {}
) {
  const q = {
    id: crypto.randomUUID(),
    name: "Jane Doe",
    email: "jane@example.com",
    phone: "(555) 123-4567",
    cell: null as string | null,
    jobSiteAddress: "123 Main St",
    propertyType: "house",
    budgetRange: "10-25k",
    howDidYouFindUs: null as string | null,
    referredByContractor: null as string | null,
    scope: null as string | null,
    quotePath: null as string | null,
    photoSessionId: null as string | null,
    publicToken: crypto.randomUUID(),
    status: "lead",
    ...overrides,
  }

  await env.DB.prepare(
    `INSERT INTO quotes (
      id, contractor_id, schema_version, name, email, phone, cell,
      job_site_address, property_type, budget_range,
      how_did_you_find_us, referred_by_contractor,
      scope, quote_path, photo_session_id, public_token, status
    ) VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      q.id, contractorId, q.name, q.email, q.phone, q.cell,
      q.jobSiteAddress, q.propertyType, q.budgetRange,
      q.howDidYouFindUs, q.referredByContractor,
      q.scope, q.quotePath, q.photoSessionId, q.publicToken, q.status
    )
    .run()

  return { ...q, contractorId }
}

export async function seedPhoto(
  quoteId: string,
  contractorId: string,
  overrides: Partial<{
    id: string
    filename: string
    contentType: string
    size: number
    r2Key: string
  }> = {}
) {
  const p = {
    id: crypto.randomUUID(),
    filename: "test.jpg",
    contentType: "image/jpeg",
    size: 1024,
    r2Key: `${contractorId}/${quoteId}/${crypto.randomUUID()}.jpg`,
    ...overrides,
  }

  await env.DB.prepare(
    "INSERT INTO photos (id, quote_id, contractor_id, filename, content_type, size, r2_key) VALUES (?, ?, ?, ?, ?, ?, ?)"
  )
    .bind(p.id, quoteId, contractorId, p.filename, p.contentType, p.size, p.r2Key)
    .run()

  return { ...p, quoteId, contractorId }
}

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

/** Dev-mode auth via x-contractor-id header */
export function authHeaders(contractorId: string): Record<string, string> {
  return { "x-contractor-id": contractorId }
}

/** Create a fake JWT for testing the JWT extraction path */
export function jwtAuthHeaders(contractorId: string): Record<string, string> {
  const header = btoa(JSON.stringify({ alg: "none", typ: "JWT" }))
  const payload = btoa(JSON.stringify({ contractorId }))
  return { Authorization: `Bearer ${header}.${payload}.fake` }
}

// ---------------------------------------------------------------------------
// URL helper
// ---------------------------------------------------------------------------

export function apiUrl(path: string): string {
  return `http://localhost/api/v1${path}`
}

// ---------------------------------------------------------------------------
// Type declarations for cloudflare:test
// ---------------------------------------------------------------------------

declare module "cloudflare:test" {
  interface ProvidedEnv {
    DB: D1Database
    STORAGE: R2Bucket
    KV: KVNamespace
    ENVIRONMENT: string
    CORS_ORIGINS: string
  }
}
