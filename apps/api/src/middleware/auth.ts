import { createMiddleware } from "hono/factory"
import type { Bindings } from "../types"
import { apiError } from "../lib/errors"

// ---------------------------------------------------------------------------
// Context variables set by the auth middleware
// ---------------------------------------------------------------------------
export type AuthVariables = {
  clerkUserId: string
  contractorId: string
  staffId: string
  staffRole: string
}

type AuthEnv = { Bindings: Bindings; Variables: AuthVariables }

// ---------------------------------------------------------------------------
// JWKS cache — avoids fetching on every request
// ---------------------------------------------------------------------------
let jwksCache: { keys: JsonWebKey[]; fetchedAt: number } | null = null
const JWKS_TTL_MS = 60 * 60 * 1000 // 1 hour

async function getJwks(issuer: string): Promise<JsonWebKey[]> {
  const now = Date.now()
  if (jwksCache && now - jwksCache.fetchedAt < JWKS_TTL_MS) {
    return jwksCache.keys
  }

  const url = `${issuer.replace(/\/$/, "")}/.well-known/jwks.json`
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Failed to fetch JWKS from ${url}: ${res.status}`)
  }
  const body = (await res.json()) as { keys: JsonWebKey[] }
  jwksCache = { keys: body.keys, fetchedAt: now }
  return body.keys
}

// ---------------------------------------------------------------------------
// JWT verification using Web Crypto API (works in Workers)
// ---------------------------------------------------------------------------
function base64UrlDecode(str: string): Uint8Array {
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/")
  const pad = base64.length % 4
  const padded = pad ? base64 + "=".repeat(4 - pad) : base64
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

type JwtHeader = { alg: string; kid?: string; typ?: string }
type JwtPayload = {
  sub: string
  iss: string
  exp: number
  iat: number
  nbf?: number
  [key: string]: unknown
}

async function verifyJwt(
  token: string,
  issuer: string,
): Promise<JwtPayload> {
  const parts = token.split(".")
  if (parts.length !== 3) {
    throw new Error("Invalid JWT format")
  }

  const headerJson = new TextDecoder().decode(base64UrlDecode(parts[0]))
  const header: JwtHeader = JSON.parse(headerJson)

  if (header.alg !== "RS256") {
    throw new Error(`Unsupported JWT algorithm: ${header.alg}`)
  }

  // Find matching key from JWKS
  const keys = await getJwks(issuer)
  const jwk = header.kid
    ? keys.find((k) => k.kid === header.kid)
    : keys[0]

  if (!jwk) {
    // Key rotation: clear cache and retry once
    jwksCache = null
    const freshKeys = await getJwks(issuer)
    const freshJwk = header.kid
      ? freshKeys.find((k) => k.kid === header.kid)
      : freshKeys[0]
    if (!freshJwk) {
      throw new Error("No matching key found in JWKS")
    }
    return verifyWithKey(parts, freshJwk, issuer)
  }

  return verifyWithKey(parts, jwk, issuer)
}

async function verifyWithKey(
  parts: string[],
  jwk: JsonWebKey,
  issuer: string,
): Promise<JwtPayload> {
  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  )

  const data = new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
  const signature = base64UrlDecode(parts[2])

  const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, signature, data)
  if (!valid) {
    throw new Error("Invalid JWT signature")
  }

  const payloadJson = new TextDecoder().decode(base64UrlDecode(parts[1]))
  const payload: JwtPayload = JSON.parse(payloadJson)

  // Validate standard claims
  const now = Math.floor(Date.now() / 1000)
  if (payload.exp && payload.exp < now) {
    throw new Error("JWT expired")
  }
  if (payload.nbf && payload.nbf > now + 60) {
    throw new Error("JWT not yet valid")
  }
  const expectedIssuer = issuer.replace(/\/$/, "")
  if (payload.iss && payload.iss.replace(/\/$/, "") !== expectedIssuer) {
    throw new Error("JWT issuer mismatch")
  }

  return payload
}

// ---------------------------------------------------------------------------
// Auth middleware — verifies Clerk JWT and resolves contractor context
// ---------------------------------------------------------------------------
export const authMiddleware = createMiddleware<AuthEnv>(async (c, next) => {
  const authHeader = c.req.header("Authorization")
  if (!authHeader?.startsWith("Bearer ")) {
    return apiError(c, "UNAUTHORIZED", "Authentication required")
  }

  const token = authHeader.slice(7)
  const issuer = c.env.CLERK_ISSUER
  if (!issuer) {
    console.error("CLERK_ISSUER not configured")
    return apiError(c, "INTERNAL_ERROR", "Server configuration error")
  }

  let payload: JwtPayload
  try {
    payload = await verifyJwt(token, issuer)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid token"
    return apiError(c, "UNAUTHORIZED", message)
  }

  const clerkUserId = payload.sub
  if (!clerkUserId) {
    return apiError(c, "UNAUTHORIZED", "Invalid token: missing subject")
  }

  // Resolve contractor context from staff table
  const staff = await c.env.DB.prepare(
    "SELECT id, contractor_id, role FROM staff WHERE clerk_user_id = ? AND active = 1",
  )
    .bind(clerkUserId)
    .first<{ id: string; contractor_id: string; role: string }>()

  if (!staff) {
    return apiError(c, "FORBIDDEN", "No active staff record found for this user")
  }

  c.set("clerkUserId", clerkUserId)
  c.set("contractorId", staff.contractor_id)
  c.set("staffId", staff.id)
  c.set("staffRole", staff.role)

  await next()
})
