import type { Context, Next } from "hono"
import { apiError } from "../lib/errors"
import { verifyClerkJwt } from "../lib/jwtVerify"

/**
 * Extract the Clerk user's email from the verified JWT.
 */
async function extractEmailFromJwt(c: Context): Promise<string | null> {
  const authHeader = c.req.header("authorization")
  if (!authHeader?.startsWith("Bearer ")) return null

  const payload = await verifyClerkJwt(authHeader.slice(7), c.env)
  if (!payload) return null

  // Clerk stores email in various places depending on config
  return (
    (payload.email as string | undefined) ??
    (payload.primary_email as string | undefined) ??
    (payload.email_address as string | undefined) ??
    null
  )
}

/**
 * Middleware: require the caller to be a platform admin.
 * Checks the Clerk JWT email against:
 *   1. PLATFORM_ADMIN_EMAILS env var (bootstrap / static list)
 *   2. platform_admins DB table (dynamically managed via UI)
 * In development mode, falls back to x-platform-admin-email header.
 */
export function requirePlatformAdmin() {
  return async (c: Context, next: Next) => {
    let callerEmail = await extractEmailFromJwt(c)

    // Dev fallback: allow x-platform-admin-email header
    if (!callerEmail && (c.env as Record<string, unknown>).ENVIRONMENT === "development") {
      callerEmail = c.req.header("x-platform-admin-email") ?? null
    }

    if (!callerEmail) {
      return apiError(c, "FORBIDDEN", "Platform admin access required")
    }

    const normalizedEmail = callerEmail.toLowerCase()

    // Check env var list (bootstrap)
    const adminEmailsRaw = (c.env as Record<string, unknown>).PLATFORM_ADMIN_EMAILS as string | undefined
    if (adminEmailsRaw) {
      const adminEmails = adminEmailsRaw
        .split(",")
        .map((e: string) => e.trim().toLowerCase())
        .filter(Boolean)
      if (adminEmails.includes(normalizedEmail)) {
        c.set("platformAdminEmail", callerEmail)
        await next()
        return
      }
    }

    // Check DB table (dynamically managed)
    try {
      const db = (c.env as Record<string, unknown>).DB as D1Database
      if (db) {
        const row = await db
          .prepare("SELECT id FROM platform_admins WHERE email = ?")
          .bind(normalizedEmail)
          .first<{ id: string }>()
        if (row) {
          c.set("platformAdminEmail", callerEmail)
          await next()
          return
        }
      }
    } catch {
      // DB check failure is non-fatal — already checked env var above
    }

    return apiError(c, "FORBIDDEN", "Platform admin access required")
  }
}
