import { z } from "zod"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Strip HTML tags to prevent stored XSS */
function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, "")
}

/** Sanitized string with min and max length */
function sanitizedMinMax(min: number, minMsg: string, max: number, maxMsg: string) {
  return z
    .string({ error: minMsg })
    .transform(stripHtml)
    .pipe(z.string().min(min, minMsg).max(max, maxMsg))
}

/** Sanitized string with max length (optional use) */
function sanitizedMax(max: number, maxMessage: string) {
  return z
    .string()
    .transform(stripHtml)
    .pipe(z.string().max(max, maxMessage))
}

// ---------------------------------------------------------------------------
// Quote submission schema
// ---------------------------------------------------------------------------

export const quoteSubmissionSchema = z.object({
  contractorId: sanitizedMinMax(
    1, "Contractor ID is required",
    200, "Contractor ID is too long"
  ),

  name: sanitizedMinMax(
    1, "Name is required",
    200, "Name must be 200 characters or fewer"
  ),

  email: z
    .string({ error: "Email address is required" })
    .transform(stripHtml)
    .pipe(z.string().email("Enter a valid email address")),

  phone: z
    .string({ error: "Phone number is required" })
    .transform(stripHtml)
    .pipe(
      z.string().refine(
        (v) => v.replace(/\D/g, "").length >= 10,
        "Enter a valid phone number (at least 10 digits)"
      )
    ),

  jobSiteAddress: sanitizedMinMax(
    1, "Job site address is required",
    500, "Job site address must be 500 characters or fewer"
  ),

  propertyType: z.enum(["house", "apt", "building", "townhouse"], {
    error: "Property type must be house, apt, building, or townhouse",
  }),

  budgetRange: z.enum(["<10k", "10-25k", "25-50k", "50k+"], {
    error: "Budget range must be <10k, 10-25k, 25-50k, or 50k+",
  }),

  schemaVersion: z
    .number({ error: "Schema version is required" })
    .int("Schema version must be a whole number"),

  // Loose validation: valid JSON, max 10KB when stringified
  scope: z
    .record(z.string(), z.unknown())
    .optional()
    .refine(
      (val) => {
        if (val === undefined) return true
        return JSON.stringify(val).length <= 10 * 1024
      },
      "Scope data must be 10KB or smaller"
    ),

  // Cloudflare Turnstile token (required when TURNSTILE_SECRET_KEY is set)
  turnstileToken: z.string().max(2048, "Turnstile token is too long").optional(),

  // Optional fields — sanitize but don't require
  cell: sanitizedMax(50, "Cell number is too long").optional(),
  howDidYouFindUs: sanitizedMax(500, "Response is too long").optional(),
  referredByContractor: sanitizedMax(200, "Referral name is too long").optional(),
  status: z.enum(["draft", "lead"]).optional(),
})

export type QuoteSubmission = z.infer<typeof quoteSubmissionSchema>

// ---------------------------------------------------------------------------
// Quote update schema (partial — only editable fields, all optional)
// ---------------------------------------------------------------------------

export const quoteUpdateSchema = z
  .object({
    name: sanitizedMinMax(
      1, "Name is required",
      200, "Name must be 200 characters or fewer"
    ),

    email: z
      .string({ error: "Enter a valid email address" })
      .transform(stripHtml)
      .pipe(z.string().email("Enter a valid email address")),

    phone: z
      .string({ error: "Enter a valid phone number" })
      .transform(stripHtml)
      .pipe(
        z.string().refine(
          (v) => v.replace(/\D/g, "").length >= 10,
          "Enter a valid phone number (at least 10 digits)"
        )
      ),

    jobSiteAddress: sanitizedMinMax(
      1, "Job site address is required",
      500, "Job site address must be 500 characters or fewer"
    ),

    propertyType: z.enum(["house", "apt", "building", "townhouse"], {
      error: "Property type must be house, apt, building, or townhouse",
    }),

    budgetRange: z.enum(["<10k", "10-25k", "25-50k", "50k+"], {
      error: "Budget range must be <10k, 10-25k, 25-50k, or 50k+",
    }),

    scope: z
      .record(z.string(), z.unknown())
      .refine(
        (val) => JSON.stringify(val).length <= 10 * 1024,
        "Scope data must be 10KB or smaller"
      ),

    cell: sanitizedMax(50, "Cell number is too long"),
    howDidYouFindUs: sanitizedMax(500, "Response is too long"),
    referredByContractor: sanitizedMax(200, "Referral name is too long"),
  })
  .partial()
  .refine(
    (val) => Object.keys(val).length > 0,
    "At least one field must be provided for update"
  )

