import type { ReactNode } from "react"
import { ContractorContext, useContractorLoader } from "@/hooks/useContractor"

export function ContractorProvider({ children }: { children: ReactNode }) {
  const value = useContractorLoader()
  return (
    <ContractorContext.Provider value={value}>
      {children}
    </ContractorContext.Provider>
  )
}
