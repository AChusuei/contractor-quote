import { useState } from "react"
import { Button } from "components"
import {
  getPendingAppointments,
  updateQuoteAppointmentStatus,
  type QuoteRecord,
} from "@/lib/admin"

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
}

type ActionState = { quoteId: string; type: "accept" | "counter" } | null

export function AdminAppointmentQueuePage() {
  const [queue, setQueue] = useState<QuoteRecord[]>(() => getPendingAppointments())
  const [activeAction, setActiveAction] = useState<ActionState>(null)
  const [counterTime, setCounterTime] = useState("")
  const [counterError, setCounterError] = useState("")

  function handleAccept(quoteId: string) {
    updateQuoteAppointmentStatus(quoteId, "confirmed")
    setQueue(getPendingAppointments())
    setActiveAction(null)
  }

  function handleOpenCounter(quoteId: string) {
    setActiveAction({ quoteId, type: "counter" })
    setCounterTime("")
    setCounterError("")
  }

  function handleCounter(quoteId: string) {
    if (!counterTime) {
      setCounterError("Please select a date and time.")
      return
    }
    const proposed = new Date(counterTime)
    if (isNaN(proposed.getTime())) {
      setCounterError("Please enter a valid date and time.")
      return
    }
    updateQuoteAppointmentStatus(quoteId, "countered", proposed.toISOString())
    setQueue(getPendingAppointments())
    setActiveAction(null)
    setCounterTime("")
    setCounterError("")
  }

  function handleCancel() {
    setActiveAction(null)
    setCounterTime("")
    setCounterError("")
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Appointment Queue</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Pending appointment proposals, sorted by earliest proposed time. Accept or counter each.
        </p>
      </div>

      {queue.length === 0 ? (
        <div className="rounded-lg border p-8 text-center text-muted-foreground text-sm">
          No pending appointment proposals.
        </div>
      ) : (
        <div className="space-y-3">
          {queue.map((quote) => {
            const isCountering =
              activeAction?.quoteId === quote.id && activeAction.type === "counter"

            return (
              <div key={quote.id} className="rounded-lg border bg-card p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1 min-w-0">
                    <p className="font-semibold">{quote.customerName}</p>
                    <p className="text-sm text-muted-foreground">{quote.address}</p>
                    <p className="text-sm text-muted-foreground">
                      {quote.email} · {quote.phone}
                    </p>
                    {quote.proposedTime && (
                      <p className="text-sm font-medium mt-2">
                        Proposed:{" "}
                        <span className="text-foreground">
                          {formatDateTime(quote.proposedTime)}
                        </span>
                      </p>
                    )}
                  </div>

                  {!isCountering && (
                    <div className="flex gap-2 shrink-0">
                      <Button
                        size="sm"
                        onClick={() => handleAccept(quote.id)}
                      >
                        Accept
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleOpenCounter(quote.id)}
                      >
                        Counter
                      </Button>
                    </div>
                  )}
                </div>

                {isCountering && (
                  <div className="mt-4 pt-4 border-t space-y-3">
                    <p className="text-sm font-medium">Propose a different time:</p>
                    <div className="flex gap-2 items-start">
                      <div className="flex-1">
                        <input
                          type="datetime-local"
                          value={counterTime}
                          onChange={(e) => {
                            setCounterTime(e.target.value)
                            setCounterError("")
                          }}
                          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                        {counterError && (
                          <p className="mt-1 text-xs text-destructive">{counterError}</p>
                        )}
                      </div>
                      <Button size="sm" onClick={() => handleCounter(quote.id)}>
                        Send Counter
                      </Button>
                      <Button size="sm" variant="ghost" onClick={handleCancel}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
