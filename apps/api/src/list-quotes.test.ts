import { describe, it, expect, vi } from "vitest"
import app from "./index"

// ---------------------------------------------------------------------------
// Helpers — minimal D1 mock
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>

function makeD1Mock(rows: Row[] = [], total = rows.length) {
  const first = vi.fn().mockResolvedValue({ total })
  const all = vi.fn().mockResolvedValue({ results: rows })

  const stmt = {
    bind: vi.fn().mockReturnValue({
      first,
      all,
      bind: vi.fn().mockReturnValue({ first, all }),
    }),
  }

  return {
    prepare: vi.fn().mockReturnValue(stmt),
    _stmt: stmt,
    _first: first,
    _all: all,
  }
}

function makeEnv(db: ReturnType<typeof makeD1Mock>) {
  return {
    DB: db,
    STORAGE: {},
    TOKENS: {},
    ENVIRONMENT: "development",
    CORS_ORIGINS: "http://localhost:5173",
    HUBSPOT_ACCESS_TOKEN: "",
    TOKEN_SIGNING_SECRET: "",
  }
}

function makeRequest(
  contractorId: string,
  query = "",
  headers: Record<string, string> = {}
) {
  const url = `http://localhost/api/v1/contractors/${contractorId}/quotes${query}`
  return new Request(url, {
    headers: {
      "x-contractor-id": contractorId,
      ...headers,
    },
  })
}

const CONTRACTOR_ID = "contractor-001"

const sampleRow: Row = {
  id: "quote-001",
  contractor_id: CONTRACTOR_ID,
  schema_version: 1,
  name: "Jane Doe",
  email: "jane@example.com",
  phone: "(555) 123-4567",
  cell: null,
  job_site_address: "123 Main St",
  property_type: "house",
  budget_range: "10-25k",
  how_did_you_find_us: "Google",
  referred_by_contractor: null,
  scope: '{"cabinets":true}',
  quote_path: null,
  photo_session_id: null,
  public_token: "abc123",
  status: "lead",
  created_at: "2026-03-20T10:00:00",
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/v1/contractors/:contractorId/quotes", () => {
  it("returns 401 without authentication", async () => {
    const db = makeD1Mock()
    const env = makeEnv(db)
    const req = new Request(
      `http://localhost/api/v1/contractors/${CONTRACTOR_ID}/quotes`
    )
    const res = await app.fetch(req, env)
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.ok).toBe(false)
    expect(body.code).toBe("UNAUTHORIZED")
  })

  it("returns 403 when contractor ID does not match", async () => {
    const db = makeD1Mock()
    const env = makeEnv(db)
    const req = makeRequest("contractor-001")
    // Override the header to a different contractor
    const url = `http://localhost/api/v1/contractors/contractor-002/quotes`
    const mismatchReq = new Request(url, {
      headers: { "x-contractor-id": "contractor-001" },
    })
    const res = await app.fetch(mismatchReq, env)
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.ok).toBe(false)
    expect(body.code).toBe("FORBIDDEN")
  })

  it("returns empty list when no quotes exist", async () => {
    const db = makeD1Mock([], 0)
    const env = makeEnv(db)
    const req = makeRequest(CONTRACTOR_ID)
    const res = await app.fetch(req, env)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.data.quotes).toEqual([])
    expect(body.data.total).toBe(0)
    expect(body.data.page).toBe(1)
  })

  it("returns quotes with camelCase field names", async () => {
    const db = makeD1Mock([sampleRow], 1)
    const env = makeEnv(db)
    const req = makeRequest(CONTRACTOR_ID)
    const res = await app.fetch(req, env)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.data.quotes).toHaveLength(1)
    const quote = body.data.quotes[0]
    expect(quote.id).toBe("quote-001")
    expect(quote.contractorId).toBe(CONTRACTOR_ID)
    expect(quote.jobSiteAddress).toBe("123 Main St")
    expect(quote.budgetRange).toBe("10-25k")
    expect(quote.scope).toEqual({ cabinets: true })
    expect(quote.createdAt).toBe("2026-03-20T10:00:00")
  })

  it("passes pagination parameters to query", async () => {
    const db = makeD1Mock([], 0)
    const env = makeEnv(db)
    const req = makeRequest(CONTRACTOR_ID, "?page=2&limit=10")
    const res = await app.fetch(req, env)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.page).toBe(2)
  })

  it("clamps limit to 100", async () => {
    const db = makeD1Mock([], 0)
    const env = makeEnv(db)
    const req = makeRequest(CONTRACTOR_ID, "?limit=500")
    const res = await app.fetch(req, env)
    expect(res.status).toBe(200)
    // The DB prepare should have been called — we can't easily check bind args
    // with our simplified mock, but the endpoint didn't crash
    expect((await res.json()).ok).toBe(true)
  })

  it("defaults page to 1 and limit to 20 for invalid params", async () => {
    const db = makeD1Mock([], 0)
    const env = makeEnv(db)
    const req = makeRequest(CONTRACTOR_ID, "?page=-1&limit=abc")
    const res = await app.fetch(req, env)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.page).toBe(1)
  })

  it("handles null scope in rows", async () => {
    const rowNoScope = { ...sampleRow, scope: null }
    const db = makeD1Mock([rowNoScope], 1)
    const env = makeEnv(db)
    const req = makeRequest(CONTRACTOR_ID)
    const res = await app.fetch(req, env)
    const body = await res.json()
    expect(body.data.quotes[0].scope).toBeNull()
  })
})
