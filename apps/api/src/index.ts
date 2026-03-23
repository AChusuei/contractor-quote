import { Hono } from "hono"
import { cors } from "hono/cors"
import type { AppointmentSlot, ApiOk } from "@contractor-quote/types"
import { apiError } from "./lib/errors"
import {
  requireAuth,
  requireContractorOwnership,
  requireQuoteOwnership,
} from "./middleware/tenantIsolation"
import {
  quoteSubmissionSchema,
  quoteUpdateSchema,
  formatZodErrors,
  MAX_PAYLOAD_BYTES,
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
  TOKENS: KVNamespace
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
    "SELECT id, name, email FROM contractors WHERE id = ?"
  )
    .bind(data.contractorId)
    .first<{ id: string; name: string; email: string | null }>()

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

  // --- Insert into D1 ---
  await c.env.DB.prepare(
    `INSERT INTO quotes (
      id, contractor_id, schema_version,
      name, email, phone, cell,
      job_site_address, property_type, budget_range,
      how_did_you_find_us, referred_by_contractor,
      scope, quote_path, photo_session_id, public_token, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'lead')`
  )
    .bind(
      quoteId,
      data.contractorId,
      data.schemaVersion,
      data.name,
      data.email,
      data.phone,
      data.cell ?? null,
      data.jobSiteAddress,
      data.propertyType,
      data.budgetRange,
      data.howDidYouFindUs ?? null,
      data.referredByContractor ?? null,
      data.scope ? JSON.stringify(data.scope) : null,
      data.quotePath ?? null,
      data.photoSessionId ?? null,
      publicToken
    )
    .run()

  // --- Log activity ---
  await c.env.DB.prepare(
    `INSERT INTO quote_activity (quote_id, contractor_id, type, new_value)
     VALUES (?, ?, 'status_change', 'lead')`
  )
    .bind(quoteId, data.contractorId)
    .run()

  // --- Send email notification to contractor (fire-and-forget) ---
  if (contractor.email) {
    c.executionCtx.waitUntil(
      sendNewQuoteNotification(
        {
          contractorEmail: contractor.email,
          contractorName: contractor.name,
          customerName: data.name,
          jobSiteAddress: data.jobSiteAddress,
          budgetRange: data.budgetRange,
          quoteId,
        },
        c.env.SENDGRID_API_KEY
      ).catch((err) => {
        console.error("Failed to send quote notification email:", err)
      })
    )
  }

  const res: ApiOk<{ id: string; publicToken: string }> = {
    ok: true,
    data: { id: quoteId, publicToken },
  }
  return c.json(res, 201)
})

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
      `SELECT id, contractor_id, schema_version,
              name, email, phone, cell,
              job_site_address, property_type, budget_range,
              how_did_you_find_us, referred_by_contractor,
              scope, quote_path, photo_session_id, public_token,
              status, created_at
       FROM quotes WHERE id = ?`
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
      quotePath: row.quote_path ?? null,
      photoSessionId: row.photo_session_id ?? null,
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

    // --- Build dynamic UPDATE query ---
    const fieldMap: Record<string, { column: string; value: unknown }> = {
      name: { column: "name", value: data.name },
      email: { column: "email", value: data.email },
      phone: { column: "phone", value: data.phone },
      cell: { column: "cell", value: data.cell },
      jobSiteAddress: { column: "job_site_address", value: data.jobSiteAddress },
      propertyType: { column: "property_type", value: data.propertyType },
      budgetRange: { column: "budget_range", value: data.budgetRange },
      howDidYouFindUs: { column: "how_did_you_find_us", value: data.howDidYouFindUs },
      referredByContractor: { column: "referred_by_contractor", value: data.referredByContractor },
      scope: { column: "scope", value: data.scope !== undefined ? JSON.stringify(data.scope) : undefined },
      quotePath: { column: "quote_path", value: data.quotePath },
      photoSessionId: { column: "photo_session_id", value: data.photoSessionId },
    }

    const setClauses: string[] = []
    const bindValues: unknown[] = []

    for (const [key, mapping] of Object.entries(fieldMap)) {
      if (key in data) {
        setClauses.push(`${mapping.column} = ?`)
        bindValues.push(mapping.value ?? null)
      }
    }

    // Update the quote
    bindValues.push(quoteId)
    await c.env.DB.prepare(
      `UPDATE quotes SET ${setClauses.join(", ")} WHERE id = ?`
    )
      .bind(...bindValues)
      .run()

    // --- Log activity ---
    await c.env.DB.prepare(
      `INSERT INTO quote_activity (quote_id, contractor_id, type, content)
       VALUES (?, ?, 'quote_edited', ?)`
    )
      .bind(quoteId, contractorId, JSON.stringify(Object.keys(data)))
      .run()

    // --- Fetch and return updated quote ---
    const updated = await c.env.DB.prepare(
      `SELECT id, contractor_id, schema_version,
              name, email, phone, cell,
              job_site_address, property_type, budget_range,
              how_did_you_find_us, referred_by_contractor,
              scope, quote_path, photo_session_id,
              public_token, status, created_at
       FROM quotes WHERE id = ?`
    )
      .bind(quoteId)
      .first()

    return c.json({ ok: true, data: updated })
  }
)

