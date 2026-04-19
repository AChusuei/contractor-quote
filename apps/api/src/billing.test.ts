import { SELF } from "cloudflare:test"
import { describe, it, expect, beforeEach } from "vitest"
import { setupDb, seedContractorWithBilling, seedStaff, authHeaders, apiUrl } from "./test-helpers"

beforeEach(async () => {
  await setupDb()
})

// ---------------------------------------------------------------------------
// GET /billing
// ---------------------------------------------------------------------------

describe("GET /billing", () => {
  it("returns billing info for contractor (owner via x-contractor-id)", async () => {
    const c = await seedContractorWithBilling({
      billingStatus: "active",
      paddleCustomerId: "ctm_abc123",
      paddleSubscriptionId: "sub_abc123",
    })

    const res = await SELF.fetch(apiUrl("/billing"), {
      headers: authHeaders(c.id),
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { ok: boolean; data: Record<string, unknown> }
    expect(body.ok).toBe(true)
    expect(body.data.billingStatus).toBe("active")
    expect(body.data.hasPaddleCustomer).toBe(true)
    expect(body.data.hasPaddleSubscription).toBe(true)
  })

  it("returns 403 for non-admin staff role", async () => {
    const c = await seedContractorWithBilling()
    const staff = await seedStaff(c.id, { role: "estimator", email: "est@test.example" })

    const { env } = await import("cloudflare:test")
    const header = btoa(JSON.stringify({ alg: "none", typ: "JWT" }))
    const payload = btoa(JSON.stringify({ email: staff.email }))
    const fakeJwt = `${header}.${payload}.fake`

    await env.DB.prepare(
      "UPDATE contractors SET billing_status = 'active' WHERE id = ?"
    ).bind(c.id).run()

    const res = await SELF.fetch(apiUrl("/billing"), {
      headers: { Authorization: `Bearer ${fakeJwt}` },
    })
    expect(res.status).toBe(403)
  })

  it("returns 401 when unauthenticated", async () => {
    await seedContractorWithBilling()
    const res = await SELF.fetch(apiUrl("/billing"))
    expect(res.status).toBe(401)
  })

  it("exposes monthlyRateCents and gracePeriodEndsAt", async () => {
    const c = await seedContractorWithBilling({
      billingStatus: "past_due",
      gracePeriodEndsAt: "2026-05-01 00:00:00",
    })
    await (await import("cloudflare:test")).env.DB.prepare(
      "UPDATE contractors SET monthly_rate_cents = 4900 WHERE id = ?"
    ).bind(c.id).run()

    const res = await SELF.fetch(apiUrl("/billing"), {
      headers: authHeaders(c.id),
    })
    const body = await res.json() as { ok: boolean; data: Record<string, unknown> }
    expect(body.ok).toBe(true)
    expect(body.data.monthlyRateCents).toBe(4900)
    expect(body.data.gracePeriodEndsAt).toBe("2026-05-01 00:00:00")
  })
})

// ---------------------------------------------------------------------------
// DELETE /billing/cancel
// ---------------------------------------------------------------------------

describe("DELETE /billing/cancel", () => {
  it("returns 404 when no subscription ID on file", async () => {
    const c = await seedContractorWithBilling({ paddleSubscriptionId: null })
    const res = await SELF.fetch(apiUrl("/billing/cancel"), {
      method: "DELETE",
      headers: authHeaders(c.id),
    })
    expect(res.status).toBe(404)
  })

  it("returns 403 for admin role (only owner can cancel)", async () => {
    const c = await seedContractorWithBilling()
    const staff = await seedStaff(c.id, { role: "admin", email: "admin@test.example" })

    const header = btoa(JSON.stringify({ alg: "none", typ: "JWT" }))
    const payload = btoa(JSON.stringify({ email: staff.email }))
    const fakeJwt = `${header}.${payload}.fake`

    const res = await SELF.fetch(apiUrl("/billing/cancel"), {
      method: "DELETE",
      headers: { Authorization: `Bearer ${fakeJwt}` },
    })
    expect(res.status).toBe(403)
  })
})

// ---------------------------------------------------------------------------
// POST /billing/portal
// ---------------------------------------------------------------------------

describe("POST /billing/portal", () => {
  it("returns 404 when no paddle customer ID on file", async () => {
    const c = await seedContractorWithBilling({ paddleCustomerId: null })
    const res = await SELF.fetch(apiUrl("/billing/portal"), {
      method: "POST",
      headers: authHeaders(c.id),
    })
    expect(res.status).toBe(404)
  })

  it("returns 500 when PADDLE_API_KEY not configured", async () => {
    const c = await seedContractorWithBilling({ paddleCustomerId: "ctm_test123" })
    const res = await SELF.fetch(apiUrl("/billing/portal"), {
      method: "POST",
      headers: authHeaders(c.id),
    })
    expect(res.status).toBe(500)
  })
})