export type QuoteUpdate = z.infer<typeof quoteUpdateSchema>

// ---------------------------------------------------------------------------
// Quote status enum values (display labels live in the frontend)
// ---------------------------------------------------------------------------

export const QUOTE_STATUSES = [
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
] as const

export type QuoteStatus = (typeof QUOTE_STATUSES)[number]

/**
 * Valid status transitions. Each key lists the statuses it can move TO.
 * Any transition not listed here is rejected.
 */
export const STATUS_TRANSITIONS: Record<QuoteStatus, readonly QuoteStatus[]> = {
  draft: ["lead", "closed"],
  lead: ["reviewing", "closed"],
  reviewing: ["site_visit_requested", "estimate_requested", "closed"],
  site_visit_requested: ["site_visit_scheduled", "closed"],
  site_visit_scheduled: ["site_visit_completed", "closed"],
  site_visit_completed: ["estimate_requested", "closed"],
  estimate_requested: ["estimate_sent", "closed"],
  estimate_sent: ["accepted", "rejected", "closed"],
  accepted: ["closed"],
  rejected: ["reviewing", "closed"],
  closed: ["reviewing"],
}

// ---------------------------------------------------------------------------
// Draft update schema (public — authenticated via publicToken)
// ---------------------------------------------------------------------------

export const draftUpdateSchema = z.object({
  publicToken: z.string({ required_error: "Public token is required" }).min(1, "Public token is required"),

  scope: z
    .record(z.string(), z.unknown())
    .refine(
      (val) => JSON.stringify(val).length <= 10 * 1024,
      "Scope data must be 10KB or smaller"
    )
    .optional(),

  status: z.enum(["lead"], {
    error: "Drafts can only be submitted (status set to lead)",
  }).optional(),

  name: sanitizedMinMax(1, "Name is required", 200, "Name must be 200 characters or fewer").optional(),
  email: z.string().transform(stripHtml).pipe(z.string().email("Enter a valid email address")).optional(),
  phone: z.string().transform(stripHtml).pipe(
    z.string().refine((v) => v.replace(/\D/g, "").length >= 10, "Enter a valid phone number (at least 10 digits)")
  ).optional(),
  cell: sanitizedMax(50, "Cell number is too long").optional(),
  jobSiteAddress: sanitizedMinMax(1, "Job site address is required", 500, "Job site address must be 500 characters or fewer").optional(),
  propertyType: z.enum(["house", "apt", "building", "townhouse"]).optional(),
  budgetRange: z.enum(["<10k", "10-25k", "25-50k", "50k+"]).optional(),
  howDidYouFindUs: sanitizedMax(500, "Response is too long").optional(),
  referredByContractor: sanitizedMax(200, "Referral name is too long").optional(),
})

export type DraftUpdate = z.infer<typeof draftUpdateSchema>

// ---------------------------------------------------------------------------
// Activity types
// ---------------------------------------------------------------------------

export const ACTIVITY_TYPES = [
  "status_change",
  "note",
  "photo_added",
  "photo_removed",
  "quote_edited",
  "estimate_sent",
  "email_sent",
] as const

export type ActivityType = (typeof ACTIVITY_TYPES)[number]

// ---------------------------------------------------------------------------
// Activity creation schema
// ---------------------------------------------------------------------------

export const activityCreateSchema = z
  .object({
    type: z.enum(ACTIVITY_TYPES, {
      error: "Activity type must be one of: status_change, note, photo_added, photo_removed, quote_edited, estimate_sent, email_sent",
    }),

    content: sanitizedMax(5000, "Content must be 5000 characters or fewer").optional(),

    newStatus: z.enum(QUOTE_STATUSES, {
      error: "Status must be one of: " + QUOTE_STATUSES.join(", "),
    }).optional(),
  })
  .refine(
    (val) => {
      if (val.type === "status_change" && !val.newStatus) return false
      return true
    },
    { message: "New status is required for status changes", path: ["newStatus"] }
  )
  .refine(
    (val) => {
      if (val.type === "note" && (!val.content || val.content.trim().length === 0)) return false
      return true
    },
    { message: "Content is required for notes", path: ["content"] }
  )

