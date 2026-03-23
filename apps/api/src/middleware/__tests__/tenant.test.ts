import { describe, it, expect, vi } from "vitest"
import { Hono } from "hono"
import {
  requireQuoteOwnership,
  requireSelfContractor,
  requireAppointmentOwnership,
} from "../tenant"
import type { Bindings } from "../../types"
import type { AuthVariables } from "../auth"

type AppEnv = { Bindings: Bindings; Variables: AuthVariables }

// ---------------------------------------------------------------------------
// Helpers — build a mini Hono app with the middleware under test
// ---------------------------------------------------------------------------

function mockDb(firstResult: Record<string, unknown> | null) {
  return {
    prepare: () => ({
      bind: () => ({
        first: vi.fn().mockResolvedValue(firstResult),
      }),
    }),
  }
}

function makeEnv(db: unknown) {
  return {
    DB: db,
    STORAGE: {},
    TOKENS: {},
    ENVIRONMENT: "test",
    CORS_ORIGINS: "*",
    HUBSPOT_ACCESS_TOKEN: "",
    TOKEN_SIGNING_SECRET: "",
    CLERK_ISSUER: "",
  } as unknown as Bindings
}

// Sets auth variables as if authMiddleware already ran
function setAuthVars(app: Hono<AppEnv>, contractorId: string) {
  app.use("*", async (c, next) => {
    c.set("clerkUserId", "user-1")
    c.set("contractorId", contractorId)
    c.set("staffId", "staff-1")
    c.set("staffRole", "admin")
    await next()
  })
}

// ---------------------------------------------------------------------------
// requireQuoteOwnership
// ---------------------------------------------------------------------------
describe("requireQuoteOwnership", () => {
  it("allows access when quote belongs to contractor", async () => {
    const db = mockDb({ contractor_id: "contractor-001" })
    const app = new Hono<AppEnv>()
    setAuthVars(app, "contractor-001")
    app.use("/api/quotes/:quoteId", requireQuoteOwnership)
    app.get("/api/quotes/:quoteId", (c) => c.json({ ok: true, data: "quote" }))

    const res = await app.request("/api/quotes/q-1", undefined, makeEnv(db))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, data: "quote" })
  })

  it("returns 403 when quote belongs to different contractor", async () => {
    const db = mockDb({ contractor_id: "contractor-002" })
    const app = new Hono<AppEnv>()
    setAuthVars(app, "contractor-001")
    app.use("/api/quotes/:quoteId", requireQuoteOwnership)
    app.get("/api/quotes/:quoteId", (c) => c.json({ ok: true }))

    const res = await app.request("/api/quotes/q-1", undefined, makeEnv(db))
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body).toEqual({ ok: false, error: "Forbidden", code: "FORBIDDEN" })
  })

  it("returns 404 when quote does not exist", async () => {
    const db = mockDb(null)
    const app = new Hono<AppEnv>()
    setAuthVars(app, "contractor-001")
    app.use("/api/quotes/:quoteId", requireQuoteOwnership)
    app.get("/api/quotes/:quoteId", (c) => c.json({ ok: true }))

    const res = await app.request("/api/quotes/q-missing", undefined, makeEnv(db))
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body).toEqual({ ok: false, error: "Quote not found", code: "NOT_FOUND" })
  })
})

// ---------------------------------------------------------------------------
// requireSelfContractor
// ---------------------------------------------------------------------------
describe("requireSelfContractor", () => {
  it("allows access when param matches authenticated contractor", async () => {
    const db = mockDb(null)
    const app = new Hono<AppEnv>()
    setAuthVars(app, "contractor-001")
    app.use("/api/contractors/:contractorId", requireSelfContractor)
    app.get("/api/contractors/:contractorId", (c) =>
      c.json({ ok: true, data: "contractor" }),
    )

    const res = await app.request(
      "/api/contractors/contractor-001",
      undefined,
      makeEnv(db),
    )
    expect(res.status).toBe(200)
  })

  it("returns 403 when param does not match authenticated contractor", async () => {
    const db = mockDb(null)
    const app = new Hono<AppEnv>()
    setAuthVars(app, "contractor-001")
    app.use("/api/contractors/:contractorId", requireSelfContractor)
    app.get("/api/contractors/:contractorId", (c) => c.json({ ok: true }))

    const res = await app.request(
      "/api/contractors/contractor-999",
      undefined,
      makeEnv(db),
    )
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body).toEqual({ ok: false, error: "Forbidden", code: "FORBIDDEN" })
  })
})

// ---------------------------------------------------------------------------
// requireAppointmentOwnership
// ---------------------------------------------------------------------------
describe("requireAppointmentOwnership", () => {
  it("allows access when appointment belongs to contractor", async () => {
    const db = mockDb({ contractor_id: "contractor-001" })
    const app = new Hono<AppEnv>()
    setAuthVars(app, "contractor-001")
    app.use("/api/appointments/:appointmentId", requireAppointmentOwnership)
    app.get("/api/appointments/:appointmentId", (c) =>
      c.json({ ok: true, data: "appt" }),
    )

    const res = await app.request(
      "/api/appointments/a-1",
      undefined,
      makeEnv(db),
    )
    expect(res.status).toBe(200)
  })

  it("returns 403 when appointment belongs to different contractor", async () => {
    const db = mockDb({ contractor_id: "contractor-other" })
    const app = new Hono<AppEnv>()
    setAuthVars(app, "contractor-001")
    app.use("/api/appointments/:appointmentId", requireAppointmentOwnership)
    app.get("/api/appointments/:appointmentId", (c) => c.json({ ok: true }))

    const res = await app.request(
      "/api/appointments/a-1",
      undefined,
      makeEnv(db),
    )
    expect(res.status).toBe(403)
  })

  it("returns 404 when appointment does not exist", async () => {
    const db = mockDb(null)
    const app = new Hono<AppEnv>()
    setAuthVars(app, "contractor-001")
    app.use("/api/appointments/:appointmentId", requireAppointmentOwnership)
    app.get("/api/appointments/:appointmentId", (c) => c.json({ ok: true }))

    const res = await app.request(
      "/api/appointments/a-missing",
      undefined,
      makeEnv(db),
    )
    expect(res.status).toBe(404)
  })
})
