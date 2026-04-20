import { describe, it, expect, vi } from "vitest"
import app from "./index"

// ---------------------------------------------------------------------------
// Helpers — D1 mock
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>

/**
 * Build a D1 mock that supports multiple sequential prepare() calls.
 * Each call to prepare() returns the next statement config in the queue.
 * The first slot is reserved for requireAuth()'s account_disabled check.
 */
function makeD1Mock(stmtConfigs: Array<{ first?: unknown; all?: { results: Row[] }; run?: unknown }>) {
  // requireAuth() queries account_disabled — prepend one null so it passes through.
  // requireActiveBilling() short-circuits when BILLING_ENABLED is unset, so no DB slot needed.
  const configs = [{ first: null }, ...stmtConfigs]
  let callIndex = 0

  return {
    prepare: vi.fn().mockImplementation(() => {
      const config = configs[callIndex] ?? configs[configs.length - 1]
      callIndex++

      const makeStmt = (cfg: typeof config) => ({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue(cfg.first ?? null),
          all: vi.fn().mockResolvedValue(cfg.all ?? { results: [] }),
          run: vi.fn().mockResolvedValue(cfg.run ?? {}),
          bind: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue(cfg.first ?? null),
            all: vi.fn().mockResolvedValue(cfg.all ?? { results: [] }),
            run: vi.fn().mockResolvedValue(cfg.run ?? {}),
          }),
        }),
        first: vi.fn().mockResolvedValue(cfg.first ?? null),
        all: vi.fn().mockResolvedValue(cfg.all ?? { results: [] }),
        run: vi.fn().mockResolvedValue(cfg.run ?? {}),
      })

      return makeStmt(config)
    }),
  }
}

function makeEnv(db: ReturnType<typeof makeD1Mock>) {
  return {
    DB: db,
    STORAGE: {},
    KV: {},
    ENVIRONMENT: "development",
    CORS_ORIGINS: "http://localhost:5173",
    TOKEN_SIGNING_SECRET: "",
  }
}

const CONTRACTOR_ID = "00000000-0000-4000-8000-000000000001"
const QUOTE_ID = "quote-001"

function makeActivityRequest(
  quoteId: string,
  body: unknown,
  contractorId = CONTRACTOR_ID
) {
  return new Request(`http://localhost/api/v1/quotes/${quoteId}/activity`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-contractor-id": contractorId,
    },
    body: JSON.stringify(body),
  })
}

function makeListRequest(
  quoteId: string,
  query = "",
  contractorId = CONTRACTOR_ID
) {
  return new Request(
    `http://localhost/api/v1/quotes/${quoteId}/activity${query}`,
    {
      headers: { "x-contractor-id": contractorId },
    }
  )
}

// ---------------------------------------------------------------------------
// POST /api/v1/quotes/:quoteId/activity
// ---------------------------------------------------------------------------

describe("POST /api/v1/quotes/:quoteId/activity", () => {
  it("returns 401 without authentication", async () => {
    const db = makeD1Mock([])
    const env = makeEnv(db)
    const req = new Request(`http://localhost/api/v1/quotes/${QUOTE_ID}/activity`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "note", content: "Hello" }),
    })
    const res = await app.fetch(req, env)
    expect(res.status).toBe(401)
  })

  it("returns 404 when quote does not exist", async () => {
    // requireQuoteOwnership queries for the quote — return null
    const db = makeD1Mock([{ first: null }])
    const env = makeEnv(db)
    const req = makeActivityRequest("nonexistent-quote", { type: "note", content: "Hello" })
    const res = await app.fetch(req, env)
    expect(res.status).toBe(404)
  })

  it("returns 422 for invalid activity type", async () => {
    // requireQuoteOwnership finds the quote
    const db = makeD1Mock([
      { first: { contractor_id: CONTRACTOR_ID } },
    ])
    const env = makeEnv(db)
    const req = makeActivityRequest(QUOTE_ID, { type: "invalid_type" })
    const res = await app.fetch(req, env)
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.ok).toBe(false)
    expect(body.code).toBe("VALIDATION_ERROR")
  })

  it("returns 422 when note has no content", async () => {
    const db = makeD1Mock([
      { first: { contractor_id: CONTRACTOR_ID } },
    ])
    const env = makeEnv(db)
    const req = makeActivityRequest(QUOTE_ID, { type: "note" })
    const res = await app.fetch(req, env)
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.fields.content).toBe("Content is required for notes")
  })

  it("returns 422 when status_change has no newStatus", async () => {
    const db = makeD1Mock([
      { first: { contractor_id: CONTRACTOR_ID } },
    ])
    const env = makeEnv(db)
    const req = makeActivityRequest(QUOTE_ID, { type: "status_change" })
    const res = await app.fetch(req, env)
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.fields.newStatus).toBe("New status is required for status changes")
  })

  it("creates a note activity successfully", async () => {
    const activityRow = {
      id: 1,
      quote_id: QUOTE_ID,
      contractor_id: CONTRACTOR_ID,
      staff_id: null,
      type: "note",
      content: "Customer called about timeline",
      old_value: null,
      new_value: null,
      created_at: "2026-03-23T10:00:00",
    }

    const db = makeD1Mock([
      // requireQuoteOwnership
      { first: { contractor_id: CONTRACTOR_ID } },
      // INSERT RETURNING
      { first: activityRow },
    ])
    const env = makeEnv(db)
    const req = makeActivityRequest(QUOTE_ID, {
      type: "note",
      content: "Customer called about timeline",
    })
    const res = await app.fetch(req, env)
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.data.type).toBe("note")
    expect(body.data.content).toBe("Customer called about timeline")
    expect(body.data.quoteId).toBe(QUOTE_ID)
  })

  it("creates a status_change activity with valid transition", async () => {
    const activityRow = {
      id: 2,
      quote_id: QUOTE_ID,
      contractor_id: CONTRACTOR_ID,
      staff_id: null,
      type: "status_change",
      content: null,
      old_value: "lead",
      new_value: "reviewing",
      created_at: "2026-03-23T10:00:00",
    }

    const db = makeD1Mock([
      // requireQuoteOwnership
      { first: { contractor_id: CONTRACTOR_ID } },
      // SELECT status FROM quotes
      { first: { status: "lead" } },
      // UPDATE quotes SET status
      { run: {} },
      // INSERT RETURNING
      { first: activityRow },
    ])
    const env = makeEnv(db)
    const req = makeActivityRequest(QUOTE_ID, {
      type: "status_change",
      newStatus: "reviewing",
    })
    const res = await app.fetch(req, env)
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.data.type).toBe("status_change")
    expect(body.data.oldValue).toBe("lead")
    expect(body.data.newValue).toBe("reviewing")
  })

  it("rejects invalid status transition", async () => {
    const db = makeD1Mock([
      // requireQuoteOwnership
      { first: { contractor_id: CONTRACTOR_ID } },
      // SELECT status FROM quotes — current status is "lead"
      { first: { status: "lead" } },
    ])
    const env = makeEnv(db)
    const req = makeActivityRequest(QUOTE_ID, {
      type: "status_change",
      newStatus: "accepted",
    })
    const res = await app.fetch(req, env)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.ok).toBe(false)
    expect(body.error).toContain("Cannot change status")
    expect(body.error).toContain("lead")
    expect(body.error).toContain("accepted")
  })

  it("returns 403 when contractor does not own the quote", async () => {
    const db = makeD1Mock([
      // requireQuoteOwnership finds quote but different contractor
      { first: { contractor_id: "contractor-999" } },
    ])
    const env = makeEnv(db)
    const req = makeActivityRequest(QUOTE_ID, { type: "note", content: "Test" })
    const res = await app.fetch(req, env)
    expect(res.status).toBe(403)
  })
})

