import type { Context, Next } from "hono"
import { apiError } from "../lib/errors"
import { verifyClerkJwt } from "../lib/jwtVerify"

/**
 * Extract the caller's email from the JWT payload.
 */
function extractEmailFromJwt(c: Context): string | null {
  const authHeader = c.req.header("authorization")
  if (!authHeader?.startsWith("Bearer ")) return null
  try {
    const token = authHeader.slice(7)
    const payload = JSON.parse(atob(token.split(".")[1]))
    return payload.email ?? payload.primary_email ?? payload.email_address ?? null
  } catch {
    return null
  }
}

/**
 * Check if the current caller is a platform admin.
 * Source of truth is the super_users table.
 */
async function isPlatformAdmin(c: Context): Promise<boolean> {
  const authHeader = c.req.header("authorization")
  if (!authHeader?.startsWith("Bearer ")) return false

  const payload = await verifyClerkJwt(authHeader.slice(7), c.env)
  if (!payload) return false

  const email = payload.email ?? payload.primary_email ?? payload.email_address
  if (!email) return false

  const normalizedEmail = (email as string).toLowerCase()

  const row = await c.env.DB.prepare(
    "SELECT id FROM super_users WHERE LOWER(email) = ? LIMIT 1"
  )
    .bind(normalizedEmail)
    .first()
  return !!row
}

interface AuthContext {
  contractorId: string
  actorEmail: string | null
  staffId: string | null
  isPlatformAdmin: boolean
}

/**
 * Extract authentication context from the request.
 *
 * Returns the contractor ID (for tenant isolation), the actor's email
 * (for audit logging), and the staff record ID if the actor is a known
 * staff member for that contractor.
 *
 * Platform admins may supply `x-super-contractor-id` to impersonate a
 * contractor context. Their JWT email is logged as the actor but they have
 * no staff record in the contractor's staff table (staffId = null).
 *
 * Falls back to the `x-contractor-id` header in local dev when Clerk is
 * not configured.
 */
async function extractAuthContext(c: Context): Promise<AuthContext | null> {
  // Platform admins can override the contractor context (impersonation)
  const superContractorId = c.req.header("x-super-contractor-id")
  if (superContractorId && (await isPlatformAdmin(c))) {
    return { contractorId: superContractorId, actorEmail: extractEmailFromJwt(c), staffId: null, isPlatformAdmin: true }
  }

  // In production: extract from Clerk JWT
  const authHeader = c.req.header("authorization")
  if (authHeader?.startsWith("Bearer ")) {
    // Verify JWT signature via Clerk JWKS, then extract claims
    const token = authHeader.slice(7)
    const payload = await verifyClerkJwt(token, c.env)
    if (!payload) return null

    const email = (payload.email ?? payload.primary_email ?? payload.email_address) as string | undefined

    // Check custom claim or org metadata for contractor ID
    const meta = payload.public_metadata as Record<string, unknown> | undefined
    const contractorIdFromJwt =
      payload.contractorId ??
      meta?.contractorId ??
      payload.org_id ??
      null

    if (contractorIdFromJwt) {
      // Look up staff record so we can log staff_id on activity rows
      let staffId: string | null = null
      if (email) {
        const staff = await c.env.DB.prepare(
          "SELECT id FROM staff WHERE LOWER(email) = ? AND contractor_id = ? AND active = 1 LIMIT 1"
        )
          .bind(email.toLowerCase(), contractorIdFromJwt)
          .first<{ id: string }>()
        staffId = staff?.id ?? null
      }
      return { contractorId: contractorIdFromJwt as string, actorEmail: email ?? null, staffId, isPlatformAdmin: false }
    }

    // No contractorId claim — look up staff table by email
    if (email) {
      const staff = await c.env.DB.prepare(
        "SELECT id, contractor_id FROM staff WHERE LOWER(email) = ? AND active = 1 LIMIT 1"
      )
        .bind(email.toLowerCase())
        .first<{ id: string; contractor_id: string }>()
      if (staff) return { contractorId: staff.contractor_id, actorEmail: email, staffId: staff.id, isPlatformAdmin: false }
    }

    // Dev fallback: JWT exists but no contractor association found
    if (c.env.ENVIRONMENT === "development") {
      const devContractorId = c.req.header("x-contractor-id") ?? null
      if (devContractorId) return { contractorId: devContractorId, actorEmail: email ?? null, staffId: null, isPlatformAdmin: false }
    }
    return null
  }

  // Dev fallback: no JWT at all, require x-contractor-id header
  if (c.env.ENVIRONMENT === "development") {
    const devContractorId = c.req.header("x-contractor-id")
    if (!devContractorId) return null
    return {
      contractorId: devContractorId,
      actorEmail: null,
      staffId: null,
      isPlatformAdmin: false,
    }
  }

  return null
}

