import { Hono } from "hono"
import { env } from "cloudflare:test"
import { describe, it, expect, beforeEach } from "vitest"
import { setupDb, seedContractorWithBilling } from "../test-helpers"
import { requireActiveBilling } from "./billingGuard"

beforeEach(async () => {
  await setupDb()
})

type Bindings = typeof env

function makeTestApp(contractorId: string | null) {
  const app = new Hono<{ Bindings: Bindings }>()
  app.use(async (c, next) => {
    if (contractorId) {
      c.set("contractorId" as never, contractorId)
    }
    await next()
  })
  app.get("/test", requireActiveBilling(), (c) => c.json({ ok: true }, 200))
  return app
}

describe("requireActiveBilling", () => {
  it("allows active billing_status", async () => {
    const contractor = await seedContractorWithBilling({ billingStatus: "active" })
    const app = makeTestApp(contractor.id)
    const res = await app.fetch(new Request("http://localhost/test"), env)
    expect(res.status).toBe(200)
  })

  it("allows past_due billing_status (within grace period)", async () => {
    const contractor = await seedContractorWithBilling({ billingStatus: "past_due" })
    const app = makeTestApp(contractor.id)
    const res = await app.fetch(new Request("http://localhost/test"), env)
    expect(res.status).toBe(200)
  })

  it("allows trialing billing_status", async () => {
    const contractor = await seedContractorWithBilling({ billingStatus: "trialing" })
    const app = makeTestApp(contractor.id)
    const res = await app.fetch(new Request("http://localhost/test"), env)
    expect(res.status).toBe(200)
  })

  it("blocks suspended billing_status with 402", async () => {
    const contractor = await seedContractorWithBilling({ billingStatus: "suspended" })
    const app = makeTestApp(contractor.id)
    const res = await app.fetch(new Request("http://localhost/test"), env)
    expect(res.status).toBe(402)
    const body = (await res.json()) as { ok: boolean; code: string; error: string }
    expect(body.ok).toBe(false)
    expect(body.code).toBe("BILLING_SUSPENDED")
  })

  it("blocks canceled billing_status with 402", async () => {
    const contractor = await seedContractorWithBilling({ billingStatus: "canceled" })
    const app = makeTestApp(contractor.id)
    const res = await app.fetch(new Request("http://localhost/test"), env)
    expect(res.status).toBe(402)
    const body = (await res.json()) as { ok: boolean; code: string; error: string }
    expect(body.ok).toBe(false)
    expect(body.code).toBe("BILLING_SUSPENDED")
  })

  it("allows billing_exempt = 1 even when suspended", async () => {
    const contractor = await seedContractorWithBilling({ billingStatus: "suspended", billingExempt: 1 })
    const app = makeTestApp(contractor.id)
    const res = await app.fetch(new Request("http://localhost/test"), env)
    expect(res.status).toBe(200)
  })

  it("allows billing_exempt = 1 when canceled", async () => {
    const contractor = await seedContractorWithBilling({ billingStatus: "canceled", billingExempt: 1 })
    const app = makeTestApp(contractor.id)
    const res = await app.fetch(new Request("http://localhost/test"), env)
    expect(res.status).toBe(200)
  })

  it("fails open when contractor not found in DB", async () => {
    const app = makeTestApp("00000000-dead-beef-0000-000000000000")
    const res = await app.fetch(new Request("http://localhost/test"), env)
    expect(res.status).toBe(200)
  })

  it("skips billing check when no contractorId in context (public route)", async () => {
    const app = makeTestApp(null)
    const res = await app.fetch(new Request("http://localhost/test"), env)
    expect(res.status).toBe(200)
  })
})
