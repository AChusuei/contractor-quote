import { createContext, useContext } from "react"
import type { Quote } from "./quoteStore"

type QuoteContextValue = {
  quote: Quote
  readOnly: boolean
}

const QuoteContext = createContext<QuoteContextValue | null>(null)

export function QuoteProvider({
  quote,
  readOnly,
  children,
}: {
  quote: Quote
  readOnly: boolean
  children: React.ReactNode
}) {
  return (
    <QuoteContext.Provider value={{ quote, readOnly }}>
      {children}
    </QuoteContext.Provider>
  )
}

export function useQuoteContext(): QuoteContextValue | null {
  return useContext(QuoteContext)
}
