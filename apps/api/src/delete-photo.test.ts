import { describe, it, expect, vi } from "vitest"
import app from "./index"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>

function makeD1Mock(photoRow: Row | null = null) {
  const runResult = { success: true }
  const run = vi.fn().mockResolvedValue(runResult)
  const first = vi.fn().mockResolvedValue(photoRow)

  const stmt = {
    bind: vi.fn().mockReturnValue({ first, run, bind: vi.fn().mockReturnValue({ first, run }) }),
  }

  return {
    prepare: vi.fn().mockReturnValue(stmt),
    _stmt: stmt,
    _first: first,
    _run: run,
  }
}

function makeStorageMock() {
  return {
    delete: vi.fn().mockResolvedValue(undefined),
  }
}

function makeEnv(db: ReturnType<typeof makeD1Mock>, storage = makeStorageMock()) {
  return {
    DB: db,
    STORAGE: storage,
    TOKENS: {},
    ENVIRONMENT: "development",
    CORS_ORIGINS: "http://localhost:5173",
    HUBSPOT_ACCESS_TOKEN: "",
    TOKEN_SIGNING_SECRET: "",
  }
}

const CONTRACTOR_ID = "contractor-001"
const QUOTE_ID = "quote-001"
const PHOTO_ID = "photo-001"
const R2_KEY = `${CONTRACTOR_ID}/${QUOTE_ID}/${PHOTO_ID}.jpg`

function makeDeleteRequest(
  quoteId = QUOTE_ID,
  photoId = PHOTO_ID,
  contractorId = CONTRACTOR_ID
) {
  return new Request(
    `http://localhost/api/v1/quotes/${quoteId}/photos/${photoId}`,
    {
      method: "DELETE",
      headers: { "x-contractor-id": contractorId },
    }
  )
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("DELETE /api/v1/quotes/:quoteId/photos/:photoId", () => {
  it("returns 401 without authentication", async () => {
    const db = makeD1Mock()
    const env = makeEnv(db)
    const req = new Request(
      `http://localhost/api/v1/quotes/${QUOTE_ID}/photos/${PHOTO_ID}`,
      { method: "DELETE" }
    )
    const res = await app.fetch(req, env)
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.ok).toBe(false)
    expect(body.code).toBe("UNAUTHORIZED")
  })

  it("returns 404 when quote does not exist", async () => {
    // requireQuoteOwnership checks quote existence first
    const db = makeD1Mock(null)
    const env = makeEnv(db)
    const req = makeDeleteRequest()
    const res = await app.fetch(req, env)
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.ok).toBe(false)
    expect(body.code).toBe("NOT_FOUND")
  })

  it("returns 403 when quote belongs to another contractor", async () => {
    // requireQuoteOwnership returns the quote with a different contractor_id
    const db = makeD1Mock({ contractor_id: "contractor-999" })
    const env = makeEnv(db)
    const req = makeDeleteRequest()
    const res = await app.fetch(req, env)
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.ok).toBe(false)
    expect(body.code).toBe("FORBIDDEN")
  })

  it("returns 404 when photo does not exist for the quote", async () => {
    // First call: requireQuoteOwnership finds the quote
    // Second call: photo lookup returns null
    const first = vi.fn()
      .mockResolvedValueOnce({ contractor_id: CONTRACTOR_ID }) // quote ownership check
      .mockResolvedValueOnce(null) // photo not found

    const run = vi.fn().mockResolvedValue({ success: true })
    const stmt = {
      bind: vi.fn().mockReturnValue({ first, run, bind: vi.fn().mockReturnValue({ first, run }) }),
    }
    const db = { prepare: vi.fn().mockReturnValue(stmt), _stmt: stmt, _first: first, _run: run }

    const env = makeEnv(db)
    const req = makeDeleteRequest()
    const res = await app.fetch(req, env)
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.ok).toBe(false)
    expect(body.code).toBe("NOT_FOUND")
    expect(body.error).toBe("Photo not found")
  })

  it("returns 204 and deletes photo from R2 and D1 on success", async () => {
    const first = vi.fn()
      .mockResolvedValueOnce({ contractor_id: CONTRACTOR_ID }) // quote ownership check
      .mockResolvedValueOnce({ id: PHOTO_ID, r2_key: R2_KEY }) // photo found

    const run = vi.fn().mockResolvedValue({ success: true })
    const stmt = {
      bind: vi.fn().mockReturnValue({ first, run, bind: vi.fn().mockReturnValue({ first, run }) }),
    }
    const db = { prepare: vi.fn().mockReturnValue(stmt), _stmt: stmt, _first: first, _run: run }
    const storage = makeStorageMock()
    const env = makeEnv(db, storage)

    const req = makeDeleteRequest()
    const res = await app.fetch(req, env)

    expect(res.status).toBe(204)

    // Verify R2 delete was called with the correct key
    expect(storage.delete).toHaveBeenCalledWith(R2_KEY)

    // Verify D1 delete and activity log were called
    expect(run).toHaveBeenCalled()
  })
})
