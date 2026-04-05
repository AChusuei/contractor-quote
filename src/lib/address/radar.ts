import type { AddressComponents, AddressProvider, AddressSuggestion } from "./types"

const API_KEY = import.meta.env.VITE_CQ_RADAR_API_KEY as string | undefined

export class RadarProvider implements AddressProvider {
  async suggest(query: string): Promise<AddressSuggestion[]> {
    if (!API_KEY) {
      if (import.meta.env.DEV) console.warn("VITE_CQ_RADAR_API_KEY not set")
      return []
    }

    const params = new URLSearchParams({ query, limit: "7" })
    const res = await fetch(`https://api.radar.io/v1/search/autocomplete?${params}`, {
      headers: { Authorization: API_KEY },
    })

    if (!res.ok) return []

    const json = await res.json()
    const addresses: {
      placeLabel?: string
      formattedAddress?: string
      addressLabel?: string
      latitude?: number
      longitude?: number
    }[] = json.addresses ?? []

    return addresses.map((a, i) => ({
      id: `radar:${i}:${a.formattedAddress ?? ""}`,
      label: a.formattedAddress ?? a.addressLabel ?? a.placeLabel ?? "",
    })).filter((a) => a.label)
  }

  async resolve(id: string): Promise<AddressComponents> {
    // Radar autocomplete returns full address data inline; the id encodes the
    // formatted address in "radar:<index>:<formattedAddress>" format.
    const formattedAddress = id.split(":").slice(2).join(":")
    if (!API_KEY) throw new Error("VITE_CQ_RADAR_API_KEY not set")

    const params = new URLSearchParams({ query: formattedAddress, limit: "1" })
    const res = await fetch(`https://api.radar.io/v1/geocode/forward?${params}`, {
      headers: { Authorization: API_KEY },
    })
    if (!res.ok) throw new Error(`Radar geocode failed: ${res.status}`)

    const json = await res.json()
    const addr: {
      number?: string
      street?: string
      city?: string
      stateCode?: string
      postalCode?: string
      countryCode?: string
      formattedAddress?: string
    } = json.addresses?.[0] ?? {}

    const street = [addr.number, addr.street].filter(Boolean).join(" ")

    return {
      street,
      city: addr.city ?? "",
      state: addr.stateCode ?? "",
      zip: addr.postalCode ?? "",
      country: addr.countryCode ?? "",
      raw: addr.formattedAddress ?? formattedAddress,
    }
  }
}
