import { describe, it, expect, vi } from "vitest"
import app from "./index"

// ---------------------------------------------------------------------------
// Helpers — D1 + R2 mock
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>

function makeD1Mock(
  quotesForEmail: Row[] = [],
  opts?: { appointmentChanges?: number; activityChanges?: number; quoteChanges?: number }
) {
  const { appointmentChanges = 0, activityChanges = 0, quoteChanges = 0 } = opts ?? {}

  let callIndex = 0
  const selectResult = { results: quotesForEmail }
  const deleteAppointments = { meta: { changes: appointmentChanges } }
  const deleteActivity = { meta: { changes: activityChanges } }
  const deleteQuotes = { meta: { changes: quoteChanges } }
  const insertLog = { meta: { changes: 1 } }

  const responses = [selectResult, deleteAppointments, deleteActivity, deleteQuotes, insertLog]

  const prepare = vi.fn().mockImplementation(() => {
    const idx = callIndex++
    return {
      bind: vi.fn().mockReturnValue({
        all: vi.fn().mockResolvedValue(responses[idx] ?? { results: [] }),
        run: vi.fn().mockResolvedValue(responses[idx] ?? { meta: { changes: 0 } }),
        first: vi.fn().mockResolvedValue(null),
      }),
    }
  })

  return { prepare }
}

function makeR2Mock(objects: { key: string }[] = []) {
  return {
    list: vi.fn().mockResolvedValue({ objects }),
    delete: vi.fn().mockResolvedValue(undefined),
  }
}

function makeEnv(db: ReturnType<typeof makeD1Mock>, storage?: ReturnType<typeof makeR2Mock>) {
  return {
    DB: db,
    STORAGE: storage ?? makeR2Mock(),
    TOKENS: {},
    ENVIRONMENT: "development",
    CORS_ORIGINS: "http://localhost:5173",
    HUBSPOT_ACCESS_TOKEN: "",
    TOKEN_SIGNING_SECRET: "",
  }
}

const CONTRACTOR_ID = "contractor-001"

function makeDeleteRequest(
  email: string,
  body?: Record<string, unknown>,
  contractorId = CONTRACTOR_ID
) {
  return new Request(
    `http://localhost/api/v1/customers/${encodeURIComponent(email)}`,
    {
      method: "DELETE",
      headers: {
        "x-contractor-id": contractorId,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    }
  )
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("DELETE /api/v1/customers/:email", () => {
  it("returns 401 without authentication", async () => {
    const db = makeD1Mock()
    const env = makeEnv(db)
    const req = new Request("http://localhost/api/v1/customers/test@example.com", {
      method: "DELETE",
    })
    const res = await app.fetch(req, env)
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.ok).toBe(false)
    expect(body.code).toBe("UNAUTHORIZED")
  })

  it("returns 400 for invalid email in path", async () => {
    const db = makeD1Mock()
    const env = makeEnv(db)
    const req = makeDeleteRequest("not-an-email")
    const res = await app.fetch(req, env)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.ok).toBe(false)
    expect(body.code).toBe("VALIDATION_ERROR")
  })

  it("returns 404 when no quotes found for email", async () => {
    const db = makeD1Mock([])
    const env = makeEnv(db)
    const req = makeDeleteRequest("nobody@example.com", { requestType: "contractor" })
    const res = await app.fetch(req, env)
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.ok).toBe(false)
    expect(body.code).toBe("NOT_FOUND")
  })

  it("deletes customer data and returns counts", async () => {
    const quotes = [
      { id: "quote-1", photo_session_id: "session-abc" },
      { id: "quote-2", photo_session_id: null },
    ]
    const db = makeD1Mock(quotes, {
      appointmentChanges: 1,
      activityChanges: 3,
      quoteChanges: 2,
    })
    const r2 = makeR2Mock([{ key: "session-abc/photo1.jpg" }, { key: "session-abc/photo2.jpg" }])
    const env = makeEnv(db, r2)
    const req = makeDeleteRequest("jane@example.com", { requestType: "ccpa" })
    const res = await app.fetch(req, env)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.data.quotesDeleted).toBe(2)
    expect(body.data.photosDeleted).toBe(2)
    expect(body.data.appointmentsDeleted).toBe(1)
    expect(body.data.activityRecordsDeleted).toBe(3)

    // R2 should have been called to list and delete photos
    expect(r2.list).toHaveBeenCalledWith({ prefix: "session-abc/" })
    expect(r2.delete).toHaveBeenCalledTimes(2)
  })

  it("validates requestType in body", async () => {
    const db = makeD1Mock()
    const env = makeEnv(db)
    const req = makeDeleteRequest("test@example.com", { requestType: "invalid" })
    const res = await app.fetch(req, env)
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.ok).toBe(false)
    expect(body.code).toBe("VALIDATION_ERROR")
  })

  it("handles URL-encoded email addresses", async () => {
    const quotes = [{ id: "quote-1", photo_session_id: null }]
    const db = makeD1Mock(quotes, { quoteChanges: 1 })
    const env = makeEnv(db)
    const req = makeDeleteRequest("user+tag@example.com", { requestType: "customer" })
    const res = await app.fetch(req, env)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
  })
})
