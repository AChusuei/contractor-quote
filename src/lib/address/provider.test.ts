import { describe, it, expect, vi, beforeEach } from "vitest"

describe("getAddressProvider", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.unstubAllEnvs()
  })

  it("returns null when VITE_CQ_ADDRESS_PROVIDER is not set", async () => {
    vi.stubEnv("VITE_CQ_ADDRESS_PROVIDER", "")
    const { getAddressProvider } = await import("./provider")
    expect(getAddressProvider()).toBeNull()
  })

  it("returns null when VITE_CQ_ADDRESS_PROVIDER is 'none'", async () => {
    vi.stubEnv("VITE_CQ_ADDRESS_PROVIDER", "none")
    const { getAddressProvider } = await import("./provider")
    expect(getAddressProvider()).toBeNull()
  })

  it("returns a GooglePlacesProvider when VITE_CQ_ADDRESS_PROVIDER is 'google'", async () => {
    vi.stubEnv("VITE_CQ_ADDRESS_PROVIDER", "google")
    const { getAddressProvider } = await import("./provider")
    const { GooglePlacesProvider } = await import("./google")
    expect(getAddressProvider()).toBeInstanceOf(GooglePlacesProvider)
  })

  it("returns null for 'radar' (Radar provider was replaced by Mapbox)", async () => {
    vi.stubEnv("VITE_CQ_ADDRESS_PROVIDER", "radar")
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    const { getAddressProvider } = await import("./provider")
    expect(getAddressProvider()).toBeNull()
    warnSpy.mockRestore()
  })

  it("returns null and warns for unknown provider", async () => {
    vi.stubEnv("VITE_CQ_ADDRESS_PROVIDER", "unknown_provider")
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    const { getAddressProvider } = await import("./provider")
    expect(getAddressProvider()).toBeNull()
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("unknown_provider"))
    warnSpy.mockRestore()
  })
})