// ---------------------------------------------------------------------------
// Photo upload
// ---------------------------------------------------------------------------
app.post(
  "/quotes/:quoteId/photos",
  rateLimit({ limit: 20, windowSeconds: 3600, keyPrefix: "photo-upload" }),
  async (c) => {
    const quoteId = c.req.param("quoteId")

    // Verify the quote exists
    const quote = await c.env.DB.prepare(
      "SELECT id FROM quotes WHERE id = ?"
    )
      .bind(quoteId)
      .first<{ id: string }>()

    if (!quote) {
      return apiError(c, "NOT_FOUND", "Quote not found")
    }

    // TODO: implement actual photo upload to R2
    return apiError(c, "INTERNAL_ERROR", "Photo upload not yet implemented")
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
    const conditions: string[] = ["contractor_id = ?"]
    const bindings: (string | number)[] = [contractorId]

    const status = c.req.query("status")
    if (status) {
      conditions.push("status = ?")
      bindings.push(status)
    }

    const budget = c.req.query("budget")
    if (budget) {
      conditions.push("budget_range = ?")
      bindings.push(budget)
    }

    const q = c.req.query("q")
    if (q) {
      conditions.push("(name LIKE ? OR job_site_address LIKE ?)")
      const pattern = `%${q}%`
      bindings.push(pattern, pattern)
    }

    const where = conditions.join(" AND ")

    // Count total matching rows
    const countResult = await c.env.DB.prepare(
      `SELECT COUNT(*) as total FROM quotes WHERE ${where}`
    )
      .bind(...bindings)
      .first<{ total: number }>()

    const total = countResult?.total ?? 0

    // Fetch paginated results
    const { results } = await c.env.DB.prepare(
      `SELECT id, contractor_id, schema_version, name, email, phone, cell,
              job_site_address, property_type, budget_range,
              how_did_you_find_us, referred_by_contractor,
              scope, quote_path, photo_session_id, public_token, status, created_at
       FROM quotes
       WHERE ${where}
       ORDER BY created_at DESC
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
      quotePath: row.quote_path ?? null,
      photoSessionId: row.photo_session_id ?? null,
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
// Delete a photo
// ---------------------------------------------------------------------------
app.delete(
  "/quotes/:quoteId/photos/:photoId",
  requireAuth(),
  requireQuoteOwnership(),
  async (c) => {
    const quoteId = c.req.param("quoteId")
    const photoId = c.req.param("photoId")
    const contractorId = c.get("contractorId") as string

    // Fetch the photo record, enforcing tenant isolation via quote_id
    const photo = await c.env.DB.prepare(
      "SELECT id, r2_key FROM photos WHERE id = ? AND quote_id = ?"
    )
      .bind(photoId, quoteId)
      .first<{ id: string; r2_key: string }>()

    if (!photo) {
      return apiError(c, "NOT_FOUND", "Photo not found")
    }

    // Delete from R2 storage
    await c.env.STORAGE.delete(photo.r2_key)

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
// Appointment windows (stub — returns mock slots; replace with real logic)
// ---------------------------------------------------------------------------
app.get("/appointment-windows", (c) => {
  const slots: AppointmentSlot[] = generateMockSlots()
  const res: ApiOk<AppointmentSlot[]> = { ok: true, data: slots }
  return c.json(res)
})

export default app

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function generateMockSlots(): AppointmentSlot[] {
  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
  const MONTHS = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ]

  const slots: AppointmentSlot[] = []
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(0, 0, 0, 0)

  for (let i = 0; i < 14 && slots.length < 10; i++) {
    const date = new Date(tomorrow)
    date.setDate(tomorrow.getDate() + i)
    const dow = date.getDay()
    if (dow === 0) continue // skip Sundays

    const dayLabel = `${DAYS[dow]}, ${MONTHS[date.getMonth()]} ${date.getDate()}`
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

  return slots
}
