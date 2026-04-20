import type { Context, Next } from "hono"
import { apiError } from "../lib/errors"

export function billingEnabled() {
  return async (c: Context, next: Next) => {
    if ((c.env as Record<string, unknown>).BILLING_ENABLED !== "true") {
      return apiError(c, "NOT_FOUND", "Not found")
    }
    await next()
  }
}
