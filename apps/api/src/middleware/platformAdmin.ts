import type { Context, Next } from "hono"
import { apiError } from "../lib/errors"

/**
 * Extract the Clerk user's email from the JWT.
 * Clerk JWTs typically include the user's email in the payload.
 */
function extractEmailFromJwt(c: Context): string | null {
  const authHeader = c.req.header("authorization")
  if (!authHeader?.startsWith("Bearer ")) return null

  try {
    const token = authHeader.slice(7)
    const payload = JSON.parse(atob(token.split(".")[1]))
    // Clerk stores email in various places depending on config
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
 * Middleware: require the caller to be a platform admin.
 * Checks the Clerk JWT email against the PLATFORM_ADMIN_EMAILS env var.
 * In development mode, falls back to x-platform-admin-email header.
 */
export function requirePlatformAdmin() {
  return async (c: Context, next: Next) => {
    const adminEmailsRaw = c.env.PLATFORM_ADMIN_EMAILS as string | undefined
    if (!adminEmailsRaw) {
      return apiError(c, "FORBIDDEN", "Platform admin access is not configured")
    }

    const adminEmails = adminEmailsRaw
      .split(",")
      .map((e: string) => e.trim().toLowerCase())
      .filter(Boolean)

    let callerEmail = extractEmailFromJwt(c)

    // Dev fallback: allow x-platform-admin-email header
    if (!callerEmail && (c.env as Record<string, unknown>).ENVIRONMENT === "development") {
      callerEmail = c.req.header("x-platform-admin-email") ?? null
    }

    if (!callerEmail || !adminEmails.includes(callerEmail.toLowerCase())) {
      return apiError(c, "FORBIDDEN", "Platform admin access required")
    }

    c.set("platformAdminEmail", callerEmail)
    await next()
  }
}