/**
 * Middleware: require authentication and extract contractor ID.
 * Sets `contractorId`, `actorEmail`, and `staffId` on the Hono context variables.
 * Also blocks disabled contractor accounts on protected routes (fail-open on DB errors).
 */
export function requireAuth() {
  return async (c: Context, next: Next) => {
    const auth = await extractAuthContext(c)
    if (!auth) {
      return apiError(c, "UNAUTHORIZED", "Authentication required")
    }
    c.set("contractorId", auth.contractorId)
    c.set("actorEmail", auth.actorEmail)
    c.set("staffId", auth.staffId)

    // Block disabled accounts on all routes except the settings page exceptions.
    // Platform admins impersonating a contractor bypass this check.
    if (!auth.isPlatformAdmin) {
      const path = c.req.path
      const method = c.req.method
      // Exceptions: read/update own contractor profile (settings page data)
      const isSettingsException =
        /^\/api\/v1\/contractors\/[^/]+$/.test(path) &&
        (method === "GET" || method === "PATCH")

      if (!isSettingsException) {
        try {
          const row = await c.env.DB.prepare(
            "SELECT account_disabled FROM contractors WHERE id = ?"
          )
            .bind(auth.contractorId)
            .first<{ account_disabled: number }>()

          if (row?.account_disabled === 1) {
            return c.json(
              { ok: false, code: "ACCOUNT_DISABLED", error: "This contractor account has been disabled." },
              403
            )
          }
        } catch {
          // FAIL OPEN: never block on infrastructure errors
        }
      }
    }

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

/**
 * Middleware: block suspended/canceled contractor accounts.
 * Must be used after requireAuth(). Fails open on DB errors.
 */
export function requireActiveBilling() {
  return async (c: Context, next: Next) => {
    const contractorId = c.get("contractorId") as string | undefined
    if (!contractorId) {
      await next()
      return
    }

    try {
      const row = await c.env.DB.prepare(
        "SELECT billing_status, billing_exempt FROM contractors WHERE id = ?"
      )
        .bind(contractorId)
        .first<{ billing_status: string; billing_exempt: number }>()

      if (row && row.billing_exempt !== 1) {
        if (row.billing_status === "suspended" || row.billing_status === "canceled") {
          return c.json(
            {
              ok: false,
              error: "Account suspended — update payment to restore access",
              code: "BILLING_SUSPENDED",
            },
            402
          )
        }
      }
    } catch {
      // FAIL OPEN: never block on infrastructure errors
    }

    await next()
  }
}

/**
 * Middleware: verify the authenticated staff member has one of the allowed roles.
 * Must be used after `requireAuth()`. Checks the staff table using the staffId
 * or actorEmail set by requireAuth().
 */
export function requireStaffRole(roles: string[]) {
  return async (c: Context, next: Next) => {
    const contractorId = c.get("contractorId") as string
    const staffId = (c.get("staffId") as string | null | undefined) ?? null
    const actorEmail = (c.get("actorEmail") as string | null | undefined) ?? null

    if (staffId) {
      const staff = await c.env.DB.prepare(
        "SELECT role FROM staff WHERE id = ? AND contractor_id = ? AND active = 1"
      )
        .bind(staffId, contractorId)
        .first<{ role: string }>()
      if (!staff || !roles.includes(staff.role)) {
        return apiError(c, "FORBIDDEN", "Insufficient permissions")
      }
      await next()
      return
    }

    if (actorEmail) {
      const staff = await c.env.DB.prepare(
        "SELECT role FROM staff WHERE LOWER(email) = ? AND contractor_id = ? AND active = 1"
      )
        .bind(actorEmail.toLowerCase(), contractorId)
        .first<{ role: string }>()
      if (!staff || !roles.includes(staff.role)) {
        return apiError(c, "FORBIDDEN", "Insufficient permissions")
      }
      await next()
      return
    }

    // Dev fallback: no JWT, check if any staff member with required role exists
    if (c.env.ENVIRONMENT === "development") {
      const placeholders = roles.map(() => "?").join(",")
      const staff = await c.env.DB.prepare(
        `SELECT role FROM staff WHERE contractor_id = ? AND role IN (${placeholders}) AND active = 1 LIMIT 1`
      )
        .bind(contractorId, ...roles)
        .first<{ role: string }>()
      if (!staff) {
        return apiError(c, "FORBIDDEN", "Insufficient permissions")
      }
      await next()
      return
    }

    return apiError(c, "FORBIDDEN", "Insufficient permissions")
  }
}
