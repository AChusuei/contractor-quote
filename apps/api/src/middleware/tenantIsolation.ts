import type { Context, Next } from "hono"
import { apiError } from "../lib/errors"

/**
 * Extract the contractor ID from a Clerk JWT.
 * Clerk stores custom claims in `sessionClaims.metadata` or
 * the `org_id` field. For now we read from a custom claim
 * `contractorId` set during Clerk onboarding.
 *
 * Falls back to the `x-contractor-id` header for local dev
 * when Clerk is not configured.
 */
function extractContractorId(c: Context): string | null {
  // In production: extract from Clerk JWT
  const authHeader = c.req.header("authorization")
  if (authHeader?.startsWith("Bearer ")) {
    try {
      // Decode JWT payload (Clerk JWTs are standard JWTs)
      const token = authHeader.slice(7)
      const payload = JSON.parse(atob(token.split(".")[1]))
      // Check custom claim or org metadata
      return (
        payload.contractorId ??
        payload.public_metadata?.contractorId ??
        payload.org_id ??
        null
      )
    } catch {
      return null
    }
  }

  // Dev fallback: allow x-contractor-id header when no JWT
  if (c.env.ENVIRONMENT === "development") {
    return c.req.header("x-contractor-id") ?? null
  }

  return null
}

/**
 * Middleware: require authentication and extract contractor ID.
 * Sets `contractorId` on the Hono context variables.
 */
export function requireAuth() {
  return async (c: Context, next: Next) => {
    const contractorId = extractContractorId(c)
    if (!contractorId) {
      return apiError(c, "UNAUTHORIZED", "Authentication required")
    }
    c.set("contractorId", contractorId)
    await next()
  }
}

/**
 * Middleware: verify that a quote belongs to the authenticated contractor.
 * Must be used after `requireAuth()` on routes with `:quoteId` param.
 */
export function requireQuoteOwnership() {
  return async (c: Context, next: Next) => {
    const contractorId = c.get("contractorId") as string
    const quoteId = c.req.param("quoteId")

    if (!quoteId) {
      return apiError(c, "VALIDATION_ERROR", "Missing quote ID")
    }

    const quote = await c.env.DB.prepare(
      "SELECT contractor_id FROM quotes WHERE id = ?"
    )
      .bind(quoteId)
      .first<{ contractor_id: string }>()

    if (!quote) {
      return apiError(c, "NOT_FOUND", "Quote not found")
    }

    if (quote.contractor_id !== contractorId) {
      return apiError(c, "FORBIDDEN", "You do not have access to this quote")
    }

    await next()
  }
}

/**
 * Middleware: verify the contractor can only access their own profile.
 * Must be used after `requireAuth()` on routes with `:contractorId` param.
 */
export function requireContractorOwnership() {
  return async (c: Context, next: Next) => {
    const authenticatedContractorId = c.get("contractorId") as string
    const routeContractorId = c.req.param("contractorId")

    if (routeContractorId !== authenticatedContractorId) {
      return apiError(c, "FORBIDDEN", "You do not have access to this contractor")
    }

    await next()
  }
}
