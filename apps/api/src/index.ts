import { Hono } from "hono"
import { cors } from "hono/cors"
import type { ApiOk } from "@contractor-quote/types"
import { apiError } from "./lib/errors"
import {
  requireAuth,
  requireContractorOwnership,
  requireQuoteOwnership,
  requireStaffRole,
} from "./middleware/tenantIsolation"
import { requireSuperAdmin } from "./middleware/superAdmin"
import {
  quoteSubmissionSchema,
  quoteUpdateSchema,
  draftUpdateSchema,
  activityCreateSchema,
  customerDeletionSchema,
  customerUpdateSchema,
  emailSendSchema,
  staffCreateSchema,
  staffUpdateSchema,
  assignOwnerSchema,
  contractorUpdateSchema,
  superUserCreateSchema,
  formatZodErrors,
  MAX_PAYLOAD_BYTES,
  QUOTE_STATUSES,
  STATUS_TRANSITIONS,
  type QuoteStatus,
} from "./validation"
import { rateLimit } from "./middleware/rateLimit"
import { billingEnabled } from "./middleware/billingEnabled"
import { sendNewQuoteNotification, sendPaymentFailedNotification } from "./lib/email"
import { verifyTurnstileToken } from "./lib/turnstile"
import { verifyClerkJwt } from "./lib/jwtVerify"
import { insertAuditEvent, extractEmailFromJwt } from "./lib/audit"

// ---------------------------------------------------------------------------
// Bindings — mirrors wrangler.toml
// ---------------------------------------------------------------------------
type Bindings = {
  DB: D1Database
  STORAGE: R2Bucket
  KV: KVNamespace
  ENVIRONMENT: string
  CORS_ORIGINS: string
  NOTIFICATION_FROM_EMAIL: string
  APP_BASE_URL: string
  // Secrets (set via `wrangler secret put`)
  PLATFORM_ADMIN_EMAILS: string
  TOKEN_SIGNING_SECRET: string
  SENDGRID_API_KEY: string
  TURNSTILE_SECRET_KEY: string
  CLERK_JWKS_URL: string
  PADDLE_API_KEY: string
  PADDLE_WEBHOOK_SECRET: string
  PADDLE_ENVIRONMENT: string
  BILLING_ENABLED: string
}

type Variables = {
  contractorId: string
  platformAdminEmail: string
  superAdminEmail: string
}

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>().basePath("/api/v1")

// SQLite datetime('now') returns "YYYY-MM-DD HH:MM:SS" in UTC — normalize before parsing.
function isTokenExpired(createdAt: string): boolean {
  const isoDate = createdAt.includes("T") ? createdAt : createdAt.replace(" ", "T") + "Z"
  return Date.now() - new Date(isoDate).getTime() > 30 * 24 * 60 * 60 * 1000
}

const TOKEN_EXPIRED_MSG = "This draft link has expired. Links are valid for 30 days."

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------
app.use("*", async (c, next) => {
  const originsRaw = c.env.CORS_ORIGINS ?? "http://localhost:5173"
  const origins = originsRaw.split(",").map((o) => o.trim())
  return cors({
    origin: origins,
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    maxAge: 86400,
  })(c, next)
})

// ---------------------------------------------------------------------------
// Global error handler — catches unhandled exceptions
// ---------------------------------------------------------------------------
app.onError((err, c) => {
  console.error("Unhandled error:", err)
  return apiError(c, "INTERNAL_ERROR", "An unexpected error occurred")
})

// ---------------------------------------------------------------------------
// 404 fallback
// ---------------------------------------------------------------------------
app.notFound((c) => {
  return apiError(c, "NOT_FOUND", `Route not found: ${c.req.method} ${c.req.path}`)
})

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------
app.get("/health", (c) => {
  const res: ApiOk<{ status: string; env: string }> = {
    ok: true,
    data: { status: "ok", env: c.env.ENVIRONMENT ?? "unknown" },
  }
  return c.json(res)
})

// ---------------------------------------------------------------------------
// Public appointment windows (unauthenticated)
// ---------------------------------------------------------------------------
app.get("/appointment-windows", (c) => {
  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

  const slots: Array<{ id: string; label: string; startAt: string; endAt: string }> = []
  const tomorrow = new Date()
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
  tomorrow.setUTCHours(0, 0, 0, 0)

  for (let i = 0; i < 14 && slots.length < 10; i++) {
    const date = new Date(tomorrow)
    date.setUTCDate(tomorrow.getUTCDate() + i)
    const dow = date.getUTCDay()
    if (dow === 0) continue

    const dayLabel = `${DAYS[dow]}, ${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}`
    const dateStr = date.toISOString().slice(0, 10)

    slots.push({
      id: `${dateStr}-morning`,
      label: `${dayLabel} · Morning (9am – 12pm)`,
      startAt: `${dateStr}T09:00:00`,
      endAt: `${dateStr}T12:00:00`,
    })

    if (slots.length < 10 && dow >= 1 && dow <= 5) {
      slots.push({
        id: `${dateStr}-afternoon`,
        label: `${dayLabel} · Afternoon (1pm – 5pm)`,
        startAt: `${dateStr}T13:00:00`,
        endAt: `${dateStr}T17:00:00`,
      })
    }
  }

  return c.json({ ok: true, data: slots })
})

// ---------------------------------------------------------------------------
// Public contractor lookup by slug (unauthenticated)
// ---------------------------------------------------------------------------
app.get("/contractors/by-slug/:slug", async (c) => {
  const slug = c.req.param("slug")
  const contractor = await c.env.DB.prepare(
    "SELECT id, slug, name, logo_url, calendar_url, phone FROM contractors WHERE slug = ?"
  )
    .bind(slug)
    .first<{ id: string; slug: string; name: string; logo_url: string | null; calendar_url: string | null; phone: string | null }>()

  if (!contractor) {
    return apiError(c, "NOT_FOUND", "Contractor not found")
  }

  return c.json({
    ok: true,
    data: {
      id: contractor.id,
      slug: contractor.slug,
      name: contractor.name,
      logoUrl: contractor.logo_url ? `/api/v1/contractors/${contractor.id}/logo` : null,
      calendarUrl: contractor.calendar_url,
      phone: contractor.phone,
    },
  })
})

// ---------------------------------------------------------------------------
// Public contractor lookup by ID (unauthenticated — localhost dev only)
// ---------------------------------------------------------------------------
app.get("/contractors/by-id/:id", async (c) => {
  const id = c.req.param("id")
  const contractor = await c.env.DB.prepare(
    "SELECT id, slug, name, logo_url, calendar_url, phone FROM contractors WHERE id = ?"
  )
    .bind(id)
    .first<{ id: string; slug: string; name: string; logo_url: string | null; calendar_url: string | null; phone: string | null }>()

  if (!contractor) {
    return apiError(c, "NOT_FOUND", "Contractor not found")
  }

  return c.json({
    ok: true,
    data: {
      id: contractor.id,
      slug: contractor.slug,
      name: contractor.name,
      logoUrl: contractor.logo_url ? `/api/v1/contractors/${contractor.id}/logo` : null,
      calendarUrl: contractor.calendar_url,
      phone: contractor.phone,
    },
  })
})

// ---------------------------------------------------------------------------
// Get contractor profile (authenticated)
// ---------------------------------------------------------------------------
app.get("/contractors/:contractorId", requireAuth(), requireContractorOwnership(), async (c) => {
  const contractorId = c.req.param("contractorId")
  const contractor = await c.env.DB.prepare(
    "SELECT id, slug, name, email, phone, address, website_url, license_number, logo_url, calendar_url, account_disabled FROM contractors WHERE id = ?"
  )
    .bind(contractorId)
    .first()

  if (!contractor) {
    return apiError(c, "NOT_FOUND", "Contractor not found")
  }

  return c.json({
    ok: true,
    data: {
      id: contractor.id,
      slug: contractor.slug,
      name: contractor.name,
      email: contractor.email,
      phone: contractor.phone,
      address: contractor.address,
      websiteUrl: contractor.website_url,
      licenseNumber: contractor.license_number,
      logoUrl: contractor.logo_url ? `/api/v1/contractors/${contractorId}/logo` : null,
      calendarUrl: contractor.calendar_url,
      accountDisabled: contractor.account_disabled === 1,
    },
  })
})

// ---------------------------------------------------------------------------
// Update contractor profile (authenticated)
// ---------------------------------------------------------------------------
app.patch("/contractors/:contractorId", requireAuth(), requireContractorOwnership(), rateLimit({ limit: 100, windowSeconds: 3600, keyPrefix: "contractor-update" }), async (c) => {
  const contractorId = c.req.param("contractorId")

  let body: Record<string, unknown>
  try {
    body = await c.req.json()
  } catch {
    return apiError(c, "VALIDATION_ERROR", "Invalid JSON")
  }

  const allowedFields: Record<string, string> = {
    name: "name",
    email: "email",
    phone: "phone",
    address: "address",
    websiteUrl: "website_url",
    licenseNumber: "license_number",
    calendarUrl: "calendar_url",
  }

  const setClauses: string[] = []
  const binds: unknown[] = []

  for (const [jsonKey, column] of Object.entries(allowedFields)) {
    if (jsonKey in body && body[jsonKey] !== undefined) {
      setClauses.push(`${column} = ?`)
      binds.push(body[jsonKey] ?? null)
    }
  }

  if (setClauses.length === 0) {
    return apiError(c, "VALIDATION_ERROR", "No fields to update")
  }

  setClauses.push("updated_at = datetime('now')")
  binds.push(contractorId)

  await c.env.DB.prepare(
    `UPDATE contractors SET ${setClauses.join(", ")} WHERE id = ?`
  )
    .bind(...binds)
    .run()

  const actorEmail = extractEmailFromJwt(c.req.header("authorization")) ?? "unknown"
  await insertAuditEvent(c.env.DB, {
    actorEmail,
    actorType: "staff",
    entityType: "contractor",
    entityId: contractorId,
    action: "update",
    details: { fields: Object.keys(body).filter((k) => k in allowedFields) },
  }).catch(() => {})

  return c.json({ ok: true, data: { updated: true } })
})

