import { env, SELF } from "cloudflare:test"
import { describe, it, expect, beforeEach } from "vitest"
import { setupDb, seedContractor, seedStaff, authHeaders, jwtEmailAuthHeaders, apiUrl } from "./test-helpers"

const CONTRACTOR_ID = "00000000-0000-4000-8000-000000000001"

beforeEach(async () => {
  await setupDb()
  await seedContractor({ id: CONTRACTOR_ID })
})

// ---------------------------------------------------------------------------
// GET /contractors/:contractorId/billing
// ---------------------------------------------------------------------------

describe("GET /api/v1/contractors/:contractorId/billing", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await SELF.fetch(apiUrl(`/contractors/${CONTRACTOR_ID}/billing`))
    expect(res.status).toBe(401)
  })

  it("returns 403 when wrong contractor", async () => {
    await seedStaff(CONTRACTOR_ID, { email: "owner@test.example", role: "owner" })
    const res = await SELF.fetch(
      apiUrl("/contractors/wrong-contractor-id/billing"),
      { headers: { ...jwtEmailAuthHeaders("owner@test.example") } }
    )
    expect(res.status).toBe(403)
  })

  it("returns 403 when staff role is insufficient (estimator)", async () => {
    await seedStaff(CONTRACTOR_ID, { email: "est@test.example", role: "estimator" })
    const res = await SELF.fetch(
      apiUrl(`/contractors/${CONTRACTOR_ID}/billing`),
      { headers: { ...jwtEmailAuthHeaders("est@test.example") } }
    )
    expect(res.status).toBe(403)
  })

  it("returns billing data for owner", async () => {
    await seedStaff(CONTRACTOR_ID, { email: "owner@test.example", role: "owner" })
    const res = await SELF.fetch(
      apiUrl(`/contractors/${CONTRACTOR_ID}/billing`),
      { headers: { ...jwtEmailAuthHeaders("owner@test.example") } }
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      ok: boolean
      data: {
        billingStatus: string
        monthlyRateCents: number | null
        nextBillingDate: string | null
        paddleCustomerId: string | null
        gracePeriodEndsAt: string | null
      }
    }
    expect(body.ok).toBe(true)
    expect(body.data.billingStatus).toBe("trialing")
    expect(body.data.monthlyRateCents).toBeNull()
    expect(body.data.nextBillingDate).toBeNull()
    expect(body.data.paddleCustomerId).toBeNull()
    expect(body.data.gracePeriodEndsAt).toBeNull()
  })

  it("returns billing data for admin", async () => {
    await seedStaff(CONTRACTOR_ID, { email: "admin@test.example", role: "admin" })
    const res = await SELF.fetch(
      apiUrl(`/contractors/${CONTRACTOR_ID}/billing`),
      { headers: { ...jwtEmailAuthHeaders("admin@test.example") } }
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean; data: { billingStatus: string } }
    expect(body.ok).toBe(true)
    expect(body.data.billingStatus).toBe("trialing")
  })

  it("masks paddle_customer_id when set", async () => {
    await env.DB.prepare(
      "UPDATE contractors SET paddle_customer_id = ? WHERE id = ?"
    )
      .bind("ctm_01hv8gq3318kfkcd794lu14d3d", CONTRACTOR_ID)
      .run()
    await seedStaff(CONTRACTOR_ID, { email: "owner@test.example", role: "owner" })
    const res = await SELF.fetch(
      apiUrl(`/contractors/${CONTRACTOR_ID}/billing`),
      { headers: { ...jwtEmailAuthHeaders("owner@test.example") } }
    )
    const body = (await res.json()) as { ok: boolean; data: { paddleCustomerId: string } }
    expect(body.ok).toBe(true)
    // Should be masked — only last 8 chars visible
    expect(body.data.paddleCustomerId).toMatch(/^\*\*\*/)
    expect(body.data.paddleCustomerId).toMatch(/4lu14d3d$/)
  })

  it("dev mode: allows access when owner staff exists", async () => {
    await seedStaff(CONTRACTOR_ID, { email: "owner@test.example", role: "owner" })
    const res = await SELF.fetch(
      apiUrl(`/contractors/${CONTRACTOR_ID}/billing`),
      { headers: authHeaders(CONTRACTOR_ID) }
    )
    expect(res.status).toBe(200)
  })

  it("dev mode: returns 403 when no owner/admin staff exists", async () => {
    await seedStaff(CONTRACTOR_ID, { email: "est@test.example", role: "estimator" })
    const res = await SELF.fetch(
      apiUrl(`/contractors/${CONTRACTOR_ID}/billing`),
      { headers: authHeaders(CONTRACTOR_ID) }
    )
    expect(res.status).toBe(403)
  })
})

// ---------------------------------------------------------------------------
// POST /contractors/:contractorId/billing/setup
// ---------------------------------------------------------------------------

