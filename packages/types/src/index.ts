// Shared types between the frontend and the API

// ---------------------------------------------------------------------------
// Appointment
// ---------------------------------------------------------------------------

export type AppointmentSlot = {
  id: string
  label: string
  startAt: string // ISO 8601 local datetime
  endAt: string
}

export type AppointmentSelection =
  | { type: "slot"; slotId: string; startAt: string; endAt: string; status: "pending" }
  | { type: "flexible"; status: "pending" }

// ---------------------------------------------------------------------------
// Lead / Intake
// ---------------------------------------------------------------------------

export type PropertyType = "house" | "apt" | "building" | "townhouse"
export type BudgetRange = "<10k" | "10-25k" | "25-50k" | "50k+"

export type LeadInput = {
  name: string
  email: string
  phone: string
  cell?: string
  jobSiteAddress: string
  propertyType: PropertyType
  budgetRange: BudgetRange
  howDidYouFindUs: string
  referredByContractor?: string
}

export type Lead = LeadInput & {
  id: string
  createdAt: string // ISO 8601
}

// ---------------------------------------------------------------------------
// API response envelope
// ---------------------------------------------------------------------------

export type ApiOk<T> = { ok: true; data: T }
export type ApiErr = { ok: false; error: string }
export type ApiResult<T> = ApiOk<T> | ApiErr
