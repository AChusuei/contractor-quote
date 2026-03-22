import { describe, it, expect, vi, beforeEach } from "vitest"

describe("getCalendarProvider", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.unstubAllEnvs()
  })

  it("returns null when VITE_CQ_CALENDAR_PROVIDER is not set", async () => {
    vi.stubEnv("VITE_CQ_CALENDAR_PROVIDER", "")
    const { getCalendarProvider } = await import("./provider")
    expect(getCalendarProvider()).toBeNull()
  })

  it("returns null when VITE_CQ_CALENDAR_PROVIDER is 'none'", async () => {
    vi.stubEnv("VITE_CQ_CALENDAR_PROVIDER", "none")
    const { getCalendarProvider } = await import("./provider")
    expect(getCalendarProvider()).toBeNull()
  })

  it("returns a GoogleCalendarAdapter when VITE_CQ_CALENDAR_PROVIDER is 'google'", async () => {
    vi.stubEnv("VITE_CQ_CALENDAR_PROVIDER", "google")
    const { getCalendarProvider } = await import("./provider")
    const { GoogleCalendarAdapter } = await import("./google")
    expect(getCalendarProvider()).toBeInstanceOf(GoogleCalendarAdapter)
  })

  it("returns null and warns for unknown provider", async () => {
    vi.stubEnv("VITE_CQ_CALENDAR_PROVIDER", "unknown_provider")
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    const { getCalendarProvider } = await import("./provider")
    expect(getCalendarProvider()).toBeNull()
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("unknown_provider"))
    warnSpy.mockRestore()
  })
})