describe("POST /api/v1/contractors/:contractorId/billing/setup", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await SELF.fetch(
      apiUrl(`/contractors/${CONTRACTOR_ID}/billing/setup`),
      { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }
    )
    expect(res.status).toBe(401)
  })

  it("returns 403 for estimator role", async () => {
    await seedStaff(CONTRACTOR_ID, { email: "est@test.example", role: "estimator" })
    const res = await SELF.fetch(
      apiUrl(`/contractors/${CONTRACTOR_ID}/billing/setup`),
      {
        method: "POST",
        headers: { "Content-Type": "application/json", ...jwtEmailAuthHeaders("est@test.example") },
        body: "{}",
      }
    )
    expect(res.status).toBe(403)
  })

  it("returns 500 when PADDLE_API_KEY is not configured", async () => {
    await seedStaff(CONTRACTOR_ID, { email: "owner@test.example", role: "owner" })
    const res = await SELF.fetch(
      apiUrl(`/contractors/${CONTRACTOR_ID}/billing/setup`),
      {
        method: "POST",
        headers: { "Content-Type": "application/json", ...jwtEmailAuthHeaders("owner@test.example") },
        body: "{}",
      }
    )
    expect(res.status).toBe(500)
    const body = (await res.json()) as { ok: boolean; code: string }
    expect(body.ok).toBe(false)
    expect(body.code).toBe("INTERNAL_ERROR")
  })

  it("returns 403 for field_tech role", async () => {
    await seedStaff(CONTRACTOR_ID, { email: "tech@test.example", role: "field_tech" })
    const res = await SELF.fetch(
      apiUrl(`/contractors/${CONTRACTOR_ID}/billing/setup`),
      {
        method: "POST",
        headers: { "Content-Type": "application/json", ...jwtEmailAuthHeaders("tech@test.example") },
        body: "{}",
      }
    )
    expect(res.status).toBe(403)
  })
})

// ---------------------------------------------------------------------------
// POST /contractors/:contractorId/billing/portal
// ---------------------------------------------------------------------------

describe("POST /api/v1/contractors/:contractorId/billing/portal", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await SELF.fetch(
      apiUrl(`/contractors/${CONTRACTOR_ID}/billing/portal`),
      { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }
    )
    expect(res.status).toBe(401)
  })

  it("returns 403 for estimator role", async () => {
    await seedStaff(CONTRACTOR_ID, { email: "est@test.example", role: "estimator" })
    const res = await SELF.fetch(
      apiUrl(`/contractors/${CONTRACTOR_ID}/billing/portal`),
      {
        method: "POST",
        headers: { "Content-Type": "application/json", ...jwtEmailAuthHeaders("est@test.example") },
        body: "{}",
      }
    )
    expect(res.status).toBe(403)
  })

  it("returns 500 when PADDLE_API_KEY is not configured", async () => {
    await seedStaff(CONTRACTOR_ID, { email: "owner@test.example", role: "owner" })
    const res = await SELF.fetch(
      apiUrl(`/contractors/${CONTRACTOR_ID}/billing/portal`),
      {
        method: "POST",
        headers: { "Content-Type": "application/json", ...jwtEmailAuthHeaders("owner@test.example") },
        body: "{}",
      }
    )
    expect(res.status).toBe(500)
    const body = (await res.json()) as { ok: boolean; code: string }
    expect(body.ok).toBe(false)
    expect(body.code).toBe("INTERNAL_ERROR")
  })

  it("returns 422 when no billing account exists (paddle_customer_id null) — but only if API key set", async () => {
    // Directly set a fake PADDLE_API_KEY in the DB row doesn't help — this tests the validation
    // path before Paddle is called. The "no billing account" check requires PADDLE_API_KEY first.
    // This test verifies the 500 path (no API key) takes priority over the 422 path.
    await seedStaff(CONTRACTOR_ID, { email: "owner@test.example", role: "owner" })
    const res = await SELF.fetch(
      apiUrl(`/contractors/${CONTRACTOR_ID}/billing/portal`),
      {
        method: "POST",
        headers: { "Content-Type": "application/json", ...jwtEmailAuthHeaders("owner@test.example") },
        body: "{}",
      }
    )
    // Without PADDLE_API_KEY set in env, always 500
    expect(res.status).toBe(500)
  })
})

// ---------------------------------------------------------------------------
// DELETE /contractors/:contractorId/billing/cancel
// ---------------------------------------------------------------------------

describe("DELETE /api/v1/contractors/:contractorId/billing/cancel", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await SELF.fetch(
      apiUrl(`/contractors/${CONTRACTOR_ID}/billing/cancel`),
      { method: "DELETE" }
    )
    expect(res.status).toBe(401)
  })

  it("returns 403 for admin role (cancel requires owner only)", async () => {
    await seedStaff(CONTRACTOR_ID, { email: "admin@test.example", role: "admin" })
    const res = await SELF.fetch(
      apiUrl(`/contractors/${CONTRACTOR_ID}/billing/cancel`),
      {
        method: "DELETE",
        headers: jwtEmailAuthHeaders("admin@test.example"),
      }
    )
    expect(res.status).toBe(403)
  })

  it("returns 403 for estimator role", async () => {
    await seedStaff(CONTRACTOR_ID, { email: "est@test.example", role: "estimator" })
    const res = await SELF.fetch(
      apiUrl(`/contractors/${CONTRACTOR_ID}/billing/cancel`),
      {
        method: "DELETE",
        headers: jwtEmailAuthHeaders("est@test.example"),
      }
    )
    expect(res.status).toBe(403)
  })

  it("returns 500 when PADDLE_API_KEY is not configured", async () => {
    await seedStaff(CONTRACTOR_ID, { email: "owner@test.example", role: "owner" })
    const res = await SELF.fetch(
      apiUrl(`/contractors/${CONTRACTOR_ID}/billing/cancel`),
      {
        method: "DELETE",
        headers: jwtEmailAuthHeaders("owner@test.example"),
      }
    )
    expect(res.status).toBe(500)
    const body = (await res.json()) as { ok: boolean; code: string }
    expect(body.ok).toBe(false)
    expect(body.code).toBe("INTERNAL_ERROR")
  })

  it("returns 403 for wrong contractor", async () => {
    await seedStaff(CONTRACTOR_ID, { email: "owner@test.example", role: "owner" })
    const res = await SELF.fetch(
      apiUrl("/contractors/other-contractor/billing/cancel"),
      {
        method: "DELETE",
        headers: jwtEmailAuthHeaders("owner@test.example"),
      }
    )
    expect(res.status).toBe(403)
  })
})
