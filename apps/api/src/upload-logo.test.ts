// @vitest-environment node
import { describe, it, expect, vi } from "vitest"
import app from "./index"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CONTRACTOR_ID = "contractor-001"

function makeR2Mock() {
  return {
    put: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
  }
}

function makeD1Mock(logoUrl: string | null = null) {
  const run = vi.fn().mockResolvedValue(undefined)
  const first = vi.fn().mockResolvedValue({ logo_url: logoUrl })

  const stmt = {
    bind: vi.fn().mockReturnValue({ first, run, all: vi.fn() }),
  }

  return {
    prepare: vi.fn().mockReturnValue(stmt),
    _run: run,
    _first: first,
    _stmt: stmt,
  }
}

function makeEnv(db: ReturnType<typeof makeD1Mock>, r2 = makeR2Mock()) {
  return {
    DB: db,
    STORAGE: r2,
    TOKENS: {},
    ENVIRONMENT: "development",
    CORS_ORIGINS: "http://localhost:5173",
    HUBSPOT_ACCESS_TOKEN: "",
    TOKEN_SIGNING_SECRET: "",
  }
}

function makeLogoRequest(
  contractorId: string,
  file?: { content: Uint8Array; type: string; name: string },
  headers: Record<string, string> = {}
) {
  const formData = new FormData()
  if (file) {
    const blob = new Blob([file.content], { type: file.type })
    formData.append("file", blob, file.name)
  }

  return new Request(
    `http://localhost/api/v1/contractors/${contractorId}/logo`,
    {
      method: "POST",
      body: formData,
      headers: {
        "x-contractor-id": contractorId,
        ...headers,
      },
    }
  )
}

