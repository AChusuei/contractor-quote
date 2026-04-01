/**
 * Thin fetch wrapper for the backend API.
 *
 * - Attaches Clerk auth token when available
 * - Returns typed {ok, data} / {ok, error} responses
 * - Falls back gracefully when API is unreachable (dev without wrangler)
 */

type ApiOkResponse<T> = { ok: true; data: T }
type ApiErrResponse = {
  ok: false
  error: string
  code?: string
  fields?: Record<string, string>
}
export type ApiResponse<T> = ApiOkResponse<T> | ApiErrResponse

const API_BASE = "/api/v1"

/** Optional Clerk getToken function — set via setAuthProvider */
let getTokenFn: (() => Promise<string | null>) | null = null

export function setAuthProvider(fn: () => Promise<string | null>) {
  getTokenFn = fn
}

async function authHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {}

  if (getTokenFn) {
    try {
      const token = await getTokenFn()
      if (token) headers["Authorization"] = `Bearer ${token}`
    } catch {
      // Clerk not ready or not signed in
    }
  }

  const superContractorId = sessionStorage.getItem("cq_super_contractor_id")
  if (superContractorId) {
    headers["x-super-contractor-id"] = superContractorId
  }

  return headers
}

/**
 * Core request helper. Returns parsed JSON or an error response.
 * On network failure (API unreachable), returns a synthetic error response
 * so callers can gracefully fall back.
 */
export async function api<T>(
  method: string,
  path: string,
  body?: unknown,
  options?: { headers?: Record<string, string> },
): Promise<ApiResponse<T>> {
  try {
    const auth = await authHeaders()
    const headers: Record<string, string> = { ...auth, ...(options?.headers ?? {}) }
    if (body !== undefined) headers["Content-Type"] = "application/json"

    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })

    // 204 No Content
    if (res.status === 204) {
      return { ok: true, data: undefined as unknown as T }
    }

    return (await res.json()) as ApiResponse<T>
  } catch {
    console.warn(`API unreachable: ${method} ${path} — falling back to local data`)
    return { ok: false, error: "API unreachable", code: "NETWORK_ERROR" }
  }
}

/**
 * Upload a file via multipart form data.
 */
export async function apiUpload<T>(
  path: string,
  formData: FormData,
): Promise<ApiResponse<T>> {
  try {
    const auth = await authHeaders()
    const res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: auth,
      body: formData,
    })
    return (await res.json()) as ApiResponse<T>
  } catch {
    console.warn(`API unreachable: POST ${path} — upload failed`)
    return { ok: false, error: "API unreachable", code: "NETWORK_ERROR" }
  }
}

// ── Convenience helpers ──────────────────────────────────────────────────

export function apiGet<T>(path: string, options?: { headers?: Record<string, string> }) {
  return api<T>("GET", path, undefined, options)
}

export function apiPost<T>(path: string, body?: unknown) {
  return api<T>("POST", path, body)
}

export function apiPatch<T>(path: string, body?: unknown, options?: { headers?: Record<string, string> }) {
  return api<T>("PATCH", path, body, options)
}

export function apiDelete<T>(path: string, body?: unknown) {
  return api<T>("DELETE", path, body)
}

// ── Network availability check ──────────────────────────────────────────

export function isNetworkError(res: { ok: boolean; code?: string }): boolean {
  return !res.ok && res.code === "NETWORK_ERROR"
}
