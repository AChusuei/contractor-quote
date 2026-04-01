import type { Context, Next } from "hono"
import { apiError } from "../lib/errors"
import { verifyClerkJwt } from "../lib/jwtVerify"

/**
 * Check if the current caller is a platform admin by inspecting their JWT email
 * against the PLATFORM_ADMIN_EMAILS env var.
 */
async function isPlatformAdmin(c: Context): Promise<boolean> {
  const adminEmailsRaw = c.env.PLATFORM_ADMIN_EMAILS as string | undefined
  if (!adminEmailsRaw) return false

  const adminEmails = adminEmailsRaw
    .split(",")
    .map((e: string) => e.trim().toLowerCase())
    .filter(Boolean)

  const authHeader = c.req.header("authorization")
  if (!authHeader?.startsWith("Bearer ")) return false

  const payload = await verifyClerkJwt(authHeader.slice(7), c.env)
  if (!payload) return false

  const email = payload.email ?? payload.primary_email ?? payload.email_address
  return Boolean(email && adminEmails.includes((email as string).toLowerCase()))
}

/**
 * Extract the contractor ID from a Clerk JWT.
 * Clerk stores custom claims in `sessionClaims.metadata` or
 * the `org_id` field. For now we read from a custom claim
 * `contractorId` set during Clerk onboarding.
 *
 * Platform admins may supply `x-super-contractor-id` to impersonate
 * a contractor context (used by the super-user portal switcher).
 *
 * Falls back to the `x-contractor-id` header for local dev
 * when Clerk is not configured.
 */
async function extractContractorId(c: Context): Promise<string | null> {
  // Platform admins can override the contractor context
  const superContractorId = c.req.header("x-super-contractor-id")
  if (superContractorId && (await isPlatformAdmin(c))) {
    return superContractorId
  }

  // In production: extract from Clerk JWT
  const authHeader = c.req.header("authorization")
  if (authHeader?.startsWith("Bearer ")) {
    // Verify JWT signature via Clerk JWKS, then extract claims
    const token = authHeader.slice(7)
    const payload = await verifyClerkJwt(token, c.env)
    if (!payload) return null

    // Check custom claim or org metadata
    const meta = payload.public_metadata as Record<string, unknown> | undefined
    const fromJwt =
      payload.contractorId ??
      meta?.contractorId ??
      payload.org_id ??
      null
    if (fromJwt) return fromJwt as string

    // No contractorId claim — look up staff table by email
    const email = (payload.email ?? payload.primary_email ?? payload.email_address) as string | undefined
    if (email) {
      const staff = await c.env.DB.prepare(
        "SELECT contractor_id FROM staff WHERE LOWER(email) = ? AND active = 1 LIMIT 1"
      )
        .bind(email.toLowerCase())
        .first<{ contractor_id: string }>()
      if (staff) return staff.contractor_id
    }

    // Dev fallback: JWT exists but no contractor association found
    if (c.env.ENVIRONMENT === "development") {
      return c.req.header("x-contractor-id") ?? null
    }
    return null
  }

  // Dev fallback: no JWT at all, allow x-contractor-id header
  if (c.env.ENVIRONMENT === "development") {
    return c.req.header("x-contractor-id") ?? "00000000-0000-4000-8000-000000000001"
  }

  return null
}

/**
 * Middleware: require authentication and extract contractor ID.
 * Sets `contractorId` on the Hono context variables.
 */
export function requireAuth() {
  return async (c: Context, next: Next) => {
    const contractorId = await extractContractorId(c)
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
