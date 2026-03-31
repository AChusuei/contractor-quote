import { Hono } from "hono"
import { cors } from "hono/cors"
import type { ApiOk } from "@contractor-quote/types"
import { apiError } from "./lib/errors"
import {
  requireAuth,
  requireContractorOwnership,
  requireQuoteOwnership,
} from "./middleware/tenantIsolation"
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
  formatZodErrors,
  MAX_PAYLOAD_BYTES,
  QUOTE_STATUSES,
  STATUS_TRANSITIONS,
  type QuoteStatus,
} from "./validation"
import { rateLimit } from "./middleware/rateLimit"
import { sendNewQuoteNotification } from "./lib/email"
import { verifyTurnstileToken } from "./lib/turnstile"

// ---------------------------------------------------------------------------
// Bindings — mirrors wrangler.toml
// ---------------------------------------------------------------------------
type Bindings = {
  DB: D1Database
  STORAGE: R2Bucket
  KV: KVNamespace
  ENVIRONMENT: string
  CORS_ORIGINS: string
  // Secrets (set via `wrangler secret put`)
  HUBSPOT_ACCESS_TOKEN: string
  TOKEN_SIGNING_SECRET: string
  SENDGRID_API_KEY: string
  TURNSTILE_SECRET_KEY: string
}

