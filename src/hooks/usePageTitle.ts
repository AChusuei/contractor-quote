import { useEffect } from "react"

const CONTRACTOR_NAME = import.meta.env.VITE_CQ_CONTRACTOR_NAME ?? "Contractor Quote"

/**
 * Sets the document title to "{contractor name} Quotes: {stage}".
 * Restores the base title on unmount.
 */
export function usePageTitle(stage: string) {
  useEffect(() => {
    document.title = `${CONTRACTOR_NAME}: ${stage}`
    return () => {
      document.title = CONTRACTOR_NAME
    }
  }, [stage])
}
