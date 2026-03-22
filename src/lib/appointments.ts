// Appointment window fetching. Controlled by VITE_CQ_APPOINTMENTS_API env var.
// When unset, returns generated mock slots covering the next two weeks.

export type AppointmentSlot = {
  id: string
  label: string
  startAt: string // ISO 8601 local datetime
  endAt: string
}

export type AppointmentSelection =
  | { type: "slot"; slotId: string; startAt: string; endAt: string; status: "pending" }
  | { type: "flexible"; status: "pending" }

const API_BASE = import.meta.env.VITE_CQ_APPOINTMENTS_API as string | undefined
const SESSION_KEY = "cq_preferred_appointment"

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

function generateMockSlots(): AppointmentSlot[] {
  const slots: AppointmentSlot[] = []
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(0, 0, 0, 0)

  for (let i = 0; i < 14 && slots.length < 10; i++) {
    const date = new Date(tomorrow)
    date.setDate(tomorrow.getDate() + i)
    const dow = date.getDay()
    if (dow === 0) continue // skip Sundays

    const dayLabel = `${DAYS[dow]}, ${MONTHS[date.getMonth()]} ${date.getDate()}`
    const dateStr = date.toISOString().slice(0, 10)

    slots.push({
      id: `${dateStr}-morning`,
      label: `${dayLabel} · Morning (9am – 12pm)`,
      startAt: `${dateStr}T09:00:00`,
      endAt: `${dateStr}T12:00:00`,
    })

    if (slots.length < 10 && dow >= 1 && dow <= 5) {
      slots.push({
        id: `${dateStr}-afternoon`,
        label: `${dayLabel} · Afternoon (1pm – 5pm)`,
        startAt: `${dateStr}T13:00:00`,
        endAt: `${dateStr}T17:00:00`,
      })
    }
  }

  return slots
}

export async function fetchAppointmentSlots(): Promise<AppointmentSlot[]> {
  if (API_BASE) {
    const res = await fetch(`${API_BASE}/appointment-windows`)
    if (!res.ok) throw new Error(`Failed to fetch appointment windows: ${res.status}`)
    return res.json() as Promise<AppointmentSlot[]>
  }

  // Mock: simulate a short network delay
  await new Promise((r) => setTimeout(r, 300))
  return generateMockSlots()
}

export function saveAppointmentSelection(selection: AppointmentSelection): void {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(selection))
}

export function getAppointmentSelection(): AppointmentSelection | null {
  const raw = sessionStorage.getItem(SESSION_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as AppointmentSelection
  } catch {
    return null
  }
}