export type ActivityCreate = z.infer<typeof activityCreateSchema>

// ---------------------------------------------------------------------------
// Customer data deletion schema
// ---------------------------------------------------------------------------

export const customerDeletionSchema = z.object({
  requestType: z.enum(["ccpa", "customer", "contractor"], {
    error: "Request type must be ccpa, customer, or contractor",
  }),
})

export type CustomerDeletion = z.infer<typeof customerDeletionSchema>

// ---------------------------------------------------------------------------
// Email send schema
// ---------------------------------------------------------------------------

export const emailSendSchema = z.object({
  to: z
    .array(
      z.string({ error: "Each recipient must be a quote ID" }).min(1, "Quote ID must not be empty"),
      { error: "Recipients list is required" }
    )
    .min(1, "Select at least one recipient")
    .max(100, "Cannot send to more than 100 recipients at once"),

  subject: z
    .string({ error: "Subject is required" })
    .min(1, "Subject is required")
    .max(500, "Subject must be 500 characters or fewer"),

  html: z
    .string({ error: "Email body is required" })
    .min(1, "Email body is required")
    .max(50_000, "Email body must be 50,000 characters or fewer"),
})

export type EmailSend = z.infer<typeof emailSendSchema>

// ---------------------------------------------------------------------------
// Staff roles
// ---------------------------------------------------------------------------

export const STAFF_ROLES = ["owner", "admin", "estimator", "field_tech"] as const
export type StaffRole = (typeof STAFF_ROLES)[number]

// ---------------------------------------------------------------------------
// Staff creation schema
// ---------------------------------------------------------------------------

export const staffCreateSchema = z.object({
  name: sanitizedMinMax(
    1, "Staff member name is required",
    200, "Name must be 200 characters or fewer"
  ),

  email: z
    .string({ error: "Email address is required" })
    .transform(stripHtml)
    .pipe(z.string().email("Enter a valid email address")),

  role: z.enum(STAFF_ROLES, {
    error: "Role must be one of: owner, admin, estimator, field_tech",
  }),

  phone: z
    .string()
    .transform(stripHtml)
    .pipe(
      z.string().refine(
        (v) => v === "" || v.replace(/\D/g, "").length >= 10,
        "Enter a valid phone number (at least 10 digits)"
      )
    )
    .optional()
    .or(z.literal("")),
})

export type StaffCreate = z.infer<typeof staffCreateSchema>

// ---------------------------------------------------------------------------
// Staff update schema (partial — all fields optional)
// ---------------------------------------------------------------------------

export const staffUpdateSchema = z
  .object({
    name: sanitizedMinMax(
      1, "Staff member name is required",
      200, "Name must be 200 characters or fewer"
    ),

    email: z
      .string({ error: "Enter a valid email address" })
      .transform(stripHtml)
      .pipe(z.string().email("Enter a valid email address")),

    role: z.enum(STAFF_ROLES, {
      error: "Role must be one of: owner, admin, estimator, field_tech",
    }),

    phone: z
      .string()
      .transform(stripHtml)
      .pipe(
        z.string().refine(
          (v) => v === "" || v.replace(/\D/g, "").length >= 10,
          "Enter a valid phone number (at least 10 digits)"
        )
      )
      .optional()
      .or(z.literal("")),

    active: z.boolean({ error: "Active must be true or false" }),
  })
  .partial()
  .refine(
    (val) => Object.keys(val).length > 0,
    "At least one field must be provided for update"
  )

export type StaffUpdate = z.infer<typeof staffUpdateSchema>

// ---------------------------------------------------------------------------
// Payload size limit (100KB)
// ---------------------------------------------------------------------------

export const MAX_PAYLOAD_BYTES = 100 * 1024

// ---------------------------------------------------------------------------
// Format Zod errors into user-friendly field → message map
// ---------------------------------------------------------------------------

export function formatZodErrors(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {}
  for (const issue of error.issues) {
    const path = issue.path.join(".")
    if (!fieldErrors[path]) {
      fieldErrors[path] = issue.message
    }
  }
  return fieldErrors
}