const TINY_PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]) // PNG header
const TINY_JPEG = new Uint8Array([255, 216, 255, 224]) // JPEG header
const TINY_SVG = new TextEncoder().encode("<svg></svg>")

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/v1/contractors/:contractorId/logo", () => {
  it("uploads a PNG logo and returns the R2 key", async () => {
    const db = makeD1Mock(null)
    const r2 = makeR2Mock()
    const env = makeEnv(db, r2)

    const req = makeLogoRequest(CONTRACTOR_ID, {
      content: TINY_PNG,
      type: "image/png",
      name: "logo.png",
    })

    const res = await app.fetch(req, env)
    expect(res.status).toBe(200)

    const json = (await res.json()) as { ok: boolean; data: { logoUrl: string } }
    expect(json.ok).toBe(true)
    expect(json.data.logoUrl).toBe(`${CONTRACTOR_ID}/logo.png`)

    // R2 put was called
    expect(r2.put).toHaveBeenCalledTimes(1)
    expect(r2.put.mock.calls[0][0]).toBe(`${CONTRACTOR_ID}/logo.png`)
  })

  it("uploads a JPEG logo", async () => {
    const db = makeD1Mock(null)
    const r2 = makeR2Mock()
    const env = makeEnv(db, r2)

    const req = makeLogoRequest(CONTRACTOR_ID, {
      content: TINY_JPEG,
      type: "image/jpeg",
      name: "logo.jpg",
    })

    const res = await app.fetch(req, env)
    expect(res.status).toBe(200)

    const json = (await res.json()) as { ok: boolean; data: { logoUrl: string } }
    expect(json.data.logoUrl).toBe(`${CONTRACTOR_ID}/logo.jpg`)
  })

  it("uploads an SVG logo", async () => {
    const db = makeD1Mock(null)
    const r2 = makeR2Mock()
    const env = makeEnv(db, r2)

    const req = makeLogoRequest(CONTRACTOR_ID, {
      content: TINY_SVG,
      type: "image/svg+xml",
      name: "logo.svg",
    })

    const res = await app.fetch(req, env)
    expect(res.status).toBe(200)

    const json = (await res.json()) as { ok: boolean; data: { logoUrl: string } }
    expect(json.data.logoUrl).toBe(`${CONTRACTOR_ID}/logo.svg`)
  })

  it("deletes previous logo from R2 when one exists", async () => {
    const db = makeD1Mock(`${CONTRACTOR_ID}/logo.png`)
    const r2 = makeR2Mock()
    const env = makeEnv(db, r2)

    const req = makeLogoRequest(CONTRACTOR_ID, {
      content: TINY_JPEG,
      type: "image/jpeg",
      name: "new-logo.jpg",
    })

    const res = await app.fetch(req, env)
    expect(res.status).toBe(200)

    // Should delete old logo then put new one
    expect(r2.delete).toHaveBeenCalledTimes(1)
    expect(r2.delete.mock.calls[0][0]).toBe(`${CONTRACTOR_ID}/logo.png`)
    expect(r2.put).toHaveBeenCalledTimes(1)
  })

  it("rejects missing file", async () => {
    const db = makeD1Mock(null)
    const env = makeEnv(db)

    const req = makeLogoRequest(CONTRACTOR_ID) // no file
    const res = await app.fetch(req, env)
    expect(res.status).toBe(422)

    const json = (await res.json()) as { ok: boolean; fields: { file: string } }
    expect(json.ok).toBe(false)
    expect(json.fields.file).toMatch(/required/)
  })

  it("rejects unsupported content type", async () => {
    const db = makeD1Mock(null)
    const env = makeEnv(db)

    const req = makeLogoRequest(CONTRACTOR_ID, {
      content: new Uint8Array([0, 0, 0]),
      type: "application/pdf",
      name: "doc.pdf",
    })

    const res = await app.fetch(req, env)
    expect(res.status).toBe(422)

    const json = (await res.json()) as { ok: boolean; fields: { file: string } }
    expect(json.ok).toBe(false)
    expect(json.fields.file).toMatch(/JPEG|PNG|SVG/)
  })

  it("rejects file over 2MB", async () => {
    const db = makeD1Mock(null)
    const env = makeEnv(db)

    const largeContent = new Uint8Array(2 * 1024 * 1024 + 1) // just over 2MB
    const req = makeLogoRequest(CONTRACTOR_ID, {
      content: largeContent,
      type: "image/png",
      name: "huge.png",
    })

    const res = await app.fetch(req, env)
    expect(res.status).toBe(422)

    const json = (await res.json()) as { ok: boolean; fields: { file: string } }
    expect(json.ok).toBe(false)
    expect(json.fields.file).toMatch(/2MB/)
  })

  it("rejects unauthenticated request", async () => {
    const db = makeD1Mock(null)
    const env = makeEnv(db)

    const formData = new FormData()
    formData.append("file", new Blob([TINY_PNG], { type: "image/png" }), "logo.png")

    const req = new Request(
      `http://localhost/api/v1/contractors/${CONTRACTOR_ID}/logo`,
      { method: "POST", body: formData }
      // No x-contractor-id header
    )

    const res = await app.fetch(req, env)
    expect(res.status).toBe(401)
  })

  it("rejects request for different contractor (tenant isolation)", async () => {
    const db = makeD1Mock(null)
    const env = makeEnv(db)

    const req = makeLogoRequest("other-contractor", {
      content: TINY_PNG,
      type: "image/png",
      name: "logo.png",
    })
    // x-contractor-id is set to "other-contractor" but we're requesting for contractor-001
    // Actually, makeLogoRequest sets x-contractor-id to the first arg, so let's flip it
    const req2 = new Request(
      `http://localhost/api/v1/contractors/${CONTRACTOR_ID}/logo`,
      {
        method: "POST",
        body: (() => {
          const fd = new FormData()
          fd.append("file", new Blob([TINY_PNG], { type: "image/png" }), "logo.png")
          return fd
        })(),
        headers: {
          "x-contractor-id": "other-contractor",
        },
      }
    )

    const res = await app.fetch(req2, env)
    expect(res.status).toBe(403)
  })
})
