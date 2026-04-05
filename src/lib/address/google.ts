import type { AddressComponents, AddressProvider, AddressSuggestion } from "./types"

const API_KEY = import.meta.env.VITE_GOOGLE_PLACES_API_KEY as string | undefined

export class GooglePlacesProvider implements AddressProvider {
  async suggest(query: string): Promise<AddressSuggestion[]> {
    if (!API_KEY) {
      if (import.meta.env.DEV) console.warn("VITE_GOOGLE_PLACES_API_KEY not set")
      return []
    }

    const res = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": API_KEY,
      },
      body: JSON.stringify({
        input: query,
        includedPrimaryTypes: ["geocode", "street_address"],
      }),
    })

    if (!res.ok) return []

    const json = await res.json()
    const suggestions: { placePrediction?: { placeId?: string; text?: { text?: string } } }[] =
      json.suggestions ?? []

    return suggestions
      .filter((s) => s.placePrediction?.placeId && s.placePrediction?.text?.text)
      .map((s) => ({
        id: s.placePrediction!.placeId!,
        label: s.placePrediction!.text!.text!,
      }))
  }

  async resolve(placeId: string): Promise<AddressComponents> {
    if (!API_KEY) throw new Error("VITE_GOOGLE_PLACES_API_KEY not set")

    const params = new URLSearchParams({
      key: API_KEY,
      place_id: placeId,
      fields: "address_components,formatted_address",
    })
    const res = await fetch(`https://maps.googleapis.com/maps/api/place/details/json?${params}`)
    if (!res.ok) throw new Error(`Place Details failed: ${res.status}`)

    const json = await res.json()
    const result = json.result as {
      formatted_address?: string
      address_components?: { long_name: string; short_name: string; types: string[] }[]
    }

    const components = result.address_components ?? []
    const get = (type: string) =>
      components.find((c) => c.types.includes(type))?.long_name ?? ""
    const getShort = (type: string) =>
      components.find((c) => c.types.includes(type))?.short_name ?? ""

    const streetNumber = get("street_number")
    const route = get("route")
    const street = [streetNumber, route].filter(Boolean).join(" ")

    return {
      street,
      city: get("locality") || get("sublocality") || get("postal_town"),
      state: getShort("administrative_area_level_1"),
      zip: get("postal_code"),
      country: getShort("country"),
      raw: result.formatted_address ?? "",
    }
  }
}