type Variables = {
  contractorId: string
}

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>().basePath("/api/v1")

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
      logoUrl: contractor.logo_url,
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
    "SELECT id, slug, name, email, phone, address, website_url, license_number, logo_url, calendar_url FROM contractors WHERE id = ?"
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
      logoUrl: contractor.logo_url,
      calendarUrl: contractor.calendar_url,
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

  // --- Verify Turnstile token (when secret key is configured) ---
  if (c.env.TURNSTILE_SECRET_KEY) {
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
    const quoteId = c.req.param("quoteId")

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
      "SELECT id, contractor_id, customer_id, status, public_token FROM quotes WHERE id = ?"
    )
      .bind(quoteId)
      .first<{ id: string; contractor_id: string; customer_id: string; status: string; public_token: string }>()

    if (!quote) {
      return apiError(c, "NOT_FOUND", "Quote not found")
    }

    if (quote.public_token !== data.publicToken) {
      return apiError(c, "FORBIDDEN", "Invalid token")
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
              c.env.SENDGRID_API_KEY
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
              q.status, q.created_at
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
    }

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

    // --- Log activity ---
    await c.env.DB.prepare(
      `INSERT INTO quote_activity (quote_id, contractor_id, type, content)
       VALUES (?, ?, 'quote_edited', ?)`
    )
      .bind(quoteId, contractorId, JSON.stringify(Object.keys(data)))
      .run()

    // --- Fetch and return updated quote ---
    const updated = await c.env.DB.prepare(
      `SELECT q.id, q.contractor_id, q.schema_version,
              c.name, c.email, c.phone, c.cell,
              q.job_site_address, q.property_type, q.budget_range,
              c.how_did_you_find_us, c.referred_by_contractor,
              q.scope, q.public_token, q.status, q.created_at
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
    let quote: { id: string; contractor_id: string; public_token: string } | null

    if (publicToken) {
      quote = await c.env.DB.prepare(
        "SELECT id, contractor_id, public_token FROM quotes WHERE id = ? AND public_token = ?"
      )
        .bind(quoteId, publicToken)
        .first()
      if (!quote) {
        return apiError(c, "NOT_FOUND", "Quote not found")
      }
    } else {
      // Fall back to Clerk auth + ownership check
      const authMw = requireAuth()
      const ownerMw = requireQuoteOwnership()
      const authResult = await authMw(c, async () => {})
      if (authResult) return authResult
      const ownerResult = await ownerMw(c, async () => {})
      if (ownerResult) return ownerResult

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
      `INSERT INTO quote_activity (quote_id, contractor_id, type, content)
       VALUES (?, ?, 'photo_added', ?)`
    )
      .bind(quoteId, quote.contractor_id, photoId)
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
        "SELECT id FROM quotes WHERE id = ? AND public_token = ?"
      )
        .bind(quoteId, publicToken)
        .first()
      if (!quote) {
        return apiError(c, "NOT_FOUND", "Quote not found")
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
        "SELECT id FROM quotes WHERE id = ? AND public_token = ?"
      )
        .bind(quoteId, publicToken)
        .first()
      if (!quote) {
        return apiError(c, "NOT_FOUND", "Quote not found")
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

    const q = c.req.query("q")
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

    if (publicToken) {
      const quote = await c.env.DB.prepare(
        "SELECT id, contractor_id FROM quotes WHERE id = ? AND public_token = ?"
      )
        .bind(quoteId, publicToken)
        .first<{ id: string; contractor_id: string }>()
      if (!quote) {
        return apiError(c, "NOT_FOUND", "Quote not found")
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
      `INSERT INTO quote_activity (quote_id, contractor_id, type, content)
       VALUES (?, ?, 'photo_removed', ?)`
    )
      .bind(quoteId, contractorId, photoId)
      .run()

    return c.body(null, 204)
  }
)

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

    // --- Build the public URL ---
    // In production this would be a custom domain or R2 public bucket URL.
    // For now, store the R2 key as the logo_url value.
    const logoUrl = r2Key

    // --- Update D1 ---
    await c.env.DB.prepare(
      "UPDATE contractors SET logo_url = ? WHERE id = ?"
    )
      .bind(logoUrl, contractorId)
      .run()

    return c.json({ ok: true, data: { logoUrl } })
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
      `INSERT INTO quote_activity (quote_id, contractor_id, type, content, old_value, new_value)
       VALUES (?, ?, ?, ?, ?, ?)
       RETURNING id, quote_id, contractor_id, staff_id, type, content, old_value, new_value, created_at`
    )
      .bind(
        quoteId,
        contractorId,
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
    const { results } = await c.env.DB.prepare(
      `SELECT id, quote_id, contractor_id, staff_id, type, content,
              old_value, new_value, created_at
       FROM quote_activity
       WHERE quote_id = ?
       ORDER BY created_at ASC, id ASC
       LIMIT ? OFFSET ?`
    )
      .bind(quoteId, limit, offset)
      .all()

    const activities = (results ?? []).map((row: Record<string, unknown>) => ({
      id: row.id,
      quoteId: row.quote_id,
      contractorId: row.contractor_id,
      staffId: row.staff_id ?? null,
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
       FROM customers WHERE id = ?`
    )
      .bind(customerId)
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
// Delete customer data (by customer ID — moves logic from email-based delete)
// ---------------------------------------------------------------------------
app.delete(
  "/customers/:customerId",
  requireAuth(),
  rateLimit({ limit: 20, windowSeconds: 3600, keyPrefix: "customer-delete" }),
  async (c) => {
    const contractorId = c.get("contractorId") as string
    const customerId = c.req.param("customerId")

    // Verify customer belongs to this contractor
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

    // Find all quotes for this customer
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

      // Delete photos from R2
      const { results: photos } = await c.env.DB.prepare(
        `SELECT storage_key FROM photos WHERE quote_id IN (${placeholders}) AND contractor_id = ?`
      )
        .bind(...quoteIds, contractorId)
        .all<{ storage_key: string }>()

      for (const photo of photos) {
        await c.env.STORAGE.delete(photo.storage_key)
        photosDeleted++
      }

      // Delete DB records
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

    // Delete the customer record
    await c.env.DB.prepare(
      "DELETE FROM customers WHERE id = ? AND contractor_id = ?"
    )
      .bind(customerId, contractorId)
      .run()

    // Hash email for audit log
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
      .bind(
        contractorId,
        requestType,
        contractorId,
        emailHash,
        quotesDeleted,
        photosDeleted,
        appointmentsDeleted,
        activityDeleted
      )
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
        `INSERT INTO quote_activity (quote_id, contractor_id, type, content)
         VALUES (?, ?, 'email_sent', ?)`
      )
        .bind(quote.id, contractorId, resolvedSubject)
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

    // Verify staff belongs to this contractor
    const existing = await c.env.DB.prepare(
      "SELECT id FROM staff WHERE id = ? AND contractor_id = ?"
    )
      .bind(staffId, contractorId)
      .first<{ id: string }>()

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
        try {
          const payload = JSON.parse(atob(authHeader.slice(7).split(".")[1]))
          clerkUserId = payload.sub ?? null
        } catch {
          // Fall through — dev mode uses x-contractor-id
        }
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

    return c.json({ ok: true, data: staffMember })
  }
)

export default app
