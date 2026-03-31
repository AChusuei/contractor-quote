import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import { useAuth } from "@clerk/clerk-react"
import { apiGet, setAuthProvider } from "@/lib/api"

interface ContractorInfo {
  id: string
  name: string
}

interface ContractorSessionValue {
  contractorId: string
  contractorName: string
  isSuperAdmin: boolean
  /** Full contractor list — populated for super admins only (for dropdown). */
  contractors: ContractorInfo[]
  loading: boolean
  error: string | null
}

const ContractorSessionContext = createContext<ContractorSessionValue>({
  contractorId: "",
  contractorName: "",
  isSuperAdmin: false,
  contractors: [],
  loading: true,
  error: null,
})

export function useContractorSession(): ContractorSessionValue {
  return useContext(ContractorSessionContext)
}

export function ContractorSessionProvider({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, getToken } = useAuth()
  const [value, setValue] = useState<ContractorSessionValue>({
    contractorId: "",
    contractorName: "",
    isSuperAdmin: false,
    contractors: [],
    loading: true,
    error: null,
  })

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return
    setAuthProvider(() => getToken())

    const superContractorId = sessionStorage.getItem("cq_super_contractor_id")
    const superContractorName = sessionStorage.getItem("cq_super_contractor_name")

    if (superContractorId && superContractorName) {
      // Super admin impersonating a contractor — fetch full contractor list for dropdown
      apiGet<ContractorInfo[]>("/platform/contractors")
        .then((res) => {
          const contractors = res.ok
            ? (res.data as Array<{ id: string; name: string }>).map((c) => ({
                id: c.id,
                name: c.name,
              }))
            : []
          setValue({
            contractorId: superContractorId,
            contractorName: superContractorName,
            isSuperAdmin: true,
            contractors,
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
            loading: false,
            error: null,
          })
        })
    } else {
      // Regular staff — look up their contractor by email via the API
      apiGet<{ contractorId: string; contractorName: string; role: string }>("/me/contractor")
        .then((res) => {
          if (res.ok) {
            setValue({
              contractorId: res.data.contractorId,
              contractorName: res.data.contractorName,
              isSuperAdmin: false,
              contractors: [],
              loading: false,
              error: null,
            })
          } else {
            setValue((prev) => ({ ...prev, loading: false, error: res.error }))
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
  }, [isLoaded, isSignedIn, getToken])

  return (
    <ContractorSessionContext.Provider value={value}>
      {children}
    </ContractorSessionContext.Provider>
  )
}
