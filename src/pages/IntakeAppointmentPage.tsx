import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { Button } from "components"
import { cn } from "@/lib/utils"
import {
  fetchAppointmentSlots,
  saveAppointmentSelection,
  type AppointmentSlot,
} from "@/lib/appointments"

export function IntakeAppointmentPage() {
  const navigate = useNavigate()
  const [slots, setSlots] = useState<AppointmentSlot[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)

  useEffect(() => {
    fetchAppointmentSlots()
      .then(setSlots)
      .catch(() => setFetchError("Couldn't load appointment times. Please try again."))
      .finally(() => setLoading(false))
  }, [])

  const handleContinue = () => {
    if (!selected) return
    const slot = slots.find((s) => s.id === selected)!
    saveAppointmentSelection({
      type: "slot",
      slotId: slot.id,
      startAt: slot.startAt,
      endAt: slot.endAt,
      status: "pending",
    })
    navigate("/intake/confirmed")
  }

  return (
    <div className="max-w-xl mx-auto">
      <div className="mb-6">
        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Step 5 of 5</p>
        <h1 className="text-2xl font-semibold">Preferred Appointment</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Pick a time that works for your site visit. We'll confirm once we receive your request.
        </p>
      </div>

      {loading && (
        <div className="space-y-2" aria-label="Loading appointment slots">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-12 rounded-md bg-muted animate-pulse" />
          ))}
        </div>
      )}

      {fetchError && (
        <p className="text-sm text-destructive">{fetchError}</p>
      )}

      {!loading && !fetchError && (
        <div className="space-y-2">
          {slots.map((slot) => (
            <button
              key={slot.id}
              type="button"
              onClick={() => setSelected(slot.id)}
              className={cn(
                "w-full rounded-md border px-4 py-3 text-left text-sm transition-colors",
                "hover:bg-accent",
                selected === slot.id
                  ? "border-primary bg-primary/5 font-medium"
                  : "border-input bg-background"
              )}
            >
              {slot.label}
            </button>
          ))}


        </div>
      )}

      <div className="pt-4">
        <Button onClick={handleContinue} disabled={!selected} className="w-full">
          Continue
        </Button>
      </div>
    </div>
  )
}