// ---------------------------------------------------------------------------
// Quote submission
// ---------------------------------------------------------------------------
app.post("/quotes", rateLimit({ limit: 5, windowSeconds: 3600, keyPrefix: "quote-submit" }), async (c) => {
  // --- Payload size gate (100KB) ---
  const contentLength = c.req.header("content-length")
  if (contentLength && parseInt(contentLength, 10) > MAX_PAYLOAD_BYTES) {
    return c.json(
      { ok: false, error: "Request payload must be under 100KB", code: "VALIDATION_ERROR" as const },
      413
    )
  }

  // Read body and enforce size limit even without Content-Length header
  const rawBody = await c.req.text()
  if (rawBody.length > MAX_PAYLOAD_BYTES) {
    return c.json(
      { ok: false, error: "Request payload must be under 100KB", code: "VALIDATION_ERROR" as const },
      413
    )
  }

  // --- Parse JSON ---
  let body: unknown
  try {
    body = JSON.parse(rawBody)
  } catch {
    return apiError(c, "VALIDATION_ERROR", "Invalid JSON in request body")
  }

  // --- Validate with Zod schema ---
  const result = quoteSubmissionSchema.safeParse(body)
  if (!result.success) {
    return c.json(
      { ok: false, error: "Validation failed", code: "VALIDATION_ERROR" as const, fields: formatZodErrors(result.error) },
      422
    )
  }

  const data = result.data

  // --- Verify Turnstile token (mandatory in production, skipped in development) ---
  const isDev = c.env.ENVIRONMENT === "development"
  if (!isDev) {
    if (!c.env.TURNSTILE_SECRET_KEY) {
      console.error("TURNSTILE_SECRET_KEY is not configured — rejecting quote submission")
      return c.json(
        { ok: false, error: "Server configuration error", code: "VALIDATION_ERROR" as const, fields: { turnstileToken: "Security verification is unavailable" } },
        500
      )
    }
    if (!data.turnstileToken) {
      return c.json(
        { ok: false, error: "Validation failed", code: "VALIDATION_ERROR" as const, fields: { turnstileToken: "Security verification is required" } },
        422
      )
    }
    const clientIp = c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for")
    const verification = await verifyTurnstileToken(data.turnstileToken, c.env.TURNSTILE_SECRET_KEY, clientIp ?? undefined)
    if (!verification.success) {
      return c.json(
        { ok: false, error: "Security verification failed. Please try again.", code: "VALIDATION_ERROR" as const, fields: { turnstileToken: "Security verification failed" } },
        422
      )
    }
  }

  // --- Verify contractorId exists in D1 ---
  const contractor = await c.env.DB.prepare(
    "SELECT id, name FROM contractors WHERE id = ?"
  )
    .bind(data.contractorId)
    .first<{ id: string; name: string }>()

  if (!contractor) {
    return c.json(
      { ok: false, error: "Validation failed", code: "VALIDATION_ERROR" as const, fields: { contractorId: "Contractor not found" } },
      422
    )
  }

  // --- Generate quote ID and public token ---
  const quoteId = crypto.randomUUID()
  const tokenBytes = new Uint8Array(32)
  crypto.getRandomValues(tokenBytes)
  const publicToken = Array.from(tokenBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")

  // --- Upsert customer ---
  const quoteStatus = data.status ?? "draft"
  const customerId = crypto.randomUUID()

  // Find existing customer by email + contractor, or create new
  const existingCustomer = await c.env.DB.prepare(
    "SELECT id FROM customers WHERE contractor_id = ? AND email = ?"
  )
    .bind(data.contractorId, data.email)
    .first<{ id: string }>()

  const actualCustomerId = existingCustomer?.id ?? customerId

  if (!existingCustomer) {
    await c.env.DB.prepare(
      `INSERT INTO customers (id, contractor_id, name, email, phone, cell, how_did_you_find_us, referred_by_contractor)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        customerId,
        data.contractorId,
        data.name,
        data.email,
        data.phone,
        data.cell ?? null,
        data.howDidYouFindUs ?? null,
        data.referredByContractor ?? null
      )
      .run()
  } else {
    // Update existing customer with latest info
    await c.env.DB.prepare(
      `UPDATE customers SET name = ?, phone = ?, cell = ?, how_did_you_find_us = ?, referred_by_contractor = ?
       WHERE id = ?`
    )
      .bind(
        data.name,
        data.phone,
        data.cell ?? null,
        data.howDidYouFindUs ?? null,
        data.referredByContractor ?? null,
        existingCustomer.id
      )
      .run()
  }

  // --- Insert quote ---
  await c.env.DB.prepare(
    `INSERT INTO quotes (
      id, customer_id, contractor_id, schema_version,
      job_site_address, property_type, budget_range,
      scope, public_token, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      quoteId,
      actualCustomerId,
      data.contractorId,
      data.schemaVersion,
      data.jobSiteAddress ?? "",
      data.propertyType ?? "",
      data.budgetRange ?? "",
      data.scope ? JSON.stringify(data.scope) : null,
      publicToken,
      quoteStatus
    )
    .run()

  // --- Log activity ---
  await c.env.DB.prepare(
    `INSERT INTO quote_activity (quote_id, contractor_id, type, new_value)
     VALUES (?, ?, 'status_change', ?)`
  )
    .bind(quoteId, data.contractorId, quoteStatus)
    .run()

  // --- Send email notification to contractor (only for non-draft submissions) ---
  // TODO: contractor email not yet on contractors table — will be added via cq-bfx (contractor profile settings)
  // if (contractorEmail && quoteStatus !== "draft") { ... }

  const res: ApiOk<{ id: string; publicToken: string }> = {
    ok: true,
    data: { id: quoteId, publicToken },
  }
  return c.json(res, 201)
})

// ---------------------------------------------------------------------------
// Public draft read (authenticated via publicToken, no Clerk auth needed)
// ---------------------------------------------------------------------------
app.get(
  "/quotes/:quoteId/draft",
  rateLimit({ limit: 60, windowSeconds: 3600, keyPrefix: "draft-read" }),
  async (c) => {
    const quoteId = c.req.param("quoteId")
    const publicToken = c.req.query("publicToken")

    if (!publicToken) {
      return apiError(c, "VALIDATION_ERROR", "publicToken query parameter is required")
    }

    const quote = await c.env.DB.prepare(
      `SELECT q.*, c.name, c.email, c.phone, c.cell, c.how_did_you_find_us, c.referred_by_contractor
       FROM quotes q
       JOIN customers c ON q.customer_id = c.id
       WHERE q.id = ? AND q.public_token = ?`
    )
      .bind(quoteId, publicToken)
      .first()

    if (!quote) {
      return apiError(c, "NOT_FOUND", "Quote not found")
    }

    if (isTokenExpired(quote.created_at as string)) {
      return apiError(c, "GONE", TOKEN_EXPIRED_MSG)
    }

    return c.json({
      ok: true,
      data: {
        id: quote.id,
        name: quote.name,
        email: quote.email,
        phone: quote.phone,
        cell: quote.cell,
        jobSiteAddress: quote.job_site_address,
        propertyType: quote.property_type,
        budgetRange: quote.budget_range,
        howDidYouFindUs: quote.how_did_you_find_us,
        referredByContractor: quote.referred_by_contractor,
        scope: quote.scope ? JSON.parse(quote.scope as string) : null,
        status: quote.status,
      },
    })
  }
)

// ---------------------------------------------------------------------------
// Public draft update (authenticated via publicToken, no Clerk auth needed)
// ---------------------------------------------------------------------------
app.patch(
  "/quotes/:quoteId/draft",
  rateLimit({ limit: 20, windowSeconds: 3600, keyPrefix: "draft-update" }),
  async (c) => {
    const quoteId = c.req.param("quoteId") as string

    // --- Payload size gate ---
    const rawBody = await c.req.text()
    if (rawBody.length > MAX_PAYLOAD_BYTES) {
      return c.json(
        { ok: false, error: "Request payload must be under 100KB", code: "VALIDATION_ERROR" as const },
        413
      )
    }

    let body: unknown
    try {
      body = JSON.parse(rawBody)
    } catch {
      return apiError(c, "VALIDATION_ERROR", "Invalid JSON in request body")
    }

    const result = draftUpdateSchema.safeParse(body)
    if (!result.success) {
      return c.json(
        { ok: false, error: "Validation failed", code: "VALIDATION_ERROR" as const, fields: formatZodErrors(result.error) },
        422
      )
    }

    const data = result.data

    // --- Verify quote exists and is a draft, and publicToken matches ---
    const quote = await c.env.DB.prepare(
      "SELECT id, contractor_id, customer_id, status, public_token, created_at FROM quotes WHERE id = ?"
    )
      .bind(quoteId)
      .first<{ id: string; contractor_id: string; customer_id: string; status: string; public_token: string; created_at: string }>()

    if (!quote) {
      return apiError(c, "NOT_FOUND", "Quote not found")
    }

    if (quote.public_token !== data.publicToken) {
      return apiError(c, "FORBIDDEN", "Invalid token")
    }

    if (isTokenExpired(quote.created_at)) {
      return apiError(c, "GONE", TOKEN_EXPIRED_MSG)
    }

    if (quote.status !== "draft") {
      return apiError(c, "VALIDATION_ERROR", "Only draft quotes can be updated via this endpoint")
    }

    // --- Build dynamic UPDATEs (quotes table + customers table) ---
    const quoteFields: Record<string, { column: string; value: unknown }> = {
      scope: { column: "scope", value: data.scope !== undefined ? JSON.stringify(data.scope) : undefined },
      status: { column: "status", value: data.status },
      jobSiteAddress: { column: "job_site_address", value: data.jobSiteAddress },
      propertyType: { column: "property_type", value: data.propertyType },
      budgetRange: { column: "budget_range", value: data.budgetRange },
    }

    const customerFields: Record<string, { column: string; value: unknown }> = {
      name: { column: "name", value: data.name },
      email: { column: "email", value: data.email },
      phone: { column: "phone", value: data.phone },
      cell: { column: "cell", value: data.cell },
      howDidYouFindUs: { column: "how_did_you_find_us", value: data.howDidYouFindUs },
      referredByContractor: { column: "referred_by_contractor", value: data.referredByContractor },
    }

    // Helper: collect SET clauses, converting undefined → null for D1
    function collectUpdates(
      fieldMap: Record<string, { column: string; value: unknown }>,
      sourceData: Record<string, unknown>
    ): { clauses: string[]; binds: unknown[] } {
      const clauses: string[] = []
      const binds: unknown[] = []
      for (const [key, mapping] of Object.entries(fieldMap)) {
        if (key in sourceData && sourceData[key] !== undefined) {
          // D1 rejects undefined — always coerce to null
          const val = mapping.value === undefined ? null : mapping.value
          clauses.push(`${mapping.column} = ?`)
          binds.push(val === undefined ? null : val)
        }
      }
      return { clauses, binds }
    }

    // Update quotes table
    const quoteUp = collectUpdates(quoteFields, data as Record<string, unknown>)
    // Set submitted_at when transitioning to 'lead'
    if (data.status === "lead") {
      quoteUp.clauses.push("submitted_at = datetime('now')")
    }
    if (quoteUp.clauses.length > 0) {
      quoteUp.clauses.push("updated_at = datetime('now')")
      quoteUp.binds.push(quoteId)
      await c.env.DB.prepare(
        `UPDATE quotes SET ${quoteUp.clauses.join(", ")} WHERE id = ?`
      )
        .bind(...quoteUp.binds)
        .run()
    }

    // Update customers table
    const custUp = collectUpdates(customerFields, data as Record<string, unknown>)
    if (custUp.clauses.length > 0) {
      custUp.clauses.push("updated_at = datetime('now')")
      custUp.binds.push(quote.customer_id)
      await c.env.DB.prepare(
        `UPDATE customers SET ${custUp.clauses.join(", ")} WHERE id = ?`
      )
        .bind(...custUp.binds)
        .run()
    }

    if (quoteUp.clauses.length === 0 && custUp.clauses.length === 0) {
      return apiError(c, "VALIDATION_ERROR", "No fields to update")
    }

    // --- If status changed to 'lead', send notification and log ---
    if (data.status === "lead") {
      await c.env.DB.prepare(
        `INSERT INTO quote_activity (quote_id, contractor_id, type, old_value, new_value)
         VALUES (?, ?, 'status_change', 'draft', 'lead')`
      )
        .bind(quoteId, quote.contractor_id)
        .run()

      // Fetch contractor for notification email
      const contractor = await c.env.DB.prepare(
        "SELECT name, email FROM contractors WHERE id = ?"
      )
        .bind(quote.contractor_id)
        .first<{ name: string; email: string | null }>()

      if (contractor?.email) {
        // Fetch updated quote + customer for notification details
        const updatedQuote = await c.env.DB.prepare(
          `SELECT c.name, q.job_site_address, q.budget_range
           FROM quotes q JOIN customers c ON q.customer_id = c.id
           WHERE q.id = ?`
        )
          .bind(quoteId)
          .first<{ name: string; job_site_address: string; budget_range: string }>()

        if (updatedQuote) {
          c.executionCtx.waitUntil(
            sendNewQuoteNotification(
              {
                contractorEmail: contractor.email,
                contractorName: contractor.name,
                customerName: updatedQuote.name,
                jobSiteAddress: updatedQuote.job_site_address,
                budgetRange: updatedQuote.budget_range,
                quoteId,
              },
              c.env.SENDGRID_API_KEY,
              c.env.NOTIFICATION_FROM_EMAIL,
              c.env.APP_BASE_URL
            ).catch((err) => {
              console.error("Failed to send quote notification email:", err)
            })
          )
        }
      }
    }

    return c.json({ ok: true, data: { id: quoteId } })
  }
)

// ---------------------------------------------------------------------------
// Get draft quote (public — authenticated via publicToken query param)
// ---------------------------------------------------------------------------
app.get(
  "/quotes/:quoteId/draft",
  async (c) => {
    const quoteId = c.req.param("quoteId")
    const publicToken = c.req.query("publicToken")

    if (!publicToken) {
      return apiError(c, "VALIDATION_ERROR", "Public token is required")
    }

    const row = await c.env.DB.prepare(
      `SELECT id, name, email, phone, cell,
              job_site_address, property_type, budget_range,
              how_did_you_find_us, referred_by_contractor,
              scope, status, public_token
       FROM quotes WHERE id = ? AND status = 'draft'`
    )
      .bind(quoteId)
      .first()

    if (!row) {
      return apiError(c, "NOT_FOUND", "Draft quote not found")
    }

    if (row.public_token !== publicToken) {
      return apiError(c, "FORBIDDEN", "Invalid token")
    }

    let scope: unknown = null
    if (row.scope) {
      try { scope = JSON.parse(row.scope as string) } catch { scope = null }
    }

    const quote = {
      id: row.id,
      name: row.name,
      email: row.email,
      phone: row.phone,
      cell: row.cell ?? null,
      jobSiteAddress: row.job_site_address,
      propertyType: row.property_type,
      budgetRange: row.budget_range,
      howDidYouFindUs: row.how_did_you_find_us ?? null,
      referredByContractor: row.referred_by_contractor ?? null,
      scope,
      status: row.status,
    }

    return c.json({ ok: true, data: quote })
  }
)

// ---------------------------------------------------------------------------
// Get single quote
// ---------------------------------------------------------------------------
app.get(
  "/quotes/:quoteId",
  requireAuth(),
  requireQuoteOwnership(),
  async (c) => {
    const quoteId = c.req.param("quoteId")

    const row = await c.env.DB.prepare(
      `SELECT q.id, q.contractor_id, q.customer_id, q.schema_version,
              c.name, c.email, c.phone, c.cell,
              q.job_site_address, q.property_type, q.budget_range,
              c.how_did_you_find_us, c.referred_by_contractor,
              q.scope, q.public_token,
              q.status, q.created_at, q.contractor_notes
       FROM quotes q
       JOIN customers c ON q.customer_id = c.id
       WHERE q.id = ?`
    )
      .bind(quoteId)
      .first()

    if (!row) {
      return apiError(c, "NOT_FOUND", "Quote not found")
    }

    // Parse scope JSON if present
    let scope: unknown = null
    if (row.scope) {
      try {
        scope = JSON.parse(row.scope as string)
      } catch {
        scope = null
      }
    }

    const quote = {
      id: row.id,
      contractorId: row.contractor_id,
      customerId: row.customer_id,
      schemaVersion: row.schema_version,
      name: row.name,
      email: row.email,
      phone: row.phone,
      cell: row.cell ?? null,
      jobSiteAddress: row.job_site_address,
      propertyType: row.property_type,
      budgetRange: row.budget_range,
      howDidYouFindUs: row.how_did_you_find_us ?? null,
      referredByContractor: row.referred_by_contractor ?? null,
      scope,
      publicToken: row.public_token,
      status: row.status,
      createdAt: row.created_at,
      contractorNotes: row.contractor_notes ?? null,
    }

    const res: ApiOk<typeof quote> = { ok: true, data: quote }
    return c.json(res)
  }
)

// ---------------------------------------------------------------------------
// Quote update (partial edit)
// ---------------------------------------------------------------------------
app.patch(
  "/quotes/:quoteId",
  requireAuth(),
  requireQuoteOwnership(),
  rateLimit({ limit: 100, windowSeconds: 3600, keyPrefix: "quote-update" }),
  async (c) => {
    const quoteId = c.req.param("quoteId")
    const contractorId = c.get("contractorId") as string
    const actorEmail = c.get("actorEmail") as string | null ?? null
    const staffId = c.get("staffId") as string | null ?? null

    // --- Payload size gate (100KB) ---
    const contentLength = c.req.header("content-length")
    if (contentLength && parseInt(contentLength, 10) > MAX_PAYLOAD_BYTES) {
      return c.json(
        { ok: false, error: "Request payload must be under 100KB", code: "VALIDATION_ERROR" as const },
        413
      )
    }

    const rawBody = await c.req.text()
    if (rawBody.length > MAX_PAYLOAD_BYTES) {
      return c.json(
        { ok: false, error: "Request payload must be under 100KB", code: "VALIDATION_ERROR" as const },
        413
      )
    }

    // --- Parse JSON ---
    let body: unknown
    try {
      body = JSON.parse(rawBody)
    } catch {
      return apiError(c, "VALIDATION_ERROR", "Invalid JSON in request body")
    }

    // --- Validate with Zod schema ---
    const result = quoteUpdateSchema.safeParse(body)
    if (!result.success) {
      return c.json(
        { ok: false, error: "Validation failed", code: "VALIDATION_ERROR" as const, fields: formatZodErrors(result.error) },
        422
      )
    }

    const data = result.data

    // --- Build dynamic UPDATE queries (split: customer fields vs quote fields) ---
    const customerFieldMap: Record<string, { column: string; value: unknown }> = {
      name: { column: "name", value: data.name },
      email: { column: "email", value: data.email },
      phone: { column: "phone", value: data.phone },
      cell: { column: "cell", value: data.cell },
      howDidYouFindUs: { column: "how_did_you_find_us", value: data.howDidYouFindUs },
      referredByContractor: { column: "referred_by_contractor", value: data.referredByContractor },
    }

    const quoteFieldMap: Record<string, { column: string; value: unknown }> = {
      jobSiteAddress: { column: "job_site_address", value: data.jobSiteAddress },
      propertyType: { column: "property_type", value: data.propertyType },
      budgetRange: { column: "budget_range", value: data.budgetRange },
      scope: { column: "scope", value: data.scope !== undefined ? JSON.stringify(data.scope) : undefined },
      contractorNotes: { column: "contractor_notes", value: data.contractorNotes },
    }

    // --- Log activity: fetch old values BEFORE updating ---
    type ChangeRecord = { field: string; from: unknown; to: unknown }

    const oldRow = await c.env.DB.prepare(
      `SELECT q.job_site_address, q.property_type, q.budget_range, q.scope,
              c.name, c.email, c.phone, c.cell,
              c.how_did_you_find_us, c.referred_by_contractor
       FROM quotes q JOIN customers c ON q.customer_id = c.id WHERE q.id = ?`
    ).bind(quoteId).first<Record<string, unknown>>()

    const oldValues: Record<string, unknown> = oldRow ? {
      jobSiteAddress: oldRow.job_site_address,
      propertyType: oldRow.property_type,
      budgetRange: oldRow.budget_range,
      scope: typeof oldRow.scope === "string" ? JSON.parse(oldRow.scope) : (oldRow.scope ?? {}),
      name: oldRow.name,
      email: oldRow.email,
      phone: oldRow.phone,
      cell: oldRow.cell,
      howDidYouFindUs: oldRow.how_did_you_find_us,
      referredByContractor: oldRow.referred_by_contractor,
    } : {}

    // Update customer fields if any
    const customerClauses: string[] = []
    const customerBinds: unknown[] = []
    for (const [key, mapping] of Object.entries(customerFieldMap)) {
      if (key in data) {
        customerClauses.push(`${mapping.column} = ?`)
        customerBinds.push(mapping.value ?? null)
      }
    }

    if (customerClauses.length > 0) {
      await c.env.DB.prepare(
        `UPDATE customers SET ${customerClauses.join(", ")}
         WHERE id = (SELECT customer_id FROM quotes WHERE id = ?)`
      )
        .bind(...customerBinds, quoteId)
        .run()
    }

    // Update quote fields if any
    const quoteClauses: string[] = []
    const quoteBinds: unknown[] = []
    for (const [key, mapping] of Object.entries(quoteFieldMap)) {
      if (key in data) {
        quoteClauses.push(`${mapping.column} = ?`)
        quoteBinds.push(mapping.value ?? null)
      }
    }

    if (quoteClauses.length > 0) {
      quoteBinds.push(quoteId)
      await c.env.DB.prepare(
        `UPDATE quotes SET ${quoteClauses.join(", ")} WHERE id = ?`
      )
        .bind(...quoteBinds)
        .run()
    }

    const newChanges: ChangeRecord[] = []
    for (const key of Object.keys(data)) {
      if (key === "scope" && data.scope !== undefined) {
        const oldScope = (oldValues.scope as Record<string, unknown>) ?? {}
        for (const [subKey, newVal] of Object.entries(data.scope)) {
          const oldVal = oldScope[subKey] ?? null
          if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
            newChanges.push({ field: `scope.${subKey}`, from: oldVal, to: newVal })
          }
        }
      } else {
        const newVal = data[key as keyof typeof data]
        const oldVal = oldValues[key] ?? null
        if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
          newChanges.push({ field: key, from: oldVal, to: newVal })
        }
      }
    }

    if (newChanges.length > 0) {
      const recent = await c.env.DB.prepare(
        `SELECT id, content FROM quote_activity
         WHERE quote_id = ? AND type = 'quote_edited' AND staff_id IS ?
           AND datetime(created_at) >= datetime('now', '-5 minutes')
         ORDER BY id DESC LIMIT 1`
      ).bind(quoteId, staffId ?? null).first<{ id: number; content: string | null }>()

      if (recent) {
        // Merge: keep oldest `from` per field, use newest `to`
        const existing: ChangeRecord[] = JSON.parse(recent.content ?? "[]")
        const byField = new Map<string, ChangeRecord>(existing.map((c) => [c.field, c]))
        for (const change of newChanges) {
          const prev = byField.get(change.field)
          byField.set(change.field, { field: change.field, from: prev ? prev.from : change.from, to: change.to })
        }
        await c.env.DB.prepare(
          `UPDATE quote_activity SET content = ? WHERE id = ?`
        ).bind(JSON.stringify(Array.from(byField.values())), recent.id).run()
      } else {
        await c.env.DB.prepare(
          `INSERT INTO quote_activity (quote_id, contractor_id, staff_id, actor_email, type, content)
           VALUES (?, ?, ?, ?, 'quote_edited', ?)`
        ).bind(quoteId, contractorId, staffId, actorEmail, JSON.stringify(newChanges)).run()
      }
    }

    // --- Fetch and return updated quote ---
    const updated = await c.env.DB.prepare(
      `SELECT q.id, q.contractor_id, q.schema_version,
              c.name, c.email, c.phone, c.cell,
              q.job_site_address, q.property_type, q.budget_range,
              c.how_did_you_find_us, c.referred_by_contractor,
              q.scope, q.public_token, q.status, q.created_at,
              q.contractor_notes
       FROM quotes q
       JOIN customers c ON q.customer_id = c.id
       WHERE q.id = ?`
    )
      .bind(quoteId)
      .first()

    if (!updated) {
      return apiError(c, "NOT_FOUND", "Quote not found")
    }

    return c.json({
      ok: true,
      data: {
        id: updated.id,
        contractorId: updated.contractor_id,
        name: updated.name,
        email: updated.email,
        phone: updated.phone,
        cell: updated.cell ?? null,
        jobSiteAddress: updated.job_site_address,
        propertyType: updated.property_type,
        budgetRange: updated.budget_range,
        howDidYouFindUs: updated.how_did_you_find_us ?? null,
        referredByContractor: updated.referred_by_contractor ?? null,
        scope: updated.scope ? JSON.parse(updated.scope as string) : null,
        publicToken: updated.public_token,
        status: updated.status,
        createdAt: updated.created_at,
        contractorNotes: updated.contractor_notes ?? null,
      },
    })
  }
)

// ---------------------------------------------------------------------------
// Photo upload (publicToken auth for intake flow)
// ---------------------------------------------------------------------------
const MAX_PHOTO_BYTES = 20 * 1024 * 1024 // 20MB
const ALLOWED_PHOTO_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/heic": "heic",
}

