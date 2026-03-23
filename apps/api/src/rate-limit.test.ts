import { describe, it, expect, vi, beforeEach } from "vitest"
import app from "./index"

// ---------------------------------------------------------------------------
// KV mock — tracks stored values in memory
// ---------------------------------------------------------------------------

function makeKvMock() {
  const store = new Map<string, { value: string; expirationTtl?: number }>()
  return {
    get: vi.fn(async (key: string) => store.get(key)?.value ?? null),
    put: vi.fn(async (key: string, value: string, opts?: { expirationTtl?: number }) => {
      store.set(key, { value, expirationTtl: opts?.expirationTtl })
    }),
    _store: store,
  }
}

function makeD1Mock() {
  const run = vi.fn().mockResolvedValue({})
  const first = vi.fn().mockResolvedValue({ id: "contractor-001" })

  const innerBind = {
    first,
    all: vi.fn().mockResolvedValue({ results: [] }),
    run,
    bind: vi.fn().mockReturnThis(),
  }

  const stmt = {
    bind: vi.fn().mockReturnValue(innerBind),
    first,
    all: vi.fn().mockResolvedValue({ results: [] }),
    run,
  }

  return {
    prepare: vi.fn().mockReturnValue(stmt),
    _first: first,
    _run: run,
  }
}

function makeEnv(kv: ReturnType<typeof makeKvMock>, db: ReturnType<typeof makeD1Mock>) {
  return {
    DB: db,
    STORAGE: {},
    TOKENS: kv,
    ENVIRONMENT: "development",
    CORS_ORIGINS: "http://localhost:5173",
    HUBSPOT_ACCESS_TOKEN: "",
    TOKEN_SIGNING_SECRET: "",
  }
}

const validQuoteBody = JSON.stringify({
  contractorId: "contractor-001",
  name: "Jane Doe",
  email: "jane@example.com",
  phone: "(555) 123-4567",
  jobSiteAddress: "123 Main St, Anytown, USA",
  propertyType: "house",
  budgetRange: "10-25k",
  schemaVersion: 1,
})

function makeQuoteRequest(ip = "1.2.3.4") {
  return new Request("http://localhost/api/v1/quotes", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "cf-connecting-ip": ip,
    },
    body: validQuoteBody,
  })
}

function makePhotoRequest(quoteId = "quote-001", ip = "1.2.3.4") {
  return new Request(`http://localhost/api/v1/quotes/${quoteId}/photos`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "cf-connecting-ip": ip,
    },
    body: "{}",
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Rate limiting on POST /api/v1/quotes", () => {
  let kv: ReturnType<typeof makeKvMock>
  let db: ReturnType<typeof makeD1Mock>
  let env: ReturnType<typeof makeEnv>

  beforeEach(() => {
    kv = makeKvMock()
    db = makeD1Mock()
    env = makeEnv(kv, db)
  })

  it("allows requests under the limit", async () => {
    const res = await app.fetch(makeQuoteRequest(), env)
    expect(res.status).toBe(201)
    expect(kv.put).toHaveBeenCalledTimes(1)
    // Verify KV key has correct prefix and TTL
    const putCall = kv.put.mock.calls[0]
    expect(putCall[0]).toMatch(/^rl:quote-submit:1\.2\.3\.4:\d+$/)
    expect(putCall[1]).toBe("1")
    expect(putCall[2]).toEqual({ expirationTtl: 3600 })
  })

  it("returns 429 after 5 requests from same IP", async () => {
    // Simulate 5 prior requests by pre-populating KV
    const windowId = Math.floor(Date.now() / (3600 * 1000))
    kv._store.set(`rl:quote-submit:1.2.3.4:${windowId}`, { value: "5" })

    const res = await app.fetch(makeQuoteRequest(), env)
    expect(res.status).toBe(429)
    const body = await res.json() as { ok: boolean; code: string; error: string }
    expect(body.ok).toBe(false)
    expect(body.code).toBe("RATE_LIMITED")
    expect(body.error).toContain("too many requests")
  })

  it("allows requests from a different IP", async () => {
    // Rate limit one IP
    const windowId = Math.floor(Date.now() / (3600 * 1000))
    kv._store.set(`rl:quote-submit:1.2.3.4:${windowId}`, { value: "5" })

    // Different IP should still work
    const res = await app.fetch(makeQuoteRequest("5.6.7.8"), env)
    expect(res.status).toBe(201)
  })

  it("increments the counter on each request", async () => {
    // First request
    await app.fetch(makeQuoteRequest(), env)
    expect(kv.put).toHaveBeenCalledWith(
      expect.stringMatching(/^rl:quote-submit:1\.2\.3\.4:\d+$/),
      "1",
      { expirationTtl: 3600 }
    )

    // The KV store now has "1" in it, so next request should write "2"
    const res2 = await app.fetch(makeQuoteRequest(), env)
    expect(res2.status).toBe(201)
    const lastPutCall = kv.put.mock.calls[kv.put.mock.calls.length - 1]
    expect(lastPutCall[1]).toBe("2")
  })
})

describe("Rate limiting on POST /api/v1/quotes/:quoteId/photos", () => {
  let kv: ReturnType<typeof makeKvMock>
  let db: ReturnType<typeof makeD1Mock>
  let env: ReturnType<typeof makeEnv>

  beforeEach(() => {
    kv = makeKvMock()
    db = makeD1Mock()
    env = makeEnv(kv, db)
  })

  it("allows photo requests under the limit", async () => {
    const res = await app.fetch(makePhotoRequest(), env)
    // Route exists but returns 500 (not yet implemented)
    expect(res.status).toBe(500)
    // Rate limiter passed — KV was written to
    expect(kv.put).toHaveBeenCalledTimes(1)
    const putCall = kv.put.mock.calls[0]
    expect(putCall[0]).toMatch(/^rl:photo-upload:1\.2\.3\.4:\d+$/)
    expect(putCall[2]).toEqual({ expirationTtl: 3600 })
  })

  it("returns 429 after 20 photo uploads from same IP", async () => {
    const windowId = Math.floor(Date.now() / (3600 * 1000))
    kv._store.set(`rl:photo-upload:1.2.3.4:${windowId}`, { value: "20" })

    const res = await app.fetch(makePhotoRequest(), env)
    expect(res.status).toBe(429)
    const body = await res.json() as { ok: boolean; code: string }
    expect(body.code).toBe("RATE_LIMITED")
  })
})
