import { GooglePlacesProvider } from "./google"
import { RadarProvider } from "./radar"
import type { AddressProvider } from "./types"

const PROVIDER_KEY = import.meta.env.VITE_ADDRESS_PROVIDER as string | undefined

let _provider: AddressProvider | null | undefined = undefined

export function getAddressProvider(): AddressProvider | null {
  if (_provider !== undefined) return _provider

  if (!PROVIDER_KEY || PROVIDER_KEY === "none") {
    _provider = null
    return null
  }

  if (PROVIDER_KEY === "google") {
    _provider = new GooglePlacesProvider()
    return _provider
  }

  if (PROVIDER_KEY === "radar") {
    _provider = new RadarProvider()
    return _provider
  }

  console.warn(`Unknown VITE_ADDRESS_PROVIDER: "${PROVIDER_KEY}"`)
  _provider = null
  return null
}