// ---------------------------------------------------------------------------
// GET /api/v1/quotes/:quoteId/activity
// ---------------------------------------------------------------------------

describe("GET /api/v1/quotes/:quoteId/activity", () => {
  it("returns 401 without authentication", async () => {
    const db = makeD1Mock([])
    const env = makeEnv(db)
    const req = new Request(`http://localhost/api/v1/quotes/${QUOTE_ID}/activity`)
    const res = await app.fetch(req, env)
    expect(res.status).toBe(401)
  })

  it("returns empty list when no activity exists", async () => {
    const db = makeD1Mock([
      // requireQuoteOwnership
      { first: { contractor_id: CONTRACTOR_ID } },
      // COUNT
      { first: { total: 0 } },
      // SELECT
      { all: { results: [] } },
    ])
    const env = makeEnv(db)
    const req = makeListRequest(QUOTE_ID)
    const res = await app.fetch(req, env)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.data.activities).toEqual([])
    expect(body.data.total).toBe(0)
    expect(body.data.page).toBe(1)
  })

  it("returns activities with camelCase field names", async () => {
    const activityRows: Row[] = [
      {
        id: 1,
        quote_id: QUOTE_ID,
        contractor_id: CONTRACTOR_ID,
        staff_id: null,
        type: "status_change",
        content: null,
        old_value: null,
        new_value: "lead",
        created_at: "2026-03-23T09:00:00",
      },
      {
        id: 2,
        quote_id: QUOTE_ID,
        contractor_id: CONTRACTOR_ID,
        staff_id: "staff-001",
        type: "note",
        content: "Spoke with customer",
        old_value: null,
        new_value: null,
        created_at: "2026-03-23T10:00:00",
      },
    ]

    const db = makeD1Mock([
      // requireQuoteOwnership
      { first: { contractor_id: CONTRACTOR_ID } },
      // COUNT
      { first: { total: 2 } },
      // SELECT
      { all: { results: activityRows } },
    ])
    const env = makeEnv(db)
    const req = makeListRequest(QUOTE_ID)
    const res = await app.fetch(req, env)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.data.activities).toHaveLength(2)
    expect(body.data.total).toBe(2)

    const first = body.data.activities[0]
    expect(first.quoteId).toBe(QUOTE_ID)
    expect(first.contractorId).toBe(CONTRACTOR_ID)
    expect(first.staffId).toBeNull()
    expect(first.type).toBe("status_change")
    expect(first.newValue).toBe("lead")

    const second = body.data.activities[1]
    expect(second.staffId).toBe("staff-001")
    expect(second.type).toBe("note")
    expect(second.content).toBe("Spoke with customer")
  })

  it("supports pagination", async () => {
    const db = makeD1Mock([
      // requireQuoteOwnership
      { first: { contractor_id: CONTRACTOR_ID } },
      // COUNT
      { first: { total: 25 } },
      // SELECT
      { all: { results: [] } },
    ])
    const env = makeEnv(db)
    const req = makeListRequest(QUOTE_ID, "?page=2&limit=10")
    const res = await app.fetch(req, env)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.page).toBe(2)
    expect(body.data.total).toBe(25)
  })

  it("clamps limit to 100", async () => {
    const db = makeD1Mock([
      { first: { contractor_id: CONTRACTOR_ID } },
      { first: { total: 0 } },
      { all: { results: [] } },
    ])
    const env = makeEnv(db)
    const req = makeListRequest(QUOTE_ID, "?limit=500")
    const res = await app.fetch(req, env)
    expect(res.status).toBe(200)
    expect((await res.json()).ok).toBe(true)
  })
})
