import type { Context, Next } from "hono"
import { apiError } from "../lib/errors"

/**
 * Extract the Clerk user's email from the JWT.
 */
function extractEmailFromJwt(c: Context): string | null {
  const authHeader = c.req.header("authorization")
  if (!authHeader?.startsWith("Bearer ")) return null

  try {
    const token = authHeader.slice(7)
    const payload = JSON.parse(atob(token.split(".")[1]))
    return (
      payload.email ??
      payload.primary_email ??
      payload.email_address ??
      null
    )
  } catch {
    return null
  }
}

/**
 * Middleware: require the caller to be a super admin.
 * Checks the Clerk JWT email against the super_users DB table.
 * In development mode, falls back to x-super-admin-email header.
 */
export function requireSuperAdmin() {
  return async (c: Context, next: Next) => {
    let callerEmail = extractEmailFromJwt(c)

    // Dev fallback: allow x-super-admin-email header
    if (!callerEmail && (c.env as Record<string, unknown>).ENVIRONMENT === "development") {
      callerEmail = c.req.header("x-super-admin-email") ?? null
    }

    if (!callerEmail) {
      return apiError(c, "FORBIDDEN", "Super admin access required")
    }

    const normalizedEmail = callerEmail.toLowerCase()

    try {
      const db = (c.env as Record<string, unknown>).DB as D1Database
      if (db) {
        const row = await db
          .prepare("SELECT id FROM super_users WHERE email = ?")
          .bind(normalizedEmail)
          .first<{ id: string }>()
        if (row) {
          c.set("superAdminEmail", callerEmail)
          await next()
          return
        }
      }
    } catch {
      // DB check failure is non-fatal
    }

    return apiError(c, "FORBIDDEN", "Super admin access required")
  }
}
