import { env, SELF } from "cloudflare:test"
import { describe, it, expect, beforeEach } from "vitest"
import {
  setupDb,
  seedContractor,
  seedCustomer,
  seedQuote,
  seedPhoto,
  seedStaff,
  authHeaders,
  jwtAuthHeaders,
  jwtEmailAuthHeaders,
  apiUrl,
} from "./test-helpers"

// ---------------------------------------------------------------------------
// Each test gets isolated storage (fresh D1/KV/R2) — apply schema per test
// ---------------------------------------------------------------------------

beforeEach(async () => {
  await setupDb()
})

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

describe("GET /api/v1/health", () => {
  it("returns 200 with status ok", async () => {
    const res = await SELF.fetch(apiUrl("/health"))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean; data: { status: string; env: string } }
    expect(body.ok).toBe(true)
    expect(body.data.status).toBe("ok")
    expect(body.data.env).toBe("development")
  })
})

// ---------------------------------------------------------------------------
// 404 fallback
// ---------------------------------------------------------------------------

describe("404 fallback", () => {
  it("returns 404 with NOT_FOUND code for unknown routes", async () => {
    const res = await SELF.fetch(apiUrl("/nonexistent"))
    expect(res.status).toBe(404)
    const body = (await res.json()) as { ok: boolean; code: string }
    expect(body.ok).toBe(false)
    expect(body.code).toBe("NOT_FOUND")
  })
})

// ---------------------------------------------------------------------------
// POST /api/v1/quotes — Quote submission
// ---------------------------------------------------------------------------

