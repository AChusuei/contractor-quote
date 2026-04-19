import { env, SELF } from "cloudflare:test"
import { describe, it, expect, beforeEach } from "vitest"
import {
  setupDb,
  seedContractor,
  seedSuperUser,
  seedCustomer,
  seedQuote,
  authHeaders,
  apiUrl,
} from "./test-helpers"

beforeEach(async () => {
  await setupDb()
})

// ---------------------------------------------------------------------------
// POST /platform/contractors/:id/toggle-access
// ---------------------------------------------------------------------------

describe("POST /platform/contractors/:id/toggle-access", () => {
  it("disables a contractor account", async () => {
    const contractor = await seedContractor()
    await seedSuperUser()

    const res = await SELF.fetch(
      apiUrl(`/platform/contractors/${contractor.id}/toggle-access`),
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-super-admin-email": "superadmin@test.example",
        },
        body: JSON.stringify({ disabled: true }),
      }
    )

    expect(res.status).toBe(200)
    const body = await res.json() as { ok: boolean; data: { account_disabled: boolean } }
    expect(body.ok).toBe(true)
    expect(body.data.account_disabled).toBe(true)

    const row = await env.DB.prepare(
      "SELECT account_disabled FROM contractors WHERE id = ?"
    ).bind(contractor.id).first<{ account_disabled: number }>()
    expect(row?.account_disabled).toBe(1)
  })

  it("enables a contractor account", async () => {
    const contractor = await seedContractor()
    await seedSuperUser()
    await env.DB.prepare(
      "UPDATE contractors SET account_disabled = 1 WHERE id = ?"
    ).bind(contractor.id).run()

    const res = await SELF.fetch(
      apiUrl(`/platform/contractors/${contractor.id}/toggle-access`),
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-super-admin-email": "superadmin@test.example",
        },
        body: JSON.stringify({ disabled: false }),
      }
    )

    expect(res.status).toBe(200)
    const body = await res.json() as { ok: boolean; data: { account_disabled: boolean } }
    expect(body.ok).toBe(true)
    expect(body.data.account_disabled).toBe(false)

    const row = await env.DB.prepare(
      "SELECT account_disabled FROM contractors WHERE id = ?"
    ).bind(contractor.id).first<{ account_disabled: number }>()
    expect(row?.account_disabled).toBe(0)
  })

  it("returns 404 for unknown contractor", async () => {
    await seedSuperUser()

    const res = await SELF.fetch(
      apiUrl("/platform/contractors/nonexistent-id/toggle-access"),
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-super-admin-email": "superadmin@test.example",
        },
        body: JSON.stringify({ disabled: true }),
      }
    )

    expect(res.status).toBe(404)
  })

  it("rejects non-super-admin callers", async () => {
    const contractor = await seedContractor()

    const res = await SELF.fetch(
      apiUrl(`/platform/contractors/${contractor.id}/toggle-access`),
      {
        method: "POST",
        headers: { "content-type": "application/json", ...authHeaders(contractor.id) },
        body: JSON.stringify({ disabled: true }),
      }
    )

    expect(res.status).toBe(403)
  })

  it("returns 400 when disabled field is missing or non-boolean", async () => {
    const contractor = await seedContractor()
    await seedSuperUser()

    const res = await SELF.fetch(
      apiUrl(`/platform/contractors/${contractor.id}/toggle-access`),
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-super-admin-email": "superadmin@test.example",
        },
        body: JSON.stringify({ disabled: "yes" }),
      }
    )

    expect(res.status).toBe(400)
    const body = await res.json() as { ok: boolean; code: string }
    expect(body.ok).toBe(false)
    expect(body.code).toBe("VALIDATION_ERROR")
  })
})

// ---------------------------------------------------------------------------
// GET /platform/contractors/:id — includes accountDisabled
// ---------------------------------------------------------------------------

