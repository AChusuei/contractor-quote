import { createContext, useContext, useEffect, useState } from "react"

export interface ContractorPublicInfo {
  id: string
  slug: string
  name: string
  logoUrl: string | null
  calendarUrl: string | null
  phone: string | null
}

interface ContractorContextValue {
  contractor: ContractorPublicInfo | null
  loading: boolean
  error: string | null
}

export const ContractorContext = createContext<ContractorContextValue>({
  contractor: null,
  loading: true,
  error: null,
})

export function useContractor(): ContractorContextValue {
  return useContext(ContractorContext)
}

/**
 * Extract the contractor slug from the subdomain.
 * e.g. central-cabinets.contractorquote.work → "central-cabinets"
 * In local dev (localhost), falls back to VITE_CQ_CONTRACTOR_SLUG env var.
 */
export function getSlugFromDomain(): string | null {
  const hostname = window.location.hostname
  // Local dev — no subdomain (localhost, 127.0.0.1, or any IP address)
  const isLocalDev =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    /^\d+\.\d+\.\d+\.\d+$/.test(hostname) // any IPv4 address
  if (isLocalDev) {
    return (import.meta.env.VITE_CQ_CONTRACTOR_SLUG as string | undefined) ?? "central-cabinets"
  }
  // Production — extract subdomain (e.g. central-cabinets.quotetool.io)
  const parts = hostname.split(".")
  if (parts.length >= 3) {
    return parts[0]
  }
  return null
}

/**
 * Fetch contractor public info by slug from the API.
 */
export async function fetchContractorBySlug(slug: string): Promise<ContractorPublicInfo> {
  const res = await fetch(`/api/v1/contractors/by-slug/${encodeURIComponent(slug)}`)
  if (!res.ok) {
    throw new Error(`Contractor not found: ${slug}`)
  }
  const json = await res.json() as { ok: boolean; data: ContractorPublicInfo }
  if (!json.ok) {
    throw new Error(`Contractor not found: ${slug}`)
  }
  return json.data
}

/**
 * Hook that loads contractor info on mount. Use inside ContractorContext.Provider.
 */
export function useContractorLoader(): ContractorContextValue {
  const [contractor, setContractor] = useState<ContractorPublicInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const slug = getSlugFromDomain()
    if (!slug) {
      setError("Could not determine contractor from URL")
      setLoading(false)
      return
    }

    fetchContractorBySlug(slug)
      .then(setContractor)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load contractor"))
      .finally(() => setLoading(false))
  }, [])

  return { contractor, loading, error }
}
