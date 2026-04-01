import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import { useNavigate } from "react-router-dom"
import { useAuth } from "@clerk/clerk-react"
import { apiGet, setAuthProvider } from "@/lib/api"

interface ContractorInfo {
  id: string
  name: string
  slug?: string
}

interface ContractorSessionValue {
  contractorId: string
  contractorName: string
  isSuperAdmin: boolean
  /** Full contractor list — populated for super admins only (for dropdown). */
  contractors: ContractorInfo[]
  logoUrl: string | null
  loading: boolean
  error: string | null
}

const ContractorSessionContext = createContext<ContractorSessionValue>({
  contractorId: "",
  contractorName: "",
  isSuperAdmin: false,
  contractors: [],
  logoUrl: null,
  loading: true,
  error: null,
})

export function useContractorSession(): ContractorSessionValue {
  return useContext(ContractorSessionContext)
}

export function ContractorSessionProvider({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, getToken } = useAuth()
  const navigate = useNavigate()
  const [value, setValue] = useState<ContractorSessionValue>({
    contractorId: "",
    contractorName: "",
    isSuperAdmin: false,
    contractors: [],
    logoUrl: null,
    loading: true,
    error: null,
  })

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return
    setAuthProvider(() => getToken())

    const superContractorId = sessionStorage.getItem("cq_super_contractor_id")
    const superContractorName = sessionStorage.getItem("cq_super_contractor_name")

    if (superContractorId && superContractorName) {
      // Super admin impersonating a contractor — fetch full contractor list and logo in parallel
      Promise.all([
        apiGet<ContractorInfo[]>("/platform/contractors"),
        apiGet<{ logoUrl: string | null }>(`/contractors/${superContractorId}`),
      ])
        .then(([contractorsRes, profileRes]) => {
          const contractors = contractorsRes.ok
            ? (contractorsRes.data as Array<{ id: string; name: string; slug?: string }>).map((c) => ({
                id: c.id,
                name: c.name,
                slug: c.slug,
              }))
            : []
          const logoUrl = profileRes.ok ? (profileRes.data as { logoUrl: string | null }).logoUrl ?? null : null
          setValue({
            contractorId: superContractorId,
            contractorName: superContractorName,
            isSuperAdmin: true,
            contractors,
            logoUrl,
            loading: false,
            error: null,
          })
        })
        .catch(() => {
          setValue({
            contractorId: superContractorId,
            contractorName: superContractorName,
            isSuperAdmin: true,
            contractors: [],
            logoUrl: null,
            loading: false,
            error: null,
          })
        })
    } else {
      // No super contractor in sessionStorage — check if this user is a super admin
      // who hasn't selected a contractor yet, or a regular staff member.
      apiGet<{ isPlatformAdmin: boolean }>("/platform/check")
        .then((res) => {
          if (res.ok) {
            // Super admin without a contractor selected — force portal selection
            navigate("/admin/contractors")
          } else {
            // Regular staff — look up their contractor by email via the API
            return apiGet<{ contractorId: string; contractorName: string; role: string }>("/me/contractor")
              .then(async (staffRes) => {
                if (staffRes.ok) {
                  const profileRes = await apiGet<{ logoUrl: string | null }>(`/contractors/${staffRes.data.contractorId}`)
                  const logoUrl = profileRes.ok ? (profileRes.data as { logoUrl: string | null }).logoUrl ?? null : null
                  setValue({
                    contractorId: staffRes.data.contractorId,
                    contractorName: staffRes.data.contractorName,
                    isSuperAdmin: false,
                    contractors: [],
                    logoUrl,
                    loading: false,
                    error: null,
                  })
                } else {
                  setValue((prev) => ({ ...prev, loading: false, error: staffRes.error }))
                }
              })
          }
        })
        .catch((err) => {
          setValue((prev) => ({
            ...prev,
            loading: false,
            error: err instanceof Error ? err.message : "Failed to load contractor",
          }))
        })
    }
  }, [isLoaded, isSignedIn, getToken, navigate])

  return (
    <ContractorSessionContext.Provider value={value}>
      {children}
    </ContractorSessionContext.Provider>
  )
}
