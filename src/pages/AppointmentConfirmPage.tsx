import { useEffect, useState } from "react"
import { useParams } from "react-router-dom"
import { Button } from "components"

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? ""

interface Appointment {
  customerName: string
  address: string
  proposedTime: string // ISO 8601
}

type PageState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; appointment: Appointment }
  | { status: "confirmed" }
  | { status: "declined" }

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
}

export function AppointmentConfirmPage() {
  const { token } = useParams<{ token: string }>()
  const [state, setState] = useState<PageState>({ status: "loading" })
  const [isActing, setIsActing] = useState(false)

  useEffect(() => {
    if (!token) {
      setState({ status: "error", message: "Invalid link. Please check your email and try again." })
      return
    }

    fetch(`${API_BASE}/appointments/${token}`)
      .then(async (res) => {
        if (!res.ok) {
          const msg =
            res.status === 404
              ? "This link has expired or is no longer valid."
              : "Unable to load appointment details. Please try again later."
          setState({ status: "error", message: msg })
          return
        }
        const data = (await res.json()) as Appointment
        setState({ status: "ready", appointment: data })
      })
      .catch(() => {
        setState({ status: "error", message: "Unable to load appointment details. Please try again later." })
      })
  }, [token])

  async function handleConfirm() {
    if (!token) return
    setIsActing(true)
    try {
      const res = await fetch(`${API_BASE}/appointments/${token}/confirm`, { method: "POST" })
      if (!res.ok) throw new Error("Confirm failed")
      setState({ status: "confirmed" })
    } catch {
      setState({ status: "error", message: "Something went wrong. Please try again or call us directly." })
    } finally {
      setIsActing(false)
    }
  }

  async function handleDecline() {
    if (!token) return
    setIsActing(true)
    try {
      const res = await fetch(`${API_BASE}/appointments/${token}/decline`, { method: "POST" })
      if (!res.ok) throw new Error("Decline failed")
      setState({ status: "declined" })
    } catch {
      setState({ status: "error", message: "Something went wrong. Please try again or call us directly." })
    } finally {
      setIsActing(false)
    }
  }

  if (state.status === "loading") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading appointment details…</p>
      </div>
    )
  }

  if (state.status === "error") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="max-w-sm text-center space-y-2">
          <p className="text-base font-medium text-destructive">Oops</p>
          <p className="text-sm text-muted-foreground">{state.message}</p>
        </div>
      </div>
    )
  }

  if (state.status === "confirmed") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="max-w-sm text-center space-y-3">
          <div className="text-4xl" role="img" aria-label="checkmark">✓</div>
          <p className="text-xl font-semibold">Appointment confirmed!</p>
          <p className="text-sm text-muted-foreground">
            We'll see you then. You'll receive a reminder closer to the date.
          </p>
        </div>
      </div>
    )
  }

  if (state.status === "declined") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="max-w-sm text-center space-y-3">
          <p className="text-xl font-semibold">Got it, no problem.</p>
          <p className="text-sm text-muted-foreground">
            We'll give you a call to find a time that works better for you.
          </p>
        </div>
      </div>
    )
  }

  const { appointment } = state

  return (
    <div className="max-w-md mx-auto px-4 py-8 space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Appointment Request</h1>
        <p className="text-sm text-muted-foreground">
          Please confirm or request a different time for your appointment.
        </p>
      </div>

      <div className="rounded-lg border bg-card p-4 space-y-4">
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Customer</p>
          <p className="text-base font-medium">{appointment.customerName}</p>
        </div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Address</p>
          <p className="text-base">{appointment.address}</p>
        </div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Proposed Time</p>
          <p className="text-base font-medium">{formatDateTime(appointment.proposedTime)}</p>
        </div>
      </div>

      <div className="space-y-3">
        <Button
          className="w-full"
          onClick={handleConfirm}
          disabled={isActing}
        >
          {isActing ? "Saving…" : "Confirm this time"}
        </Button>
        <Button
          variant="outline"
          className="w-full"
          onClick={handleDecline}
          disabled={isActing}
        >
          Request a different time
        </Button>
      </div>
    </div>
  )
}
