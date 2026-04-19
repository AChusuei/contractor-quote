import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react"
import { apiGet, apiPost, onBillingSuspended } from "@/lib/api"
import { useContractorSession } from "@/contexts/ContractorSession"

interface BillingContextValue {
  isSuspended: boolean
  redirectToPortal: () => Promise<void>
  portalLoading: boolean
}

const BillingContext = createContext<BillingContextValue>({
  isSuspended: false,
  redirectToPortal: async () => {},
  portalLoading: false,
})

export function useBilling(): BillingContextValue {
  return useContext(BillingContext)
}

export function BillingProvider({ children }: { children: ReactNode }) {
  const { role, isSuperAdmin, loading: sessionLoading } = useContractorSession()
  const [isSuspended, setIsSuspended] = useState(false)
  const [portalLoading, setPortalLoading] = useState(false)

  const canCheckBilling = !sessionLoading && (isSuperAdmin || role === "owner" || role === "admin")

  useEffect(() => {
    if (!canCheckBilling) return
    apiGet<{ billingStatus: string }>("/billing").then((res) => {
      if (res.ok) {
        setIsSuspended(res.data.billingStatus === "suspended")
      }
    })
  }, [canCheckBilling])

  useEffect(() => {
    return onBillingSuspended(() => setIsSuspended(true))
  }, [])

  const redirectToPortal = useCallback(async () => {
    setPortalLoading(true)
    try {
      const res = await apiPost<{ url: string }>("/billing/portal")
      if (res.ok) {
        window.location.href = res.data.url
      }
    } finally {
      setPortalLoading(false)
    }
  }, [])

  return (
    <BillingContext.Provider value={{ isSuspended, redirectToPortal, portalLoading }}>
      {children}
    </BillingContext.Provider>
  )
}