describe("POST /api/v1/quotes", () => {
  const validPayload = {
    contractorId: "00000000-0000-4000-8000-000000000001",
    name: "Jane Doe",
    email: "jane@example.com",
    phone: "(555) 123-4567",
    jobSiteAddress: "123 Main St, Anytown, USA",
    propertyType: "house",
    budgetRange: "10-25k",
    schemaVersion: 1,
  }

  function quoteRequest(body: unknown, headers: Record<string, string> = {}) {
    return SELF.fetch(apiUrl("/quotes"), {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    })
  }

  it("creates a quote and returns 201", async () => {
    await seedContractor()
    const res = await quoteRequest(validPayload)
    expect(res.status).toBe(201)
    const body = (await res.json()) as { ok: boolean; data: { id: string; publicToken: string } }
    expect(body.ok).toBe(true)
    expect(body.data.id).toBeTruthy()
    expect(body.data.publicToken).toBeTruthy()

    // Verify row exists in D1
    const row = await env.DB.prepare(
      "SELECT q.id, c.name FROM quotes q JOIN customers c ON q.customer_id = c.id WHERE q.id = ?"
    )
      .bind(body.data.id)
      .first()
    expect(row).toBeTruthy()
    expect(row!.name).toBe("Jane Doe")
  })

  it("logs activity on quote creation", async () => {
    await seedContractor()
    const res = await quoteRequest(validPayload)
    const body = (await res.json()) as { ok: boolean; data: { id: string } }

    const activity = await env.DB.prepare(
      "SELECT type, new_value FROM quote_activity WHERE quote_id = ?"
    )
      .bind(body.data.id)
      .first()
    expect(activity).toBeTruthy()
    expect(activity!.type).toBe("status_change")
    expect(activity!.new_value).toBe("draft")
  })

  it("accepts optional fields", async () => {
    await seedContractor()
    const res = await quoteRequest({
      ...validPayload,
      cell: "(555) 999-8888",
      howDidYouFindUs: "Google",
      referredByContractor: "Bob",
      scope: { cabinets: true },
    })
    expect(res.status).toBe(201)
  })

  it("returns 422 when required fields are missing", async () => {
    await seedContractor()
    const res = await quoteRequest({})
    expect(res.status).toBe(422)
    const body = (await res.json()) as { ok: boolean; code: string; fields: Record<string, string> }
    expect(body.ok).toBe(false)
    expect(body.code).toBe("VALIDATION_ERROR")
    expect(body.fields.name).toBeDefined()
    expect(body.fields.email).toBeDefined()
    expect(body.fields.phone).toBeDefined()
  })

  it("returns 422 with field error for invalid email", async () => {
    await seedContractor()
    const res = await quoteRequest({ ...validPayload, email: "not-an-email" })
    expect(res.status).toBe(422)
    const body = (await res.json()) as { ok: boolean; fields: Record<string, string> }
    expect(body.fields.email).toBe("Enter a valid email address")
  })

  it("returns 422 with field error for short phone", async () => {
    await seedContractor()
    const res = await quoteRequest({ ...validPayload, phone: "555-1234" })
    expect(res.status).toBe(422)
    const body = (await res.json()) as { ok: boolean; fields: Record<string, string> }
    expect(body.fields.phone).toContain("at least 10 digits")
  })

  it("returns 422 when contractor does not exist", async () => {
    // Use a contractor ID that doesn't exist
    const res = await quoteRequest({ ...validPayload, contractorId: "nonexistent-contractor" })
    expect(res.status).toBe(422)
    const body = (await res.json()) as { ok: boolean; fields: Record<string, string> }
    expect(body.fields.contractorId).toContain("not found")
  })

  it("returns 413 when Content-Length exceeds 100KB", async () => {
    await seedContractor()
    const res = await SELF.fetch(apiUrl("/quotes"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": String(200 * 1024),
      },
      body: JSON.stringify(validPayload),
    })
    expect(res.status).toBe(413)
  })

  it("returns VALIDATION_ERROR for invalid JSON body", async () => {
    await seedContractor()
    const res = await SELF.fetch(apiUrl("/quotes"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not-json{{{",
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as { ok: boolean; code: string }
    expect(body.code).toBe("VALIDATION_ERROR")
  })

  it("strips HTML from input fields", async () => {
    await seedContractor()
    const res = await quoteRequest({
      ...validPayload,
      name: '<script>alert("xss")</script>Jane',
    })
    expect(res.status).toBe(201)
    const data = ((await res.json()) as { data: { id: string } }).data
    const row = await env.DB.prepare(
      "SELECT c.name FROM quotes q JOIN customers c ON q.customer_id = c.id WHERE q.id = ?"
    )
      .bind(data.id)
      .first()
    expect(row!.name).toBe('alert("xss")Jane')
  })

  it("rate limits after 5 requests from the same IP", async () => {
    await seedContractor()
    const ip = "10.0.0.1"

    // Pre-populate KV to simulate 5 prior requests
    const windowId = Math.floor(Date.now() / (3600 * 1000))
    await env.KV.put(`rl:quote-submit:${ip}:${windowId}`, "5")

    const res = await SELF.fetch(apiUrl("/quotes"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "cf-connecting-ip": ip,
      },
      body: JSON.stringify(validPayload),
    })
    expect(res.status).toBe(429)
    const body = (await res.json()) as { ok: boolean; code: string }
    expect(body.code).toBe("RATE_LIMITED")
  })

  it("allows requests from different IPs", async () => {
    await seedContractor()

    // Rate limit IP 10.0.0.1
    const windowId = Math.floor(Date.now() / (3600 * 1000))
    await env.KV.put(`rl:quote-submit:10.0.0.1:${windowId}`, "5")

    // Different IP should work
    const res = await SELF.fetch(apiUrl("/quotes"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "cf-connecting-ip": "10.0.0.2",
      },
      body: JSON.stringify(validPayload),
    })
    expect(res.status).toBe(201)
  })
})

// ---------------------------------------------------------------------------
// GET /api/v1/quotes/:quoteId — Get single quote
// ---------------------------------------------------------------------------

describe("GET /api/v1/quotes/:quoteId", () => {
  it("returns 401 without authentication", async () => {
    const res = await SELF.fetch(apiUrl("/quotes/some-id"))
    expect(res.status).toBe(401)
    const body = (await res.json()) as { ok: boolean; code: string }
    expect(body.code).toBe("UNAUTHORIZED")
  })

  it("returns 404 when quote does not exist", async () => {
    await seedContractor()
    const res = await SELF.fetch(apiUrl("/quotes/nonexistent"), {
      headers: authHeaders("00000000-0000-4000-8000-000000000001"),
    })
    expect(res.status).toBe(404)
    const body = (await res.json()) as { ok: boolean; code: string }
    expect(body.code).toBe("NOT_FOUND")
  })

  it("returns 403 when quote belongs to another contractor", async () => {
    const c1 = await seedContractor({ id: "c1", slug: "slug-c1" })
    await seedContractor({ id: "c2", slug: "slug-c2", name: "Other Co" })
    const cu1 = await seedCustomer(c1.id)
    const quote = await seedQuote(cu1.id, c1.id)

    const res = await SELF.fetch(apiUrl(`/quotes/${quote.id}`), {
      headers: authHeaders("c2"),
    })
    expect(res.status).toBe(403)
    const body = (await res.json()) as { ok: boolean; code: string }
    expect(body.code).toBe("FORBIDDEN")
  })

  it("returns 200 with camelCase quote data", async () => {
    const contractor = await seedContractor()
    const customer = await seedCustomer(contractor.id, { howDidYouFindUs: "Google" })
    const quote = await seedQuote(customer.id, contractor.id, {
      scope: '{"cabinets":true}',
    })

    const res = await SELF.fetch(apiUrl(`/quotes/${quote.id}`), {
      headers: authHeaders(contractor.id),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      ok: boolean
      data: {
        id: string
        contractorId: string
        name: string
        jobSiteAddress: string
        budgetRange: string
        scope: unknown
        howDidYouFindUs: string
        createdAt: string
      }
    }
    expect(body.ok).toBe(true)
    expect(body.data.id).toBe(quote.id)
    expect(body.data.contractorId).toBe(contractor.id)
    expect(body.data.name).toBe("Jane Doe")
    expect(body.data.jobSiteAddress).toBe("123 Main St")
    expect(body.data.budgetRange).toBe("10-25k")
    expect(body.data.scope).toEqual({ cabinets: true })
    expect(body.data.howDidYouFindUs).toBe("Google")
    expect(body.data.createdAt).toBeTruthy()
  })

  it("authenticates via JWT Bearer token", async () => {
    const contractor = await seedContractor()
    const customer = await seedCustomer(contractor.id)
    const quote = await seedQuote(customer.id, contractor.id)

    const res = await SELF.fetch(apiUrl(`/quotes/${quote.id}`), {
      headers: jwtAuthHeaders(contractor.id),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean; data: { id: string } }
    expect(body.data.id).toBe(quote.id)
  })
})

// ---------------------------------------------------------------------------
// PATCH /api/v1/quotes/:quoteId — Update quote
// ---------------------------------------------------------------------------

describe("PATCH /api/v1/quotes/:quoteId", () => {
  it("returns 401 without authentication", async () => {
    const res = await SELF.fetch(apiUrl("/quotes/some-id"), {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "New Name" }),
    })
    expect(res.status).toBe(401)
  })

  it("returns 404 when quote does not exist", async () => {
    await seedContractor()
    const res = await SELF.fetch(apiUrl("/quotes/nonexistent"), {
      method: "PATCH",
      headers: { "content-type": "application/json", ...authHeaders("00000000-0000-4000-8000-000000000001") },
      body: JSON.stringify({ name: "New Name" }),
    })
    expect(res.status).toBe(404)
  })

  it("returns 403 when quote belongs to another contractor", async () => {
    const c1 = await seedContractor({ id: "c1", slug: "slug-c1" })
    await seedContractor({ id: "c2", slug: "slug-c2", name: "Other Co" })
    const cu1 = await seedCustomer(c1.id)
    const quote = await seedQuote(cu1.id, c1.id)

    const res = await SELF.fetch(apiUrl(`/quotes/${quote.id}`), {
      method: "PATCH",
      headers: { "content-type": "application/json", ...authHeaders("c2") },
      body: JSON.stringify({ name: "New Name" }),
    })
    expect(res.status).toBe(403)
  })

  it("updates a single field and returns 200", async () => {
    const contractor = await seedContractor()
    const customer = await seedCustomer(contractor.id)
    const quote = await seedQuote(customer.id, contractor.id)

    const res = await SELF.fetch(apiUrl(`/quotes/${quote.id}`), {
      method: "PATCH",
      headers: { "content-type": "application/json", ...authHeaders(contractor.id) },
      body: JSON.stringify({ name: "Updated Name" }),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean; data: { name: string } }
    expect(body.ok).toBe(true)
    expect(body.data.name).toBe("Updated Name")
  })

  it("updates multiple fields", async () => {
    const contractor = await seedContractor()
    const customer = await seedCustomer(contractor.id)
    const quote = await seedQuote(customer.id, contractor.id)

    const res = await SELF.fetch(apiUrl(`/quotes/${quote.id}`), {
      method: "PATCH",
      headers: { "content-type": "application/json", ...authHeaders(contractor.id) },
      body: JSON.stringify({
        name: "Updated Name",
        email: "updated@example.com",
        propertyType: "apt",
        budgetRange: "25-50k",
      }),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      ok: boolean
      data: { name: string; email: string; propertyType: string; budgetRange: string }
    }
    expect(body.ok).toBe(true)
    expect(body.data.name).toBe("Updated Name")
    expect(body.data.email).toBe("updated@example.com")
  })

  it("logs edit activity", async () => {
    const contractor = await seedContractor()
    const customer = await seedCustomer(contractor.id)
    const quote = await seedQuote(customer.id, contractor.id)

    await SELF.fetch(apiUrl(`/quotes/${quote.id}`), {
      method: "PATCH",
      headers: { "content-type": "application/json", ...authHeaders(contractor.id) },
      body: JSON.stringify({ name: "Updated" }),
    })

    const activity = await env.DB.prepare(
      "SELECT type FROM quote_activity WHERE quote_id = ? AND type = 'quote_edited'"
    )
      .bind(quote.id)
      .first()
    expect(activity).toBeTruthy()
  })

  it("returns 422 for empty update body", async () => {
    const contractor = await seedContractor()
    const customer = await seedCustomer(contractor.id)
    const quote = await seedQuote(customer.id, contractor.id)

    const res = await SELF.fetch(apiUrl(`/quotes/${quote.id}`), {
      method: "PATCH",
      headers: { "content-type": "application/json", ...authHeaders(contractor.id) },
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(422)
  })

  it("returns 422 for invalid field values", async () => {
    const contractor = await seedContractor()
    const customer = await seedCustomer(contractor.id)
    const quote = await seedQuote(customer.id, contractor.id)

    const res = await SELF.fetch(apiUrl(`/quotes/${quote.id}`), {
      method: "PATCH",
      headers: { "content-type": "application/json", ...authHeaders(contractor.id) },
      body: JSON.stringify({ email: "not-an-email" }),
    })
    expect(res.status).toBe(422)
    const body = (await res.json()) as { ok: boolean; fields: Record<string, string> }
    expect(body.fields.email).toBe("Enter a valid email address")
  })

  it("returns 413 when payload exceeds 100KB", async () => {
    const contractor = await seedContractor()
    const customer = await seedCustomer(contractor.id)
    const quote = await seedQuote(customer.id, contractor.id)

    const res = await SELF.fetch(apiUrl(`/quotes/${quote.id}`), {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "content-length": String(200 * 1024),
        ...authHeaders(contractor.id),
      },
      body: JSON.stringify({ name: "x" }),
    })
    expect(res.status).toBe(413)
  })

  it("updates contractorNotes and returns it in the response", async () => {
    const contractor = await seedContractor()
    const customer = await seedCustomer(contractor.id)
    const quote = await seedQuote(customer.id, contractor.id)

    const res = await SELF.fetch(apiUrl(`/quotes/${quote.id}`), {
      method: "PATCH",
      headers: { "content-type": "application/json", ...authHeaders(contractor.id) },
      body: JSON.stringify({ contractorNotes: "Load-bearing wall — needs structural engineer." }),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean; data: { contractorNotes: string } }
    expect(body.ok).toBe(true)
    expect(body.data.contractorNotes).toBe("Load-bearing wall — needs structural engineer.")

    // Verify persisted via GET
    const getRes = await SELF.fetch(apiUrl(`/quotes/${quote.id}`), {
      headers: authHeaders(contractor.id),
    })
    const getBody = (await getRes.json()) as { ok: boolean; data: { contractorNotes: string } }
    expect(getBody.data.contractorNotes).toBe("Load-bearing wall — needs structural engineer.")
  })
})

// ---------------------------------------------------------------------------
// GET /api/v1/contractors/:contractorId/quotes — List quotes
// ---------------------------------------------------------------------------

describe("GET /api/v1/contractors/:contractorId/quotes", () => {
  it("returns 401 without authentication", async () => {
    const res = await SELF.fetch(apiUrl("/contractors/00000000-0000-4000-8000-000000000001/quotes"))
    expect(res.status).toBe(401)
  })

  it("returns 403 when contractor ID does not match auth", async () => {
    await seedContractor({ id: "c1", slug: "slug-c1" })
    await seedContractor({ id: "c2", slug: "slug-c2", name: "Other" })

    const res = await SELF.fetch(apiUrl("/contractors/c2/quotes"), {
      headers: authHeaders("c1"),
    })
    expect(res.status).toBe(403)
  })

  it("returns empty list when no quotes exist", async () => {
    const contractor = await seedContractor()
    const res = await SELF.fetch(apiUrl(`/contractors/${contractor.id}/quotes`), {
      headers: authHeaders(contractor.id),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean; data: { quotes: unknown[]; total: number; page: number } }
    expect(body.ok).toBe(true)
    expect(body.data.quotes).toEqual([])
    expect(body.data.total).toBe(0)
    expect(body.data.page).toBe(1)
  })

  it("returns quotes with camelCase field names", async () => {
    const contractor = await seedContractor()
    const customer = await seedCustomer(contractor.id)
    await seedQuote(customer.id, contractor.id, { scope: '{"cabinets":true}', status: "lead" })

    const res = await SELF.fetch(apiUrl(`/contractors/${contractor.id}/quotes`), {
      headers: authHeaders(contractor.id),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      ok: boolean
      data: {
        quotes: Array<{
          id: string
          contractorId: string
          jobSiteAddress: string
          scope: unknown
        }>
        total: number
      }
    }
    expect(body.data.quotes).toHaveLength(1)
    expect(body.data.total).toBe(1)
    const q = body.data.quotes[0]
    expect(q.contractorId).toBe(contractor.id)
    expect(q.jobSiteAddress).toBe("123 Main St")
    expect(q.scope).toEqual({ cabinets: true })
  })

  it("enforces tenant isolation — does not return other contractors quotes", async () => {
    const c1 = await seedContractor({ id: "c1", slug: "slug-c1" })
    await seedContractor({ id: "c2", slug: "slug-c2", name: "Other" })
    const cu1 = await seedCustomer("c1")
    const cu2 = await seedCustomer("c2", { email: "other@example.com" })
    await seedQuote(cu1.id, "c1", { status: "lead" })
    await seedQuote(cu2.id, "c2", { status: "lead" })

    const res = await SELF.fetch(apiUrl(`/contractors/${c1.id}/quotes`), {
      headers: authHeaders(c1.id),
    })
    const body = (await res.json()) as { data: { quotes: Array<{ contractorId: string }>; total: number } }
    expect(body.data.total).toBe(1)
    expect(body.data.quotes[0].contractorId).toBe("c1")
  })

  it("paginates results", async () => {
    const contractor = await seedContractor()
    const customer = await seedCustomer(contractor.id)
    // Seed 3 quotes
    await seedQuote(customer.id, contractor.id, { id: "q1", status: "lead" })
    await seedQuote(customer.id, contractor.id, { id: "q2", status: "lead" })
    await seedQuote(customer.id, contractor.id, { id: "q3", status: "lead" })

    const res = await SELF.fetch(
      apiUrl(`/contractors/${contractor.id}/quotes?page=2&limit=1`),
      { headers: authHeaders(contractor.id) }
    )
    const body = (await res.json()) as { data: { quotes: unknown[]; total: number; page: number } }
    expect(body.data.total).toBe(3)
    expect(body.data.quotes).toHaveLength(1)
    expect(body.data.page).toBe(2)
  })

  it("clamps limit to 100", async () => {
    const contractor = await seedContractor()
    const res = await SELF.fetch(
      apiUrl(`/contractors/${contractor.id}/quotes?limit=500`),
      { headers: authHeaders(contractor.id) }
    )
    expect(res.status).toBe(200)
  })

  it("defaults to page 1 for invalid page param", async () => {
    const contractor = await seedContractor()
    const res = await SELF.fetch(
      apiUrl(`/contractors/${contractor.id}/quotes?page=-1&limit=abc`),
      { headers: authHeaders(contractor.id) }
    )
    const body = (await res.json()) as { data: { page: number } }
    expect(body.data.page).toBe(1)
  })

  it("filters by status", async () => {
    const contractor = await seedContractor()
    const customer = await seedCustomer(contractor.id)
    await seedQuote(customer.id, contractor.id, { status: "lead" })
    await seedQuote(customer.id, contractor.id, { status: "qualified" })

    const res = await SELF.fetch(
      apiUrl(`/contractors/${contractor.id}/quotes?status=lead`),
      { headers: authHeaders(contractor.id) }
    )
    const body = (await res.json()) as { data: { quotes: Array<{ status: string }>; total: number } }
    expect(body.data.total).toBe(1)
    expect(body.data.quotes[0].status).toBe("lead")
  })

  it("filters by budget range", async () => {
    const contractor = await seedContractor()
    const customer = await seedCustomer(contractor.id)
    await seedQuote(customer.id, contractor.id, { budgetRange: "10-25k", status: "lead" })
    await seedQuote(customer.id, contractor.id, { budgetRange: "50k+", status: "lead" })

    const res = await SELF.fetch(
      apiUrl(`/contractors/${contractor.id}/quotes?budget=50k%2B`),
      { headers: authHeaders(contractor.id) }
    )
    const body = (await res.json()) as { data: { quotes: Array<{ budgetRange: string }>; total: number } }
    expect(body.data.total).toBe(1)
    expect(body.data.quotes[0].budgetRange).toBe("50k+")
  })

  it("searches by name or address", async () => {
    const contractor = await seedContractor()
    const alice = await seedCustomer(contractor.id, { name: "Alice Smith", email: "alice@example.com" })
    const bob = await seedCustomer(contractor.id, { name: "Bob Jones", email: "bob@example.com" })
    await seedQuote(alice.id, contractor.id, { jobSiteAddress: "456 Oak Ave", status: "lead" })
    await seedQuote(bob.id, contractor.id, { jobSiteAddress: "789 Pine St", status: "lead" })

    const res = await SELF.fetch(
      apiUrl(`/contractors/${contractor.id}/quotes?q=Alice`),
      { headers: authHeaders(contractor.id) }
    )
    const body = (await res.json()) as { data: { quotes: Array<{ name: string }>; total: number } }
    expect(body.data.total).toBe(1)
    expect(body.data.quotes[0].name).toBe("Alice Smith")
  })

  it("handles null scope in rows", async () => {
    const contractor = await seedContractor()
    const customer = await seedCustomer(contractor.id)
    await seedQuote(customer.id, contractor.id, { scope: null, status: "lead" })

    const res = await SELF.fetch(
      apiUrl(`/contractors/${contractor.id}/quotes`),
      { headers: authHeaders(contractor.id) }
    )
    const body = (await res.json()) as { data: { quotes: Array<{ scope: unknown }> } }
    expect(body.data.quotes[0].scope).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// POST /api/v1/quotes/:quoteId/photos — Photo upload
// ---------------------------------------------------------------------------

describe("POST /api/v1/quotes/:quoteId/photos", () => {
  const TINY_JPG = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0])

  function uploadRequest(quoteId: string, opts: { publicToken?: string; headers?: Record<string, string>; file?: File } = {}) {
    const formData = new FormData()
    formData.append("file", opts.file ?? new File([TINY_JPG], "test.jpg", { type: "image/jpeg" }))
    const tokenParam = opts.publicToken ? `?publicToken=${encodeURIComponent(opts.publicToken)}` : ""
    return SELF.fetch(apiUrl(`/quotes/${quoteId}/photos${tokenParam}`), {
      method: "POST",
      headers: opts.headers ?? {},
      body: formData,
    })
  }

  it("returns 404 when quote does not exist", async () => {
    const res = await uploadRequest("nonexistent", { publicToken: "badtoken" })
    expect(res.status).toBe(404)
  })

  it("uploads a photo with publicToken auth and returns 201", async () => {
    const contractor = await seedContractor()
    const customer = await seedCustomer(contractor.id)
    const quote = await seedQuote(customer.id, contractor.id)

    const res = await uploadRequest(quote.id, { publicToken: quote.publicToken })
    expect(res.status).toBe(201)
    const body = (await res.json()) as { ok: boolean; data: { id: string; filename: string } }
    expect(body.ok).toBe(true)
    expect(body.data.id).toBeTruthy()
    expect(body.data.filename).toBe("test.jpg")

    // Verify D1 record
    const row = await env.DB.prepare("SELECT id, quote_id, storage_key FROM photos WHERE id = ?")
      .bind(body.data.id)
      .first()
    expect(row).toBeTruthy()
    expect(row!.quote_id).toBe(quote.id)
  })

  it("uploads a photo with Clerk auth and returns 201", async () => {
    const contractor = await seedContractor()
    const customer = await seedCustomer(contractor.id)
    const quote = await seedQuote(customer.id, contractor.id)

    const res = await uploadRequest(quote.id, { headers: authHeaders(contractor.id) })
    expect(res.status).toBe(201)
  })

  it("rejects invalid content type", async () => {
    const contractor = await seedContractor()
    const customer = await seedCustomer(contractor.id)
    const quote = await seedQuote(customer.id, contractor.id)

    const res = await uploadRequest(quote.id, {
      publicToken: quote.publicToken,
      file: new File(["data"], "doc.pdf", { type: "application/pdf" }),
    })
    expect(res.status).toBe(422)
  })

  it("rejects when at 10-photo limit", async () => {
    const contractor = await seedContractor()
    const customer = await seedCustomer(contractor.id)
    const quote = await seedQuote(customer.id, contractor.id)

    // Seed 10 photos
    for (let i = 0; i < 10; i++) {
      await seedPhoto(quote.id, contractor.id)
    }

    const res = await uploadRequest(quote.id, { publicToken: quote.publicToken })
    expect(res.status).toBe(422)
    const body = (await res.json()) as { ok: boolean; error: string }
    expect(body.error).toContain("Maximum of 10")
  })

  it("logs activity on photo upload", async () => {
    const contractor = await seedContractor()
    const customer = await seedCustomer(contractor.id)
    const quote = await seedQuote(customer.id, contractor.id)

    const res = await uploadRequest(quote.id, { publicToken: quote.publicToken })
    const body = (await res.json()) as { ok: boolean; data: { id: string } }

    const activity = await env.DB.prepare(
      "SELECT type, content FROM quote_activity WHERE quote_id = ? AND type = 'photo_added'"
    )
      .bind(quote.id)
      .first()
    expect(activity).toBeTruthy()
    expect(activity!.content).toBe(body.data.id)
  })

  it("rate limits after 20 photo uploads from same IP", async () => {
    const contractor = await seedContractor()
    const customer = await seedCustomer(contractor.id)
    const quote = await seedQuote(customer.id, contractor.id)
    const ip = "10.0.0.1"

    const windowId = Math.floor(Date.now() / (3600 * 1000))
    await env.KV.put(`rl:photo-upload:${ip}:${windowId}`, "20")

    const formData = new FormData()
    formData.append("file", new File([TINY_JPG], "test.jpg", { type: "image/jpeg" }))
    const res = await SELF.fetch(apiUrl(`/quotes/${quote.id}/photos?publicToken=${quote.publicToken}`), {
      method: "POST",
      headers: { "cf-connecting-ip": ip },
      body: formData,
    })
    expect(res.status).toBe(429)
  })
})

// ---------------------------------------------------------------------------
// GET /api/v1/quotes/:quoteId/photos — Photo list
// ---------------------------------------------------------------------------

describe("GET /api/v1/quotes/:quoteId/photos", () => {
  it("returns 404 with invalid publicToken", async () => {
    const res = await SELF.fetch(apiUrl("/quotes/nonexistent/photos?publicToken=bad"))
    expect(res.status).toBe(404)
  })

  it("lists photos for a quote via publicToken", async () => {
    const contractor = await seedContractor()
    const customer = await seedCustomer(contractor.id)
    const quote = await seedQuote(customer.id, contractor.id)
    const photo = await seedPhoto(quote.id, contractor.id)

    const res = await SELF.fetch(apiUrl(`/quotes/${quote.id}/photos?publicToken=${quote.publicToken}`))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean; data: { photos: { id: string }[] } }
    expect(body.ok).toBe(true)
    expect(body.data.photos).toHaveLength(1)
    expect(body.data.photos[0].id).toBe(photo.id)
  })

  it("lists photos for a quote via Clerk auth", async () => {
    const contractor = await seedContractor()
    const customer = await seedCustomer(contractor.id)
    const quote = await seedQuote(customer.id, contractor.id)
    await seedPhoto(quote.id, contractor.id)

    const res = await SELF.fetch(apiUrl(`/quotes/${quote.id}/photos`), {
      headers: authHeaders(contractor.id),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean; data: { photos: { id: string }[] } }
    expect(body.data.photos).toHaveLength(1)
  })

  it("returns empty array when no photos", async () => {
    const contractor = await seedContractor()
    const customer = await seedCustomer(contractor.id)
    const quote = await seedQuote(customer.id, contractor.id)

    const res = await SELF.fetch(apiUrl(`/quotes/${quote.id}/photos?publicToken=${quote.publicToken}`))
    const body = (await res.json()) as { ok: boolean; data: { photos: unknown[] } }
    expect(body.data.photos).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// DELETE /api/v1/quotes/:quoteId/photos/:photoId
// ---------------------------------------------------------------------------

describe("DELETE /api/v1/quotes/:quoteId/photos/:photoId", () => {
  it("returns 401 without authentication", async () => {
    const res = await SELF.fetch(apiUrl("/quotes/q1/photos/p1"), {
      method: "DELETE",
    })
    expect(res.status).toBe(401)
  })

  it("returns 404 when quote does not exist", async () => {
    await seedContractor()
    const res = await SELF.fetch(apiUrl("/quotes/nonexistent/photos/p1"), {
      method: "DELETE",
      headers: authHeaders("00000000-0000-4000-8000-000000000001"),
    })
    expect(res.status).toBe(404)
  })

  it("returns 403 when quote belongs to another contractor", async () => {
    const c1 = await seedContractor({ id: "c1", slug: "slug-c1" })
    await seedContractor({ id: "c2", slug: "slug-c2", name: "Other" })
    const cu1 = await seedCustomer(c1.id)
    const quote = await seedQuote(cu1.id, c1.id)

    const res = await SELF.fetch(apiUrl(`/quotes/${quote.id}/photos/p1`), {
      method: "DELETE",
      headers: authHeaders("c2"),
    })
    expect(res.status).toBe(403)
  })

  it("returns 404 when photo does not exist for the quote", async () => {
    const contractor = await seedContractor()
    const customer = await seedCustomer(contractor.id)
    const quote = await seedQuote(customer.id, contractor.id)

    const res = await SELF.fetch(apiUrl(`/quotes/${quote.id}/photos/nonexistent`), {
      method: "DELETE",
      headers: authHeaders(contractor.id),
    })
    expect(res.status).toBe(404)
    const body = (await res.json()) as { ok: boolean; error: string }
    expect(body.error).toBe("Photo not found")
  })

  it("returns 204 and deletes photo from D1", async () => {
    const contractor = await seedContractor()
    const customer = await seedCustomer(contractor.id)
    const quote = await seedQuote(customer.id, contractor.id)
    const photo = await seedPhoto(quote.id, contractor.id)

    const res = await SELF.fetch(apiUrl(`/quotes/${quote.id}/photos/${photo.id}`), {
      method: "DELETE",
      headers: authHeaders(contractor.id),
    })
    expect(res.status).toBe(204)

    // Verify D1 record is gone
    const row = await env.DB.prepare("SELECT id FROM photos WHERE id = ?")
      .bind(photo.id)
      .first()
    expect(row).toBeNull()
  })

  it("logs activity on photo deletion", async () => {
    const contractor = await seedContractor()
    const customer = await seedCustomer(contractor.id)
    const quote = await seedQuote(customer.id, contractor.id)
    const photo = await seedPhoto(quote.id, contractor.id)

    await SELF.fetch(apiUrl(`/quotes/${quote.id}/photos/${photo.id}`), {
      method: "DELETE",
      headers: authHeaders(contractor.id),
    })

    const activity = await env.DB.prepare(
      "SELECT type, content FROM quote_activity WHERE quote_id = ? AND type = 'photo_removed'"
    )
      .bind(quote.id)
      .first()
    expect(activity).toBeTruthy()
    expect(activity!.content).toBe(photo.id)
  })
})

// ---------------------------------------------------------------------------
// POST /api/v1/contractors/:contractorId/logo — Logo upload
// ---------------------------------------------------------------------------

describe("POST /api/v1/contractors/:contractorId/logo", () => {
  const TINY_PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])

  function logoRequest(
    contractorId: string,
    file?: { content: Uint8Array; type: string; name: string },
    headers: Record<string, string> = {}
  ) {
    const formData = new FormData()
    if (file) {
      const blob = new Blob([file.content], { type: file.type })
      formData.append("file", blob, file.name)
    }
    return SELF.fetch(apiUrl(`/contractors/${contractorId}/logo`), {
      method: "POST",
      body: formData,
      headers: { ...authHeaders(contractorId), ...headers },
    })
  }

  it("returns 401 without authentication", async () => {
    await seedContractor()
    const formData = new FormData()
    formData.append("file", new Blob([TINY_PNG], { type: "image/png" }), "logo.png")

    const res = await SELF.fetch(apiUrl("/contractors/00000000-0000-4000-8000-000000000001/logo"), {
      method: "POST",
      body: formData,
    })
    expect(res.status).toBe(401)
  })

  it("returns 403 when contractor does not match auth", async () => {
    await seedContractor({ id: "c1", slug: "slug-c1" })
    await seedContractor({ id: "c2", slug: "slug-c2", name: "Other" })

    const res = await logoRequest("c1", {
      content: TINY_PNG,
      type: "image/png",
      name: "logo.png",
    }, authHeaders("c2"))
    // Headers are merged — c2 overrides
    expect(res.status).toBe(403)
  })

  it("returns 422 when no file is provided", async () => {
    const contractor = await seedContractor()
    const res = await logoRequest(contractor.id) // no file
    expect(res.status).toBe(422)
    const body = (await res.json()) as { ok: boolean; fields: { file: string } }
    expect(body.ok).toBe(false)
    expect(body.fields.file).toMatch(/required/)
  })

  it("returns 422 for unsupported content type", async () => {
    const contractor = await seedContractor()
    const res = await logoRequest(contractor.id, {
      content: new Uint8Array([0, 0, 0]),
      type: "application/pdf",
      name: "doc.pdf",
    })
    expect(res.status).toBe(422)
    const body = (await res.json()) as { ok: boolean; fields: { file: string } }
    expect(body.fields.file).toMatch(/JPEG|PNG|SVG/)
  })

  it("returns 422 for file over 2MB", async () => {
    const contractor = await seedContractor()
    const largeContent = new Uint8Array(2 * 1024 * 1024 + 1)
    const res = await logoRequest(contractor.id, {
      content: largeContent,
      type: "image/png",
      name: "huge.png",
    })
    expect(res.status).toBe(422)
    const body = (await res.json()) as { ok: boolean; fields: { file: string } }
    expect(body.fields.file).toMatch(/2MB/)
  })

  it("uploads PNG logo successfully", async () => {
    const contractor = await seedContractor()
    const res = await logoRequest(contractor.id, {
      content: TINY_PNG,
      type: "image/png",
      name: "logo.png",
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean; data: { logoUrl: string } }
    expect(body.ok).toBe(true)
    expect(body.data.logoUrl).toBe(`${contractor.id}/logo.png`)

    // Verify D1 updated
    const row = await env.DB.prepare("SELECT logo_url FROM contractors WHERE id = ?")
      .bind(contractor.id)
      .first<{ logo_url: string }>()
    expect(row!.logo_url).toBe(`${contractor.id}/logo.png`)
  })

  it("uploads JPEG logo successfully", async () => {
    const contractor = await seedContractor()
    const res = await logoRequest(contractor.id, {
      content: new Uint8Array([255, 216, 255, 224]),
      type: "image/jpeg",
      name: "logo.jpg",
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean; data: { logoUrl: string } }
    expect(body.data.logoUrl).toBe(`${contractor.id}/logo.jpg`)
  })

  it("uploads SVG logo successfully", async () => {
    const contractor = await seedContractor()
    const res = await logoRequest(contractor.id, {
      content: new TextEncoder().encode("<svg></svg>"),
      type: "image/svg+xml",
      name: "logo.svg",
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean; data: { logoUrl: string } }
    expect(body.data.logoUrl).toBe(`${contractor.id}/logo.svg`)
  })

  it("replaces previous logo in R2", async () => {
    const contractor = await seedContractor()

    // Upload first logo
    await logoRequest(contractor.id, {
      content: TINY_PNG,
      type: "image/png",
      name: "logo.png",
    })

    // Upload replacement
    const res = await logoRequest(contractor.id, {
      content: new Uint8Array([255, 216, 255, 224]),
      type: "image/jpeg",
      name: "new-logo.jpg",
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean; data: { logoUrl: string } }
    expect(body.data.logoUrl).toBe(`${contractor.id}/logo.jpg`)
  })
})

// ---------------------------------------------------------------------------
// GET /api/v1/appointment-windows
// ---------------------------------------------------------------------------

describe("GET /api/v1/appointment-windows", () => {
  it("returns an array of appointment slots", async () => {
    const res = await SELF.fetch(apiUrl("/appointment-windows"))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean; data: Array<{ id: string; label: string; startAt: string; endAt: string }> }
    expect(body.ok).toBe(true)
    expect(Array.isArray(body.data)).toBe(true)
    expect(body.data.length).toBeGreaterThan(0)
    expect(body.data.length).toBeLessThanOrEqual(10)

    const slot = body.data[0]
    expect(slot.id).toBeTruthy()
    expect(slot.label).toBeTruthy()
    expect(slot.startAt).toBeTruthy()
    expect(slot.endAt).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// GET /api/v1/me/contractor
// ---------------------------------------------------------------------------

describe("GET /api/v1/me/contractor", () => {
  it("returns contractor when x-contractor-id header is provided in dev mode", async () => {
    const contractor = await seedContractor()
    const res = await SELF.fetch(apiUrl("/me/contractor"), {
      headers: authHeaders(contractor.id),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean; data: { contractorId: string; contractorName: string; role: string } }
    expect(body.ok).toBe(true)
    expect(body.data.contractorId).toBe(contractor.id)
    expect(body.data.contractorName).toBe(contractor.name)
    expect(body.data.role).toBe("owner")
  })

  it("returns 404 in dev mode with no x-contractor-id header and no JWT", async () => {
    const res = await SELF.fetch(apiUrl("/me/contractor"))
    expect(res.status).toBe(404)
    const body = (await res.json()) as { ok: boolean; code: string }
    expect(body.ok).toBe(false)
    expect(body.code).toBe("NOT_FOUND")
  })

  it("returns contractor when JWT has email matching a staff record", async () => {
    const contractor = await seedContractor()
    await seedStaff(contractor.id, { email: "staff@example.test", role: "estimator" })
    const res = await SELF.fetch(apiUrl("/me/contractor"), {
      headers: jwtEmailAuthHeaders("staff@example.test"),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean; data: { contractorId: string; contractorName: string; role: string } }
    expect(body.ok).toBe(true)
    expect(body.data.contractorId).toBe(contractor.id)
    expect(body.data.contractorName).toBe(contractor.name)
    expect(body.data.role).toBe("estimator")
  })

  it("returns 404 when JWT email has no staff record", async () => {
    const res = await SELF.fetch(apiUrl("/me/contractor"), {
      headers: jwtEmailAuthHeaders("nobody@example.test"),
    })
    expect(res.status).toBe(404)
    const body = (await res.json()) as { ok: boolean; code: string }
    expect(body.ok).toBe(false)
    expect(body.code).toBe("NOT_FOUND")
  })
})
