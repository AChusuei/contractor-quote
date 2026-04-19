import type { Context, Next } from "hono"

export function requireActiveBilling() {
  return async (c: Context, next: Next) => {
    const contractorId = c.get("contractorId") as string | undefined
    if (!contractorId) {
      await next()
      return
    }

    try {
      const row = await c.env.DB.prepare(
        "SELECT billing_status, billing_exempt FROM contractors WHERE id = ? LIMIT 1"
      )
        .bind(contractorId)
        .first<{ billing_status: string; billing_exempt: number }>()

      if (!row) {
        await next()
        return
      }

      if (row.billing_exempt === 1) {
        await next()
        return
      }

      if (row.billing_status === "suspended" || row.billing_status === "canceled") {
        return c.json(
          {
            ok: false,
            error: "Account suspended — update payment to restore access",
            code: "BILLING_SUSPENDED",
          },
          402
        )
      }
    } catch {
      // FAIL OPEN: pass through on DB error
    }

    await next()
  }
}