app.post(
  "/quotes/:quoteId/photos",
  rateLimit({ limit: 20, windowSeconds: 3600, keyPrefix: "photo-upload" }),
  async (c) => {
    const quoteId = c.req.param("quoteId")

    // --- Auth: publicToken (intake) or Clerk (admin) ---
    const publicToken = c.req.query("publicToken")
    let quote: { id: string; contractor_id: string; public_token: string; created_at: string } | null

    let photoActorEmail: string | null = null
    let photoStaffId: string | null = null

    if (publicToken) {
      quote = await c.env.DB.prepare(
        "SELECT id, contractor_id, public_token, created_at FROM quotes WHERE id = ? AND public_token = ?"
      )
        .bind(quoteId, publicToken)
        .first()
      if (!quote) {
        return apiError(c, "NOT_FOUND", "Quote not found")
      }
      if (isTokenExpired(quote.created_at)) {
        return apiError(c, "GONE", TOKEN_EXPIRED_MSG)
      }
    } else {
      // Fall back to Clerk auth + ownership check
      const authMw = requireAuth()
      const ownerMw = requireQuoteOwnership()
      const authResult = await authMw(c, async () => {})
      if (authResult) return authResult
      const ownerResult = await ownerMw(c, async () => {})
      if (ownerResult) return ownerResult

      photoActorEmail = c.get("actorEmail") as string | null ?? null
      photoStaffId = c.get("staffId") as string | null ?? null

      quote = await c.env.DB.prepare(
        "SELECT id, contractor_id, public_token FROM quotes WHERE id = ?"
      )
        .bind(quoteId)
        .first()
      if (!quote) {
        return apiError(c, "NOT_FOUND", "Quote not found")
      }
    }

    // --- Parse multipart form data ---
    let formData: FormData
    try {
      formData = await c.req.formData()
    } catch {
      return apiError(c, "VALIDATION_ERROR", "Request must be multipart form data")
    }

    const file = formData.get("file")
    if (!file || !(file instanceof File)) {
      return c.json(
        { ok: false, error: "Validation failed", code: "VALIDATION_ERROR" as const, fields: { file: "A photo file is required" } },
        422
      )
    }

    // --- Validate content type ---
    const ext = ALLOWED_PHOTO_TYPES[file.type]
    if (!ext) {
      return c.json(
        { ok: false, error: "Validation failed", code: "VALIDATION_ERROR" as const, fields: { file: "Photo must be a JPEG, PNG, or HEIC image" } },
        422
      )
    }

    // --- Validate file size ---
    if (file.size > MAX_PHOTO_BYTES) {
      return c.json(
        { ok: false, error: "Validation failed", code: "VALIDATION_ERROR" as const, fields: { file: "Photo must be under 20MB" } },
        422
      )
    }

    // --- Check photo count limit (max 10 per quote) ---
    const countRow = await c.env.DB.prepare(
      "SELECT COUNT(*) as cnt FROM photos WHERE quote_id = ?"
    )
      .bind(quoteId)
      .first<{ cnt: number }>()
    if (countRow && countRow.cnt >= 10) {
      return c.json(
        { ok: false, error: "Maximum of 10 photos per quote reached", code: "VALIDATION_ERROR" as const },
        422
      )
    }

    // --- Upload to R2 ---
    const photoId = crypto.randomUUID()
    const r2Key = `${quote.contractor_id}/${quoteId}/${photoId}.${ext}`
    const fileBuffer = await file.arrayBuffer()
    await c.env.STORAGE.put(r2Key, fileBuffer, {
      httpMetadata: { contentType: file.type },
    })

    // --- Insert into D1 ---
    await c.env.DB.prepare(
      `INSERT INTO photos (id, quote_id, contractor_id, filename, content_type, size, storage_key)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(photoId, quoteId, quote.contractor_id, file.name, file.type, file.size, r2Key)
      .run()

    // --- Log activity ---
    await c.env.DB.prepare(
      `INSERT INTO quote_activity (quote_id, contractor_id, staff_id, actor_email, type, content)
       VALUES (?, ?, ?, ?, 'photo_added', ?)`
    )
      .bind(quoteId, quote.contractor_id, photoStaffId, photoActorEmail, photoId)
      .run()

    return c.json({
      ok: true,
      data: {
        id: photoId,
        filename: file.name,
        contentType: file.type,
        size: file.size,
      },
    }, 201)
  }
)

// ---------------------------------------------------------------------------
// List photos for a quote (publicToken or Clerk auth)
// ---------------------------------------------------------------------------
app.get(
  "/quotes/:quoteId/photos",
  rateLimit({ limit: 60, windowSeconds: 3600, keyPrefix: "photo-list" }),
  async (c) => {
    const quoteId = c.req.param("quoteId")

    // --- Auth: publicToken (intake) or Clerk (admin) ---
    const publicToken = c.req.query("publicToken")

    if (publicToken) {
      const quote = await c.env.DB.prepare(
        "SELECT id, created_at FROM quotes WHERE id = ? AND public_token = ?"
      )
        .bind(quoteId, publicToken)
        .first<{ id: string; created_at: string }>()
      if (!quote) {
        return apiError(c, "NOT_FOUND", "Quote not found")
      }
      if (isTokenExpired(quote.created_at)) {
        return apiError(c, "GONE", TOKEN_EXPIRED_MSG)
      }
    } else {
      const authMw = requireAuth()
      const ownerMw = requireQuoteOwnership()
      const authResult = await authMw(c, async () => {})
      if (authResult) return authResult
      const ownerResult = await ownerMw(c, async () => {})
      if (ownerResult) return ownerResult
    }

    // --- Fetch photos from D1 ---
    const { results } = await c.env.DB.prepare(
      `SELECT id, filename, content_type, size, storage_key, created_at
       FROM photos WHERE quote_id = ? ORDER BY created_at ASC`
    )
      .bind(quoteId)
      .all<{ id: string; filename: string; content_type: string; size: number; storage_key: string; created_at: string }>()

    // --- Generate presigned URLs (R2 public URL via key) ---
    const photos = (results ?? []).map((row) => ({
      id: row.id,
      filename: row.filename,
      contentType: row.content_type,
      size: row.size,
      url: `/api/v1/quotes/${quoteId}/photos/${row.id}/file${publicToken ? `?publicToken=${encodeURIComponent(publicToken)}` : ""}`,
      createdAt: row.created_at,
    }))

    return c.json({ ok: true, data: { photos } })
  }
)

// ---------------------------------------------------------------------------
// Serve photo file (publicToken or Clerk auth)
// ---------------------------------------------------------------------------
app.get(
  "/quotes/:quoteId/photos/:photoId/file",
  rateLimit({ limit: 120, windowSeconds: 3600, keyPrefix: "photo-file" }),
  async (c) => {
    const quoteId = c.req.param("quoteId")
    const photoId = c.req.param("photoId")

    // --- Auth: publicToken (intake) or Clerk (admin) ---
    const publicToken = c.req.query("publicToken")

    if (publicToken) {
      const quote = await c.env.DB.prepare(
        "SELECT id, created_at FROM quotes WHERE id = ? AND public_token = ?"
      )
        .bind(quoteId, publicToken)
        .first<{ id: string; created_at: string }>()
      if (!quote) {
        return apiError(c, "NOT_FOUND", "Quote not found")
      }
      if (isTokenExpired(quote.created_at)) {
        return apiError(c, "GONE", TOKEN_EXPIRED_MSG)
      }
    } else {
      const authMw = requireAuth()
      const ownerMw = requireQuoteOwnership()
      const authResult = await authMw(c, async () => {})
      if (authResult) return authResult
      const ownerResult = await ownerMw(c, async () => {})
      if (ownerResult) return ownerResult
    }

    // --- Fetch photo record ---
    const photo = await c.env.DB.prepare(
      "SELECT storage_key, content_type, filename FROM photos WHERE id = ? AND quote_id = ?"
    )
      .bind(photoId, quoteId)
      .first<{ storage_key: string; content_type: string; filename: string }>()

    if (!photo) {
      return apiError(c, "NOT_FOUND", "Photo not found")
    }

    // --- Stream from R2 ---
    const object = await c.env.STORAGE.get(photo.storage_key)
    if (!object) {
      return apiError(c, "NOT_FOUND", "Photo file not found in storage")
    }

    return new Response(object.body, {
      headers: {
        "Content-Type": photo.content_type,
        "Content-Disposition": `inline; filename="${photo.filename}"`,
        "Cache-Control": "private, max-age=900",
      },
    })
  }
)

// ---------------------------------------------------------------------------
// List quotes for a contractor
// ---------------------------------------------------------------------------
app.get(
  "/contractors/:contractorId/quotes",
  requireAuth(),
  requireContractorOwnership(),
  async (c) => {
    const contractorId = c.get("contractorId")

    // Parse pagination params
    const pageParam = parseInt(c.req.query("page") ?? "1", 10)
    const limitParam = parseInt(c.req.query("limit") ?? "20", 10)
    const page = Number.isFinite(pageParam) && pageParam >= 1 ? pageParam : 1
    const limit = Number.isFinite(limitParam) && limitParam >= 1
      ? Math.min(limitParam, 100)
      : 20
    const offset = (page - 1) * limit

    // Build WHERE conditions
    const conditions: string[] = ["q.contractor_id = ?"]
    const bindings: (string | number)[] = [contractorId]

    // Filter out drafts by default unless explicitly included
    const includeDrafts = c.req.query("include_drafts") === "true"
    const status = c.req.query("status")
    if (status) {
      conditions.push("q.status = ?")
      bindings.push(status)
    } else if (!includeDrafts) {
      conditions.push("q.status != 'draft'")
    }

    const budget = c.req.query("budget")
    if (budget) {
      conditions.push("q.budget_range = ?")
      bindings.push(budget)
    }

    const q = c.req.query("q")?.slice(0, 200)
    if (q) {
      conditions.push("(c.name LIKE ? OR q.job_site_address LIKE ?)")
      const pattern = `%${q}%`
      bindings.push(pattern, pattern)
    }

    const where = conditions.join(" AND ")

    // Count total matching rows
    const countResult = await c.env.DB.prepare(
      `SELECT COUNT(*) as total FROM quotes q JOIN customers c ON q.customer_id = c.id WHERE ${where}`
    )
      .bind(...bindings)
      .first<{ total: number }>()

    const total = countResult?.total ?? 0

    // Fetch paginated results
    const { results } = await c.env.DB.prepare(
      `SELECT q.id, q.contractor_id, q.schema_version, c.name, c.email, c.phone, c.cell,
              q.job_site_address, q.property_type, q.budget_range,
              c.how_did_you_find_us, c.referred_by_contractor,
              q.scope, q.public_token, q.status, q.created_at
       FROM quotes q
       JOIN customers c ON q.customer_id = c.id
       WHERE ${where}
       ORDER BY q.created_at DESC
       LIMIT ? OFFSET ?`
    )
      .bind(...bindings, limit, offset)
      .all()

    const quotes = (results ?? []).map((row: Record<string, unknown>) => ({
      id: row.id,
      contractorId: row.contractor_id,
      schemaVersion: row.schema_version,
      name: row.name,
      email: row.email,
      phone: row.phone,
      cell: row.cell ?? null,
      jobSiteAddress: row.job_site_address,
      propertyType: row.property_type,
      budgetRange: row.budget_range,
      howDidYouFindUs: row.how_did_you_find_us ?? null,
      referredByContractor: row.referred_by_contractor ?? null,
      scope: row.scope ? JSON.parse(row.scope as string) : null,
      publicToken: row.public_token,
      status: row.status,
      createdAt: row.created_at,
    }))

    const res: ApiOk<{ quotes: typeof quotes; total: number; page: number }> = {
      ok: true,
      data: { quotes, total, page },
    }
    return c.json(res)
  }
)

// ---------------------------------------------------------------------------
// Delete a photo (publicToken or Clerk auth)
// ---------------------------------------------------------------------------
app.delete(
  "/quotes/:quoteId/photos/:photoId",
  rateLimit({ limit: 20, windowSeconds: 3600, keyPrefix: "photo-delete" }),
  async (c) => {
    const quoteId = c.req.param("quoteId")
    const photoId = c.req.param("photoId")

    // --- Auth: publicToken (intake) or Clerk (admin) ---
    const publicToken = c.req.query("publicToken")
    let contractorId: string
    let deleteActorEmail: string | null = null
    let deleteStaffId: string | null = null

    if (publicToken) {
      const quote = await c.env.DB.prepare(
        "SELECT id, contractor_id, created_at FROM quotes WHERE id = ? AND public_token = ?"
      )
        .bind(quoteId, publicToken)
        .first<{ id: string; contractor_id: string; created_at: string }>()
      if (!quote) {
        return apiError(c, "NOT_FOUND", "Quote not found")
      }
      if (isTokenExpired(quote.created_at)) {
        return apiError(c, "GONE", TOKEN_EXPIRED_MSG)
      }
      contractorId = quote.contractor_id
    } else {
      const authMw = requireAuth()
      const ownerMw = requireQuoteOwnership()
      const authResult = await authMw(c, async () => {})
      if (authResult) return authResult
      const ownerResult = await ownerMw(c, async () => {})
      if (ownerResult) return ownerResult
      contractorId = c.get("contractorId") as string
      deleteActorEmail = c.get("actorEmail") as string | null ?? null
      deleteStaffId = c.get("staffId") as string | null ?? null
    }

    // Fetch the photo record, enforcing tenant isolation via quote_id
    const photo = await c.env.DB.prepare(
      "SELECT id, storage_key FROM photos WHERE id = ? AND quote_id = ?"
    )
      .bind(photoId, quoteId)
      .first<{ id: string; storage_key: string }>()

    if (!photo) {
      return apiError(c, "NOT_FOUND", "Photo not found")
    }

    // Delete from R2 storage
    await c.env.STORAGE.delete(photo.storage_key)

    // Delete from D1
    await c.env.DB.prepare("DELETE FROM photos WHERE id = ?")
      .bind(photoId)
      .run()

    // Log activity
    await c.env.DB.prepare(
      `INSERT INTO quote_activity (quote_id, contractor_id, staff_id, actor_email, type, content)
       VALUES (?, ?, ?, ?, 'photo_removed', ?)`
    )
      .bind(quoteId, contractorId, deleteStaffId, deleteActorEmail, photoId)
      .run()

    return c.body(null, 204)
  }
)

// ---------------------------------------------------------------------------
// Serve contractor logo (public — no auth required)
// ---------------------------------------------------------------------------
app.get("/contractors/:contractorId/logo", async (c) => {
  const contractorId = c.req.param("contractorId")

  const contractor = await c.env.DB.prepare(
    "SELECT logo_url FROM contractors WHERE id = ?"
  )
    .bind(contractorId)
    .first<{ logo_url: string | null }>()

  if (!contractor?.logo_url) {
    return apiError(c, "NOT_FOUND", "No logo found")
  }

  const object = await c.env.STORAGE.get(contractor.logo_url)
  if (!object) {
    return apiError(c, "NOT_FOUND", "Logo file not found in storage")
  }

  return new Response(object.body, {
    headers: {
      "Content-Type": object.httpMetadata?.contentType ?? "image/png",
      "Cache-Control": "public, max-age=86400",
    },
  })
})

// ---------------------------------------------------------------------------
// Upload contractor logo
// ---------------------------------------------------------------------------
const MAX_LOGO_BYTES = 2 * 1024 * 1024 // 2MB
const ALLOWED_LOGO_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/svg+xml": "svg",
}

app.post(
  "/contractors/:contractorId/logo",
  requireAuth(),
  requireContractorOwnership(),
  rateLimit({ limit: 100, windowSeconds: 3600, keyPrefix: "logo-upload" }),
  async (c) => {
    const contractorId = c.get("contractorId") as string

    // --- Parse multipart form data ---
    let formData: FormData
    try {
      formData = await c.req.formData()
    } catch {
      return apiError(c, "VALIDATION_ERROR", "Request must be multipart form data")
    }

    const file = formData.get("file")
    if (!file || !(file instanceof File)) {
      return c.json(
        { ok: false, error: "Validation failed", code: "VALIDATION_ERROR" as const, fields: { file: "A logo image file is required" } },
        422
      )
    }

    // --- Validate content type ---
    const ext = ALLOWED_LOGO_TYPES[file.type]
    if (!ext) {
      return c.json(
        { ok: false, error: "Validation failed", code: "VALIDATION_ERROR" as const, fields: { file: "Logo must be a JPEG, PNG, or SVG image" } },
        422
      )
    }

    // --- Validate file size ---
    if (file.size > MAX_LOGO_BYTES) {
      return c.json(
        { ok: false, error: "Validation failed", code: "VALIDATION_ERROR" as const, fields: { file: "Logo must be under 2MB" } },
        422
      )
    }

    // --- Delete previous logo from R2 if exists ---
    const contractor = await c.env.DB.prepare(
      "SELECT logo_url FROM contractors WHERE id = ?"
    )
      .bind(contractorId)
      .first<{ logo_url: string | null }>()

    if (contractor?.logo_url) {
      // Extract R2 key from the stored URL
      const previousKey = `${contractorId}/logo.${contractor.logo_url.split(".").pop()}`
      try {
        await c.env.STORAGE.delete(previousKey)
      } catch {
        // Best-effort deletion — don't fail the upload if old logo cleanup fails
      }
    }

    // --- Upload to R2 ---
    const r2Key = `${contractorId}/logo.${ext}`
    const fileBuffer = await file.arrayBuffer()
    await c.env.STORAGE.put(r2Key, fileBuffer, {
      httpMetadata: { contentType: file.type },
    })

    // --- Update D1 with R2 key ---
    await c.env.DB.prepare(
      "UPDATE contractors SET logo_url = ? WHERE id = ?"
    )
      .bind(r2Key, contractorId)
      .run()

    // Return the public API URL for the logo
    return c.json({ ok: true, data: { logoUrl: r2Key } })
  }
)

// ---------------------------------------------------------------------------
// Add activity to a quote (note or status change)
// ---------------------------------------------------------------------------
app.post(
  "/quotes/:quoteId/activity",
  requireAuth(),
  requireQuoteOwnership(),
  rateLimit({ limit: 100, windowSeconds: 3600, keyPrefix: "activity-create" }),
  async (c) => {
    const quoteId = c.req.param("quoteId")
    const contractorId = c.get("contractorId") as string
    const actorEmail = c.get("actorEmail") as string | null ?? null
    const staffId = c.get("staffId") as string | null ?? null

    // --- Payload size gate ---
    const contentLength = c.req.header("content-length")
    if (contentLength && parseInt(contentLength, 10) > MAX_PAYLOAD_BYTES) {
      return c.json(
        { ok: false, error: "Request payload must be under 100KB", code: "VALIDATION_ERROR" as const },
        413
      )
    }

    const rawBody = await c.req.text()
    if (rawBody.length > MAX_PAYLOAD_BYTES) {
      return c.json(
        { ok: false, error: "Request payload must be under 100KB", code: "VALIDATION_ERROR" as const },
        413
      )
    }

    // --- Parse JSON ---
    let body: unknown
    try {
      body = JSON.parse(rawBody)
    } catch {
      return apiError(c, "VALIDATION_ERROR", "Invalid JSON in request body")
    }

    // --- Validate ---
    const result = activityCreateSchema.safeParse(body)
    if (!result.success) {
      return c.json(
        { ok: false, error: "Validation failed", code: "VALIDATION_ERROR" as const, fields: formatZodErrors(result.error) },
        422
      )
    }

    const data = result.data

    // --- Status change: validate transition ---
    let oldStatus: string | null = null
    if (data.type === "status_change") {
      const quote = await c.env.DB.prepare(
        "SELECT status FROM quotes WHERE id = ?"
      )
        .bind(quoteId)
        .first<{ status: string }>()

      if (!quote) {
        return apiError(c, "NOT_FOUND", "Quote not found")
      }

      oldStatus = quote.status
      const currentStatus = quote.status as QuoteStatus

      if (!QUOTE_STATUSES.includes(currentStatus)) {
        return apiError(c, "VALIDATION_ERROR", `Current quote status "${currentStatus}" is not recognized`)
      }

      const allowed = STATUS_TRANSITIONS[currentStatus]
      if (!allowed.includes(data.newStatus!)) {
        return apiError(
          c,
          "VALIDATION_ERROR",
          `Cannot change status from "${currentStatus}" to "${data.newStatus}". Allowed: ${allowed.join(", ")}`
        )
      }

      // Update quote status
      await c.env.DB.prepare(
        "UPDATE quotes SET status = ? WHERE id = ?"
      )
        .bind(data.newStatus!, quoteId)
        .run()
    }

    // --- Insert activity record ---
    const activityResult = await c.env.DB.prepare(
      `INSERT INTO quote_activity (quote_id, contractor_id, staff_id, actor_email, type, content, old_value, new_value)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING id, quote_id, contractor_id, staff_id, actor_email, type, content, old_value, new_value, created_at`
    )
      .bind(
        quoteId,
        contractorId,
        staffId,
        actorEmail,
        data.type,
        data.content ?? null,
        oldStatus,
        data.type === "status_change" ? data.newStatus! : null
      )
      .first()

    if (!activityResult) {
      return apiError(c, "INTERNAL_ERROR", "Failed to create activity record")
    }

    const activity = {
      id: activityResult.id,
      quoteId: activityResult.quote_id,
      contractorId: activityResult.contractor_id,
      staffId: activityResult.staff_id ?? null,
      actorEmail: activityResult.actor_email ?? null,
      type: activityResult.type,
      content: activityResult.content ?? null,
      oldValue: activityResult.old_value ?? null,
      newValue: activityResult.new_value ?? null,
      createdAt: activityResult.created_at,
    }

    const res: ApiOk<typeof activity> = { ok: true, data: activity }
    return c.json(res, 201)
  }
)

// ---------------------------------------------------------------------------
// List activity feed for a quote (chronological, paginated)
// ---------------------------------------------------------------------------
app.get(
  "/quotes/:quoteId/activity",
  requireAuth(),
  requireQuoteOwnership(),
  async (c) => {
    const quoteId = c.req.param("quoteId")

    // Parse pagination params
    const pageParam = parseInt(c.req.query("page") ?? "1", 10)
    const limitParam = parseInt(c.req.query("limit") ?? "50", 10)
    const page = Number.isFinite(pageParam) && pageParam >= 1 ? pageParam : 1
    const limit = Number.isFinite(limitParam) && limitParam >= 1
      ? Math.min(limitParam, 100)
      : 50
    const offset = (page - 1) * limit

    // Count total
    const countResult = await c.env.DB.prepare(
      "SELECT COUNT(*) as total FROM quote_activity WHERE quote_id = ?"
    )
      .bind(quoteId)
      .first<{ total: number }>()

    const total = countResult?.total ?? 0

    // Fetch paginated results (chronological order)
    // LEFT JOIN staff to resolve actor name for display
    const { results } = await c.env.DB.prepare(
      `SELECT qa.id, qa.quote_id, qa.contractor_id, qa.staff_id, qa.actor_email,
              qa.type, qa.content, qa.old_value, qa.new_value, qa.created_at,
              s.name AS actor_name
       FROM quote_activity qa
       LEFT JOIN staff s ON s.id = qa.staff_id
       WHERE qa.quote_id = ?
       ORDER BY qa.created_at ASC, qa.id ASC
       LIMIT ? OFFSET ?`
    )
      .bind(quoteId, limit, offset)
      .all()

    const activities = (results ?? []).map((row: Record<string, unknown>) => ({
      id: row.id,
      quoteId: row.quote_id,
      contractorId: row.contractor_id,
      staffId: row.staff_id ?? null,
      actorEmail: row.actor_email ?? null,
      actorName: row.actor_name ?? null,
      type: row.type,
      content: row.content ?? null,
      oldValue: row.old_value ?? null,
      newValue: row.new_value ?? null,
      createdAt: row.created_at,
    }))

    const res: ApiOk<{ activities: typeof activities; total: number; page: number }> = {
      ok: true,
      data: { activities, total, page },
    }
    return c.json(res)
  }
)

// ---------------------------------------------------------------------------
// List customers for a contractor (with quote count)
// ---------------------------------------------------------------------------
app.get(
  "/contractors/:contractorId/customers",
  requireAuth(),
  requireContractorOwnership(),
  async (c) => {
    const contractorId = c.get("contractorId")

    const pageParam = parseInt(c.req.query("page") ?? "1", 10)
    const limitParam = parseInt(c.req.query("limit") ?? "50", 10)
    const page = Number.isFinite(pageParam) && pageParam >= 1 ? pageParam : 1
    const limit = Number.isFinite(limitParam) && limitParam >= 1
      ? Math.min(limitParam, 100)
      : 50
    const offset = (page - 1) * limit

    const conditions: string[] = ["c.contractor_id = ?"]
    const bindings: (string | number)[] = [contractorId]

    const search = c.req.query("search")
    if (search) {
      conditions.push("(c.name LIKE ? OR c.email LIKE ?)")
      const pattern = `%${search}%`
      bindings.push(pattern, pattern)
    }

    const where = conditions.join(" AND ")

    const countResult = await c.env.DB.prepare(
      `SELECT COUNT(*) as total FROM customers c WHERE ${where}`
    )
      .bind(...bindings)
      .first<{ total: number }>()

    const total = countResult?.total ?? 0

    const { results } = await c.env.DB.prepare(
      `SELECT c.id, c.name, c.email, c.phone,
              c.how_did_you_find_us, c.referred_by_contractor,
              c.created_at, c.updated_at,
              COUNT(q.id) as quote_count,
              MAX(q.created_at) as most_recent_quote_date
       FROM customers c
       LEFT JOIN quotes q ON q.customer_id = c.id AND q.deleted_at IS NULL
       WHERE ${where}
       GROUP BY c.id
       ORDER BY c.created_at DESC
       LIMIT ? OFFSET ?`
    )
      .bind(...bindings, limit, offset)
      .all()

    const customers = (results ?? []).map((row: Record<string, unknown>) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      phone: row.phone,
      howDidYouFindUs: row.how_did_you_find_us ?? null,
      referredByContractor: row.referred_by_contractor ?? null,
      quoteCount: row.quote_count ?? 0,
      mostRecentQuoteDate: row.most_recent_quote_date ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }))

    const res: ApiOk<{ customers: typeof customers; total: number; page: number }> = {
      ok: true,
      data: { customers, total, page },
    }
    return c.json(res)
  }
)

// ---------------------------------------------------------------------------
// Get single customer with their quotes
// ---------------------------------------------------------------------------
app.get(
  "/customers/:customerId",
  requireAuth(),
  async (c) => {
    const contractorId = c.get("contractorId") as string
    const customerId = c.req.param("customerId")

    const row = await c.env.DB.prepare(
      `SELECT id, contractor_id, name, email, phone,
              how_did_you_find_us, referred_by_contractor,
              created_at, updated_at
       FROM customers
       WHERE id = ? AND contractor_id = ?`
    )
      .bind(customerId, contractorId)
      .first()

    if (!row) {
      return apiError(c, "NOT_FOUND", "Customer not found")
    }

    const { results: quotes } = await c.env.DB.prepare(
      `SELECT id, job_site_address, property_type, budget_range, status, created_at
       FROM quotes
       WHERE customer_id = ? AND contractor_id = ? AND deleted_at IS NULL
       ORDER BY created_at DESC`
    )
      .bind(customerId, contractorId)
      .all()

    const customer = {
      id: row.id,
      contractorId: row.contractor_id,
      name: row.name,
      email: row.email,
      phone: row.phone,
      howDidYouFindUs: row.how_did_you_find_us ?? null,
      referredByContractor: row.referred_by_contractor ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      quotes: (quotes ?? []).map((q: Record<string, unknown>) => ({
        id: q.id,
        jobSiteAddress: q.job_site_address,
        propertyType: q.property_type,
        budgetRange: q.budget_range,
        status: q.status,
        createdAt: q.created_at,
      })),
    }

    const res: ApiOk<typeof customer> = { ok: true, data: customer }
    return c.json(res)
  }
)

// ---------------------------------------------------------------------------
// Update customer fields
// ---------------------------------------------------------------------------
app.patch(
  "/customers/:customerId",
  requireAuth(),
  rateLimit({ limit: 100, windowSeconds: 3600, keyPrefix: "customer-update" }),
  async (c) => {
    const contractorId = c.get("contractorId") as string
    const customerId = c.req.param("customerId")

    const existing = await c.env.DB.prepare(
      "SELECT id FROM customers WHERE id = ? AND contractor_id = ?"
    )
      .bind(customerId, contractorId)
      .first<{ id: string }>()

    if (!existing) {
      return apiError(c, "NOT_FOUND", "Customer not found")
    }

    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return apiError(c, "VALIDATION_ERROR", "Invalid JSON in request body")
    }

    const result = customerUpdateSchema.safeParse(body)
    if (!result.success) {
      return c.json(
        { ok: false, error: "Validation failed", code: "VALIDATION_ERROR" as const, fields: formatZodErrors(result.error) },
        422
      )
    }

    const data = result.data

    const fieldMap: Record<string, { column: string; value: unknown }> = {
      name: { column: "name", value: data.name },
      email: { column: "email", value: data.email },
      phone: { column: "phone", value: data.phone },
      howDidYouFindUs: { column: "how_did_you_find_us", value: data.howDidYouFindUs },
      referredByContractor: { column: "referred_by_contractor", value: data.referredByContractor },
    }

    const setClauses: string[] = []
    const bindValues: unknown[] = []

    for (const [key, mapping] of Object.entries(fieldMap)) {
      if (key in data && mapping.value !== undefined) {
        setClauses.push(`${mapping.column} = ?`)
        bindValues.push(mapping.value ?? null)
      }
    }

    if (setClauses.length > 0) {
      setClauses.push("updated_at = datetime('now')")
      bindValues.push(customerId, contractorId)
      await c.env.DB.prepare(
        `UPDATE customers SET ${setClauses.join(", ")} WHERE id = ? AND contractor_id = ?`
      )
        .bind(...bindValues)
        .run()
    }

    const updated = await c.env.DB.prepare(
      `SELECT id, contractor_id, name, email, phone,
              how_did_you_find_us, referred_by_contractor,
              created_at, updated_at
       FROM customers WHERE id = ? AND contractor_id = ?`
    )
      .bind(customerId, contractorId)
      .first()

    if (!updated) {
      return apiError(c, "INTERNAL_ERROR", "Failed to fetch updated customer")
    }

    return c.json({
      ok: true,
      data: {
        id: updated.id,
        contractorId: updated.contractor_id,
        name: updated.name,
        email: updated.email,
        phone: updated.phone,
        howDidYouFindUs: updated.how_did_you_find_us ?? null,
        referredByContractor: updated.referred_by_contractor ?? null,
        createdAt: updated.created_at,
        updatedAt: updated.updated_at,
      },
    })
  }
)

// ---------------------------------------------------------------------------
// Delete customer data (by email or by customer UUID)
// ---------------------------------------------------------------------------
app.delete(
  "/customers/:id",
  requireAuth(),
  rateLimit({ limit: 20, windowSeconds: 3600, keyPrefix: "customer-delete" }),
  async (c) => {
    const contractorId = c.get("contractorId") as string
    const id = c.req.param("id")

    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

    // --- Email-based deletion ---
    if (!UUID_REGEX.test(id)) {
      const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!EMAIL_REGEX.test(id)) {
        return c.json(
          { ok: false, error: "Invalid email address", code: "VALIDATION_ERROR" as const },
          400
        )
      }

      let requestType = "contractor"
      const rawBody = await c.req.text()
      if (rawBody) {
        let body: unknown
        try {
          body = JSON.parse(rawBody)
        } catch {
          return apiError(c, "VALIDATION_ERROR", "Invalid JSON in request body")
        }
        const result = customerDeletionSchema.safeParse(body)
        if (!result.success) {
          return c.json(
            { ok: false, error: "Validation failed", code: "VALIDATION_ERROR" as const, fields: formatZodErrors(result.error) },
            422
          )
        }
        requestType = result.data.requestType
      }

      const { results: quotes } = await c.env.DB.prepare(
        `SELECT q.id FROM quotes q JOIN customers c ON q.customer_id = c.id
         WHERE LOWER(c.email) = LOWER(?) AND q.contractor_id = ?`
      )
        .bind(id, contractorId)
        .all<{ id: string }>()

      if (!quotes || quotes.length === 0) {
        return apiError(c, "NOT_FOUND", "No customer data found for this email")
      }

      const quoteIds = quotes.map((q) => q.id)
      const placeholders = quoteIds.map(() => "?").join(", ")

      let photosDeleted = 0
      let appointmentsDeleted = 0
      let activityDeleted = 0
      let quotesDeleted = 0

      const { results: photos } = await c.env.DB.prepare(
        `SELECT storage_key FROM photos WHERE quote_id IN (${placeholders}) AND contractor_id = ?`
      )
        .bind(...quoteIds, contractorId)
        .all<{ storage_key: string }>()

      for (const photo of photos) {
        await c.env.STORAGE.delete(photo.storage_key)
        photosDeleted++
      }

      await c.env.DB.prepare(
        `DELETE FROM photos WHERE quote_id IN (${placeholders}) AND contractor_id = ?`
      )
        .bind(...quoteIds, contractorId)
        .run()

      const apptResult = await c.env.DB.prepare(
        `DELETE FROM appointments WHERE quote_id IN (${placeholders}) AND contractor_id = ?`
      )
        .bind(...quoteIds, contractorId)
        .run()
      appointmentsDeleted = apptResult.meta?.changes ?? 0

      const actResult = await c.env.DB.prepare(
        `DELETE FROM quote_activity WHERE quote_id IN (${placeholders}) AND contractor_id = ?`
      )
        .bind(...quoteIds, contractorId)
        .run()
      activityDeleted = actResult.meta?.changes ?? 0

      const qResult = await c.env.DB.prepare(
        `DELETE FROM quotes WHERE id IN (${placeholders}) AND contractor_id = ?`
      )
        .bind(...quoteIds, contractorId)
        .run()
      quotesDeleted = qResult.meta?.changes ?? 0

      const emailBytes = new TextEncoder().encode(id.toLowerCase().trim())
      const hashBuffer = await crypto.subtle.digest("SHA-256", emailBytes)
      const emailHash = Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")

      await c.env.DB.prepare(
        `INSERT INTO data_deletion_log (
          contractor_id, request_type, requested_by, email_hash,
          quotes_deleted, photos_deleted, appointments_deleted, activity_records_deleted
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(contractorId, requestType, contractorId, emailHash, quotesDeleted, photosDeleted, appointmentsDeleted, activityDeleted)
        .run()

      return c.json({
        ok: true,
        data: { quotesDeleted, photosDeleted, appointmentsDeleted, activityRecordsDeleted: activityDeleted },
      })
    }

    // --- UUID-based deletion ---
    const customerId = id

    const customer = await c.env.DB.prepare(
      "SELECT id, email FROM customers WHERE id = ? AND contractor_id = ?"
    )
      .bind(customerId, contractorId)
      .first<{ id: string; email: string }>()

    if (!customer) {
      return apiError(c, "NOT_FOUND", "Customer not found")
    }

    let requestType = "contractor"
    const rawBody = await c.req.text()
    if (rawBody) {
      let body: unknown
      try {
        body = JSON.parse(rawBody)
      } catch {
        return apiError(c, "VALIDATION_ERROR", "Invalid JSON in request body")
      }
      const result = customerDeletionSchema.safeParse(body)
      if (!result.success) {
        return c.json(
          { ok: false, error: "Validation failed", code: "VALIDATION_ERROR" as const, fields: formatZodErrors(result.error) },
          422
        )
      }
      requestType = result.data.requestType
    }

    const { results: quotes } = await c.env.DB.prepare(
      "SELECT id FROM quotes WHERE customer_id = ? AND contractor_id = ?"
    )
      .bind(customerId, contractorId)
      .all<{ id: string }>()

    const quoteIds = (quotes ?? []).map((q) => q.id)

    let photosDeleted = 0
    let appointmentsDeleted = 0
    let activityDeleted = 0
    let quotesDeleted = 0

    if (quoteIds.length > 0) {
      const placeholders = quoteIds.map(() => "?").join(", ")

      const { results: photos } = await c.env.DB.prepare(
        `SELECT storage_key FROM photos WHERE quote_id IN (${placeholders}) AND contractor_id = ?`
      )
        .bind(...quoteIds, contractorId)
        .all<{ storage_key: string }>()

      for (const photo of photos) {
        await c.env.STORAGE.delete(photo.storage_key)
        photosDeleted++
      }

      await c.env.DB.prepare(
        `DELETE FROM photos WHERE quote_id IN (${placeholders}) AND contractor_id = ?`
      )
        .bind(...quoteIds, contractorId)
        .run()

      const appointmentResult = await c.env.DB.prepare(
        `DELETE FROM appointments WHERE quote_id IN (${placeholders}) AND contractor_id = ?`
      )
        .bind(...quoteIds, contractorId)
        .run()
      appointmentsDeleted = appointmentResult.meta?.changes ?? 0

      const activityResult = await c.env.DB.prepare(
        `DELETE FROM quote_activity WHERE quote_id IN (${placeholders}) AND contractor_id = ?`
      )
        .bind(...quoteIds, contractorId)
        .run()
      activityDeleted = activityResult.meta?.changes ?? 0

      const quotesResult = await c.env.DB.prepare(
        `DELETE FROM quotes WHERE id IN (${placeholders}) AND contractor_id = ?`
      )
        .bind(...quoteIds, contractorId)
        .run()
      quotesDeleted = quotesResult.meta?.changes ?? 0
    }

    await c.env.DB.prepare(
      "DELETE FROM customers WHERE id = ? AND contractor_id = ?"
    )
      .bind(customerId, contractorId)
      .run()

    const emailBytes = new TextEncoder().encode(customer.email.toLowerCase().trim())
    const hashBuffer = await crypto.subtle.digest("SHA-256", emailBytes)
    const emailHash = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")

    await c.env.DB.prepare(
      `INSERT INTO data_deletion_log (
        contractor_id, request_type, requested_by, email_hash,
        quotes_deleted, photos_deleted, appointments_deleted, activity_records_deleted
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(contractorId, requestType, contractorId, emailHash, quotesDeleted, photosDeleted, appointmentsDeleted, activityDeleted)
      .run()

    const res: ApiOk<{
      quotesDeleted: number
      photosDeleted: number
      appointmentsDeleted: number
      activityRecordsDeleted: number
    }> = {
      ok: true,
      data: {
        quotesDeleted,
        photosDeleted,
        appointmentsDeleted,
        activityRecordsDeleted: activityDeleted,
      },
    }
    return c.json(res)
  }
)

// ---------------------------------------------------------------------------
// Email send
// ---------------------------------------------------------------------------

const BUDGET_LABELS: Record<string, string> = {
  "<10k": "Under $10k",
  "10-25k": "$10k – $25k",
  "25-50k": "$25k – $50k",
  "50k+": "$50k+",
}

const STATUS_LABELS: Record<string, string> = {
  lead: "Lead",
  measure_scheduled: "Measure Scheduled",
  quoted: "Quoted",
  accepted: "Accepted",
  rejected: "Rejected",
}

function escapeMergeField(value: string): string {
  return value.replace(/\{\{/g, "{ {").replace(/\}\}/g, "} }")
}

function resolveMergeFields(
  template: string,
  quote: { name: string; job_site_address: string; budget_range: string; status: string }
): string {
  return template
    .replace(/\{\{name\}\}/g, escapeMergeField(quote.name))
    .replace(/\{\{address\}\}/g, escapeMergeField(quote.job_site_address))
    .replace(/\{\{budget\}\}/g, escapeMergeField(BUDGET_LABELS[quote.budget_range] ?? quote.budget_range))
    .replace(/\{\{status\}\}/g, escapeMergeField(STATUS_LABELS[quote.status] ?? quote.status))
}

function textToHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>")
}

app.post(
  "/email/send",
  requireAuth(),
  rateLimit({ limit: 10, windowSeconds: 3600, keyPrefix: "email-send" }),
  async (c) => {
    const contractorId = c.get("contractorId") as string
    const emailActorEmail = c.get("actorEmail") as string | null ?? null
    const emailStaffId = c.get("staffId") as string | null ?? null

    // --- Parse and validate ---
    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return apiError(c, "VALIDATION_ERROR", "Invalid JSON in request body")
    }

    const result = emailSendSchema.safeParse(body)
    if (!result.success) {
      return c.json(
        { ok: false, error: "Validation failed", code: "VALIDATION_ERROR" as const, fields: formatZodErrors(result.error) },
        422
      )
    }

    const { to: quoteIds, subject, html: bodyTemplate } = result.data

    // --- Fetch quotes owned by this contractor ---
    const placeholders = quoteIds.map(() => "?").join(", ")
    const { results } = await c.env.DB.prepare(
      `SELECT id, name, email, job_site_address, budget_range, status
       FROM quotes
       WHERE id IN (${placeholders}) AND contractor_id = ?`
    )
      .bind(...quoteIds, contractorId)
      .all()

    const quotes = (results ?? []) as Array<{
      id: string
      name: string
      email: string
      job_site_address: string
      budget_range: string
      status: string
    }>

    if (quotes.length === 0) {
      return apiError(c, "NOT_FOUND", "No matching quotes found for your account")
    }

    // --- Send emails ---
    const apiKey = c.env.SENDGRID_API_KEY
    const isDevMode = !apiKey
    let sent = 0
    let failed = 0
    const errors: Array<{ quoteId: string; error: string }> = []

    for (const quote of quotes) {
      const resolvedSubject = resolveMergeFields(subject, quote)
      const resolvedBody = resolveMergeFields(bodyTemplate, quote)
      const resolvedHtml = textToHtml(resolvedBody)

      if (isDevMode) {
        console.warn(`[DEV EMAIL] To: ${quote.email} (${quote.name})`)
        console.warn(`[DEV EMAIL] Subject: ${resolvedSubject}`)
        console.warn(`[DEV EMAIL] Body:\n${resolvedBody}`)
        console.warn("---")
        sent++
      } else {
        try {
          const sgResponse = await fetch("https://api.sendgrid.com/v3/mail/send", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              personalizations: [{ to: [{ email: quote.email, name: quote.name }] }],
              from: { email: "noreply@example.com" },
              subject: resolvedSubject,
              content: [{ type: "text/html", value: resolvedHtml }],
            }),
          })

          if (sgResponse.status >= 200 && sgResponse.status < 300) {
            sent++
          } else {
            const errText = await sgResponse.text()
            failed++
            errors.push({ quoteId: quote.id, error: `SendGrid ${sgResponse.status}: ${errText}` })
          }
        } catch (err) {
          failed++
          errors.push({ quoteId: quote.id, error: err instanceof Error ? err.message : "Unknown error" })
        }
      }

      // Log email_sent activity
      await c.env.DB.prepare(
        `INSERT INTO quote_activity (quote_id, contractor_id, staff_id, actor_email, type, content)
         VALUES (?, ?, ?, ?, 'email_sent', ?)`
      )
        .bind(quote.id, contractorId, emailStaffId, emailActorEmail, resolvedSubject)
        .run()
    }

    const res: ApiOk<{ sent: number; failed: number; errors: typeof errors }> = {
      ok: true,
      data: { sent, failed, errors },
    }
    return c.json(res)
  }
)

// ---------------------------------------------------------------------------
// Me endpoints — authenticated user's own context
// ---------------------------------------------------------------------------

// GET /me/contractor — returns the contractor associated with the caller's email
// Used by the frontend ContractorSession context for regular staff members.
app.get(
  "/me/contractor",
  async (c) => {
    const authHeader = c.req.header("authorization")
    let email: string | null = null

    if (authHeader?.startsWith("Bearer ")) {
      const payload = await verifyClerkJwt(authHeader.slice(7), c.env)
      if (!payload) {
        return apiError(c, "UNAUTHORIZED", "Invalid token")
      }
      email =
        (payload.email as string | undefined) ??
        (payload.primary_email as string | undefined) ??
        (payload.email_address as string | undefined) ??
        null
    } else if (c.env.ENVIRONMENT === "development") {
      // Dev fallback: no JWT, require x-contractor-id header (no hardcoded default)
      const devContractorId = c.req.header("x-contractor-id")
      if (!devContractorId) {
        return apiError(c, "NOT_FOUND", "No contractor association found for this user")
      }
      const row = await c.env.DB.prepare(
        "SELECT id, name FROM contractors WHERE id = ?"
      )
        .bind(devContractorId)
        .first<{ id: string; name: string }>()
      if (!row) {
        return apiError(c, "NOT_FOUND", "Contractor not found")
      }
      const res: ApiOk<{ contractorId: string; contractorName: string; role: string }> = {
        ok: true,
        data: { contractorId: row.id, contractorName: row.name, role: "owner" },
      }
      return c.json(res)
    } else {
      return apiError(c, "UNAUTHORIZED", "Authentication required")
    }

    if (!email) {
      return apiError(c, "UNAUTHORIZED", "No email in token")
    }

    const staff = await c.env.DB.prepare(
      `SELECT s.contractor_id, s.role, c.name AS contractor_name
       FROM staff s
       JOIN contractors c ON c.id = s.contractor_id
       WHERE LOWER(s.email) = ? AND s.active = 1
       LIMIT 1`
    )
      .bind(email.toLowerCase())
      .first<{ contractor_id: string; role: string; contractor_name: string }>()

    if (!staff) {
      return apiError(c, "NOT_FOUND", "No contractor association found for this user")
    }

    const res: ApiOk<{ contractorId: string; contractorName: string; role: string }> = {
      ok: true,
      data: {
        contractorId: staff.contractor_id,
        contractorName: staff.contractor_name,
        role: staff.role,
      },
    }
    return c.json(res)
  }
)

// ---------------------------------------------------------------------------
// Staff management
// ---------------------------------------------------------------------------

// List staff for the authenticated contractor
app.get(
  "/staff",
  requireAuth(),
  async (c) => {
    const contractorId = c.get("contractorId") as string

    const includeInactive = c.req.query("includeInactive") === "true"
    const where = includeInactive
      ? "contractor_id = ?"
      : "contractor_id = ? AND active = 1"

    const { results } = await c.env.DB.prepare(
      `SELECT id, contractor_id, clerk_user_id, name, email, role, phone, active, created_at
       FROM staff
       WHERE ${where}
       ORDER BY created_at ASC`
    )
      .bind(contractorId)
      .all()

    const staff = (results ?? []).map((row: Record<string, unknown>) => ({
      id: row.id,
      contractorId: row.contractor_id,
      clerkUserId: row.clerk_user_id ?? null,
      name: row.name,
      email: row.email,
      role: row.role,
      phone: row.phone ?? null,
      active: row.active === 1,
      createdAt: row.created_at,
    }))

    const res: ApiOk<typeof staff> = { ok: true, data: staff }
    return c.json(res)
  }
)

// Create a new staff member
app.post(
  "/staff",
  requireAuth(),
  rateLimit({ limit: 100, windowSeconds: 3600, keyPrefix: "staff-create" }),
  async (c) => {
    const contractorId = c.get("contractorId") as string

    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return apiError(c, "VALIDATION_ERROR", "Invalid JSON in request body")
    }

    const result = staffCreateSchema.safeParse(body)
    if (!result.success) {
      return c.json(
        { ok: false, error: "Validation failed", code: "VALIDATION_ERROR" as const, fields: formatZodErrors(result.error) },
        422
      )
    }

    const data = result.data

    // Check for duplicate email within this contractor
    const existing = await c.env.DB.prepare(
      "SELECT id FROM staff WHERE email = ? AND contractor_id = ?"
    )
      .bind(data.email, contractorId)
      .first<{ id: string }>()

    if (existing) {
      return c.json(
        { ok: false, error: "Validation failed", code: "VALIDATION_ERROR" as const, fields: { email: "A staff member with this email already exists" } },
        422
      )
    }

    const staffId = crypto.randomUUID()

    await c.env.DB.prepare(
      `INSERT INTO staff (id, contractor_id, name, email, role, phone, active)
       VALUES (?, ?, ?, ?, ?, ?, 1)`
    )
      .bind(staffId, contractorId, data.name, data.email, data.role, data.phone || null)
      .run()

    const created = await c.env.DB.prepare(
      `SELECT id, contractor_id, clerk_user_id, name, email, role, phone, active, created_at
       FROM staff WHERE id = ?`
    )
      .bind(staffId)
      .first()

    if (!created) {
      return apiError(c, "INTERNAL_ERROR", "Failed to create staff member")
    }

    const staffMember = {
      id: created.id,
      contractorId: created.contractor_id,
      clerkUserId: created.clerk_user_id ?? null,
      name: created.name,
      email: created.email,
      role: created.role,
      phone: created.phone ?? null,
      active: created.active === 1,
      createdAt: created.created_at,
    }

    const actorEmail = extractEmailFromJwt(c.req.header("authorization")) ?? "unknown"
    await insertAuditEvent(c.env.DB, {
      actorEmail,
      actorType: "staff",
      entityType: "staff",
      entityId: staffId,
      action: "create",
      details: { name: data.name, email: data.email, role: data.role },
    }).catch(() => {})

    const res: ApiOk<typeof staffMember> = { ok: true, data: staffMember }
    return c.json(res, 201)
  }
)

// Update a staff member
app.patch(
  "/staff/:staffId",
  requireAuth(),
  rateLimit({ limit: 100, windowSeconds: 3600, keyPrefix: "staff-update" }),
  async (c) => {
    const contractorId = c.get("contractorId") as string
    const staffId = c.req.param("staffId")

    // Verify staff belongs to this contractor (also captures old values for audit)
    const existing = await c.env.DB.prepare(
      "SELECT id, name, email, role, phone, active FROM staff WHERE id = ? AND contractor_id = ?"
    )
      .bind(staffId, contractorId)
      .first<{ id: string; name: string; email: string; role: string; phone: string | null; active: number }>()

    if (!existing) {
      return apiError(c, "NOT_FOUND", "Staff member not found")
    }

    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return apiError(c, "VALIDATION_ERROR", "Invalid JSON in request body")
    }

    const result = staffUpdateSchema.safeParse(body)
    if (!result.success) {
      return c.json(
        { ok: false, error: "Validation failed", code: "VALIDATION_ERROR" as const, fields: formatZodErrors(result.error) },
        422
      )
    }

    const data = result.data

    // Restrict role changes to owners only
    if (data.role !== undefined) {
      let clerkUserId: string | null = null
      const authHeader = c.req.header("authorization")
      if (authHeader?.startsWith("Bearer ")) {
        const payload = await verifyClerkJwt(authHeader.slice(7), c.env)
        clerkUserId = (payload?.sub as string | undefined) ?? null
      }

      // In dev mode without JWT, check x-contractor-id header for owner lookup
      const requestingStaff = clerkUserId
        ? await c.env.DB.prepare(
            "SELECT role FROM staff WHERE clerk_user_id = ? AND contractor_id = ?"
          )
            .bind(clerkUserId, contractorId)
            .first<{ role: string }>()
        : c.env.ENVIRONMENT === "development"
          ? await c.env.DB.prepare(
              "SELECT role FROM staff WHERE contractor_id = ? AND role = 'owner' LIMIT 1"
            )
              .bind(contractorId)
              .first<{ role: string }>()
          : null

      if (!requestingStaff || requestingStaff.role !== "owner") {
        return apiError(c, "FORBIDDEN", "Only owners can change staff roles")
      }
    }

    // Check for duplicate email if email is being changed
    if (data.email) {
      const duplicate = await c.env.DB.prepare(
        "SELECT id FROM staff WHERE email = ? AND contractor_id = ? AND id != ?"
      )
        .bind(data.email, contractorId, staffId)
        .first<{ id: string }>()

      if (duplicate) {
        return c.json(
          { ok: false, error: "Validation failed", code: "VALIDATION_ERROR" as const, fields: { email: "A staff member with this email already exists" } },
          422
        )
      }
    }

    // Build dynamic UPDATE
    const fieldMap: Record<string, { column: string; value: unknown }> = {
      name: { column: "name", value: data.name },
      email: { column: "email", value: data.email },
      role: { column: "role", value: data.role },
      phone: { column: "phone", value: data.phone },
      active: { column: "active", value: data.active !== undefined ? (data.active ? 1 : 0) : undefined },
    }

    const setClauses: string[] = []
    const bindValues: unknown[] = []

    for (const [key, mapping] of Object.entries(fieldMap)) {
      if (key in data && mapping.value !== undefined) {
        setClauses.push(`${mapping.column} = ?`)
        bindValues.push(mapping.value ?? null)
      }
    }

    if (setClauses.length > 0) {
      bindValues.push(staffId)
      await c.env.DB.prepare(
        `UPDATE staff SET ${setClauses.join(", ")} WHERE id = ?`
      )
        .bind(...bindValues)
        .run()
    }

    // Fetch updated record
    const updated = await c.env.DB.prepare(
      `SELECT id, contractor_id, clerk_user_id, name, email, role, phone, active, created_at
       FROM staff WHERE id = ?`
    )
      .bind(staffId)
      .first()

    if (!updated) {
      return apiError(c, "INTERNAL_ERROR", "Failed to fetch updated staff member")
    }

    const staffMember = {
      id: updated.id,
      contractorId: updated.contractor_id,
      clerkUserId: updated.clerk_user_id ?? null,
      name: updated.name,
      email: updated.email,
      role: updated.role,
      phone: updated.phone ?? null,
      active: updated.active === 1,
      createdAt: updated.created_at,
    }

    if (setClauses.length > 0) {
      const changedFields: Record<string, { old: unknown; new: unknown }> = {}
      if (data.name !== undefined && data.name !== existing.name) changedFields.name = { old: existing.name, new: data.name }
      if (data.email !== undefined && data.email !== existing.email) changedFields.email = { old: existing.email, new: data.email }
      if (data.role !== undefined && data.role !== existing.role) changedFields.role = { old: existing.role, new: data.role }
      if (data.phone !== undefined && data.phone !== existing.phone) changedFields.phone = { old: existing.phone, new: data.phone }
      if (data.active !== undefined && (data.active ? 1 : 0) !== existing.active) changedFields.active = { old: existing.active === 1, new: data.active }
      const actorEmail = extractEmailFromJwt(c.req.header("authorization")) ?? "unknown"
      await insertAuditEvent(c.env.DB, {
        actorEmail,
        actorType: "staff",
        entityType: "staff",
        entityId: staffId,
        action: "update",
        details: { changes: changedFields },
      }).catch(() => {})
    }

    return c.json({ ok: true, data: staffMember })
  }
)

// ---------------------------------------------------------------------------
// Dev-only routes (ENVIRONMENT === "development" guard — never reached in prod)
// ---------------------------------------------------------------------------

// List all contractors — no auth required, dev only
app.get("/dev/contractors", async (c) => {
  if ((c.env as Record<string, unknown>).ENVIRONMENT !== "development") {
    return apiError(c, "FORBIDDEN", "Dev endpoint not available in production")
  }

  const { results } = await c.env.DB.prepare(
    `SELECT id, slug, name FROM contractors ORDER BY name ASC`
  ).all<{ id: string; slug: string; name: string }>()

  return c.json({ ok: true, data: results ?? [] })
})

// ---------------------------------------------------------------------------
// Platform admin routes
// ---------------------------------------------------------------------------

// List all contractors (platform admin only)
app.get(
  "/platform/contractors",
  requireSuperAdmin(),
  async (c) => {
    const { results } = await c.env.DB.prepare(
      `SELECT c.id, c.slug, c.name, c.email, c.phone,
              s.id AS owner_staff_id, s.name AS owner_name, s.email AS owner_email, s.clerk_user_id AS owner_clerk_user_id
       FROM contractors c
       LEFT JOIN staff s ON s.contractor_id = c.id AND s.role = 'owner' AND s.active = 1
       ORDER BY c.name ASC`
    ).all()

    const contractors = (results ?? []).map((row: Record<string, unknown>) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      email: row.email ?? null,
      phone: row.phone ?? null,
      owner: row.owner_staff_id
        ? {
            staffId: row.owner_staff_id,
            name: row.owner_name,
            email: row.owner_email,
            clerkUserId: row.owner_clerk_user_id ?? null,
          }
        : null,
    }))

    const res: ApiOk<typeof contractors> = { ok: true, data: contractors }
    return c.json(res)
  }
)

// Assign owner to a contractor (platform admin only)
// Enforces ONE owner per contractor: demotes existing owner to 'admin'
app.post(
  "/platform/contractors/:contractorId/owner",
  requireSuperAdmin(),
  rateLimit({ limit: 50, windowSeconds: 3600, keyPrefix: "platform-assign-owner" }),
  async (c) => {
    const contractorId = c.req.param("contractorId")

    // Verify contractor exists
    const contractor = await c.env.DB.prepare(
      "SELECT id FROM contractors WHERE id = ?"
    )
      .bind(contractorId)
      .first<{ id: string }>()

    if (!contractor) {
      return apiError(c, "NOT_FOUND", "Contractor not found")
    }

    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return apiError(c, "VALIDATION_ERROR", "Invalid JSON in request body")
    }

    const result = assignOwnerSchema.safeParse(body)
    if (!result.success) {
      return c.json(
        { ok: false, error: "Validation failed", code: "VALIDATION_ERROR" as const, fields: formatZodErrors(result.error) },
        422
      )
    }

    const data = result.data

    // Demote any existing owner(s) to 'admin'
    await c.env.DB.prepare(
      "UPDATE staff SET role = 'admin' WHERE contractor_id = ? AND role = 'owner'"
    )
      .bind(contractorId)
      .run()

    // Check if a staff record with this email already exists for this contractor
    const existingStaff = await c.env.DB.prepare(
      "SELECT id FROM staff WHERE email = ? AND contractor_id = ?"
    )
      .bind(data.email, contractorId)
      .first<{ id: string }>()

    let staffId: string

    if (existingStaff) {
      // Promote existing staff to owner
      staffId = existingStaff.id
      await c.env.DB.prepare(
        `UPDATE staff SET role = 'owner', name = ?, active = 1${data.clerkUserId ? ", clerk_user_id = ?" : ""}
         WHERE id = ?`
      )
        .bind(
          ...(data.clerkUserId
            ? [data.name, data.clerkUserId, staffId]
            : [data.name, staffId])
        )
        .run()
    } else {
      // Create new staff record as owner
      staffId = crypto.randomUUID()
      await c.env.DB.prepare(
        `INSERT INTO staff (id, contractor_id, name, email, role, clerk_user_id, active)
         VALUES (?, ?, ?, ?, 'owner', ?, 1)`
      )
        .bind(staffId, contractorId, data.name, data.email, data.clerkUserId ?? null)
        .run()
    }

    // Fetch the created/updated owner record
    const owner = await c.env.DB.prepare(
      `SELECT id, contractor_id, clerk_user_id, name, email, role, phone, active, created_at
       FROM staff WHERE id = ?`
    )
      .bind(staffId)
      .first()

    if (!owner) {
      return apiError(c, "INTERNAL_ERROR", "Failed to fetch owner record")
    }

    const staffMember = {
      id: owner.id,
      contractorId: owner.contractor_id,
      clerkUserId: owner.clerk_user_id ?? null,
      name: owner.name,
      email: owner.email,
      role: owner.role,
      phone: owner.phone ?? null,
      active: owner.active === 1,
      createdAt: owner.created_at,
    }

    const actorEmail = c.get("superAdminEmail") as string
    await insertAuditEvent(c.env.DB, {
      actorEmail,
      actorType: "super_admin",
      entityType: "staff",
      entityId: staffId,
      action: existingStaff ? "update" : "create",
      details: { contractorId, role: "owner", name: data.name, email: data.email },
    }).catch(() => {})

    return c.json({ ok: true, data: staffMember }, 200)
  }
)

// Check if current user is a platform admin
app.get(
  "/platform/check",
  requireSuperAdmin(),
  (c) => {
    return c.json({ ok: true, data: { isPlatformAdmin: true } })
  }
)

// ---------------------------------------------------------------------------
// Platform: Contractor detail + update
// ---------------------------------------------------------------------------

// Get contractor detail with staff list, quote count, customer count
app.get(
  "/platform/contractors/:contractorId",
  requireSuperAdmin(),
  async (c) => {
    const contractorId = c.req.param("contractorId")

    const contractor = await c.env.DB.prepare(
      `SELECT id, slug, name, email, phone, address, website_url, license_number, logo_url, account_disabled
       FROM contractors WHERE id = ?`
    )
      .bind(contractorId)
      .first<{
        id: string
        slug: string
        name: string
        email: string | null
        phone: string | null
        address: string | null
        website_url: string | null
        license_number: string | null
        logo_url: string | null
        account_disabled: number
      }>()

    if (!contractor) {
      return apiError(c, "NOT_FOUND", "Contractor not found")
    }

    const { results: staffRows } = await c.env.DB.prepare(
      `SELECT id, name, email, role, phone, active, created_at, clerk_user_id
       FROM staff WHERE contractor_id = ? ORDER BY role ASC, name ASC`
    )
      .bind(contractorId)
      .all<{
        id: string
        name: string
        email: string
        role: string
        phone: string | null
        active: number
        created_at: string
        clerk_user_id: string | null
      }>()

    const counts = await c.env.DB.prepare(
      `SELECT
         (SELECT COUNT(*) FROM quotes WHERE contractor_id = ? AND deleted_at IS NULL) AS quoteCount,
         (SELECT COUNT(*) FROM customers WHERE contractor_id = ?) AS customerCount`
    )
      .bind(contractorId, contractorId)
      .first<{ quoteCount: number; customerCount: number }>()

    const data = {
      id: contractor.id,
      slug: contractor.slug,
      name: contractor.name,
      email: contractor.email ?? null,
      phone: contractor.phone ?? null,
      address: contractor.address ?? null,
      websiteUrl: contractor.website_url ?? null,
      licenseNumber: contractor.license_number ?? null,
      logoUrl: contractor.logo_url ?? null,
      accountDisabled: contractor.account_disabled === 1,
      quoteCount: counts?.quoteCount ?? 0,
      customerCount: counts?.customerCount ?? 0,
      staff: (staffRows ?? []).map((s) => ({
        id: s.id,
        name: s.name,
        email: s.email,
        role: s.role,
        phone: s.phone ?? null,
        active: s.active === 1,
        createdAt: s.created_at,
        clerkUserId: s.clerk_user_id ?? null,
      })),
    }

    return c.json({ ok: true, data })
  }
)

// Toggle contractor account access (platform admin only)
app.post(
  "/platform/contractors/:contractorId/toggle-access",
  requireSuperAdmin(),
  rateLimit({ limit: 50, windowSeconds: 3600, keyPrefix: "platform-toggle-access" }),
  async (c) => {
    const contractorId = c.req.param("contractorId")

    const existing = await c.env.DB.prepare(
      "SELECT id FROM contractors WHERE id = ?"
    )
      .bind(contractorId)
      .first<{ id: string }>()

    if (!existing) {
      return apiError(c, "NOT_FOUND", "Contractor not found")
    }

    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return apiError(c, "VALIDATION_ERROR", "Invalid JSON in request body")
    }

    const parsed = body as Record<string, unknown>
    if (typeof parsed.disabled !== "boolean") {
      return apiError(c, "VALIDATION_ERROR", "disabled field must be a boolean")
    }

    const accountDisabled = parsed.disabled ? 1 : 0

    await c.env.DB.prepare(
      "UPDATE contractors SET account_disabled = ?, updated_at = datetime('now') WHERE id = ?"
    )
      .bind(accountDisabled, contractorId)
      .run()

    const actorEmail = c.get("superAdminEmail") as string
    await insertAuditEvent(c.env.DB, {
      actorEmail,
      actorType: "super_admin",
      entityType: "contractor",
      entityId: contractorId,
      action: accountDisabled ? "disable" : "enable",
      details: { account_disabled: Boolean(accountDisabled) },
    }).catch(() => {})

    return c.json({ ok: true, data: { account_disabled: Boolean(accountDisabled) } })
  }
)

// Update contractor fields (platform admin only)
app.patch(
  "/platform/contractors/:contractorId",
  requireSuperAdmin(),
  async (c) => {
    const contractorId = c.req.param("contractorId")

    const existing = await c.env.DB.prepare(
      "SELECT id FROM contractors WHERE id = ?"
    )
      .bind(contractorId)
      .first<{ id: string }>()

    if (!existing) {
      return apiError(c, "NOT_FOUND", "Contractor not found")
    }

    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return apiError(c, "VALIDATION_ERROR", "Invalid JSON in request body")
    }

    const result = contractorUpdateSchema.safeParse(body)
    if (!result.success) {
      return c.json(
        {
          ok: false,
          error: "Validation failed",
          code: "VALIDATION_ERROR" as const,
          fields: formatZodErrors(result.error),
        },
        422
      )
    }

    const data = result.data

    // Check slug uniqueness (excluding this contractor)
    if (data.slug) {
      const slugConflict = await c.env.DB.prepare(
        "SELECT id FROM contractors WHERE slug = ? AND id != ?"
      )
        .bind(data.slug, contractorId)
        .first<{ id: string }>()
      if (slugConflict) {
        return c.json(
          {
            ok: false,
            error: "Validation failed",
            code: "VALIDATION_ERROR" as const,
            fields: { slug: "This slug is already in use by another contractor" },
          },
          422
        )
      }
    }

    await c.env.DB.prepare(
      `UPDATE contractors
       SET name = ?, email = ?, phone = ?, address = ?, website_url = ?, license_number = ?,
           slug = ?, updated_at = datetime('now')
       WHERE id = ?`
    )
      .bind(
        data.name,
        data.email || null,
        data.phone || null,
        data.address || null,
        data.websiteUrl || null,
        data.licenseNumber || null,
        data.slug,
        contractorId
      )
      .run()

    const actorEmail = c.get("superAdminEmail") as string
    await insertAuditEvent(c.env.DB, {
      actorEmail,
      actorType: "super_admin",
      entityType: "contractor",
      entityId: contractorId,
      action: "update",
      details: { name: data.name, slug: data.slug, email: data.email || null },
    }).catch(() => {})

    return c.json({ ok: true, data: { updated: true } })
  }
)

// Extended contractor list with staff count and quote count
app.get(
  "/platform/contractors-extended",
  requireSuperAdmin(),
  async (c) => {
    const { results } = await c.env.DB.prepare(
      `SELECT
         c.id, c.slug, c.name, c.email,
         (SELECT COUNT(*) FROM staff s WHERE s.contractor_id = c.id AND s.active = 1) AS staffCount,
         (SELECT COUNT(*) FROM quotes q WHERE q.contractor_id = c.id AND q.deleted_at IS NULL) AS quoteCount
       FROM contractors c
       ORDER BY c.name ASC`
    ).all<{
      id: string
      slug: string
      name: string
      email: string | null
      staffCount: number
      quoteCount: number
    }>()

    const contractors = (results ?? []).map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      email: row.email ?? null,
      staffCount: row.staffCount,
      quoteCount: row.quoteCount,
    }))

    return c.json({ ok: true, data: contractors })
  }
)

// Create a new contractor
app.post(
  "/platform/contractors",
  requireSuperAdmin(),
  rateLimit({ limit: 20, windowSeconds: 3600, keyPrefix: "platform-contractor-create" }),
  async (c) => {
    let body: Record<string, unknown>
    try {
      body = await c.req.json()
    } catch {
      return apiError(c, "VALIDATION_ERROR", "Invalid JSON")
    }

    const name = (body.name as string)?.trim()
    const slug = (body.slug as string)?.trim()?.toLowerCase()?.replace(/[^a-z0-9-]/g, "")

    if (!name || !slug) {
      return apiError(c, "VALIDATION_ERROR", "Name and slug are required")
    }

    // Check slug uniqueness
    const existing = await c.env.DB.prepare(
      "SELECT id FROM contractors WHERE slug = ?"
    ).bind(slug).first()

    if (existing) {
      return c.json(
        { ok: false, error: "A contractor with this slug already exists", code: "VALIDATION_ERROR" as const },
        422
      )
    }

    const id = crypto.randomUUID()
    await c.env.DB.prepare(
      `INSERT INTO contractors (id, slug, name, email, phone, address)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(
      id,
      slug,
      name,
      (body.email as string)?.trim() ?? null,
      (body.phone as string)?.trim() ?? null,
      (body.address as string)?.trim() ?? null,
    ).run()

    const actorEmail = c.get("superAdminEmail") as string
    await insertAuditEvent(c.env.DB, {
      actorEmail,
      actorType: "super_admin",
      entityType: "contractor",
      entityId: id,
      action: "create",
      details: { name, slug },
    }).catch(() => {})

    return c.json({ ok: true, data: { id, slug, name } }, 201)
  }
)

// ---------------------------------------------------------------------------
// Platform: Super user management (legacy /platform/superusers — kept for UI compat)
// ---------------------------------------------------------------------------

// List all super users
app.get(
  "/platform/superusers",
  requireSuperAdmin(),
  async (c) => {
    const { results } = await c.env.DB.prepare(
      "SELECT id, email, name, created_at FROM super_users ORDER BY name ASC"
    ).all<{ id: string; email: string; name: string; created_at: string }>()

    const superUsers = (results ?? []).map((r) => ({
      id: r.id,
      email: r.email,
      name: r.name,
      createdAt: r.created_at,
    }))

    return c.json({ ok: true, data: superUsers })
  }
)

// Add a super user
app.post(
  "/platform/superusers",
  requireSuperAdmin(),
  rateLimit({ limit: 20, windowSeconds: 3600, keyPrefix: "platform-superuser-create" }),
  async (c) => {
    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return apiError(c, "VALIDATION_ERROR", "Invalid JSON in request body")
    }

    const result = superUserCreateSchema.safeParse(body)
    if (!result.success) {
      return c.json(
        {
          ok: false,
          error: "Validation failed",
          code: "VALIDATION_ERROR" as const,
          fields: formatZodErrors(result.error),
        },
        422
      )
    }

    const { email, name } = result.data
    const normalizedEmail = email.toLowerCase()

    const existing = await c.env.DB.prepare(
      "SELECT id FROM super_users WHERE email = ?"
    )
      .bind(normalizedEmail)
      .first<{ id: string }>()

    if (existing) {
      return c.json(
        {
          ok: false,
          error: "Validation failed",
          code: "VALIDATION_ERROR" as const,
          fields: { email: "This email is already a super user" },
        },
        422
      )
    }

    const id = crypto.randomUUID()
    await c.env.DB.prepare(
      "INSERT INTO super_users (id, email, name) VALUES (?, ?, ?)"
    )
      .bind(id, normalizedEmail, name)
      .run()

    const actorEmailPlatform = c.get("superAdminEmail") as string
    await insertAuditEvent(c.env.DB, {
      actorEmail: actorEmailPlatform,
      actorType: "super_admin",
      entityType: "super_user",
      entityId: id,
      action: "create",
      details: { email: normalizedEmail, name },
    }).catch(() => {})

    return c.json({ ok: true, data: { id, email: normalizedEmail, name, createdAt: new Date().toISOString() } }, 201)
  }
)

// Delete a super user (cannot delete self)
app.delete(
  "/platform/superusers/:id",
  requireSuperAdmin(),
  async (c) => {
    const id = c.req.param("id")
    const callerEmail = c.get("superAdminEmail") as string

    const target = await c.env.DB.prepare(
      "SELECT id, email FROM super_users WHERE id = ?"
    )
      .bind(id)
      .first<{ id: string; email: string }>()

    if (!target) {
      return apiError(c, "NOT_FOUND", "Super user not found")
    }

    if (target.email.toLowerCase() === callerEmail.toLowerCase()) {
      return apiError(c, "FORBIDDEN", "You cannot remove yourself as a super user")
    }

    await c.env.DB.prepare(
      "DELETE FROM super_users WHERE id = ?"
    )
      .bind(id)
      .run()

    await insertAuditEvent(c.env.DB, {
      actorEmail: callerEmail,
      actorType: "super_admin",
      entityType: "super_user",
      entityId: id,
      action: "delete",
      details: { email: target.email },
    }).catch(() => {})

    return c.json({ ok: true, data: { deleted: true } })
  }
)

// ---------------------------------------------------------------------------
// Super admin routes (/super/*)
// ---------------------------------------------------------------------------

// Check if current user is a super admin
app.get(
  "/super/check",
  requireSuperAdmin(),
  (c) => {
    return c.json({ ok: true })
  }
)

// List all super users
app.get(
  "/super/users",
  requireSuperAdmin(),
  async (c) => {
    const { results } = await c.env.DB.prepare(
      "SELECT id, email, name, created_at FROM super_users ORDER BY name ASC"
    ).all<{ id: string; email: string; name: string; created_at: string }>()

    const superUsers = (results ?? []).map((r) => ({
      id: r.id,
      email: r.email,
      name: r.name,
      createdAt: r.created_at,
    }))

    return c.json({ ok: true, data: superUsers })
  }
)

// Add a super user
app.post(
  "/super/users",
  requireSuperAdmin(),
  rateLimit({ limit: 20, windowSeconds: 3600, keyPrefix: "super-users-create" }),
  async (c) => {
    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return apiError(c, "VALIDATION_ERROR", "Invalid JSON in request body")
    }

    const result = superUserCreateSchema.safeParse(body)
    if (!result.success) {
      return c.json(
        {
          ok: false,
          error: "Validation failed",
          code: "VALIDATION_ERROR" as const,
          fields: formatZodErrors(result.error),
        },
        422
      )
    }

    const { email, name } = result.data
    const normalizedEmail = email.toLowerCase()

    const existing = await c.env.DB.prepare(
      "SELECT id FROM super_users WHERE email = ?"
    )
      .bind(normalizedEmail)
      .first<{ id: string }>()

    if (existing) {
      return c.json(
        {
          ok: false,
          error: "Validation failed",
          code: "VALIDATION_ERROR" as const,
          fields: { email: "This email is already a super user" },
        },
        422
      )
    }

    const id = crypto.randomUUID()
    await c.env.DB.prepare(
      "INSERT INTO super_users (id, email, name) VALUES (?, ?, ?)"
    )
      .bind(id, normalizedEmail, name)
      .run()

    const actorEmailSuper = c.get("superAdminEmail") as string
    await insertAuditEvent(c.env.DB, {
      actorEmail: actorEmailSuper,
      actorType: "super_admin",
      entityType: "super_user",
      entityId: id,
      action: "create",
      details: { email: normalizedEmail, name },
    }).catch(() => {})

    return c.json({ ok: true, data: { id, email: normalizedEmail, name, createdAt: new Date().toISOString() } }, 201)
  }
)

