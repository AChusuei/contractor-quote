import { describe, it, expect, vi, beforeEach } from "vitest"

// API_KEY is a module-level constant captured at import time.
// We must use vi.resetModules() + dynamic imports so each test
// gets a fresh module with the stubbed env variable applied.

const mockFeature = {
  id: "address.abc123",
  place_name: "123 Main St, Springfield, IL 62701, United States",
  context: [
    { id: "place.1", text: "Springfield" },
    { id: "region.1", text: "Illinois" },
    { id: "postcode.1", text: "62701" },
    { id: "country.1", text: "United States" },
  ],
}

const mockFetch = vi.fn()

beforeEach(() => {
  vi.resetModules()
  vi.stubGlobal("fetch", mockFetch)
  vi.stubEnv("VITE_CQ_MAPBOX_API_KEY", "test-key")
  mockFetch.mockReset()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe("MapboxProvider — suggest()", () => {
  it("fetches from mapbox and returns suggestions", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ features: [mockFeature] }),
    })

    const { MapboxProvider } = await import("./mapbox")
    const provider = new MapboxProvider()
    const results = await provider.suggest("123 Main")

    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(mockFetch.mock.calls[0][0]).toContain("mapbox.places")
    expect(results).toEqual([{ id: mockFeature.id, label: mockFeature.place_name }])
  })

  it("caches the full feature data from suggest()", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ features: [mockFeature] }),
    })

    const { MapboxProvider } = await import("./mapbox")
    const provider = new MapboxProvider()
    await provider.suggest("123 Main")

    // resolve() should succeed without fetching again
    const components = await provider.resolve(mockFeature.id)
    expect(mockFetch).toHaveBeenCalledTimes(1) // still only 1 call
    expect(components.raw).toBe(mockFeature.place_name)
  })
})

describe("MapboxProvider — resolve()", () => {
  it("uses cached feature data without making a second fetch", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ features: [mockFeature] }),
    })

    const { MapboxProvider } = await import("./mapbox")
    const provider = new MapboxProvider()
    await provider.suggest("123 Main")

    const fetchCallsBefore = mockFetch.mock.calls.length
    const components = await provider.resolve(mockFeature.id)
    const fetchCallsAfter = mockFetch.mock.calls.length

    expect(fetchCallsAfter).toBe(fetchCallsBefore) // no new fetch
    expect(components).toEqual({
      street: "123 Main St",
      city: "Springfield",
      state: "Illinois",
      zip: "62701",
      country: "United States",
      raw: mockFeature.place_name,
    })
  })

  it("throws if id was never cached via suggest()", async () => {
    const { MapboxProvider } = await import("./mapbox")
    const provider = new MapboxProvider()
    await expect(provider.resolve("nonexistent.id")).rejects.toThrow(
      "Mapbox: no cached feature for id nonexistent.id"
    )
    expect(mockFetch).not.toHaveBeenCalled()
  })
})
