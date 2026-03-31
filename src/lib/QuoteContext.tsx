import { createContext, useContext } from "react"
import type { Quote } from "./quoteStore"

type QuoteContextValue = {
  quote: Quote
  readOnly: boolean
  /** Ref that child forms set to expose their current values for Save. */
  valuesRef?: React.MutableRefObject<(() => Record<string, unknown>) | null>
  /** Called by child forms when a field value changes (triggers auto-save). */
  onFieldChange?: () => void
}

const QuoteContext = createContext<QuoteContextValue | null>(null)

export function QuoteProvider({
  quote,
  readOnly,
  valuesRef,
  onFieldChange,
  children,
}: {
  quote: Quote
  readOnly: boolean
  valuesRef?: React.MutableRefObject<(() => Record<string, unknown>) | null>
  onFieldChange?: () => void
  children: React.ReactNode
}) {
  return (
    <QuoteContext.Provider value={{ quote, readOnly, valuesRef, onFieldChange }}>
      {children}
    </QuoteContext.Provider>
  )
}

export function useQuoteContext(): QuoteContextValue | null {
  return useContext(QuoteContext)
}
