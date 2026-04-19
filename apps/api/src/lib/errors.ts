import type { Context } from "hono"
import type { ErrorCode, ApiErr } from "@contractor-quote/types"

const STATUS_MAP: Record<ErrorCode, number> = {
  NOT_FOUND: 404,
  FORBIDDEN: 403,
  GONE: 410,
  VALIDATION_ERROR: 400,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
  UNAUTHORIZED: 401,
  BILLING_SUSPENDED: 402,
}

/**
 * Return a standardized JSON error response.
 *
 * @param c     Hono context
 * @param code  Machine-readable error code
 * @param error Human-readable error message
 */
export function apiError(c: Context, code: ErrorCode, error: string) {
  const status = STATUS_MAP[code] as 400 | 401 | 403 | 404 | 410 | 429 | 500
  const body: ApiErr = { ok: false, error, code }
  return c.json(body, status)
}
