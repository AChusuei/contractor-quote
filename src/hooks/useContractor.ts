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

function isLocalDev(): boolean {
  const hostname = window.location.hostname
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    /^\d+\.\d+\.\d+\.\d+$/.test(hostname)
  )
}

/**
 * Extract the contractor slug from the subdomain.
 * e.g. central-cabinets.contractorquote.work → "central-cabinets"
 * Returns null on localhost (use sessionStorage instead).
 */
export function getSlugFromDomain(): string | null {
  if (isLocalDev()) return null
  // Production — extract subdomain (e.g. central-cabinets.quotetool.io)
  const parts = window.location.hostname.split(".")
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
 * Fetch contractor public info by ID from the API.
 */
export async function fetchContractorById(id: string): Promise<ContractorPublicInfo> {
  const res = await fetch(`/api/v1/contractors/by-id/${encodeURIComponent(id)}`)
  if (!res.ok) {
    throw new Error(`Contractor not found: ${id}`)
  }
  const json = await res.json() as { ok: boolean; data: ContractorPublicInfo }
  if (!json.ok) {
    throw new Error(`Contractor not found: ${id}`)
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
    if (isLocalDev()) {
      const contractorId = sessionStorage.getItem("cq_super_contractor_id")
      if (!contractorId) {
        setError("Select a contractor from admin portal")
        setLoading(false)
        return
      }
      fetchContractorById(contractorId)
        .then(setContractor)
        .catch((err) => setError(err instanceof Error ? err.message : "Failed to load contractor"))
        .finally(() => setLoading(false))
      return
    }

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
