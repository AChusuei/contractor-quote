import type { Context, Next } from "hono"
import { apiError } from "../lib/errors"

interface RateLimitOptions {
  /** Max requests allowed within the window */
  limit: number
  /** Time window in seconds */
  windowSeconds: number
  /** Prefix for the KV key (e.g. "quote-submit", "photo-upload") */
  keyPrefix: string
}

/**
 * Get the client IP address from the request.
 * Cloudflare Workers set CF-Connecting-IP; falls back to X-Forwarded-For
 * and then to a constant for local dev.
 */
function getClientIp(c: Context): string {
  return (
    c.req.header("cf-connecting-ip") ??
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
    "127.0.0.1"
  )
}

/**
 * Rate limiting middleware using Workers KV.
 *
 * Stores a counter per IP per time window in the KV namespace.
 * Keys are auto-expired by KV's `expirationTtl`.
 */
export function rateLimit(options: RateLimitOptions) {
  const { limit, windowSeconds, keyPrefix } = options

  return async (c: Context, next: Next) => {
    // Skip rate limiting in development
    if (c.env.ENVIRONMENT === "development") {
      await next()
      return
    }
    const kv = c.env.KV as KVNamespace | undefined
    if (!kv) {
      await next()
      return
    }
    const ip = getClientIp(c)
    const windowId = Math.floor(Date.now() / (windowSeconds * 1000))
    const key = `rl:${keyPrefix}:${ip}:${windowId}`

    const current = await kv.get(key)
    const count = current ? parseInt(current, 10) : 0

    if (count >= limit) {
      return apiError(
        c,
        "RATE_LIMITED",
        "You've submitted too many requests. Please wait a while and try again."
      )
    }

    // Increment counter with TTL so it auto-expires
    await kv.put(key, String(count + 1), { expirationTtl: windowSeconds })

    await next()
  }
}
