import { useState } from "react"
import {
  getQuotes,
  type QuoteRecord,
  formatAppointmentStatus,
  appointmentStatusColor,
} from "@/lib/admin"

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
}

export function AdminQuotesPage() {
  const [quotes] = useState<QuoteRecord[]>(() => getQuotes())

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Quotes</h1>
        <p className="text-sm text-muted-foreground mt-1">
          All submitted quote requests with appointment status.
        </p>
      </div>

      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50 border-b">
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Customer</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Address</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Submitted</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Proposed Time</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Appointment</th>
            </tr>
          </thead>
          <tbody>
            {quotes.map((quote, i) => (
              <tr
                key={quote.id}
                className={i % 2 === 0 ? "bg-background" : "bg-muted/20"}
              >
                <td className="px-4 py-3">
                  <div className="font-medium">{quote.customerName}</div>
                  <div className="text-xs text-muted-foreground">{quote.email}</div>
                  <div className="text-xs text-muted-foreground">{quote.phone}</div>
                </td>
                <td className="px-4 py-3 text-muted-foreground max-w-[200px]">
                  {quote.address}
                </td>
                <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                  {formatDate(quote.submittedAt)}
                </td>
                <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                  {quote.proposedTime ? formatDateTime(quote.proposedTime) : "—"}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${appointmentStatusColor(quote.appointmentStatus)}`}
                  >
                    {formatAppointmentStatus(quote.appointmentStatus)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {quotes.length === 0 && (
          <div className="text-center py-12 text-muted-foreground text-sm">
            No quotes yet.
          </div>
        )}
      </div>
    </div>
  )
}
