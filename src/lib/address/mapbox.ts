import type { AddressComponents, AddressProvider, AddressSuggestion } from "./types"

const API_KEY = import.meta.env.VITE_CQ_MAPBOX_API_KEY as string | undefined

export class MapboxProvider implements AddressProvider {
  async suggest(query: string): Promise<AddressSuggestion[]> {
    if (!API_KEY) {
      console.warn("VITE_CQ_MAPBOX_API_KEY:", API_KEY ? "set" : "NOT SET")
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
    return (json.features ?? []).map((f: { id: string; place_name: string }) => ({
      id: f.id,
      label: f.place_name,
    }))
  }

  async resolve(id: string): Promise<AddressComponents> {
    if (!API_KEY) throw new Error("VITE_CQ_MAPBOX_API_KEY not set")

    const params = new URLSearchParams({ access_token: API_KEY })
    const res = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(id)}.json?${params}`
    )
    if (!res.ok) throw new Error(`Mapbox geocode failed: ${res.status}`)

    const json = await res.json()
    const feature = json.features?.[0]
    if (!feature) throw new Error("No result from Mapbox")

    const ctx: { id: string; text: string }[] = feature.context ?? []
    const get = (type: string) => ctx.find((c) => c.id.startsWith(type))?.text ?? ""

    const [streetNumber, ...streetParts] = (feature.place_name as string).split(",")
    const street = streetNumber?.trim() ?? streetParts[0]?.trim() ?? ""

    return {
      street,
      city: get("place"),
      state: get("region"),
      zip: get("postcode"),
      country: get("country"),
      raw: feature.place_name ?? "",
    }
  }
}