// Delete a super user (cannot delete self)
app.delete(
  "/super/users/:id",
  requireSuperAdmin(),
  async (c) => {
    const id = c.req.param("id")
    const callerEmail = c.get("superAdminEmail") as string

    const target = await c.env.DB.prepare(
      "SELECT id, email FROM super_users WHERE id = ?"
    )
      .bind(id)
      .first<{ id: string; email: string }>()

    if (!target) {
      return apiError(c, "NOT_FOUND", "Super user not found")
    }

    if (target.email.toLowerCase() === callerEmail.toLowerCase()) {
      return apiError(c, "FORBIDDEN", "You cannot remove yourself as a super user")
    }

    await c.env.DB.prepare(
      "DELETE FROM super_users WHERE id = ?"
    )
      .bind(id)
      .run()

    await insertAuditEvent(c.env.DB, {
      actorEmail: callerEmail,
      actorType: "super_admin",
      entityType: "super_user",
      entityId: id,
      action: "delete",
      details: { email: target.email },
    }).catch(() => {})

    return c.json({ ok: true, data: { deleted: true } })
  }
)

// ---------------------------------------------------------------------------
// Audit log (super admin only)
// ---------------------------------------------------------------------------
app.get(
  "/audit-log",
  requireSuperAdmin(),
  async (c) => {
    const entityType = c.req.query("entityType")
    const dateFrom = c.req.query("dateFrom")
    const dateTo = c.req.query("dateTo")
    const pageStr = c.req.query("page") ?? "1"
    const page = Math.max(1, parseInt(pageStr, 10) || 1)
    const limit = 50
    const offset = (page - 1) * limit

    const conditions: string[] = []
    const binds: unknown[] = []

    if (entityType && ["staff", "contractor", "super_user"].includes(entityType)) {
      conditions.push("entity_type = ?")
      binds.push(entityType)
    }
    if (dateFrom) {
      conditions.push("created_at >= ?")
      binds.push(dateFrom)
    }
    if (dateTo) {
      conditions.push("created_at <= ?")
      binds.push(dateTo)
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""

    const { results } = await c.env.DB.prepare(
      `SELECT id, actor_email, actor_type, entity_type, entity_id, action, details, created_at
       FROM audit_events ${where}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`
    )
      .bind(...binds, limit, offset)
      .all<{
        id: string
        actor_email: string
        actor_type: string
        entity_type: string
        entity_id: string
        action: string
        details: string | null
        created_at: string
      }>()

    const countRow = await c.env.DB.prepare(
      `SELECT COUNT(*) AS total FROM audit_events ${where}`
    )
      .bind(...binds)
      .first<{ total: number }>()

    const events = (results ?? []).map((r) => ({
      id: r.id,
      actorEmail: r.actor_email,
      actorType: r.actor_type,
      entityType: r.entity_type,
      entityId: r.entity_id,
      action: r.action,
      details: r.details ? JSON.parse(r.details) : null,
      createdAt: r.created_at,
    }))

    return c.json({
      ok: true,
      data: {
        events,
        total: countRow?.total ?? 0,
        page,
        limit,
      },
    })
  }
)

// ---------------------------------------------------------------------------
// Paddle webhook — public endpoint (no auth)
// ---------------------------------------------------------------------------

type PaddleEventData = {
  id: string
  customer_id?: string
  subscription_id?: string
}

type PaddleEvent = {
  event_type: string
  data: PaddleEventData
}

async function verifyPaddleSignature(
  rawBody: string,
  signatureHeader: string,
  secret: string
): Promise<boolean> {
  // Paddle-Signature: ts=<timestamp>;h1=<hex-hash>
  const parts: Record<string, string> = {}
  for (const part of signatureHeader.split(";")) {
    const idx = part.indexOf("=")
    if (idx !== -1) parts[part.slice(0, idx)] = part.slice(idx + 1)
  }
  const ts = parts["ts"]
  const h1 = parts["h1"]
  if (!ts || !h1) return false

  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  )
  const signedPayload = `${ts}:${rawBody}`
  const sigBytes = await crypto.subtle.sign("HMAC", key, encoder.encode(signedPayload))
  const computed = Array.from(new Uint8Array(sigBytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")

  return computed === h1
}

const PADDLE_KNOWN_EVENTS = new Set([
  "subscription.activated",
  "subscription.past_due",
  "subscription.canceled",
  "transaction.completed",
  "transaction.payment_failed",
])

app.post("/webhooks/paddle", billingEnabled(), async (c) => {
  const rawBody = await c.req.text()

  const signatureHeader = c.req.header("paddle-signature") ?? ""
  const secret = c.env.PADDLE_WEBHOOK_SECRET

  if (!secret || !signatureHeader) {
    return c.json({ ok: false, error: "Invalid signature" }, 400)
  }

  const valid = await verifyPaddleSignature(rawBody, signatureHeader, secret)
  if (!valid) {
    return c.json({ ok: false, error: "Invalid signature" }, 400)
  }

  let event: PaddleEvent
  try {
    event = JSON.parse(rawBody) as PaddleEvent
  } catch {
    return c.json({ ok: false, error: "Invalid payload" }, 400)
  }

  const { event_type, data } = event

  // Return 200 for unknown events — Paddle expects 200 for all acknowledged events
  if (!PADDLE_KNOWN_EVENTS.has(event_type)) {
    return c.json({ ok: true })
  }

  // For subscription events data.id is the subscription ID; for transaction events it's data.subscription_id
  const customerId = data.customer_id ?? null
  const subscriptionId = event_type.startsWith("subscription.")
    ? data.id
    : (data.subscription_id ?? null)

  if (!customerId && !subscriptionId) {
    return c.json({ ok: true })
  }

  const contractor = await c.env.DB.prepare(
    `SELECT id, email, name, billing_status, grace_period_ends_at
     FROM contractors
     WHERE (paddle_customer_id = ? AND paddle_customer_id IS NOT NULL)
        OR (paddle_subscription_id = ? AND paddle_subscription_id IS NOT NULL)
     LIMIT 1`
  )
    .bind(customerId, subscriptionId)
    .first<{ id: string; email: string | null; name: string; billing_status: string; grace_period_ends_at: string | null }>()

  if (!contractor) {
    return c.json({ ok: true })
  }

  if (event_type === "subscription.activated" || event_type === "transaction.completed") {
    if (contractor.billing_status !== "active" || contractor.grace_period_ends_at !== null) {
      await c.env.DB.prepare(
        `UPDATE contractors SET billing_status = 'active', grace_period_ends_at = NULL, updated_at = datetime('now') WHERE id = ?`
      )
        .bind(contractor.id)
        .run()
    }
  } else if (event_type === "subscription.past_due") {
    if (contractor.billing_status !== "past_due") {
      await c.env.DB.prepare(
        `UPDATE contractors SET billing_status = 'past_due', grace_period_ends_at = datetime('now', '+5 days'), updated_at = datetime('now') WHERE id = ?`
      )
        .bind(contractor.id)
        .run()
    }
  } else if (event_type === "subscription.canceled") {
    if (contractor.billing_status !== "canceled") {
      await c.env.DB.prepare(
        `UPDATE contractors SET billing_status = 'canceled', updated_at = datetime('now') WHERE id = ?`
      )
        .bind(contractor.id)
        .run()
    }
  } else if (event_type === "transaction.payment_failed") {
    if (contractor.grace_period_ends_at === null) {
      await c.env.DB.prepare(
        `UPDATE contractors SET grace_period_ends_at = datetime('now', '+5 days'), updated_at = datetime('now') WHERE id = ?`
      )
        .bind(contractor.id)
        .run()
    } else {
      const graceEnd = new Date(
        contractor.grace_period_ends_at.includes("T")
          ? contractor.grace_period_ends_at
          : contractor.grace_period_ends_at.replace(" ", "T") + "Z"
      )
      if (graceEnd < new Date()) {
        await c.env.DB.prepare(
          `UPDATE contractors SET billing_status = 'suspended', updated_at = datetime('now') WHERE id = ?`
        )
          .bind(contractor.id)
          .run()
      }
    }

    if (contractor.email) {
      await sendPaymentFailedNotification(
        { contractorEmail: contractor.email, contractorName: contractor.name },
        c.env.SENDGRID_API_KEY,
        c.env.NOTIFICATION_FROM_EMAIL,
        c.env.APP_BASE_URL
      )
    }
  }

  return c.json({ ok: true })
})

// ---------------------------------------------------------------------------
// Billing — Paddle backend endpoints
// ---------------------------------------------------------------------------

function paddleBase(env: Bindings): string {
  return env.PADDLE_ENVIRONMENT === "sandbox"
    ? "https://sandbox-api.paddle.com"
    : "https://api.paddle.com"
}

// GET /contractors/:contractorId/billing
app.get(
  "/contractors/:contractorId/billing",
  billingEnabled(),
  requireAuth(),
  requireContractorOwnership(),
  requireStaffRole(["owner", "admin"]),
  async (c) => {
    const contractorId = c.req.param("contractorId")
    const row = await c.env.DB.prepare(
      `SELECT billing_status, monthly_rate_cents, next_billing_date,
              paddle_customer_id, grace_period_ends_at
       FROM contractors WHERE id = ?`
    )
      .bind(contractorId)
      .first<{
        billing_status: string
        monthly_rate_cents: number | null
        next_billing_date: string | null
        paddle_customer_id: string | null
        grace_period_ends_at: string | null
      }>()

    if (!row) {
      return apiError(c, "NOT_FOUND", "Contractor not found")
    }

    const maskedCustomerId = row.paddle_customer_id
      ? `***${row.paddle_customer_id.slice(-8)}`
      : null

    return c.json({
      ok: true,
      data: {
        billingStatus: row.billing_status,
        monthlyRateCents: row.monthly_rate_cents,
        nextBillingDate: row.next_billing_date,
        paddleCustomerId: maskedCustomerId,
        gracePeriodEndsAt: row.grace_period_ends_at,
      },
    })
  }
)

// POST /contractors/:contractorId/billing/setup
app.post(
  "/contractors/:contractorId/billing/setup",
  billingEnabled(),
  requireAuth(),
  requireContractorOwnership(),
  requireStaffRole(["owner", "admin"]),
  async (c) => {
    if (!c.env.PADDLE_API_KEY) {
      return apiError(c, "INTERNAL_ERROR", "Billing not configured")
    }

    const contractorId = c.req.param("contractorId")
    const contractor = await c.env.DB.prepare(
      "SELECT name, email, paddle_customer_id FROM contractors WHERE id = ?"
    )
      .bind(contractorId)
      .first<{ name: string; email: string | null; paddle_customer_id: string | null }>()

    if (!contractor) {
      return apiError(c, "NOT_FOUND", "Contractor not found")
    }

    const base = paddleBase(c.env)
    let paddleCustomerId = contractor.paddle_customer_id

    if (!paddleCustomerId) {
      const customerRes = await fetch(`${base}/customers`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${c.env.PADDLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: contractor.email ?? undefined,
          name: contractor.name,
        }),
      })

      if (!customerRes.ok) {
        console.error("Paddle create customer failed:", customerRes.status, await customerRes.text())
        return apiError(c, "INTERNAL_ERROR", "Failed to create billing customer")
      }

      const customerData = (await customerRes.json()) as { data: { id: string } }
      paddleCustomerId = customerData.data.id

      await c.env.DB.prepare(
        "UPDATE contractors SET paddle_customer_id = ? WHERE id = ?"
      )
        .bind(paddleCustomerId, contractorId)
        .run()
    }

    const anchor = new Date().toISOString().slice(0, 10)
    const subRes = await fetch(`${base}/subscriptions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${c.env.PADDLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        customer_id: paddleCustomerId,
        billing_cycle_anchor: anchor,
        collection_mode: "automatic",
      }),
    })

    if (!subRes.ok) {
      console.error("Paddle create subscription failed:", subRes.status, await subRes.text())
      return apiError(c, "INTERNAL_ERROR", "Failed to create billing subscription")
    }

    const subData = (await subRes.json()) as {
      data: { id: string; management?: { payment_method_update_url?: string } }
    }
    const subscriptionId = subData.data.id
    const checkoutUrl = subData.data.management?.payment_method_update_url ?? null

    await c.env.DB.prepare(
      "UPDATE contractors SET paddle_subscription_id = ?, billing_status = 'active' WHERE id = ?"
    )
      .bind(subscriptionId, contractorId)
      .run()

    return c.json({ ok: true, data: { checkoutUrl } })
  }
)

// POST /contractors/:contractorId/billing/portal
app.post(
  "/contractors/:contractorId/billing/portal",
  billingEnabled(),
  requireAuth(),
  requireContractorOwnership(),
  requireStaffRole(["owner", "admin"]),
  async (c) => {
    if (!c.env.PADDLE_API_KEY) {
      return apiError(c, "INTERNAL_ERROR", "Billing not configured")
    }

    const contractorId = c.req.param("contractorId")
    const contractor = await c.env.DB.prepare(
      "SELECT paddle_customer_id FROM contractors WHERE id = ?"
    )
      .bind(contractorId)
      .first<{ paddle_customer_id: string | null }>()

    if (!contractor) {
      return apiError(c, "NOT_FOUND", "Contractor not found")
    }

    if (!contractor.paddle_customer_id) {
      return apiError(c, "VALIDATION_ERROR", "No billing account found — set up billing first")
    }

    const base = paddleBase(c.env)
    const portalRes = await fetch(
      `${base}/customers/${contractor.paddle_customer_id}/portal-sessions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${c.env.PADDLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      }
    )

    if (!portalRes.ok) {
      console.error("Paddle portal session failed:", portalRes.status, await portalRes.text())
      return apiError(c, "INTERNAL_ERROR", "Failed to create billing portal session")
    }

    const portalData = (await portalRes.json()) as {
      data: { urls: { general: { overview: string } } }
    }
    const portalUrl = portalData.data.urls.general.overview

    return c.json({ ok: true, data: { portalUrl } })
  }
)

