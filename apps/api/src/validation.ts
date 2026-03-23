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

  // Optional fields — sanitize but don't require
  cell: sanitizedMax(50, "Cell number is too long").optional(),
  howDidYouFindUs: sanitizedMax(500, "Response is too long").optional(),
  referredByContractor: sanitizedMax(200, "Referral name is too long").optional(),
  quotePath: z.enum(["site_visit", "estimate_requested"]).optional(),
  photoSessionId: sanitizedMax(200, "Photo session ID is too long").optional(),
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
    quotePath: z.enum(["site_visit", "estimate_requested"]),
    photoSessionId: sanitizedMax(200, "Photo session ID is too long"),
  })
  .partial()
  .refine(
    (val) => Object.keys(val).length > 0,
    "At least one field must be provided for update"
  )

export type QuoteUpdate = z.infer<typeof quoteUpdateSchema>

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
