import { usePageTitle } from "@/hooks/usePageTitle"
import { useMemo } from "react"
import { getQuote, getActiveQuoteId } from "@/lib/quoteStore"

const APPOINTMENT_URL = import.meta.env.VITE_CQ_GOOGLE_APPOINTMENT_URL as string | undefined

export function IntakeAppointmentPage() {
  const iframeSrc = useMemo(() => {
    if (!APPOINTMENT_URL) return undefined
    const quoteId = getActiveQuoteId()
    if (!quoteId) return APPOINTMENT_URL
    const quote = getQuote(quoteId)
    if (!quote?.email) return APPOINTMENT_URL
    const url = new URL(APPOINTMENT_URL)
    url.searchParams.set("email", quote.email)
    if (quote.name) url.searchParams.set("name", quote.name)
    return url.toString()
  }, [])

  usePageTitle("Schedule Appointment")
  return (
    <div className="max-w-xl mx-auto">
      <div className="mb-6">
        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Step 4 of 4</p>
        <h1 className="text-2xl font-semibold">Preferred Site Visit Appointment</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Pick a tentative date and time that works for your site visit. Once we receive your request, we'll confirm by email if that date and time work.
        </p>
      </div>

      {iframeSrc ? (
        <iframe
          src={iframeSrc}
          title="Schedule an appointment"
          className="w-full border-0"
          style={{ height: "700px" }}
          allowFullScreen
        />
      ) : (
        <p className="text-sm text-destructive">
          Appointment scheduling is not configured. Please contact us directly to book a time.
        </p>
      )}
    </div>
  )
}
