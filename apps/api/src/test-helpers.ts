import { env } from "cloudflare:test"
import { SCHEMA_STATEMENTS } from "./generated-schema"

// ---------------------------------------------------------------------------
// Database setup — reads schema from generated migration statements
// ---------------------------------------------------------------------------

export async function setupDb() {
  await env.DB.batch(SCHEMA_STATEMENTS.map((sql) => env.DB.prepare(sql)))
}

// ---------------------------------------------------------------------------
// Seed helpers (normalized schema: contractors → customers → quotes)
// ---------------------------------------------------------------------------

export async function seedContractor(
  overrides: Partial<{
    id: string
    slug: string
    name: string
    email: string | null
    phone: string | null
  }> = {}
) {
  const c = {
    id: "00000000-0000-4000-8000-000000000001",
    slug: "central-cabinets",
    name: "Central Cabinets",
    email: "admin@centralcabinets.test" as string | null,
    phone: null as string | null,
    ...overrides,
  }
  await env.DB.prepare(
    "INSERT OR REPLACE INTO contractors (id, slug, name, email, phone) VALUES (?, ?, ?, ?, ?)"
  )
    .bind(c.id, c.slug, c.name, c.email, c.phone)
    .run()
  return c
}

export async function seedContractorWithBilling(
  overrides: Partial<{
    id: string
    slug: string
    name: string
    email: string | null
    paddleCustomerId: string | null
    paddleSubscriptionId: string | null
    billingStatus: string
    gracePeriodEndsAt: string | null
  }> = {}
) {
  const c = {
    id: "00000000-0000-4000-8000-000000000002",
    slug: "billing-co",
    name: "Billing Co",
    email: "admin@billingco.test" as string | null,
    paddleCustomerId: "ctm_test123" as string | null,
    paddleSubscriptionId: "sub_test456" as string | null,
    billingStatus: "trialing",
    gracePeriodEndsAt: null as string | null,
    ...overrides,
  }
  await env.DB.prepare(
    `INSERT OR REPLACE INTO contractors
     (id, slug, name, email, paddle_customer_id, paddle_subscription_id, billing_status, grace_period_ends_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      c.id, c.slug, c.name, c.email,
      c.paddleCustomerId, c.paddleSubscriptionId, c.billingStatus, c.gracePeriodEndsAt
    )
    .run()
  return c
}

/** Compute a valid Paddle-Signature header value for testing */
export async function paddleSignatureHeader(
  rawBody: string,
  secret: string,
  ts?: string
): Promise<string> {
  const timestamp = ts ?? String(Math.floor(Date.now() / 1000))
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  )
  const sigBytes = await crypto.subtle.sign("HMAC", key, encoder.encode(`${timestamp}:${rawBody}`))
  const h1 = Array.from(new Uint8Array(sigBytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
  return `ts=${timestamp};h1=${h1}`
}

export async function seedCustomer(
  contractorId: string,
  overrides: Partial<{
    id: string
    name: string
    email: string
    phone: string
    cell: string | null
    howDidYouFindUs: string | null
    referredByContractor: string | null
  }> = {}
) {
  const cu = {
    id: crypto.randomUUID(),
    name: "Jane Doe",
    email: "jane@example.com",
    phone: "(555) 123-4567",
    cell: null as string | null,
    howDidYouFindUs: null as string | null,
    referredByContractor: null as string | null,
    ...overrides,
  }
  await env.DB.prepare(
    `INSERT INTO customers (id, contractor_id, name, email, phone, cell, how_did_you_find_us, referred_by_contractor)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      cu.id, contractorId, cu.name, cu.email, cu.phone,
      cu.cell, cu.howDidYouFindUs, cu.referredByContractor
    )
    .run()
  return { ...cu, contractorId }
}

export async function seedQuote(
  customerId: string,
  contractorId: string,
  overrides: Partial<{
    id: string
    jobSiteAddress: string
    propertyType: string
    budgetRange: string
    scope: string | null
    publicToken: string
    status: string
    submittedAt: string | null
    deletedAt: string | null
    createdAt: string | null
  }> = {}
) {
  const q = {
    id: crypto.randomUUID(),
    jobSiteAddress: "123 Main St",
    propertyType: "house",
    budgetRange: "10-25k",
    scope: null as string | null,
    publicToken: crypto.randomUUID(),
    status: "lead",
    submittedAt: null as string | null,
    deletedAt: null as string | null,
    createdAt: null as string | null,
    ...overrides,
  }

  const createdAt = q.createdAt ?? new Date().toISOString().replace("T", " ").slice(0, 19)

  await env.DB.prepare(
    `INSERT INTO quotes (
      id, customer_id, contractor_id, schema_version,
      job_site_address, property_type, budget_range,
      scope, public_token, status, submitted_at, deleted_at, created_at
    ) VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      q.id, customerId, contractorId,
      q.jobSiteAddress, q.propertyType, q.budgetRange,
      q.scope, q.publicToken, q.status,
      q.submittedAt, q.deletedAt, createdAt
    )
    .run()

  return { ...q, customerId, contractorId }
}

export async function seedPhoto(
  quoteId: string,
  contractorId: string,
  overrides: Partial<{
    id: string
    filename: string
    contentType: string
    size: number
    storageKey: string
  }> = {}
) {
  const p = {
    id: crypto.randomUUID(),
    filename: "test.jpg",
    contentType: "image/jpeg",
    size: 1024,
    storageKey: `${contractorId}/${quoteId}/${crypto.randomUUID()}.jpg`,
    ...overrides,
  }

  await env.DB.prepare(
    "INSERT INTO photos (id, quote_id, contractor_id, storage_key, filename, content_type, size) VALUES (?, ?, ?, ?, ?, ?, ?)"
  )
    .bind(p.id, quoteId, contractorId, p.storageKey, p.filename, p.contentType, p.size)
    .run()

  return { ...p, quoteId, contractorId }
}

export async function seedSuperUser(
  overrides: Partial<{ id: string; email: string; name: string }> = {}
) {
  const u = {
    id: "su-test-001",
    email: "superadmin@test.example",
    name: "Super Admin",
    ...overrides,
  }
  await env.DB.prepare(
    "INSERT OR REPLACE INTO super_users (id, email, name) VALUES (?, ?, ?)"
  )
    .bind(u.id, u.email, u.name)
    .run()
  return u
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

/** Create a fake JWT with an email claim (for /me/contractor tests) */
export function jwtEmailAuthHeaders(email: string): Record<string, string> {
  const header = btoa(JSON.stringify({ alg: "none", typ: "JWT" }))
  const payload = btoa(JSON.stringify({ email }))
  return { Authorization: `Bearer ${header}.${payload}.fake` }
}

export async function seedStaff(
  contractorId: string,
  overrides: Partial<{ id: string; email: string; name: string; role: string }> = {}
) {
  const s = {
    id: crypto.randomUUID(),
    email: "staff@example.test",
    name: "Staff Member",
    role: "estimator",
    ...overrides,
  }
  await env.DB.prepare(
    "INSERT OR REPLACE INTO staff (id, contractor_id, email, name, role, active) VALUES (?, ?, ?, ?, ?, 1)"
  )
    .bind(s.id, contractorId, s.email, s.name, s.role)
    .run()
  return { ...s, contractorId }
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
    PADDLE_WEBHOOK_SECRET: string
  }
}