// DELETE /contractors/:contractorId/billing/cancel
app.delete(
  "/contractors/:contractorId/billing/cancel",
  billingEnabled(),
  requireAuth(),
  requireContractorOwnership(),
  requireStaffRole(["owner"]),
  async (c) => {
    if (!c.env.PADDLE_API_KEY) {
      return apiError(c, "INTERNAL_ERROR", "Billing not configured")
    }

    const contractorId = c.req.param("contractorId")
    const contractor = await c.env.DB.prepare(
      "SELECT paddle_subscription_id FROM contractors WHERE id = ?"
    )
      .bind(contractorId)
      .first<{ paddle_subscription_id: string | null }>()

    if (!contractor) {
      return apiError(c, "NOT_FOUND", "Contractor not found")
    }

    if (!contractor.paddle_subscription_id) {
      return apiError(c, "VALIDATION_ERROR", "No active subscription found")
    }

    const base = paddleBase(c.env)
    const cancelRes = await fetch(
      `${base}/subscriptions/${contractor.paddle_subscription_id}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${c.env.PADDLE_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    )

    if (!cancelRes.ok) {
      console.error("Paddle cancel subscription failed:", cancelRes.status, await cancelRes.text())
      return apiError(c, "INTERNAL_ERROR", "Failed to cancel subscription")
    }

    await c.env.DB.prepare(
      "UPDATE contractors SET billing_status = 'canceled' WHERE id = ?"
    )
      .bind(contractorId)
      .run()

    return c.json({ ok: true, data: { canceled: true } })
  }
)

// ---------------------------------------------------------------------------
// Required secrets — must be present in all non-development environments.
// Validated on every request so any request to an unconfigured Worker fails
// immediately with a clear error rather than a cryptic failure deep in a handler.
// ---------------------------------------------------------------------------
const REQUIRED_SECRETS = [
  "TOKEN_SIGNING_SECRET",
  "SENDGRID_API_KEY",
  "TURNSTILE_SECRET_KEY",
  "CLERK_JWKS_URL",
] as const

export default {
  async fetch(request: Request, env: Bindings, ctx: ExecutionContext): Promise<Response> {
    if (env.ENVIRONMENT !== "development") {
      const missing = REQUIRED_SECRETS.filter((key) => !env[key])
      if (missing.length > 0) {
        const msg = `Worker startup failed: missing required env vars: ${missing.join(", ")}`
        console.error(msg)
        return new Response(JSON.stringify({ ok: false, error: msg }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        })
      }
    }

    // Warn if dev-mode security bypasses are active in a non-local deployment.
    // ENVIRONMENT=development disables JWT signature verification and enables the
    // x-super-admin-email bypass — safe locally, dangerous if set on a real Worker.
    if (env.ENVIRONMENT === "development") {
      const { hostname } = new URL(request.url)
      if (hostname !== "localhost" && hostname !== "127.0.0.1") {
        console.error(
          `SECURITY WARNING: ENVIRONMENT=development is set but Worker is serving requests at "${hostname}". ` +
            "Dev-mode security bypasses are active (JWT signature verification skipped, " +
            "x-super-admin-email header accepted). " +
            "Set ENVIRONMENT=production for non-local deployments."
        )
      }
    }

    return app.fetch(request, env, ctx)
  },
}
