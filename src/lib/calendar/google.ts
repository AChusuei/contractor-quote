import type {
  Booking,
  CalendarProvider,
  CustomerDetails,
  DateRange,
  Slot,
} from "./types"

// OAuth access token required for all Google Calendar API calls (calendar data is private)
const ACCESS_TOKEN = import.meta.env.VITE_GOOGLE_CALENDAR_ACCESS_TOKEN as string | undefined

const CALENDAR_API = "https://www.googleapis.com/calendar/v3"

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
]

function formatSlotLabel(startAt: string, endAt: string): string {
  const start = new Date(startAt)
  const end = new Date(endAt)
  const dayLabel = `${DAYS[start.getDay()]}, ${MONTHS[start.getMonth()]} ${start.getDate()}`

  const fmt = (d: Date) => {
    const h = d.getHours()
    const m = d.getMinutes()
    const ampm = h >= 12 ? "pm" : "am"
    const hour = h % 12 || 12
    return m === 0 ? `${hour}${ampm}` : `${hour}:${m.toString().padStart(2, "0")}${ampm}`
  }

  return `${dayLabel} · ${fmt(start)} – ${fmt(end)}`
}

interface GCalEvent {
  id: string
  summary?: string
  start?: { dateTime?: string }
  end?: { dateTime?: string }
}

export class GoogleCalendarAdapter implements CalendarProvider {
  private authHeader(): Record<string, string> {
    if (!ACCESS_TOKEN) throw new Error("VITE_GOOGLE_CALENDAR_ACCESS_TOKEN not set")
    return { Authorization: `Bearer ${ACCESS_TOKEN}` }
  }

  /**
   * Returns available (non-busy) slots for the contractor's calendar in the given date range.
   * Uses the freebusy API to find busy periods, then builds available 3-hour windows.
   */
  async getAvailability(contractorId: string, dateRange: DateRange): Promise<Slot[]> {
    const headers = this.authHeader()

    const res = await fetch(`${CALENDAR_API}/freeBusy`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        timeMin: dateRange.start,
        timeMax: dateRange.end,
        items: [{ id: contractorId }],
      }),
    })

    if (!res.ok) throw new Error(`Google Calendar freebusy failed: ${res.status}`)

    const json = await res.json()
    const busyPeriods: { start: string; end: string }[] =
      json.calendars?.[contractorId]?.busy ?? []

    // Generate candidate slots (9am–12pm and 1pm–5pm on weekdays)
    const slots: Slot[] = []
    const start = new Date(dateRange.start)
    const end = new Date(dateRange.end)

    for (const date = new Date(start); date < end; date.setDate(date.getDate() + 1)) {
      const dow = date.getDay()
      if (dow === 0) continue // skip Sundays

      const dateStr = date.toISOString().slice(0, 10)

      const windows = [
        { startHour: 9, endHour: 12, suffix: "morning" },
        ...(dow >= 1 && dow <= 5 ? [{ startHour: 13, endHour: 17, suffix: "afternoon" }] : []),
      ]

      for (const window of windows) {
        const slotStart = `${dateStr}T${window.startHour.toString().padStart(2, "0")}:00:00`
        const slotEnd = `${dateStr}T${window.endHour.toString().padStart(2, "0")}:00:00`

        const isBusy = busyPeriods.some((b) => b.start < slotEnd && b.end > slotStart)
        if (isBusy) continue

        slots.push({
          id: `${dateStr}-${window.suffix}`,
          contractorId,
          label: formatSlotLabel(slotStart, slotEnd),
          startAt: slotStart,
          endAt: slotEnd,
        })
      }
    }

    return slots
  }

  /**
   * Creates a Google Calendar event for the booking and returns a Booking record.
   */
  async createBooking(
    contractorId: string,
    slot: Slot,
    customerDetails: CustomerDetails
  ): Promise<Booking> {
    const headers = this.authHeader()

    const description = [
      `Customer: ${customerDetails.name}`,
      `Email: ${customerDetails.email}`,
      customerDetails.phone ? `Phone: ${customerDetails.phone}` : null,
      customerDetails.notes ? `Notes: ${customerDetails.notes}` : null,
    ]
      .filter(Boolean)
      .join("\n")

    const res = await fetch(
      `${CALENDAR_API}/calendars/${encodeURIComponent(contractorId)}/events`,
      {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          summary: `Site Visit — ${customerDetails.name}`,
          description,
          start: { dateTime: slot.startAt },
          end: { dateTime: slot.endAt },
        }),
      }
    )

    if (!res.ok) throw new Error(`Google Calendar createEvent failed: ${res.status}`)

    const event = (await res.json()) as GCalEvent

    return {
      id: event.id,
      contractorId,
      slot,
      customer: customerDetails,
      status: "confirmed",
    }
  }

  /**
   * Deletes a Google Calendar event by bookingId (event ID).
   */
  async cancelBooking(contractorId: string, bookingId: string): Promise<void> {
    const headers = this.authHeader()

    const res = await fetch(
      `${CALENDAR_API}/calendars/${encodeURIComponent(contractorId)}/events/${encodeURIComponent(bookingId)}`,
      {
        method: "DELETE",
        headers,
      }
    )

    if (!res.ok && res.status !== 410) {
      // 410 Gone means already deleted — treat as success
      throw new Error(`Google Calendar deleteEvent failed: ${res.status}`)
    }
  }
}
