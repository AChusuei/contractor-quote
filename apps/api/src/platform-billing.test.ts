import { SELF } from "cloudflare:test"
import { describe, it, expect, beforeEach } from "vitest"
import {
  setupDb,
  seedContractorWithBilling,
  seedSuperUser,
  apiUrl,
} from "./test-helpers"

beforeEach(async () => {
  await setupDb()
})

function superAdminHeaders(email = "admin@test.example"): Record<string, string> {
  return { "x-super-admin-email": email }
}

// ---------------------------------------------------------------------------
// GET /platform/contractors-extended — billing_status in list
// ---------------------------------------------------------------------------

describe("GET /platform/contractors-extended — billing_status", () => {
  it("includes billingStatus for each contractor", async () => {
    await seedContractorWithBilling({ billingStatus: "active" })
    await seedSuperUser({ email: "admin@test.example" })

    const res = await SELF.fetch(apiUrl("/platform/contractors-extended"), {
      headers: superAdminHeaders(),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean; data: { billingStatus: string }[] }
    expect(body.ok).toBe(true)
    expect(body.data[0].billingStatus).toBe("active")
  })
})

// ---------------------------------------------------------------------------
// GET /platform/contractors/:id — billing fields in detail
// ---------------------------------------------------------------------------

describe("GET /platform/contractors/:id — billing fields", () => {
  it("returns billing fields in contractor detail", async () => {
    const contractor = await seedContractorWithBilling({
      billingStatus: "past_due",
      paddleCustomerId: "ctm_abc123",
      gracePeriodEndsAt: "2026-05-01",
    })
    await seedSuperUser({ email: "admin@test.example" })

    const res = await SELF.fetch(apiUrl(`/platform/contractors/${contractor.id}`), {
      headers: superAdminHeaders(),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      ok: boolean
      data: {
        billingStatus: string
        paddleCustomerId: string | null
        gracePeriodEndsAt: string | null
        monthlyRateCents: number | null
        billingExempt: boolean
      }
    }
    expect(body.data.billingStatus).toBe("past_due")
    expect(body.data.paddleCustomerId).toBe("ctm_abc123")
    expect(body.data.gracePeriodEndsAt).toBe("2026-05-01")
    expect(body.data.monthlyRateCents).toBeNull()
    expect(body.data.billingExempt).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// PATCH /platform/contractors/:id/billing
// ---------------------------------------------------------------------------

describe("PATCH /platform/contractors/:id/billing", () => {
  it("updates monthly_rate_cents and billing_exempt", async () => {
    const contractor = await seedContractorWithBilling()
    await seedSuperUser({ email: "admin@test.example" })

    const res = await SELF.fetch(apiUrl(`/platform/contractors/${contractor.id}/billing`), {
      method: "PATCH",
      headers: { ...superAdminHeaders(), "content-type": "application/json" },
      body: JSON.stringify({ monthly_rate_cents: 4900, billing_exempt: true }),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean; data: { updated: boolean } }
    expect(body.ok).toBe(true)
    expect(body.data.updated).toBe(true)

    // Verify persisted
    const detail = await SELF.fetch(apiUrl(`/platform/contractors/${contractor.id}`), {
      headers: superAdminHeaders(),
    })
    const detailBody = (await detail.json()) as { ok: boolean; data: { monthlyRateCents: number; billingExempt: boolean } }
    expect(detailBody.data.monthlyRateCents).toBe(4900)
    expect(detailBody.data.billingExempt).toBe(true)
  })

  it("returns 404 for unknown contractor", async () => {
    await seedSuperUser({ email: "admin@test.example" })

    const res = await SELF.fetch(apiUrl("/platform/contractors/nonexistent/billing"), {
      method: "PATCH",
      headers: { ...superAdminHeaders(), "content-type": "application/json" },
      body: JSON.stringify({ monthly_rate_cents: 4900 }),
    })
    expect(res.status).toBe(404)
  })

  it("returns 422 for negative monthly_rate_cents", async () => {
    const contractor = await seedContractorWithBilling()
    await seedSuperUser({ email: "admin@test.example" })

    const res = await SELF.fetch(apiUrl(`/platform/contractors/${contractor.id}/billing`), {
      method: "PATCH",
      headers: { ...superAdminHeaders(), "content-type": "application/json" },
      body: JSON.stringify({ monthly_rate_cents: -100 }),
    })
    expect(res.status).toBe(422)
  })

  it("returns 403 without super admin auth", async () => {
    const contractor = await seedContractorWithBilling()

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
  it("clears suspension and sets billing_status to active", async () => {
    const contractor = await seedContractorWithBilling({
      billingStatus: "suspended",
      gracePeriodEndsAt: "2026-03-01",
    })
    await seedSuperUser({ email: "admin@test.example" })

    const res = await SELF.fetch(
      apiUrl(`/platform/contractors/${contractor.id}/billing/override-suspension`),
      {
        method: "POST",
        headers: { ...superAdminHeaders(), "content-type": "application/json" },
        body: JSON.stringify({}),
      }
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean; data: { updated: boolean } }
    expect(body.ok).toBe(true)
    expect(body.data.updated).toBe(true)

    // Verify billing_status is now active and grace period cleared
    const detail = await SELF.fetch(apiUrl(`/platform/contractors/${contractor.id}`), {
      headers: superAdminHeaders(),
    })
    const detailBody = (await detail.json()) as { ok: boolean; data: { billingStatus: string; gracePeriodEndsAt: string | null } }
    expect(detailBody.data.billingStatus).toBe("active")
    expect(detailBody.data.gracePeriodEndsAt).toBeNull()
  })

  it("returns 404 for unknown contractor", async () => {
    await seedSuperUser({ email: "admin@test.example" })

    const res = await SELF.fetch(
      apiUrl("/platform/contractors/nonexistent/billing/override-suspension"),
      {
        method: "POST",
        headers: { ...superAdminHeaders(), "content-type": "application/json" },
        body: JSON.stringify({}),
      }
    )
    expect(res.status).toBe(404)
  })

  it("returns 403 without super admin auth", async () => {
    const contractor = await seedContractorWithBilling({ billingStatus: "suspended" })

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
