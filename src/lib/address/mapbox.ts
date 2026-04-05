import type { AddressComponents, AddressProvider, AddressSuggestion } from "./types"

const API_KEY = import.meta.env.VITE_CQ_MAPBOX_API_KEY as string | undefined

interface MapboxFeature {
  id: string
  place_name: string
  context?: { id: string; text: string }[]
}

export class MapboxProvider implements AddressProvider {
  // Cache full feature data from suggest so resolve() doesn't need a second API call
  private _cache = new Map<string, MapboxFeature>()

  async suggest(query: string): Promise<AddressSuggestion[]> {
    if (!API_KEY) {
      if (import.meta.env.DEV) console.warn("VITE_CQ_MAPBOX_API_KEY:", API_KEY ? "set" : "NOT SET")
      return []
    }

    const params = new URLSearchParams({
      access_token: API_KEY,
      autocomplete: "true",
      types: "address",
      limit: "7",
      country: "us",
    })

    const encoded = encodeURIComponent(query)
    const res = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encoded}.json?${params}`
    )

    if (!res.ok) return []

    const json = await res.json()
    const features: MapboxFeature[] = json.features ?? []

    features.forEach((f) => this._cache.set(f.id, f))

    return features.map((f) => ({ id: f.id, label: f.place_name }))
  }

  async resolve(id: string): Promise<AddressComponents> {
    const feature = this._cache.get(id)
    if (!feature) throw new Error(`Mapbox: no cached feature for id ${id}`)

    const ctx = feature.context ?? []
    const get = (type: string) => ctx.find((c) => c.id.startsWith(type))?.text ?? ""

    return {
      street: feature.place_name.split(",")[0]?.trim() ?? "",
      city: get("place"),
      state: get("region"),
      zip: get("postcode"),
      country: get("country"),
      raw: feature.place_name,
    }
  }
}
