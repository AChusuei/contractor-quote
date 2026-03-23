const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"

type TurnstileResult = {
  success: boolean
  "error-codes"?: string[]
}

/**
 * Verify a Cloudflare Turnstile token against the siteverify endpoint.
 * Returns true if the token is valid.
 */
export async function verifyTurnstileToken(
  token: string,
  secretKey: string,
  remoteIp?: string
): Promise<{ success: boolean; errorCodes?: string[] }> {
  const body: Record<string, string> = {
    secret: secretKey,
    response: token,
  }
  if (remoteIp) {
    body.remoteip = remoteIp
  }

  const res = await fetch(SITEVERIFY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  })

  if (!res.ok) {
    return { success: false, errorCodes: ["siteverify-request-failed"] }
  }

  const result = (await res.json()) as TurnstileResult
  return {
    success: result.success,
    errorCodes: result["error-codes"],
  }
}
