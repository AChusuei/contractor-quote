import { createRemoteJWKSet, jwtVerify } from "jose"

/**
 * JWKS cache keyed by URL — lives for the lifetime of the Worker instance.
 * createRemoteJWKSet already caches keys internally; this map avoids
 * constructing a new remote key set on every request.
 */
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>()

function getJwks(jwksUrl: string): ReturnType<typeof createRemoteJWKSet> {
  let jwks = jwksCache.get(jwksUrl)
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(jwksUrl))
    jwksCache.set(jwksUrl, jwks)
  }
  return jwks
}

/**
 * Verify a Clerk JWT and return the verified payload.
 *
 * If CLERK_JWKS_URL is set: performs full signature verification via JWKS.
 * If CLERK_JWKS_URL is not set and ENVIRONMENT === "development": falls back
 * to parsing the payload without signature verification (dev convenience only).
 * Returns null on any error or if verification fails.
 */
export async function verifyClerkJwt(
  token: string,
  env: { CLERK_JWKS_URL?: string; ENVIRONMENT?: string }
): Promise<Record<string, unknown> | null> {
  const jwksUrl = env.CLERK_JWKS_URL

  if (jwksUrl) {
    try {
      const jwks = getJwks(jwksUrl)
      const { payload } = await jwtVerify(token, jwks)
      return payload as Record<string, unknown>
    } catch {
      return null
    }
  }

  // Dev-only fallback: no Clerk configured, parse without verification
  if (env.ENVIRONMENT === "development") {
    try {
      return JSON.parse(atob(token.split(".")[1])) as Record<string, unknown>
    } catch {
      return null
    }
  }

  // Production with no CLERK_JWKS_URL configured — reject
  return null
}
