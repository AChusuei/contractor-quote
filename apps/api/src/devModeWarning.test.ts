import { SELF } from "cloudflare:test"
import { describe, it, expect, vi, afterEach } from "vitest"

// The test env has ENVIRONMENT=development (from wrangler.toml [vars]).
// Tests use http://localhost URLs by default (no warning).
// We test non-localhost URLs to verify the security warning fires.

describe("dev-mode security warning", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("logs a SECURITY WARNING when ENVIRONMENT=development and hostname is not localhost", async () => {
    const spy = vi.spyOn(console, "error")

    await SELF.fetch("https://api.workers.dev/api/v1/health")

    const warned = spy.mock.calls.some(
      (args) => typeof args[0] === "string" && args[0].includes("SECURITY WARNING")
    )
    expect(warned).toBe(true)
  })

  it("includes the hostname in the security warning message", async () => {
    const spy = vi.spyOn(console, "error")

    await SELF.fetch("https://api.workers.dev/api/v1/health")

    const warningMsg = spy.mock.calls
      .map((args) => args[0])
      .find((msg): msg is string => typeof msg === "string" && msg.includes("SECURITY WARNING"))

    expect(warningMsg).toContain("api.workers.dev")
  })

  it("does not log a security warning for localhost requests", async () => {
    const spy = vi.spyOn(console, "error")

    await SELF.fetch("http://localhost/api/v1/health")

    const warned = spy.mock.calls.some(
      (args) => typeof args[0] === "string" && args[0].includes("SECURITY WARNING")
    )
    expect(warned).toBe(false)
  })

  it("does not log a security warning for 127.0.0.1 requests", async () => {
    const spy = vi.spyOn(console, "error")

    await SELF.fetch("http://127.0.0.1/api/v1/health")

    const warned = spy.mock.calls.some(
      (args) => typeof args[0] === "string" && args[0].includes("SECURITY WARNING")
    )
    expect(warned).toBe(false)
  })

  it("still returns a valid response despite the warning", async () => {
    const res = await SELF.fetch("https://api.workers.dev/api/v1/health")
    expect(res.status).toBe(200)
  })
})
