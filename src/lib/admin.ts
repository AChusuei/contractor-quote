// Admin portal data layer — mock implementation with localStorage persistence.
// Replace storage calls with API calls when the backend is ready.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6

export type AvailabilityWindow = {
  id: string
  dayOfWeek: DayOfWeek
  startTime: string // HH:mm (24-hour)
  endTime: string // HH:mm (24-hour)
}

export type AppointmentStatus = "pending" | "confirmed" | "countered" | "needs-call"

export type QuoteRecord = {
  id: string
  customerName: string
  email: string
  phone: string
  address: string
  submittedAt: string // ISO 8601
  appointmentStatus: AppointmentStatus | null
  proposedTime: string | null // ISO 8601
}

// ---------------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------------

const AVAILABILITY_KEY = "cq_admin_availability"
const QUOTES_KEY = "cq_admin_quotes"

// ---------------------------------------------------------------------------
// Default mock data
// ---------------------------------------------------------------------------

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

function defaultAvailability(): AvailabilityWindow[] {
  return [
    { id: "avail-1", dayOfWeek: 1, startTime: "09:00", endTime: "12:00" },
    { id: "avail-2", dayOfWeek: 1, startTime: "13:00", endTime: "17:00" },
    { id: "avail-3", dayOfWeek: 2, startTime: "09:00", endTime: "12:00" },
    { id: "avail-4", dayOfWeek: 3, startTime: "09:00", endTime: "17:00" },
    { id: "avail-5", dayOfWeek: 4, startTime: "13:00", endTime: "17:00" },
    { id: "avail-6", dayOfWeek: 5, startTime: "09:00", endTime: "12:00" },
  ]
}

function defaultQuotes(): QuoteRecord[] {
  const now = Date.now()
  const day = 24 * 60 * 60 * 1000

  return [
    {
      id: "q-001",
      customerName: "Maria Santos",
      email: "maria@example.com",
      phone: "(718) 555-0101",
      address: "45-12 Parsons Blvd, Flushing, NY 11355",
      submittedAt: new Date(now - 1 * day).toISOString(),
      appointmentStatus: "pending",
      proposedTime: new Date(now + 2 * day).toISOString(),
    },
    {
      id: "q-002",
      customerName: "James O'Brien",
      email: "james@example.com",
      phone: "(718) 555-0202",
      address: "88-02 Jamaica Ave, Jamaica, NY 11421",
      submittedAt: new Date(now - 2 * day).toISOString(),
      appointmentStatus: "confirmed",
      proposedTime: new Date(now + 5 * day).toISOString(),
    },
    {
      id: "q-003",
      customerName: "Linda Chen",
      email: "linda@example.com",
      phone: "(646) 555-0303",
      address: "120 Broadway, New York, NY 10271",
      submittedAt: new Date(now - 3 * day).toISOString(),
      appointmentStatus: "pending",
      proposedTime: new Date(now + 1 * day).toISOString(),
    },
    {
      id: "q-004",
      customerName: "Robert Kim",
      email: "robert@example.com",
      phone: "(917) 555-0404",
      address: "250-18 Hillside Ave, Floral Park, NY 11004",
      submittedAt: new Date(now - 4 * day).toISOString(),
      appointmentStatus: "needs-call",
      proposedTime: null,
    },
    {
      id: "q-005",
      customerName: "Patricia Nguyen",
      email: "patricia@example.com",
      phone: "(718) 555-0505",
      address: "32-15 Francis Lewis Blvd, Bayside, NY 11358",
      submittedAt: new Date(now - 5 * day).toISOString(),
      appointmentStatus: null,
      proposedTime: null,
    },
  ]
}

// ---------------------------------------------------------------------------
// Availability windows
// ---------------------------------------------------------------------------

export function getAvailabilityWindows(): AvailabilityWindow[] {
  const raw = localStorage.getItem(AVAILABILITY_KEY)
  if (!raw) {
    const defaults = defaultAvailability()
    localStorage.setItem(AVAILABILITY_KEY, JSON.stringify(defaults))
    return defaults
  }
  try {
    return JSON.parse(raw) as AvailabilityWindow[]
  } catch {
    return defaultAvailability()
  }
}

export function saveAvailabilityWindows(windows: AvailabilityWindow[]): void {
  localStorage.setItem(AVAILABILITY_KEY, JSON.stringify(windows))
}

export function addAvailabilityWindow(
  window_: Omit<AvailabilityWindow, "id">
): AvailabilityWindow {
  const windows = getAvailabilityWindows()
  const newWindow: AvailabilityWindow = {
    ...window_,
    id: `avail-${Date.now()}`,
  }
  saveAvailabilityWindows([...windows, newWindow])
  return newWindow
}

export function updateAvailabilityWindow(updated: AvailabilityWindow): void {
  const windows = getAvailabilityWindows()
  saveAvailabilityWindows(windows.map((w) => (w.id === updated.id ? updated : w)))
}

export function deleteAvailabilityWindow(id: string): void {
  const windows = getAvailabilityWindows()
  saveAvailabilityWindows(windows.filter((w) => w.id !== id))
}

export function formatDayOfWeek(day: DayOfWeek): string {
  return DAY_NAMES[day]
}

export function formatTime(hhmm: string): string {
  const [hourStr, min] = hhmm.split(":")
  const hour = parseInt(hourStr, 10)
  const period = hour >= 12 ? "pm" : "am"
  const displayHour = hour % 12 === 0 ? 12 : hour % 12
  return `${displayHour}:${min}${period}`
}

// ---------------------------------------------------------------------------
// Quotes
// ---------------------------------------------------------------------------

export function getQuotes(): QuoteRecord[] {
  const raw = localStorage.getItem(QUOTES_KEY)
  if (!raw) {
    const defaults = defaultQuotes()
    localStorage.setItem(QUOTES_KEY, JSON.stringify(defaults))
    return defaults
  }
  try {
    return JSON.parse(raw) as QuoteRecord[]
  } catch {
    return defaultQuotes()
  }
}

function saveQuotes(quotes: QuoteRecord[]): void {
  localStorage.setItem(QUOTES_KEY, JSON.stringify(quotes))
}

export function updateQuoteAppointmentStatus(
  quoteId: string,
  status: AppointmentStatus,
  proposedTime?: string
): void {
  const quotes = getQuotes()
  saveQuotes(
    quotes.map((q) =>
      q.id === quoteId
        ? { ...q, appointmentStatus: status, proposedTime: proposedTime ?? q.proposedTime }
        : q
    )
  )
}

export function getPendingAppointments(): QuoteRecord[] {
  return getQuotes()
    .filter((q) => q.appointmentStatus === "pending" && q.proposedTime != null)
    .sort((a, b) => {
      if (!a.proposedTime || !b.proposedTime) return 0
      return new Date(a.proposedTime).getTime() - new Date(b.proposedTime).getTime()
    })
}

export function formatAppointmentStatus(status: AppointmentStatus | null): string {
  switch (status) {
    case "pending":
      return "Pending"
    case "confirmed":
      return "Confirmed"
    case "countered":
      return "Countered"
    case "needs-call":
      return "Needs Call"
    default:
      return "—"
  }
}

export function appointmentStatusColor(status: AppointmentStatus | null): string {
  switch (status) {
    case "pending":
      return "text-amber-600 bg-amber-50 border-amber-200"
    case "confirmed":
      return "text-green-700 bg-green-50 border-green-200"
    case "countered":
      return "text-blue-700 bg-blue-50 border-blue-200"
    case "needs-call":
      return "text-red-700 bg-red-50 border-red-200"
    default:
      return "text-muted-foreground bg-muted border-transparent"
  }
}
