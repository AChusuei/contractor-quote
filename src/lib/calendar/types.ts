export interface DateRange {
  start: string // ISO 8601 datetime
  end: string // ISO 8601 datetime
}

export interface Slot {
  id: string
  contractorId: string
  label: string
  startAt: string // ISO 8601 datetime
  endAt: string // ISO 8601 datetime
}

export interface CustomerDetails {
  name: string
  email: string
  phone?: string
  notes?: string
}

export interface Booking {
  id: string
  contractorId: string
  slot: Slot
  customer: CustomerDetails
  status: "confirmed" | "pending" | "cancelled"
}

export interface CalendarProvider {
  getAvailability(contractorId: string, dateRange: DateRange): Promise<Slot[]>
  createBooking(
    contractorId: string,
    slot: Slot,
    customerDetails: CustomerDetails
  ): Promise<Booking>
  cancelBooking(contractorId: string, bookingId: string): Promise<void>
}
