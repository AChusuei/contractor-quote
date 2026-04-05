import { GoogleCalendarAdapter } from "./google"
import type { CalendarProvider } from "./types"

const PROVIDER_KEY = import.meta.env.VITE_CQ_CALENDAR_PROVIDER as string | undefined

let _provider: CalendarProvider | null | undefined = undefined

export function getCalendarProvider(): CalendarProvider | null {
  if (_provider !== undefined) return _provider

  if (!PROVIDER_KEY || PROVIDER_KEY === "none") {
    _provider = null
    return null
  }

  if (PROVIDER_KEY === "google") {
    _provider = new GoogleCalendarAdapter()
    return _provider
  }

  if (import.meta.env.DEV) console.warn(`Unknown VITE_CQ_CALENDAR_PROVIDER: "${PROVIDER_KEY}"`)
  _provider = null
  return null
}
