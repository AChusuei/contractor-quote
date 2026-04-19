// Shared types and Zod schemas between the frontend and the API
import { z } from "zod"

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

export type ErrorCode =
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "GONE"
  | "VALIDATION_ERROR"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR"
  | "UNAUTHORIZED"

export type ApiOk<T> = { ok: true; data: T }
export type ApiErr = { ok: false; error: string; code: ErrorCode }
export type ApiValidationErr = { ok: false; error: string; code: "VALIDATION_ERROR"; fields: Record<string, string> }
export type ApiResult<T> = ApiOk<T> | ApiErr

// ---------------------------------------------------------------------------
// Zod schemas — single source of truth for shared validation
// ---------------------------------------------------------------------------

// QuoteStatusEnum — all valid lifecycle states for a quote
export const QuoteStatusEnum = z.enum([
  "draft",
  "lead",
  "reviewing",
  "site_visit_requested",
  "site_visit_scheduled",
  "site_visit_completed",
  "estimate_requested",
  "estimate_sent",
  "accepted",
  "rejected",
  "closed",
])
export type QuoteStatus = z.infer<typeof QuoteStatusEnum>

// QuoteSchema — full quote shape (read from API, stored locally)
const StatusEventSchema = z.object({
  status: QuoteStatusEnum,
  timestamp: z.string(),
})

export const QuoteSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  name: z.string(),
  email: z.string().email(),
  phone: z.string(),
  cell: z.string().optional(),
  howDidYouFindUs: z.string(),
  referredByContractor: z.string().optional(),
  jobSiteAddress: z.string().optional(),
  propertyType: z.enum(["house", "apt", "building", "townhouse"]).optional(),
  budgetRange: z.enum(["<10k", "10-25k", "25-50k", "50k+"]).optional(),
  scope: z.record(z.string(), z.unknown()).optional(),
  photoSessionId: z.string().optional(),
  status: QuoteStatusEnum,
  statusHistory: z.array(StatusEventSchema),
  contractorNotes: z.string(),
})
export type QuoteData = z.infer<typeof QuoteSchema>

// CustomerSchema — core customer record
export const CustomerSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
  phone: z.string(),
  cell: z.string().optional(),
  howDidYouFindUs: z.string().optional(),
  referredByContractor: z.string().optional(),
  createdAt: z.string(),
})
export type CustomerData = z.infer<typeof CustomerSchema>

// AppointmentWindowSchema — a single bookable time window
export const AppointmentWindowSchema = z.object({
  id: z.string(),
  label: z.string(),
  startAt: z.string(),
  endAt: z.string(),
})
export type AppointmentWindow = z.infer<typeof AppointmentWindowSchema>

// PhotoUploadSchema — photo metadata returned from the photos API
export const PhotoUploadSchema = z.object({
  id: z.string(),
  filename: z.string(),
  contentType: z.string(),
  size: z.number().int().min(0),
  url: z.string(),
})
export type PhotoUpload = z.infer<typeof PhotoUploadSchema>
