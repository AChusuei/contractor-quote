import { SELF } from "cloudflare:test"
import { describe, it, expect, beforeEach } from "vitest"
import {
  setupDb,
  seedContractor,
  seedCustomer,
  seedQuote,
  seedSuperUser,
  authHeaders,
  apiUrl,
} from "./test-helpers"

beforeEach(async () => {
  await setupDb()
})

// ---------------------------------------------------------------------------
// Helper: build a fake dev-mode JWT with an email claim
// (verifyClerkJwt falls back to unsigned parse when CLERK_JWKS_URL is absent)
// ---------------------------------------------------------------------------
function emailJwtHeaders(email: string, extra: Record<string, unknown> = {}): Record<string, string> {
  const header = btoa(JSON.stringify({ alg: "none", typ: "JWT" }))
  const payload = btoa(JSON.stringify({ email, ...extra }))
  return { Authorization: `Bearer ${header}.${payload}.fake` }
}

// ---------------------------------------------------------------------------
// isPlatformAdmin — super_users DB fallback
// ---------------------------------------------------------------------------

describe("isPlatformAdmin — super_users DB fallback", () => {
  it("allows super user in DB to impersonate a contractor via x-super-contractor-id", async () => {
    const contractor = await seedContractor()
    await seedSuperUser({ email: "superadmin@test.example" })
    const customer = await seedCustomer(contractor.id)
    await seedQuote(customer.id, contractor.id)

    const res = await SELF.fetch(apiUrl(`/contractors/${contractor.id}/quotes`), {
      headers: {
        ...emailJwtHeaders("superadmin@test.example"),
        "x-super-contractor-id": contractor.id,
      },
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean }
    expect(body.ok).toBe(true)
  })

  it("rejects impersonation attempt from a user not in super_users", async () => {
    const contractor = await seedContractor()
    // No super user seeded — this user is not in the table

    const res = await SELF.fetch(apiUrl(`/contractors/${contractor.id}/quotes`), {
      headers: {
        ...emailJwtHeaders("notanadmin@example.com"),
        "x-super-contractor-id": contractor.id,
      },
    })

    // Without a valid super admin, the x-super-contractor-id header is ignored.
    // Auth then falls through to the regular JWT path which has no contractorId claim → 401.
    expect(res.status).toBe(401)
  })

  it("allows impersonation of a different contractor than the one in JWT", async () => {
    const contractorA = await seedContractor({ id: "00000000-0000-4000-8000-000000000001", slug: "contractor-a", name: "Contractor A" })
    const contractorB = await seedContractor({ id: "00000000-0000-4000-8000-000000000002", slug: "contractor-b", name: "Contractor B" })
    await seedSuperUser({ email: "superadmin@test.example" })
    const customer = await seedCustomer(contractorB.id)
    await seedQuote(customer.id, contractorB.id)

    // Super admin accesses contractorB's quotes using contractorA's JWT context — impersonation
    const res = await SELF.fetch(apiUrl(`/contractors/${contractorB.id}/quotes`), {
      headers: {
        ...emailJwtHeaders("superadmin@test.example"),
        "x-super-contractor-id": contractorB.id,
      },
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean }
    expect(body.ok).toBe(true)
    void contractorA
  })

  it("regular contractor cannot use x-super-contractor-id to bypass ownership", async () => {
    const contractorA = await seedContractor({ id: "00000000-0000-4000-8000-000000000001", slug: "ca", name: "CA" })
    const contractorB = await seedContractor({ id: "00000000-0000-4000-8000-000000000002", slug: "cb", name: "CB" })

    // contractorA's staff member tries to access contractorB by spoofing the header
    const res = await SELF.fetch(apiUrl(`/contractors/${contractorB.id}/quotes`), {
      headers: {
        "x-contractor-id": contractorA.id,
        "x-super-contractor-id": contractorB.id,
      },
    })

    // Should get 403 because auth context is contractorA, but route is contractorB
    expect(res.status).toBe(403)
  })
})

// ---------------------------------------------------------------------------
// requireActiveBilling — billing guard middleware
// ---------------------------------------------------------------------------

describe("requireActiveBilling", () => {
  it("allows access when billing_status is active", async () => {
    const contractor = await seedContractor({ billingStatus: "active" })
    const customer = await seedCustomer(contractor.id)
    await seedQuote(customer.id, contractor.id)

    const res = await SELF.fetch(apiUrl(`/contractors/${contractor.id}/quotes`), {
      headers: authHeaders(contractor.id),
    })

    expect(res.status).toBe(200)
  })

  it("allows access when billing_status is past_due", async () => {
    const contractor = await seedContractor({ billingStatus: "past_due" })
    const customer = await seedCustomer(contractor.id)
    await seedQuote(customer.id, contractor.id)

    const res = await SELF.fetch(apiUrl(`/contractors/${contractor.id}/quotes`), {
      headers: authHeaders(contractor.id),
    })

    expect(res.status).toBe(200)
  })

  it("blocks access with 402 when billing_status is suspended", async () => {
    const contractor = await seedContractor({ billingStatus: "suspended" })

    const res = await SELF.fetch(apiUrl(`/contractors/${contractor.id}/quotes`), {
      headers: authHeaders(contractor.id),
    })

    expect(res.status).toBe(402)
    const body = (await res.json()) as { ok: boolean; code: string }
    expect(body.ok).toBe(false)
    expect(body.code).toBe("BILLING_SUSPENDED")
  })

  it("blocks access with 402 when billing_status is canceled", async () => {
    const contractor = await seedContractor({ billingStatus: "canceled" })

    const res = await SELF.fetch(apiUrl(`/contractors/${contractor.id}/quotes`), {
      headers: authHeaders(contractor.id),
    })

    expect(res.status).toBe(402)
    const body = (await res.json()) as { ok: boolean; code: string }
    expect(body.ok).toBe(false)
    expect(body.code).toBe("BILLING_SUSPENDED")
  })

  it("allows access when billing_exempt is 1 regardless of billing_status", async () => {
    const contractor = await seedContractor({ billingStatus: "suspended", billingExempt: 1 })

    const res = await SELF.fetch(apiUrl(`/contractors/${contractor.id}/quotes`), {
      headers: authHeaders(contractor.id),
    })

    // Exempt contractors pass billing check; no customers/quotes seeded so 200 with empty list
    expect(res.status).toBe(200)
  })
})
