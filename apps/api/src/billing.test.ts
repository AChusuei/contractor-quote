import { env, SELF } from "cloudflare:test"
import { describe, it, expect, beforeEach } from "vitest"
import { setupDb, seedContractor, seedSuperUser, apiUrl } from "./test-helpers"

beforeEach(async () => {
  await setupDb()
})

// ---------------------------------------------------------------------------
// Super admin auth helper for billing endpoints
// ---------------------------------------------------------------------------

function superAdminHeaders(email: string): Record<string, string> {
  return { "x-super-admin-email": email }
}

// ---------------------------------------------------------------------------
// Platform: contractors-extended includes billingStatus
// ---------------------------------------------------------------------------

describe("GET /platform/contractors-extended — billingStatus", () => {
  it("returns billingStatus field defaulting to active", async () => {
    const contractor = await seedContractor()
    await seedSuperUser({ email: "sa@test.example" })

    const res = await SELF.fetch(apiUrl("/platform/contractors-extended"), {
      headers: superAdminHeaders("sa@test.example"),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean; data: Array<{ id: string; billingStatus: string }> }
    const found = body.data.find((c) => c.id === contractor.id)
    expect(found).toBeDefined()
    expect(found!.billingStatus).toBe("active")
  })

  it("returns suspended billingStatus for suspended contractor", async () => {
    const contractor = await seedContractor()
    await seedSuperUser({ email: "sa@test.example" })
    await env.DB.prepare(
      "UPDATE contractors SET billing_status = 'suspended' WHERE id = ?"
    ).bind(contractor.id).run()

    const res = await SELF.fetch(apiUrl("/platform/contractors-extended"), {
      headers: superAdminHeaders("sa@test.example"),
    })
    const body = (await res.json()) as { ok: boolean; data: Array<{ id: string; billingStatus: string }> }
    const found = body.data.find((c) => c.id === contractor.id)
    expect(found!.billingStatus).toBe("suspended")
  })

  it("returns 403 without super admin credentials", async () => {
    const res = await SELF.fetch(apiUrl("/platform/contractors-extended"))
    expect(res.status).toBe(403)
  })
})

// ---------------------------------------------------------------------------
// Platform: GET /platform/contractors/:id includes billing fields
// ---------------------------------------------------------------------------

describe("GET /platform/contractors/:id — billing fields", () => {
  it("returns billing fields with defaults", async () => {
    const contractor = await seedContractor()
    await seedSuperUser({ email: "sa@test.example" })

    const res = await SELF.fetch(apiUrl(`/platform/contractors/${contractor.id}`), {
      headers: superAdminHeaders("sa@test.example"),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      ok: boolean
      data: {
        billingStatus: string
        monthlyRateCents: number
        billingExempt: boolean
        paddleCustomerId: string | null
        gracePeriodEndsAt: string | null
      }
    }
    expect(body.data.billingStatus).toBe("active")
    expect(body.data.monthlyRateCents).toBe(0)
    expect(body.data.billingExempt).toBe(false)
    expect(body.data.paddleCustomerId).toBeNull()
    expect(body.data.gracePeriodEndsAt).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// PATCH /platform/contractors/:id/billing
// ---------------------------------------------------------------------------

describe("PATCH /platform/contractors/:id/billing", () => {
  it("updates monthly_rate_cents", async () => {
    const contractor = await seedContractor()
    await seedSuperUser({ email: "sa@test.example" })

    const res = await SELF.fetch(apiUrl(`/platform/contractors/${contractor.id}/billing`), {
      method: "PATCH",
      headers: { "content-type": "application/json", ...superAdminHeaders("sa@test.example") },
      body: JSON.stringify({ monthly_rate_cents: 4900 }),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean; data: { updated: boolean } }
    expect(body.ok).toBe(true)

    const row = await env.DB.prepare(
      "SELECT monthly_rate_cents FROM contractors WHERE id = ?"
    ).bind(contractor.id).first<{ monthly_rate_cents: number }>()
    expect(row!.monthly_rate_cents).toBe(4900)
  })

  it("updates billing_exempt flag", async () => {
    const contractor = await seedContractor()
    await seedSuperUser({ email: "sa@test.example" })

    const res = await SELF.fetch(apiUrl(`/platform/contractors/${contractor.id}/billing`), {
      method: "PATCH",
      headers: { "content-type": "application/json", ...superAdminHeaders("sa@test.example") },
      body: JSON.stringify({ billing_exempt: true }),
    })
    expect(res.status).toBe(200)

    const row = await env.DB.prepare(
      "SELECT billing_exempt FROM contractors WHERE id = ?"
    ).bind(contractor.id).first<{ billing_exempt: number }>()
    expect(row!.billing_exempt).toBe(1)
  })

  it("updates both fields at once", async () => {
    const contractor = await seedContractor()
    await seedSuperUser({ email: "sa@test.example" })

    const res = await SELF.fetch(apiUrl(`/platform/contractors/${contractor.id}/billing`), {
      method: "PATCH",
      headers: { "content-type": "application/json", ...superAdminHeaders("sa@test.example") },
      body: JSON.stringify({ monthly_rate_cents: 9900, billing_exempt: false }),
    })
    expect(res.status).toBe(200)

    const row = await env.DB.prepare(
      "SELECT monthly_rate_cents, billing_exempt FROM contractors WHERE id = ?"
    ).bind(contractor.id).first<{ monthly_rate_cents: number; billing_exempt: number }>()
    expect(row!.monthly_rate_cents).toBe(9900)
    expect(row!.billing_exempt).toBe(0)
  })

  it("rejects negative monthly_rate_cents", async () => {
    const contractor = await seedContractor()
    await seedSuperUser({ email: "sa@test.example" })

    const res = await SELF.fetch(apiUrl(`/platform/contractors/${contractor.id}/billing`), {
      method: "PATCH",
      headers: { "content-type": "application/json", ...superAdminHeaders("sa@test.example") },
      body: JSON.stringify({ monthly_rate_cents: -100 }),
    })
    expect(res.status).toBe(422)
  })

  it("returns 404 for non-existent contractor", async () => {
    await seedSuperUser({ email: "sa@test.example" })

    const res = await SELF.fetch(apiUrl("/platform/contractors/nonexistent/billing"), {
      method: "PATCH",
      headers: { "content-type": "application/json", ...superAdminHeaders("sa@test.example") },
      body: JSON.stringify({ monthly_rate_cents: 4900 }),
    })
    expect(res.status).toBe(404)
  })

  it("returns 403 without super admin credentials", async () => {
    const contractor = await seedContractor()

    const res = await SELF.fetch(apiUrl(`/platform/contractors/${contractor.id}/billing`), {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ monthly_rate_cents: 4900 }),
    })
    expect(res.status).toBe(403)
  })
})

// ---------------------------------------------------------------------------
// POST /platform/contractors/:id/billing/override-suspension
// ---------------------------------------------------------------------------

describe("POST /platform/contractors/:id/billing/override-suspension", () => {
  it("clears suspended status and grace_period_ends_at", async () => {
    const contractor = await seedContractor()
    await seedSuperUser({ email: "sa@test.example" })
    await env.DB.prepare(
      "UPDATE contractors SET billing_status = 'suspended', grace_period_ends_at = '2026-05-01' WHERE id = ?"
    ).bind(contractor.id).run()

    const res = await SELF.fetch(
      apiUrl(`/platform/contractors/${contractor.id}/billing/override-suspension`),
      {
        method: "POST",
        headers: { "content-type": "application/json", ...superAdminHeaders("sa@test.example") },
        body: JSON.stringify({}),
      }
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean; data: { updated: boolean } }
    expect(body.ok).toBe(true)

    const row = await env.DB.prepare(
      "SELECT billing_status, grace_period_ends_at FROM contractors WHERE id = ?"
    ).bind(contractor.id).first<{ billing_status: string; grace_period_ends_at: string | null }>()
    expect(row!.billing_status).toBe("active")
    expect(row!.grace_period_ends_at).toBeNull()
  })

  it("sets already-active contractor to active (idempotent)", async () => {
    const contractor = await seedContractor()
    await seedSuperUser({ email: "sa@test.example" })

    const res = await SELF.fetch(
      apiUrl(`/platform/contractors/${contractor.id}/billing/override-suspension`),
      {
        method: "POST",
        headers: { "content-type": "application/json", ...superAdminHeaders("sa@test.example") },
        body: JSON.stringify({}),
      }
    )
    expect(res.status).toBe(200)

    const row = await env.DB.prepare(
      "SELECT billing_status FROM contractors WHERE id = ?"
    ).bind(contractor.id).first<{ billing_status: string }>()
    expect(row!.billing_status).toBe("active")
  })

  it("returns 404 for non-existent contractor", async () => {
    await seedSuperUser({ email: "sa@test.example" })

    const res = await SELF.fetch(
      apiUrl("/platform/contractors/nonexistent/billing/override-suspension"),
      {
        method: "POST",
        headers: { "content-type": "application/json", ...superAdminHeaders("sa@test.example") },
        body: JSON.stringify({}),
      }
    )
    expect(res.status).toBe(404)
  })

  it("returns 403 without super admin credentials", async () => {
    const contractor = await seedContractor()

    const res = await SELF.fetch(
      apiUrl(`/platform/contractors/${contractor.id}/billing/override-suspension`),
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }
    )
    expect(res.status).toBe(403)
  })
})
