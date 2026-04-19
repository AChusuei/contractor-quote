import { Hono } from "hono"
import { env } from "cloudflare:test"
import { describe, it, expect, beforeEach } from "vitest"
import { setupDb, seedContractor, seedStaff } from "../test-helpers"
import { requireStaffRole } from "./staffRole"
import type { StaffRole } from "../validation"

beforeEach(async () => {
  await setupDb()
})

type Bindings = typeof env

function makeTestApp(staffId: string | null, allowedRoles: StaffRole[]) {
  const app = new Hono<{ Bindings: Bindings }>()
  app.use(async (c, next) => {
    c.set("staffId" as never, staffId)
    await next()
  })
  app.get("/test", requireStaffRole(allowedRoles), (c) => c.json({ ok: true }, 200))
  return app
}

describe("requireStaffRole", () => {
  it("allows null staffId (treated as owner) when owner is in allowedRoles", async () => {
    const app = makeTestApp(null, ["owner", "admin"])
    const res = await app.fetch(new Request("http://localhost/test"), env)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean }
    expect(body.ok).toBe(true)
  })

  it("null staffId treated as owner passes owner-only restriction", async () => {
    const app = makeTestApp(null, ["owner"])
    const res = await app.fetch(new Request("http://localhost/test"), env)
    expect(res.status).toBe(200)
  })

  it("null staffId treated as owner is blocked when owner not in allowedRoles", async () => {
    const app = makeTestApp(null, ["admin"])
    const res = await app.fetch(new Request("http://localhost/test"), env)
    expect(res.status).toBe(403)
    const body = (await res.json()) as { ok: boolean; code: string }
    expect(body.ok).toBe(false)
    expect(body.code).toBe("FORBIDDEN")
  })

  it("allows admin role when admin is in allowedRoles", async () => {
    const contractor = await seedContractor()
    const staff = await seedStaff(contractor.id, { role: "admin" })
    const app = makeTestApp(staff.id, ["owner", "admin"])
    const res = await app.fetch(new Request("http://localhost/test"), env)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean }
    expect(body.ok).toBe(true)
  })

  it("blocks estimator when only owner/admin allowed", async () => {
    const contractor = await seedContractor()
    const staff = await seedStaff(contractor.id, { role: "estimator" })
    const app = makeTestApp(staff.id, ["owner", "admin"])
    const res = await app.fetch(new Request("http://localhost/test"), env)
    expect(res.status).toBe(403)
    const body = (await res.json()) as { ok: boolean; code: string }
    expect(body.ok).toBe(false)
    expect(body.code).toBe("FORBIDDEN")
  })

  it("blocks field_tech when only owner/admin allowed", async () => {
    const contractor = await seedContractor()
    const staff = await seedStaff(contractor.id, { role: "field_tech" })
    const app = makeTestApp(staff.id, ["owner", "admin"])
    const res = await app.fetch(new Request("http://localhost/test"), env)
    expect(res.status).toBe(403)
    const body = (await res.json()) as { ok: boolean; code: string }
    expect(body.ok).toBe(false)
    expect(body.code).toBe("FORBIDDEN")
  })
})
