import { useEffect } from "react"
import { useContractor } from "@/hooks/useContractor"

/**
 * Sets the document title to "{contractor name}: {stage}".
 * Falls back to "Quote: {stage}" if contractor hasn't loaded yet.
 * Restores the base title on unmount.
 */
export function usePageTitle(stage: string) {
  const { contractor } = useContractor()
  const name = contractor?.name ?? "Quote"

  useEffect(() => {
    document.title = `${name}: ${stage}`
    return () => {
      document.title = name
    }
  }, [name, stage])
}