describe("GET /platform/contractors/:id account_disabled field", () => {
  it("includes accountDisabled: false by default", async () => {
    const contractor = await seedContractor()
    await seedSuperUser()

    const res = await SELF.fetch(
      apiUrl(`/platform/contractors/${contractor.id}`),
      {
        headers: { "x-super-admin-email": "superadmin@test.example" },
      }
    )

    expect(res.status).toBe(200)
    const body = await res.json() as { ok: boolean; data: { accountDisabled: boolean } }
    expect(body.data.accountDisabled).toBe(false)
  })

  it("includes accountDisabled: true after disabling", async () => {
    const contractor = await seedContractor()
    await seedSuperUser()
    await env.DB.prepare(
      "UPDATE contractors SET account_disabled = 1 WHERE id = ?"
    ).bind(contractor.id).run()

    const res = await SELF.fetch(
      apiUrl(`/platform/contractors/${contractor.id}`),
      {
        headers: { "x-super-admin-email": "superadmin@test.example" },
      }
    )

    expect(res.status).toBe(200)
    const body = await res.json() as { ok: boolean; data: { accountDisabled: boolean } }
    expect(body.data.accountDisabled).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Access middleware — disabled account blocks protected routes
// ---------------------------------------------------------------------------

describe("account_disabled access middleware", () => {
  it("blocks protected routes for disabled contractors", async () => {
    const contractor = await seedContractor()
    await env.DB.prepare(
      "UPDATE contractors SET account_disabled = 1 WHERE id = ?"
    ).bind(contractor.id).run()
    const customer = await seedCustomer(contractor.id)
    const quote = await seedQuote(customer.id, contractor.id)

    const res = await SELF.fetch(
      apiUrl(`/quotes/${quote.id}`),
      {
        headers: authHeaders(contractor.id),
      }
    )

    expect(res.status).toBe(403)
    const body = await res.json() as { ok: boolean; code: string }
    expect(body.ok).toBe(false)
    expect(body.code).toBe("ACCOUNT_DISABLED")
  })

  it("allows GET /contractors/:id for disabled contractors (settings exception)", async () => {
    const contractor = await seedContractor()
    await env.DB.prepare(
      "UPDATE contractors SET account_disabled = 1 WHERE id = ?"
    ).bind(contractor.id).run()

    const res = await SELF.fetch(
      apiUrl(`/contractors/${contractor.id}`),
      {
        headers: authHeaders(contractor.id),
      }
    )

    expect(res.status).toBe(200)
  })

  it("allows PATCH /contractors/:id for disabled contractors (settings exception)", async () => {
    const contractor = await seedContractor()
    await env.DB.prepare(
      "UPDATE contractors SET account_disabled = 1 WHERE id = ?"
    ).bind(contractor.id).run()

    const res = await SELF.fetch(
      apiUrl(`/contractors/${contractor.id}`),
      {
        method: "PATCH",
        headers: { "content-type": "application/json", ...authHeaders(contractor.id) },
        body: JSON.stringify({ name: "Updated Name" }),
      }
    )

    expect(res.status).toBe(200)
  })

  it("does not block enabled contractors on protected routes", async () => {
    const contractor = await seedContractor()
    const customer = await seedCustomer(contractor.id)
    const quote = await seedQuote(customer.id, contractor.id)

    const res = await SELF.fetch(
      apiUrl(`/quotes/${quote.id}`),
      {
        headers: authHeaders(contractor.id),
      }
    )

    expect(res.status).toBe(200)
  })

  it("allows GET /contractors/:id/billing for disabled contractors", async () => {
    const contractor = await seedContractor()
    await env.DB.prepare(
      "UPDATE contractors SET account_disabled = 1 WHERE id = ?"
    ).bind(contractor.id).run()
    // Seed an owner so requireStaffRole passes in dev mode
    await env.DB.prepare(
      "INSERT INTO staff (id, contractor_id, name, email, role, active) VALUES (?, ?, ?, ?, ?, 1)"
    ).bind("staff-001", contractor.id, "Owner", "owner@test.example", "owner").run()

    const res = await SELF.fetch(
      apiUrl(`/contractors/${contractor.id}/billing`),
      {
        headers: authHeaders(contractor.id),
      }
    )

    // Should not be blocked with ACCOUNT_DISABLED — billing routes remain accessible
    const body = await res.json() as { ok: boolean; code?: string }
    expect(body.code).not.toBe("ACCOUNT_DISABLED")
    expect(res.status).toBe(200)
  })

  it("allows POST /contractors/:id/billing/portal for disabled contractors", async () => {
    const contractor = await seedContractor()
    await env.DB.prepare(
      "UPDATE contractors SET account_disabled = 1 WHERE id = ?"
    ).bind(contractor.id).run()
    // Seed an owner so requireStaffRole passes in dev mode
    await env.DB.prepare(
      "INSERT INTO staff (id, contractor_id, name, email, role, active) VALUES (?, ?, ?, ?, ?, 1)"
    ).bind("staff-002", contractor.id, "Owner", "owner@test.example", "owner").run()

    const res = await SELF.fetch(
      apiUrl(`/contractors/${contractor.id}/billing/portal`),
      {
        method: "POST",
        headers: { "content-type": "application/json", ...authHeaders(contractor.id) },
      }
    )

    // Should not be blocked with ACCOUNT_DISABLED — billing portal remains accessible.
    // Will fail with VALIDATION_ERROR (no paddle_customer_id), not ACCOUNT_DISABLED.
    const body = await res.json() as { ok: boolean; code?: string }
    expect(body.code).not.toBe("ACCOUNT_DISABLED")
  })
})
